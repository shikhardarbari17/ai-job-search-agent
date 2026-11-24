# Instructions for Claude Code in this repo

Read `docs/ARCHITECTURE.md` and `docs/schema.sql` before writing code. They are the contract.
`research/` holds the research scripts for the McMaster project; do not change them while building the app.
`data/` is git-ignored and holds research data; never commit it and never delete it.

Work one ticket at a time (numbers from `Job_Agent_MVP_Scope_v1.pdf`, section 7). Ticket 1 is done (docs + `app/sources/base.py`).
For each ticket: say what you will change, make the change, run the tests, then stop and summarise. Do not start the next ticket unprompted.

Never: send `temperature` to Anthropic; print or commit API keys; bind the server to anything but 127.0.0.1;
add a data source that is not in the scope; fetch Indeed, LinkedIn, GC Jobs or the Job Bank website.

Python: the Mac runs Python 3.14 (Homebrew). Use a venv in `.venv`. Keep dependencies few:
fastapi, uvicorn, jinja2, anthropic, openai, httpx, python-dotenv, pytest.
