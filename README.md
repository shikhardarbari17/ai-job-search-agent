# AI Job Search Agent

A personal AI agent that sources, scores, and delivers Canadian job listings — built to replace manual job searching with an automated pipeline.

## What it does

- Fetches ~120 Canadian job listings per run via the Adzuna API across 10 AI-focused search terms
- Scores each role 1-10 against a detailed candidate profile using Claude Haiku (Anthropic API) with structured JSON output
- Deduplicates listings across runs using SQLite — never surfaces the same job twice
- Exports ranked results to a color-coded Excel file (green = posted <3 days, yellow = 4-10 days, red = 10+ days)
- Emails a top-3 digest via SendGrid on a scheduled cadence

## Stack

Python, Anthropic Claude API (Haiku), Adzuna API, SQLite, openpyxl, SendGrid, launchd (Mac scheduling)

## Project structure

- `job_agent.py` — main pipeline (fetch, score, dedupe, export, email)
- `score_prompt.py` — candidate profile + scoring instructions sent to Claude
- `sources/adzuna.py` — Adzuna API fetcher
- `db.py` — SQLite deduplication layer
- `email_send.py` — SendGrid email delivery

## Setup

1. Clone the repo
2. Create a virtual environment: `python3 -m venv .venv && source .venv/bin/activate`
3. Install dependencies: `pip install anthropic requests python-dotenv sendgrid openpyxl`
4. Create a `~/.job-agent.env` file with your API keys (see `.env.example`)
5. Run: `python3 job_agent.py`

## API keys needed

- Anthropic API key (console.anthropic.com)
- Adzuna API key (developer.adzuna.com)
- SendGrid API key (sendgrid.com)
