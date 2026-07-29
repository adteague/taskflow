"""In-memory task store with per-task activity log.

All mutations are guarded by a threading.Lock. The store starts empty
(seed data deferred by the PM). Auto-increment int ids start at 1 for
both tasks and activity entries.
"""

import threading
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Optional


@dataclass
class TaskRecord:
    id: int
    title: str
    completed: bool
    created_at: datetime
    updated_at: datetime


@dataclass
class ActivityRecord:
    id: int
    task_id: int
    timestamp: datetime
    action: str  # "created" | "title_changed" | "status_changed"
    old_value: Optional[str]
    new_value: Optional[str]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TaskStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tasks: dict[int, TaskRecord] = {}
        self._activity: dict[int, list[ActivityRecord]] = {}
        self._next_task_id = 1
        self._next_activity_id = 1

    # -- internal helpers (call with lock held) --

    def _log(
        self,
        task_id: int,
        action: str,
        old_value: Optional[str],
        new_value: Optional[str],
    ) -> None:
        entry = ActivityRecord(
            id=self._next_activity_id,
            task_id=task_id,
            timestamp=_now(),
            action=action,
            old_value=old_value,
            new_value=new_value,
        )
        self._next_activity_id += 1
        self._activity[task_id].append(entry)

    # -- public API --

    def create_task(self, title: str) -> TaskRecord:
        with self._lock:
            now = _now()
            record = TaskRecord(
                id=self._next_task_id,
                title=title,
                completed=False,
                created_at=now,
                updated_at=now,
            )
            self._next_task_id += 1
            self._tasks[record.id] = record
            self._activity[record.id] = []
            self._log(record.id, "created", None, None)
            return replace(record)

    def list_tasks(
        self,
        page: int,
        limit: int,
        *,
        search: Optional[str] = None,
        status: str = "all",
    ) -> tuple[list[TaskRecord], int]:
        """Return (items for the requested page, total count). Newest first (id desc).

        Filters apply before pagination: `search` is a case-insensitive
        substring match on title; `status` is "all" | "active" | "completed".
        `total` is the count after filtering.
        """
        with self._lock:
            ordered = sorted(self._tasks.values(), key=lambda t: t.id, reverse=True)
            if search:
                needle = search.lower()
                ordered = [t for t in ordered if needle in t.title.lower()]
            if status == "active":
                ordered = [t for t in ordered if not t.completed]
            elif status == "completed":
                ordered = [t for t in ordered if t.completed]
            total = len(ordered)
            start = (page - 1) * limit
            items = [replace(t) for t in ordered[start : start + limit]]
            return items, total

    def get_task(self, task_id: int) -> Optional[TaskRecord]:
        with self._lock:
            record = self._tasks.get(task_id)
            return replace(record) if record else None

    def update_task(
        self,
        task_id: int,
        *,
        title: Optional[str] = None,
        completed: Optional[bool] = None,
    ) -> Optional[TaskRecord]:
        """Apply a partial update. Logs activity only for real changes.

        Returns the (possibly unchanged) record, or None if the task is missing.
        """
        with self._lock:
            record = self._tasks.get(task_id)
            if record is None:
                return None
            changed = False
            if title is not None and title != record.title:
                self._log(task_id, "title_changed", record.title, title)
                record.title = title
                changed = True
            if completed is not None and completed != record.completed:
                self._log(
                    task_id,
                    "status_changed",
                    "completed" if record.completed else "pending",
                    "completed" if completed else "pending",
                )
                record.completed = completed
                changed = True
            if changed:
                record.updated_at = _now()
            return replace(record)

    def delete_task(self, task_id: int) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False
            del self._tasks[task_id]
            del self._activity[task_id]
            return True

    def get_activity(self, task_id: int) -> Optional[list[ActivityRecord]]:
        """Return the task's activity entries newest-first, or None if task missing."""
        with self._lock:
            if task_id not in self._tasks:
                return None
            return [replace(e) for e in reversed(self._activity[task_id])]

    def stats(self) -> tuple[int, int]:
        """Return (total, completed)."""
        with self._lock:
            total = len(self._tasks)
            completed = sum(1 for t in self._tasks.values() if t.completed)
            return total, completed


# Module-level singleton shared by the routers.
store = TaskStore()
