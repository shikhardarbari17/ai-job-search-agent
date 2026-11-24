-- Job Agent schema v2 (Postgres on Netlify Database). 21 Nov 2026.
-- Rules: store raw model output and model IDs for every LLM call; never store exposure LEVELS (computed at read time from settings).
-- Single user for now: every per-user table has user_id TEXT NOT NULL DEFAULT 'owner', so logins can be added later without a migration of existing rows.

CREATE TABLE settings (                      -- key/value: cut-offs, caps
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('exposure_cut_low', '6'),                  -- pilot values, NOT locked
  ('exposure_cut_high', '7'),
  ('daily_cost_cap_usd', '2.00'),             -- runs stop when today's LLM cost reaches this
  ('max_postings_per_run', '200');

CREATE TABLE profiles (                      -- Context tab; every save is a new version
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'owner',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  label       TEXT NOT NULL,
  body_text   TEXT NOT NULL,                  -- free-text background (replaces the block in score_prompt.py)
  prefs_json  JSONB NOT NULL DEFAULT '{}',    -- target roles, locations, salary floor, must-haves, deal-breakers
  is_active   BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX ix_profiles_user ON profiles(user_id, is_active);

CREATE TABLE sources (                       -- Sources tab; one row per adapter
  key               TEXT PRIMARY KEY,         -- 'research_import', 'workday_import', 'adzuna', 'greenhouse', 'lever', 'ashby', ...
  label             TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('api','ats','open_data','import')),
  enabled           BOOLEAN NOT NULL DEFAULT true,
  returns_full_text BOOLEAN NOT NULL DEFAULT false,
  terms_note        TEXT NOT NULL DEFAULT '',
  config_json       JSONB NOT NULL DEFAULT '{}',
  last_run_at       TIMESTAMPTZ,
  last_count        INTEGER,
  last_error        TEXT
);
INSERT INTO sources (key, label, kind, enabled, returns_full_text, terms_note) VALUES
  ('research_import', 'Company job boards (research snapshot, 29 Oct 2026)', 'import', true, true, 'Snapshot collected for the study; link out to the employer page.'),
  ('workday_import',  'Hospitals and universities (Workday snapshot, Nov 2026)', 'import', true, true, 'Collected only where robots.txt allowed; link out.');

CREATE TABLE runs (                          -- Runs tab
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL DEFAULT 'owner',
  kind          TEXT NOT NULL CHECK (kind IN ('fetch','score','rate','rq2')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('queued','running','done','failed','stopped_cap','cancelled')),
  params_json   JSONB NOT NULL DEFAULT '{}',  -- sources, profile_id, input_basis, posting ids
  total         INTEGER NOT NULL DEFAULT 0,
  done_count    INTEGER NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10,4) NOT NULL DEFAULT 0,
  log_text      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE postings (                      -- one row per posting per source; shared by all users
  id                  BIGSERIAL PRIMARY KEY,
  source_key          TEXT NOT NULL REFERENCES sources(key),
  source_job_id       TEXT NOT NULL,
  fingerprint         TEXT NOT NULL,          -- lower(employer)|lower(title)|lower(city)
  title               TEXT NOT NULL,
  employer            TEXT NOT NULL DEFAULT '',
  location            TEXT NOT NULL DEFAULT '',
  country             TEXT,
  posted_at           DATE,                   -- NULL when the source gives none (the research snapshot has none)
  closes_at           DATE,
  url                 TEXT NOT NULL DEFAULT '',
  description_text    TEXT NOT NULL DEFAULT '',
  description_is_full BOOLEAN NOT NULL DEFAULT false,
  salary_min          NUMERIC, salary_max NUMERIC, salary_period TEXT,
  employer_industry   TEXT,                   -- from research/employer_industry_coding.csv (my coding) where available
  raw_json            JSONB NOT NULL DEFAULT '{}',
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_run_id        BIGINT REFERENCES runs(id),
  UNIQUE (source_key, source_job_id)
);
CREATE INDEX ix_postings_fp ON postings(fingerprint);
CREATE INDEX ix_postings_posted ON postings(posted_at);

CREATE TABLE llm_calls (                     -- every API call, for cost, debugging and traceability
  id             BIGSERIAL PRIMARY KEY,
  run_id         BIGINT REFERENCES runs(id),
  purpose        TEXT NOT NULL CHECK (purpose IN ('fit','extract','rate')),
  provider       TEXT NOT NULL CHECK (provider IN ('anthropic','openai')),
  model_sent     TEXT NOT NULL,
  model_returned TEXT,
  prompt_version TEXT NOT NULL,
  input_tokens   INTEGER, output_tokens INTEGER, cost_usd NUMERIC(10,6),
  ok             BOOLEAN NOT NULL,
  error          TEXT,
  raw_response   JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_llm_calls_day ON llm_calls(created_at);

CREATE TABLE fit_scores (                    -- fit of a posting to one user's profile version
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL DEFAULT 'owner',
  posting_id     BIGINT NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  profile_id     BIGINT NOT NULL REFERENCES profiles(id),
  model          TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  score          INTEGER CHECK (score BETWEEN 1 AND 10),
  category       TEXT, fit TEXT, red_flag TEXT,
  llm_call_id    BIGINT REFERENCES llm_calls(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (posting_id, profile_id, model, prompt_version)
);

CREATE TABLE task_sets (                     -- 6 tasks extracted once per posting per input basis; shared by both raters
  id             BIGSERIAL PRIMARY KEY,
  posting_id     BIGINT NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  input_basis    TEXT NOT NULL CHECK (input_basis IN ('title','title_500','full')),   -- RQ2 conditions
  model          TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  tasks_json     JSONB NOT NULL,             -- array of 6 strings
  llm_call_id    BIGINT REFERENCES llm_calls(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (posting_id, input_basis, prompt_version)
);

CREATE TABLE exposure_ratings (              -- one row per rater per task set per repeat
  id             BIGSERIAL PRIMARY KEY,
  task_set_id    BIGINT NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
  rater_model    TEXT NOT NULL,              -- 'claude-haiku-5-5', 'gpt-6-luna'
  prompt_version TEXT NOT NULL,
  repeat_index   INTEGER NOT NULL DEFAULT 1, -- test-retest
  ratings_json   JSONB NOT NULL,             -- array of 6 of DO/HELP/NONE
  score          INTEGER NOT NULL CHECK (score BETWEEN 0 AND 12),  -- 2 x DO + HELP
  llm_call_id    BIGINT REFERENCES llm_calls(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_set_id, rater_model, prompt_version, repeat_index)
);

CREATE TABLE user_actions (                  -- seen / saved / hidden / applied
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT 'owner',
  posting_id  BIGINT NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('seen','saved','hidden','applied')),
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_actions_user_posting ON user_actions(user_id, posting_id);
