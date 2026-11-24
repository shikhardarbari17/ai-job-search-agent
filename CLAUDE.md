# Instructions for Claude Code in this repo (v2, 21 Nov 2026)

Read `docs/ARCHITECTURE.md`, `docs/TICKETS.md` and `web/netlify/database/migrations/0001_init.sql` before writing code. They are the contract.
The web app lives in `web/` (Netlify base directory). TypeScript only for the app. Ticket 1 is done.

Work one ticket at a time from `docs/TICKETS.md`. For each ticket: say what you will change, make the change, run the tests, then stop and summarise. Do not start the next ticket unprompted.

Never:
- send `temperature`, `top_p` or `top_k` to Anthropic;
- put an API key or the passcode in front-end code, logs, commits or test fixtures;
- commit anything from `data/`, `research/`, `*.jsonl`, spreadsheets or `.env` files;
- edit an already-applied migration (add a new numbered one instead);
- add a data source not in the scope, or fetch Indeed, LinkedIn, GC Jobs or the Job Bank website;
- change `research/` (the study scripts) or `web/prompts/extract_title.txt` / `rate.txt` (copied verbatim from the study).

Dependencies: only those listed in ARCHITECTURE.md; ask before adding any other.
Old Python app: `job_agent.py` keeps working until ticket 8 is done. `archive/` and `docs/archive/` are history; do not build on them.
