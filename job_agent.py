import time
import json
import os
from dotenv import load_dotenv
import anthropic

load_dotenv(os.path.expanduser("~/.job-agent.env"))

from sources.adzuna import fetch_jobs
from score_prompt import SYSTEM_PROMPT, build_user_message
from db import init_db, is_new_job, mark_seen

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

def score_job(job):
    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": build_user_message(job)}
            ]
        )
        raw = response.content[0].text
        # Strip markdown code fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        result = json.loads(raw)
        return result
    except Exception as e:
        print(f"  Scoring error: {e}")
        return None


def run():
    init_db()
    print("Fetching jobs...")
    jobs = fetch_jobs()

    new_jobs = [j for j in jobs if is_new_job(j["id"])]
    print(f"{len(new_jobs)} new jobs to score (out of {len(jobs)} fetched)")

    scored = []

    for job in new_jobs:
        print(f"  Scoring: {job['title']} — {job['company']}")
        result = score_job(job)

        if result and result.get("score", 0) >= 6:
            job["score"] = result["score"]
            job["category"] = result["category"]
            job["fit"] = result["fit"]
            job["red_flag"] = result["red_flag"]
            scored.append(job)
            print(f"    Score: {result['score']} | {result['category']} | {result['fit']}")
        else:
            if result:
                print(f"    Score: {result.get('score')} — skipped")

        mark_seen(job["id"])
        time.sleep(15)

    scored.sort(key=lambda x: x["score"], reverse=True)
    print(f"\nDone. {len(scored)} jobs scored 6 or above.")

    # Save to Excel
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    from datetime import datetime, timezone

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Job Results"

    headers = ["Score", "Category", "Title", "Company", "Location", "Posted", "Why it fits", "Red flag", "Link"]
    ws.append(headers)

    # Bold headers
    for cell in ws[1]:
        cell.font = Font(bold=True)

    # Color fills for posting freshness
    green = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
    yellow = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
    red = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")

    def days_old(date_str):
        # Adzuna 'created' looks like 2025-05-20T12:00:00Z
        try:
            posted = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            return (now - posted).days
        except Exception:
            return None

    row_num = 1
    for j in scored:
        row_num += 1
        age = days_old(j.get("date", ""))
        if age is None:
            posted_label = "Unknown"
        elif age == 0:
            posted_label = "Today"
        elif age == 1:
            posted_label = "1 day ago"
        else:
            posted_label = f"{age} days ago"

        ws.append([
            j["score"],
            j["category"],
            j["title"],
            j["company"],
            j["location"],
            posted_label,
            j["fit"],
            j["red_flag"],
            j["url"],
        ])

        # Color-code the Posted cell (column F)
        posted_cell = ws.cell(row=row_num, column=6)
        if age is not None:
            if age <= 3:
                posted_cell.fill = green
            elif age <= 10:
                posted_cell.fill = yellow
            else:
                posted_cell.fill = red

    # Set column widths
    ws.column_dimensions["A"].width = 8
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 35
    ws.column_dimensions["D"].width = 25
    ws.column_dimensions["E"].width = 20
    ws.column_dimensions["F"].width = 14
    ws.column_dimensions["G"].width = 50
    ws.column_dimensions["H"].width = 40
    ws.column_dimensions["I"].width = 50

    filename = f"job_results_{datetime.now().strftime('%Y%m%d')}.xlsx"
    filepath = os.path.expanduser(f"~/job-agent/{filename}")
    wb.save(filepath)
    print(f"\nSaved to {filepath}")

    # Also print top 3
    for j in scored[:3]:
        print(f"\n  [{j['score']}] {j['title']} — {j['company']}")
        print(f"  Fit: {j['fit']}")
        print(f"  Red flag: {j['red_flag']}")
        print(f"  Link: {j['url']}")

if __name__ == "__main__":
    run()