-- Job Agent Phase 1 schema (SQLite). Ticket 1, 17 Nov 2026.
-- Rule: store raw model output and model IDs for every LLM call, so any score can be traced and re-checked.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (            -- small key/value store: cut-offs, page size, etc.
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- seeded: exposure_cut_low='6', exposure_cut_high='7' (pilot values, NOT locked; levels are computed at read time)

CREATE TABLE IF NOT EXISTS profiles (            -- Context tab; every save is a new version
  id          INTEGER PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  label       TEXT NOT NULL,
  body_text   TEXT NOT NULL,                     -- replaces the hard-coded background block in score_prompt.py
  prefs_json  TEXT NOT NULL DEFAULT '{}',        -- structured fields: target roles, locations, salary floor, must-haves, deal-breakers
  is_active   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sources (             -- Sources tab
  key               TEXT PRIMARY KEY,            -- 'adzuna', 'greenhouse', 'workday', 'jobbank_file', 'research_import'
  label             TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('api','ats','open_data','import')),
  enabled           INTEGER NOT NULL DEFAULT 1,
  returns_full_text INTEGER NOT NULL DEFAULT 0,
  terms_note        TEXT NOT NULL DEFAULT '',    -- shown in the UI, e.g. 'Personal use only; licence needed for revenue products'
  config_json       TEXT NOT NULL DEFAULT '{}',  -- search terms, employer slugs, max per run
  last_run_at       TEXT,
  last_count        INTEGER,
  last_error        TEXT
);

CREATE TABLE IF NOT EXISTS runs (                -- Runs tab
  id            INTEGER PRIMARY KEY,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT,
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed','cancelled')),
  profile_id    INTEGER REFERENCES profiles(id),
  sources_json  TEXT NOT NULL DEFAULT '[]',
  fetched       INTEGER NOT NULL DEFAULT 0,
  new_postings  INTEGER NOT NULL DEFAULT 0,
  scored        INTEGER NOT NULL DEFAULT 0,
  rated         INTEGER NOT NULL DEFAULT 0,
  log_text      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS postings (            -- one row per posting per source
  id                  INTEGER PRIMARY KEY,
  source_key          TEXT NOT NULL REFERENCES sources(key),
  source_job_id       TEXT NOT NULL,
  fingerprint         TEXT NOT NULL,             -- lower(employer)|lower(title)|lower(city): cross-source duplicate grouping
  title               TEXT NOT NULL,
  employer            TEXT NOT NULL DEFAULT '',
  location            TEXT NOT NULL DEFAULT '',
  country             TEXT,
  posted_at           TEXT,                      -- as given by the source; NULL if the source has none
  closes_at           TEXT,
  url                 TEXT NOT NULL DEFAULT '',
  description_text    TEXT NOT NULL DEFAULT '',  -- plain text, HTML stripped
  description_is_full INTEGER NOT NULL DEFAULT 0,-- 0 for snippets (Adzuna) and title-only sources
  salary_min          REAL,
  salary_max          REAL,
  salary_period       TEXT,
  raw_json            TEXT NOT NULL DEFAULT '{}',
  first_seen_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at        TEXT NOT NULL DEFAULT (datetime('now')),
  first_run_id        INTEGER REFERENCES runs(id),
  UNIQUE (source_key, source_job_id)
);
CREATE INDEX IF NOT EXISTS ix_postings_fp ON postings(fingerprint);
CREATE INDEX IF NOT EXISTS ix_postings_posted ON postings(posted_at);

CREATE TABLE IF NOT EXISTS llm_calls (           -- every API call, for cost and debugging
  id            INTEGER PRIMARY KEY,
  run_id        INTEGER REFERENCES runs(id),
  purpose       TEXT NOT NULL CHECK (purpose IN ('fit','extract','rate')),
  provider      TEXT NOT NULL CHECK (provider IN ('anthropic','openai')),
  model_sent    TEXT NOT NULL,
  model_returned TEXT,
  input_tokens  INTEGER, output_tokens INTEGER, cost_usd REAL,
  ok            INTEGER NOT NULL,
  error         TEXT,
  raw_response  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fit_scores (          -- fit of a posting to a profile version
  id             INTEGER PRIMARY KEY,
  posting_id     INTEGER NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  profile_id     INTEGER NOT NULL REFERENCES profiles(id),
  model          TEXT NOT NULL,
  prompt_version TEXT NOT NULL,                  -- short hash of the prompt file
  score          INTEGER CHECK (score BETWEEN 1 AND 10),
  category       TEXT, fit TEXT, red_flag TEXT,
  llm_call_id    INTEGER REFERENCES llm_calls(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (posting_id, profile_id, model, prompt_version)
);

CREATE TABLE IF NOT EXISTS task_sets (           -- the 6 tasks extracted once per posting, shared by both raters
  id             INTEGER PRIMARY KEY,
  posting_id     INTEGER NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  input_basis    TEXT NOT NULL CHECK (input_basis IN ('title','title_desc')),
  model          TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  tasks_json     TEXT NOT NULL,                  -- JSON array of 6 strings
  llm_call_id    INTEGER REFERENCES llm_calls(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (posting_id, input_basis, prompt_version)
);

CREATE TABLE IF NOT EXISTS exposure_ratings (    -- one row per rater per task set (per repeat)
  id             INTEGER PRIMARY KEY,
  task_set_id    INTEGER NOT NULL REFERENCES task_sets(id) ON DELETE CASCADE,
  rater_model    TEXT NOT NULL,                  -- 'claude-haiku-5-5', 'gpt-6-luna'
  prompt_version TEXT NOT NULL,
  repeat_index   INTEGER NOT NULL DEFAULT 1,     -- for test-retest
  ratings_json   TEXT NOT NULL,                  -- JSON array of 6 of DO/HELP/NONE
  score          INTEGER NOT NULL,               -- 2 x DO + HELP, 0..12; level is NOT stored (cut-offs live in settings)
  llm_call_id    INTEGER REFERENCES llm_calls(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (task_set_id, rater_model, prompt_version, repeat_index)
);

CREATE TABLE IF NOT EXISTS user_actions (        -- seen / saved / hidden / applied
  id          INTEGER PRIMARY KEY,
  posting_id  INTEGER NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('seen','saved','hidden','applied')),
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_actions_posting ON user_actions(posting_id);

CREATE TABLE IF NOT EXISTS legacy_seen_jobs (    -- copied from the old jobs.db so old Adzuna IDs still dedupe
  job_id TEXT PRIMARY KEY, date_seen TEXT
);
