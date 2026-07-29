"""MCP server exposing the shared in-memory task store to AI agents.

Mounted IN-PROCESS on the FastAPI app at /mcp (see app/main.py) so that MCP
tools operate on the exact same TaskStore singleton as the REST routes — a
separate process would get its own empty copy of the store.

Every tool is a thin wrapper over the SAME route handler functions in
app/routes_tasks.py (which in turn call the store), so business logic,
validation, and response shapes (camelCase JSON) are defined exactly once.

Auth: the mounted ASGI app is wrapped in BearerAuthASGIMiddleware, which
requires the same JWT bearer tokens as the REST API (app/security.py).
"""

from typing import Annotated, Any, Literal, Optional

from fastapi import HTTPException
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import Field, ValidationError
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app import routes_tasks
from app.models import TaskCreate, TaskUpdate
from app.security import verify_token

INSTRUCTIONS = (
    "This server manages the user's task list (a simple task manager: tasks "
    "have an integer id, a title, a completed flag, and timestamps). Suggested "
    "workflow: call get_stats first for a quick overview, and list_tasks to "
    "see current tasks (newest first) before mutating anything. All task ids "
    "are integers taken from list_tasks/create_task results — never guess "
    "them. Read the docs://usage resource for fuller documentation."
)

USAGE_DOC = """\
# Task Manager MCP — Usage Guide

This server exposes a task manager's live, in-memory task store. It is the
same data the human user sees in their web UI, so mutations take effect for
them immediately.

## Data model

A task: `{"id": 3, "title": "...", "completed": false,
"createdAt": "<ISO 8601>", "updatedAt": "<ISO 8601>"}`.
Ids are integers, assigned by the server. All field names are camelCase.

## Recommended workflow

1. `get_stats` — cheap overview (total / completed / pending counts).
2. `list_tasks` — page through tasks (newest first). Use `search` and
   `status` to narrow results instead of paging through everything.
3. Mutate with `create_task`, `update_task`, `complete_task`, `delete_task`,
   using ids taken from `list_tasks` results — never guess ids.
4. `get_activity` — per-task audit trail when you need history ("when was
   this renamed/completed?").

## Rules and edge cases

- Titles: 1–200 characters after trimming whitespace; longer or blank titles
  are rejected with a validation error.
- `update_task` requires at least one of `title` / `completed`.
- `complete_task` is idempotent — completing a completed task is a no-op.
- `delete_task` is permanent and also deletes the task's activity history.
- Tools that reference a missing id return a "Task not found" tool error.
- `list_tasks` pagination: `total` is the count after filtering;
  `totalPages` is at least 1 even when there are no results.
"""

mcp = FastMCP(
    name="TaskFlow",
    instructions=INSTRUCTIONS,
    # Stateless: each HTTP request is self-contained; no server-side session
    # state to lose on restart, and no session-id bookkeeping for clients.
    stateless_http=True,
    json_response=True,
    # The FastAPI app mounts this ASGI app at /mcp, so serve at the sub-app
    # root ("/") rather than the SDK default ("/mcp" would yield /mcp/mcp).
    streamable_http_path="/",
)


# --- helpers -----------------------------------------------------------------


def _call_route(fn, *args, **kwargs):
    """Invoke a REST route handler, converting HTTPException to a tool error."""
    try:
        return fn(*args, **kwargs)
    except HTTPException as exc:
        raise ToolError(str(exc.detail)) from exc


def _validated(model_cls, **data):
    """Build a request model, converting ValidationError to a tool error."""
    try:
        return model_cls(**data)
    except ValidationError as exc:
        detail = "; ".join(
            err["msg"].removeprefix("Value error, ") for err in exc.errors()
        )
        raise ToolError(detail) from exc


def _dump(model) -> dict[str, Any]:
    """Serialize a response model to the same camelCase JSON as the REST API."""
    return model.model_dump(mode="json", by_alias=True)


_TASK_ID_PARAM = Annotated[
    int, Field(description="Integer id of the task, as returned by list_tasks.")
]


# --- tools -------------------------------------------------------------------


@mcp.tool(
    description=(
        "Call this to see the user's tasks. Returns one page of tasks, newest "
        "first, plus pagination metadata (total, page, limit, totalPages). "
        "Use search/status filters to find specific tasks instead of paging "
        "through everything. Call this before updating, completing, or "
        "deleting so you operate on real task ids."
    )
)
def list_tasks(
    page: Annotated[
        int, Field(ge=1, description="1-based page number to fetch.")
    ] = 1,
    limit: Annotated[
        int, Field(ge=1, le=100, description="Tasks per page (1-100).")
    ] = 10,
    search: Annotated[
        Optional[str],
        Field(
            description=(
                "Optional case-insensitive substring match on the task title. "
                "Omit to include all titles."
            )
        ),
    ] = None,
    status: Annotated[
        Literal["all", "active", "completed"],
        Field(
            description=(
                "Filter by completion state: 'active' = not completed, "
                "'completed' = completed, 'all' = no filter (default)."
            )
        ),
    ] = "all",
) -> dict[str, Any]:
    return _dump(
        _call_route(
            routes_tasks.list_tasks, page=page, limit=limit, search=search,
            status=status,
        )
    )


@mcp.tool(
    description=(
        "Call this to add a new task to the user's list. The task starts as "
        "not completed. Returns the created task, including its server-assigned "
        "integer id."
    )
)
def create_task(
    title: Annotated[
        str,
        Field(description="Task title, 1-200 characters after trimming whitespace."),
    ],
) -> dict[str, Any]:
    body = _validated(TaskCreate, title=title)
    return _dump(_call_route(routes_tasks.create_task, body))


@mcp.tool(
    description=(
        "Call this to rename a task and/or set its completed state. Provide at "
        "least one of title/completed; omitted fields are left unchanged. "
        "Returns the updated task. Fails with a tool error if the task id does "
        "not exist."
    )
)
def update_task(
    task_id: _TASK_ID_PARAM,
    title: Annotated[
        Optional[str],
        Field(
            description=(
                "New title (1-200 characters after trimming). Omit to keep the "
                "current title."
            )
        ),
    ] = None,
    completed: Annotated[
        Optional[bool],
        Field(
            description=(
                "New completed state: true = completed, false = active. Omit "
                "to keep the current state."
            )
        ),
    ] = None,
) -> dict[str, Any]:
    body = _validated(TaskUpdate, title=title, completed=completed)
    return _dump(_call_route(routes_tasks.patch_task, task_id, body))


@mcp.tool(
    description=(
        "Call this to mark a task as completed (done). Idempotent: completing "
        "an already-completed task is a harmless no-op. Returns the task in its "
        "completed state. To un-complete a task, use update_task with "
        "completed=false."
    )
)
def complete_task(task_id: _TASK_ID_PARAM) -> dict[str, Any]:
    return _dump(_call_route(routes_tasks.complete_task, task_id))


@mcp.tool(
    description=(
        "Call this to permanently delete a task. This cannot be undone and "
        "also removes the task's activity history — confirm intent before "
        "deleting. Returns a confirmation with the deleted task's id."
    )
)
def delete_task(task_id: _TASK_ID_PARAM) -> dict[str, Any]:
    _call_route(routes_tasks.delete_task, task_id)
    return {"deleted": True, "taskId": task_id}


@mcp.tool(
    description=(
        "Call this for a quick overview of the user's task list before diving "
        "into details. Returns counts: total, completed, and pending (not "
        "completed). Cheap — good first call."
    )
)
def get_stats() -> dict[str, Any]:
    return _dump(_call_route(routes_tasks.get_stats))


@mcp.tool(
    description=(
        "Call this to see a single task's audit trail: when it was created, "
        "renamed, completed, or reopened. Returns activity entries newest "
        "first; each has an action ('created', 'title_changed', "
        "'status_changed') plus oldValue/newValue and a timestamp. Use this to "
        "answer history questions, not for current state (use list_tasks)."
    )
)
def get_activity(task_id: _TASK_ID_PARAM) -> list[dict[str, Any]]:
    entries = _call_route(routes_tasks.get_task_activity, task_id)
    return [_dump(entry) for entry in entries]


# --- resources ---------------------------------------------------------------


@mcp.resource(
    "docs://usage",
    name="usage-guide",
    description=(
        "Full usage documentation for this task-manager server: data model, "
        "recommended workflow, validation rules, and edge cases. Read this "
        "before complex or bulk operations."
    ),
    mime_type="text/markdown",
)
def usage_guide() -> str:
    return USAGE_DOC


# --- auth + ASGI wiring ------------------------------------------------------


class BearerAuthASGIMiddleware:
    """Require the REST API's JWT bearer tokens on every request to /mcp.

    Reuses app.security.verify_token, so /mcp accepts exactly the tokens
    issued by POST /auth/login and rejects everything else with the same
    401 JSON shape as the REST API.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        auth_header = ""
        for key, value in scope.get("headers", []):
            if key == b"authorization":
                auth_header = value.decode("latin-1")
                break
        scheme, _, token = auth_header.partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token or verify_token(token) is None:
            response = JSONResponse(
                {"detail": "Not authenticated"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


def build_mcp_asgi_app() -> ASGIApp:
    """Streamable HTTP ASGI app for /mcp, wrapped with bearer auth.

    Must be called before the FastAPI lifespan touches mcp.session_manager
    (creating the app also creates the session manager). app/main.py calls
    this at app-construction time, which satisfies that ordering.
    """
    return BearerAuthASGIMiddleware(mcp.streamable_http_app())
