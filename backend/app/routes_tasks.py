"""Task CRUD, stats, and activity routes. All routes require bearer auth."""

import math
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.models import (
    ActivityEntry,
    Task,
    TaskCreate,
    TaskListResponse,
    TaskStats,
    TaskUpdate,
)
from app.security import get_current_user
from app.store import store

router = APIRouter(
    prefix="/tasks",
    tags=["tasks"],
    dependencies=[Depends(get_current_user)],
)


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Task not found")


@router.get("", response_model=TaskListResponse)
def list_tasks(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Literal["all", "active", "completed"] = Query("all"),
) -> TaskListResponse:
    # Filters are applied inside the store before pagination; total reflects
    # the filtered count. Invalid `status` values 422 via the Literal type.
    items, total = store.list_tasks(page, limit, search=search, status=status)
    return TaskListResponse(
        items=[Task.model_validate(t) for t in items],
        total=total,
        page=page,
        limit=limit,
        total_pages=max(1, math.ceil(total / limit)),
    )


@router.post("", response_model=Task, status_code=201)
def create_task(body: TaskCreate) -> Task:
    return Task.model_validate(store.create_task(body.title))


# ROUTE ORDER IS CRITICAL: /tasks/stats must be registered BEFORE /tasks/{task_id},
# otherwise the literal path segment "stats" would be matched by the {task_id}
# route and fail to parse as an int.
@router.get("/stats", response_model=TaskStats)
def get_stats() -> TaskStats:
    total, completed = store.stats()
    return TaskStats(total=total, completed=completed, pending=total - completed)


@router.get("/{task_id}", response_model=Task)
def get_task(task_id: int) -> Task:
    record = store.get_task(task_id)
    if record is None:
        raise _not_found()
    return Task.model_validate(record)


@router.patch("/{task_id}", response_model=Task)
def patch_task(task_id: int, body: TaskUpdate) -> Task:
    record = store.update_task(task_id, title=body.title, completed=body.completed)
    if record is None:
        raise _not_found()
    return Task.model_validate(record)


@router.put("/{task_id}/complete", response_model=Task)
def complete_task(task_id: int) -> Task:
    # Idempotent: the store only logs status_changed on a real transition.
    record = store.update_task(task_id, completed=True)
    if record is None:
        raise _not_found()
    return Task.model_validate(record)


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int) -> Response:
    if not store.delete_task(task_id):
        raise _not_found()
    return Response(status_code=204)


@router.get("/{task_id}/activity", response_model=list[ActivityEntry])
def get_task_activity(task_id: int) -> list[ActivityEntry]:
    entries = store.get_activity(task_id)
    if entries is None:
        raise _not_found()
    return [ActivityEntry.model_validate(e) for e in entries]
