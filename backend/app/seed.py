"""Demo seed data: a Solutions Engineer's task list at Carbon Arc.

Invoked once from the FastAPI lifespan (see app/main.py). Guarded by the
SEED_DATA env var: "true"/"1"/"yes" (case-insensitive) enables seeding,
anything else disables it. Defaults to enabled.

All tasks and activity entries are created through the store's own public
API (create_task / update_task) so record and activity shapes stay exactly
what the store produces; only the timestamps are rewritten afterwards to
backdate the histories (see _backdate below).
"""

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.store import TaskStore, store

# Each edit is (kind, value, hours_after_create):
#   ("title", new_title, h)    -> update_task(title=...)
#   ("status", status_name, h) -> update_task(status=...) — one of
#                                 backlog | todo | in_progress | complete
# Edits are applied (and therefore logged) in order, so hours_after_create
# must be increasing within a spec and smaller than created_days_ago * 24.
Edit = tuple[str, object, float]


@dataclass(frozen=True)
class _SeedSpec:
    title: str  # title at creation time (edits may rename it later)
    created_days_ago: float
    edits: tuple[Edit, ...] = ()


# Oldest first: ascending ids then match chronological order, so the
# newest-first (id desc) task list also reads newest createdAt first.
_SEED_SPECS: tuple[_SeedSpec, ...] = (
    _SeedSpec(
        title="Prep retail demo",
        created_days_ago=14.0,
        edits=(
            ("title", "Prepare Carbon Arc platform demo for retail prospect", 5),
            ("status", "in_progress", 24),
            ("status", "complete", 52),
        ),
    ),
    _SeedSpec(
        title="Draft insights report: CPG purchase trends",
        created_days_ago=13.2,
        edits=(("status", "complete", 96),),
    ),
    _SeedSpec(
        title="Set up sandbox workspace for pilot client onboarding",
        created_days_ago=12.4,
        edits=(("status", "complete", 30),),
    ),
    _SeedSpec(
        title="Follow up with pilot client",
        created_days_ago=11.1,
        edits=(
            ("title", "Follow up on API integration questions from pilot client", 26),
            ("status", "in_progress", 40),
        ),
    ),
    _SeedSpec(
        title="Build sample notebook for data eval",
        created_days_ago=10.3,
        edits=(
            ("title", "Build sample notebook for hedge fund data eval", 8),
            ("status", "complete", 70),
        ),
    ),
    _SeedSpec(
        title="Review data dictionary updates for consumer transactions feed",
        created_days_ago=9.2,
        edits=(("status", "backlog", 4),),
    ),
    _SeedSpec(
        title="QA foot-traffic dataset refresh before client delivery",
        created_days_ago=8.0,
        edits=(("status", "complete", 20),),
    ),
    _SeedSpec(
        # Completed, then reopened to todo after client feedback.
        title="Write integration guide for Snowflake data share",
        created_days_ago=7.1,
        edits=(
            ("status", "complete", 50),
            ("status", "todo", 96),
        ),
    ),
    _SeedSpec(
        title="Scope custom entity-matching request from insurance prospect",
        created_days_ago=6.0,
        edits=(("status", "backlog", 6),),
    ),
    _SeedSpec(
        title=(
            "Put together ROI one-pager for the FinServ account's "
            "quarterly business review"
        ),
        created_days_ago=5.2,
        edits=(("status", "in_progress", 20),),
    ),
    _SeedSpec(
        title="Look into webhook failures",
        created_days_ago=4.1,
        edits=(
            ("title", "Triage webhook delivery failures reported by pilot client", 6),
            ("status", "in_progress", 12),
        ),
    ),
    _SeedSpec(
        title="Schedule technical deep-dive with prospect's data science team",
        created_days_ago=2.6,
    ),
    _SeedSpec(
        title="Update demo environment with latest alt-data connectors",
        created_days_ago=1.4,
        edits=(("status", "backlog", 3),),
    ),
    _SeedSpec(
        title="Prep talking points for hedge fund eval kickoff call",
        created_days_ago=0.3,
    ),
)


def _seed_enabled() -> bool:
    return os.environ.get("SEED_DATA", "true").strip().lower() in {"true", "1", "yes"}


def _backdate(
    target: TaskStore,
    task_id: int,
    created_at: datetime,
    edit_times: list[datetime],
) -> None:
    """Rewrite timestamps on an already-created task to make it look historic.

    The store stamps now() on every mutation, so records created during
    seeding all carry "just now" timestamps. For demo realism we reach into
    the store (under its lock, before the app serves any traffic) and set:
      - created_at            -> the backdated creation time
      - activity[0] (created) -> same creation time
      - activity[1:]          -> the chronological edit times
      - updated_at            -> the timestamp of the last activity entry
    This is the only place such rewriting happens; nothing else should touch
    the store's internals.
    """
    with target._lock:
        record = target._tasks[task_id]
        entries = target._activity[task_id]
        record.created_at = created_at
        entries[0].timestamp = created_at  # the "created" entry
        for entry, ts in zip(entries[1:], edit_times):
            entry.timestamp = ts
        record.updated_at = entries[-1].timestamp


def seed_if_enabled(target: TaskStore = store) -> None:
    """Populate the store with demo data unless disabled or already seeded."""
    if not _seed_enabled():
        return
    if target.stats()["total"] > 0:
        # Idempotence guard: never double-seed a store that already has tasks.
        return

    now = datetime.now(timezone.utc)
    for spec in _SEED_SPECS:
        record = target.create_task(spec.title)
        created_at = now - timedelta(days=spec.created_days_ago)
        edit_times: list[datetime] = []
        for kind, value, hours_after in spec.edits:
            if kind == "title":
                target.update_task(record.id, title=value)
            else:  # "status"
                target.update_task(record.id, status=str(value))
            edit_times.append(created_at + timedelta(hours=hours_after))
        _backdate(target, record.id, created_at, edit_times)
