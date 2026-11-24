"""Source-adapter interface (ticket 1). Every source returns RawPosting objects; the pipeline does the rest.
Adapters must not call any LLM, write to the database, or print secrets. They may only fetch and normalise."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Iterable, Protocol


@dataclass
class RawPosting:
    source_job_id: str                 # stable ID from the source (Adzuna id, Greenhouse id, Workday externalPath, Job Bank snapshot ID)
    title: str
    employer: str = ""
    location: str = ""
    url: str = ""
    description_text: str = ""         # plain text; strip HTML in the adapter
    description_is_full: bool = False  # False for snippets and title-only sources
    posted_at: str | None = None       # ISO date if the source gives one
    closes_at: str | None = None
    country: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    salary_period: str | None = None
    raw: dict = field(default_factory=dict)  # original record, stored as raw_json


class SourceAdapter(Protocol):
    key: str                 # matches sources.key
    label: str               # shown in the Sources tab
    kind: str                # 'api' | 'ats' | 'open_data' | 'import'
    returns_full_text: bool
    terms_note: str          # one line, shown in the UI

    def fetch(self, config: dict, log: Callable[[str], None]) -> Iterable[RawPosting]:
        """Yield postings. Use `log` for progress and per-item errors; raise only for total failure.
        Respect config['max_per_run']. Network adapters must time out (<= 60 s per request) and back off on HTTP 429."""
        ...


REGISTRY: dict[str, SourceAdapter] = {}


def register(adapter: SourceAdapter) -> SourceAdapter:
    REGISTRY[adapter.key] = adapter
    return adapter
