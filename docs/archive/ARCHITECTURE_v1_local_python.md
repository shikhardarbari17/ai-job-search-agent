# Job Agent, Phase 1 architecture (ticket 1)

Decided 17 Nov 2026: **local-only on the Mac, single user, FastAPI + SQLite + Jinja templates with HTMX.** Adzuna stays (personal use).
Full scope with screens and tickets: `Job_Agent_MVP_Scope_v1.pdf`. This file is the build contract for tickets 2 to 10.

## Layout
```
app/
  __main__.py        python -m app  -> uvicorn on 127.0.0.1:8000 (never 0.0.0.0)
  config.py          paths, model IDs, prices, loads ~/.job-agent.env (server side only)
  db.py              connect(), migrate() from docs/schema.sql, small query helpers
  sources/
    base.py          RawPosting + SourceAdapter interface (done)
    adzuna.py        from sources/adzuna.py (keep full description, drop the [:500] cut)
    ats.py           greenhouse, lever, ashby, workable, recruitee, smartrecruiters (from fulltext_test_v2.py)
    workday.py       robots.txt check per site, 5 s between requests, 60 s+ back-off on 429, max 80 per site
    jobbank_file.py  loads a downloaded Job Bank monthly CSV (UTF-16, tab-separated), title-only
    research_import.py  one-off import of ca_postings_v2.jsonl and data/sector_fulltext/*.jsonl
  pipeline/
    normalize.py     strip HTML, clean titles, fingerprint = lower(employer)|lower(title)|lower(city)
    run.py           fetch -> upsert postings -> fit score new ones -> extract tasks -> rate with both models
  llm/
    client.py        one call() for Anthropic and OpenAI; JSON-only parsing; retries; writes llm_calls
    prompts/         fit.txt, extract.txt, rate.txt  (prompt_version = first 8 chars of sha256 of the file)
  web/
    routes.py        pages + HTMX partials
    templates/       base.html, jobs.html, job_detail.html, context.html, sources.html, runs.html, about.html
    static/          one CSS file
tests/               adapters tested against saved JSON fixtures; no live network in tests
```

## Rules (non-negotiable)
1. **Keys stay server side.** Read from `~/.job-agent.env`. Never render, log or return a key. Bind to 127.0.0.1 only.
2. **No `temperature`, `top_p` or `top_k`** in Anthropic calls: removed for current models (API version 2026-10-21, returns HTTP 400).
3. **Pin model IDs in config.py.** Fit: `claude-haiku-5-5`. Exposure raters: `claude-haiku-5-5` and `gpt-6-luna`. Store `model_returned` from every response.
4. **Tasks are extracted once** (Claude) and the same 6 tasks go to both raters. Extract and rate prompts are the research prompts in `research/psc/rate_pilot.py` (general wording). Do not edit them without bumping prompt_version.
5. **Exposure level is computed at read time** from `settings.exposure_cut_low/high`. Never store the level. Changing cut-offs must not trigger re-rating.
6. **Store raw responses** in `llm_calls.raw_response`. Every score in the UI must be traceable to a call.
7. **Sources:** only those in the Sources table of the scope PDF. Never Indeed, LinkedIn, GC Jobs pages or the Job Bank website. Workday only if robots.txt allows.
8. **Idempotent runs:** re-running skips postings already scored for the active profile + model + prompt_version.
9. **Cost:** price table in config.py (USD per million tokens, Nov 2026): claude-haiku-5-5 0.10 in / 0.50 out; gpt-6-luna 0.10 / 0.50. Show tokens and cost per run.
10. **Long runs** go in a background thread; the Runs page polls run status every 2 s with HTMX.

## Migration from the current code
- `score_prompt.py`: the background block becomes the first `profiles` row; the floors, examples and JSON contract become `llm/prompts/fit.txt` with a `{profile}` placeholder.
- `job_agent.py` uses `claude-haiku-4-5-20251001` and cuts descriptions to 500 characters. Switching to `claude-haiku-5-5` and full text **will shift fit scores**; re-check a handful of known jobs after ticket 4.
- `jobs.db` `seen_jobs` -> `legacy_seen_jobs`, so old Adzuna IDs still dedupe.
- Keep `job_agent.py` working until ticket 8 is done; delete it only then.

## Known gaps (not decided)
Hosting, logins, other users' data, outreach email, licensed feeds: Phase 2 or later.
