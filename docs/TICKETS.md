# Build tickets v2 (Netlify) — work one at a time, stop after each

| # | Ticket | Model | Done when |
|---|---|---|---|
| 1 | Architecture, schema, adapter interface | Opus 5.5 | DONE 21 Nov (this file, ARCHITECTURE.md, migrations/0001_init.sql, prompts copied) |
| 2 | Scaffold `web/` (Vite + React + TS, netlify.toml), `_lib/db.ts`, `_lib/guard.ts`, `/api/health`, passcode prompt in the browser, **import**: `POST /api/import` (passcode; accepts chunks of up to 200 records) + an Import page that reads `ca_postings_v2.jsonl` and `data/sector_fulltext/*.jsonl` from the user's disk in the browser and sends them in chunks; employer industry from `research/employer_industry_coding.csv` | Sonnet 5.5 | `netlify dev` works locally; after deploy, 1,563 + 169 postings are in the production database; re-importing changes nothing (upsert) |
| 3 | `_lib/llm.ts`, `_lib/prompts.ts`, price table, cost guard; draft `fit.txt` (instructions from score_prompt.py with a {profile} placeholder) and `extract_title500.txt` / `extract_full.txt` | Opus 5.5 | Unit tests with mocked HTTP pass; no temperature sent; prompts reviewed by Shikhar/Claude before any paid run |
| 4 | `run-background.mts`: fit scoring, task extraction, two-model rating, RQ2 mode (title / title_500 / full for chosen postings), chunking, cost cap, `/api/runs` | Sonnet 5.5 | A 10-posting run completes online, every score traces to llm_calls, re-running costs nothing |
| 5 | Jobs page: table, filters (source, fit range, exposure level, location, industry, marketing-only, hide seen), sort, **Download Excel** | Sonnet 5.5 | 2,000 rows usable; export matches the screen and includes Task_ratings |
| 6 | Job detail: description, fit reason, 6 tasks with both models' labels side by side, disagreement flag, link out, seen/saved/applied | Sonnet 5.5 | Missing ratings say so |
| 7 | Context page: profile form + versions + Re-score (passcode) | Sonnet 5.5 | Saving and re-scoring changes fit scores without code edits |
| 8 | Runs + Sources pages; first live adapters (Greenhouse/Lever/Ashby from fulltext_test_v2.py; Adzuna) | Sonnet 5.5 | A live fetch adds new postings; errors shown per source |
| 9 | About page (method, agreement numbers read from data, limits) + public Landing page | Sonnet 5.5 | Numbers come from data, not typed |
| 10 | Review: keys, passcode, cost cap, error states, README, 5-minute demo script | Opus 5.5 | Fresh clone + deploy works; demo script runs end to end |

Target dates: 2 by Mon 23, 3-4 by Tue 24, 5 Wed 25, 6 Thu 26, demo at check-in Fri 27, 7-9 by 30 Nov, 10 on 1 Dec.
