# Job Agent v2 architecture (online on Netlify) — 21 Nov 2026

Supersedes the 17 Nov local FastAPI plan (kept in `docs/archive/`). This file, `web/netlify/database/migrations/` and `docs/TICKETS.md` are the build contract.

## Decisions (Shikhar, 21 Nov)
- **Online on Netlify.** For personal use, the professor demo, and showing on his profile.
- **One user for now, no login.** Every per-user table carries `user_id` (default `'owner'`) so logins (Netlify Identity) can be added later without reworking data.
- **Screens first** on postings already collected; live sources come later through the adapter interface below.
- **The rating service also runs the RQ2 test** (title vs first 500 characters vs full text).
- **Download Excel** button on the Jobs tab.

## Verified platform facts (Netlify docs, read 21 Nov 2026)
- Functions are TypeScript/JavaScript (Go also). No Python. Synchronous functions: 60 s limit. Background functions: up to 15 min, available on the Free plan, return 202 at once, retried on error.
- Netlify Database = managed Postgres. Package `@netlify/database` (`getDatabase()`, `db.sql` tagged template, auto-parameterised). Migrations: `netlify/database/migrations/<number>_<slug>.sql`, applied automatically on every production deploy and deploy preview. `netlify dev` runs a local Postgres.
- Free plan database limits: 3 databases, 48 compute units and 5 GB written per billing period, 5 GB storage, sleeps after 5 min idle.
- NOT checked: how many credits the Free plan gives per month, and what functions cost in credits.

## Layout (all app code under `web/`, Netlify base directory = `web`)
```
web/
  netlify.toml
  package.json            vite, react, react-dom, typescript, @netlify/functions, @netlify/database,
                          @anthropic-ai/sdk, openai, exceljs   (keep it to these; ask before adding)
  index.html, src/        React + TypeScript front end (Vite). Pages: Jobs, JobDetail, Context, Sources, Runs, About, Landing
  netlify/
    functions/            API (one file per route, path set in config: /api/...)
      _lib/db.ts          getDatabase() wrapper + typed queries
      _lib/guard.ts       passcode check (see Rule 2)
      _lib/llm.ts         one call() for Anthropic and OpenAI; JSON-only parsing; retries; writes llm_calls; cost from price table
      _lib/prompts.ts     loads web/prompts/*.txt; prompt_version = first 8 hex chars of sha256(file text)
      _lib/sources/       adapter interface + adapters (see "Sources")
      run-background.mts  background function: processes a run in chunks, re-invokes itself before 14 min
    database/migrations/  0001_init.sql (+ later migrations, never edit an applied one)
  prompts/                extract_title.txt and rate.txt (verbatim from research/psc/rate_pilot.py, general wording),
                          extract_title500.txt, extract_full.txt, fit.txt (written in tickets 3-4, reviewed before use)
  scripts/                one-off helpers that run on the Mac (never deployed)
```

## Rules (non-negotiable)
1. **Keys stay server side.** ANTHROPIC_API_KEY, OPENAI_API_KEY (and later ADZUNA_*) are Netlify environment variables, read only inside functions. Never send a key to the browser, log it, or commit it.
2. **Passcode on anything that costs money or writes.** No login yet, so: env var `ADMIN_PASSCODE`; functions that start runs, re-score, save context, record actions or import data require header `x-admin-passcode` to match (constant-time compare), else 401. The browser asks once and keeps it in localStorage. Read-only job pages stay open for the demo. The Context page (personal profile) also requires the passcode to READ.
3. **No `temperature`, `top_p` or `top_k`** to Anthropic. Pin model IDs in one config file: fit `claude-haiku-5-5`; exposure raters `claude-haiku-5-5` and `gpt-6-luna`. Store `model_returned` from every response.
4. **Tasks are extracted once per posting per input basis** (Claude) and the same 6 tasks go to both raters. Do not edit a prompt file without its prompt_version changing (automatic via the hash).
5. **Exposure level is computed at read time** from `settings.exposure_cut_low/high`. Never store levels; changing cut-offs never triggers re-rating.
6. **Store raw responses** in `llm_calls.raw_response`. Every number in the UI must trace to a call.
7. **Cost guard.** Before each LLM call, sum today's `llm_calls.cost_usd`; stop the run with status `stopped_cap` at `settings.daily_cost_cap_usd`. Also cap postings per run (`max_postings_per_run`). Shikhar sets a monthly limit in the Anthropic and OpenAI consoles too.
8. **Idempotent runs.** Skip work already stored for the same posting + profile/input_basis + model + prompt_version.
9. **Long work only in the background function.** Synchronous functions must answer well inside 60 s. The Runs page polls `/api/runs/:id` every 2 s.
10. **No research data in git.** The repo may be public. Postings are loaded through the passcode-protected import endpoint, never committed. `data/`, `research/raw_workbooks/`, `*.jsonl` and spreadsheets stay git-ignored.
11. **Sources:** only those in the scope (company job-board APIs, Adzuna, Workday where robots.txt allows, Job Bank open-data files). Never Indeed, LinkedIn, GC Jobs pages or the Job Bank website. Link out to the employer page.

## Sources and the adapter interface (ready for live connections)
Every source, including the one-off imports, implements the same TypeScript interface (port of the old `base.py`):
```ts
export interface RawPosting {
  sourceJobId: string; title: string; employer?: string; location?: string; url?: string;
  descriptionText?: string; descriptionIsFull: boolean; postedAt?: string | null; closesAt?: string | null;
  country?: string | null; salaryMin?: number | null; salaryMax?: number | null; salaryPeriod?: string | null;
  raw: unknown;
}
export interface SourceAdapter {
  key: string; label: string; kind: 'api' | 'ats' | 'open_data' | 'import';
  returnsFullText: boolean; termsNote: string;
  fetch(config: Record<string, unknown>, log: (msg: string) => void): AsyncIterable<RawPosting>;
}
```
One `upsertPostings()` does normalise (strip HTML, clean title), fingerprint, and `INSERT ... ON CONFLICT (source_key, source_job_id) DO UPDATE SET last_seen_at = now()`. Adding a live source later = a new adapter file + a `sources` row + (optionally) a scheduled function. No schema change.

## Excel download
`GET /api/export.xlsx?<same filters as the Jobs page>` built with exceljs:
- Sheet `Jobs`: the filtered rows (title, employer, location, source, posted, fit score, exposure score and level for each model, disagreement flag, URL), age colour-coding as in the old Excel.
- Sheet `Task_ratings`: one row per task per rater for those jobs (raw labels), so every summary number can be spot-checked.
- Sheet `README`: filters used, cut-offs, model IDs, prompt versions, export time.

## Not in this version
Logins and multiple users, outreach email, licensed feeds, payments.
