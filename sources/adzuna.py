import requests
import os
from dotenv import load_dotenv

load_dotenv(os.path.expanduser("~/.job-agent.env"))

APP_ID = os.getenv("ADZUNA_APP_ID")
APP_KEY = os.getenv("ADZUNA_APP_KEY")

SEARCH_TERMS = [
    "marketing analytics",
    "AI marketing",
    "AI strategy",
    "marketing science",
    "AI builder",
    "AI engineer",
    "AI agent",
    "agentic AI",
    "AI automation",
    "intelligent automation",
    "AI solutions engineer",
    "automation developer"
]

def fetch_jobs():
    all_jobs = []
    seen_ids = set()

    for term in SEARCH_TERMS:
        url = "https://api.adzuna.com/v1/api/jobs/ca/search/1"
        params = {
            "app_id": APP_ID,
            "app_key": APP_KEY,
            "what": term,
            "results_per_page": 10,
            "content-type": "application/json",
        }
        try:
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            jobs = data.get("results", [])
            for job in jobs:
                job_id = job.get("id")
                if job_id and job_id not in seen_ids:
                    seen_ids.add(job_id)
                    all_jobs.append({
                        "id": str(job_id),
                        "title": job.get("title", ""),
                        "company": job.get("company", {}).get("display_name", ""),
                        "location": job.get("location", {}).get("display_name", ""),
                        "description": job.get("description", "")[:500],
                        "url": job.get("redirect_url", ""),
                        "date": job.get("created", ""),
                    })
        except Exception as e:
            print(f"Error fetching '{term}': {e}")

    print(f"Fetched {len(all_jobs)} unique jobs from Adzuna")
    return all_jobs

if __name__ == "__main__":
    jobs = fetch_jobs()
    for j in jobs[:5]:
        print(f"\n{j['title']} — {j['company']} ({j['location']})")
        print(f"  {j['url']}")