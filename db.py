import sqlite3
import os

DB_PATH = os.path.expanduser("~/job-agent/jobs.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS seen_jobs (
            job_id TEXT PRIMARY KEY,
            date_seen TEXT
        )
    """)
    conn.commit()
    conn.close()

def is_new_job(job_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT 1 FROM seen_jobs WHERE job_id = ?", (job_id,))
    result = c.fetchone()
    conn.close()
    return result is None

def mark_seen(job_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    from datetime import datetime
    c.execute("INSERT OR IGNORE INTO seen_jobs VALUES (?, ?)",
              (job_id, datetime.now().isoformat()))
    conn.commit()
    conn.close()