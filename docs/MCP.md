# MCP Server

The backend exposes its task store to AI agents over the [Model Context
Protocol](https://modelcontextprotocol.io) at `/mcp` (Streamable HTTP). The MCP
server is mounted in-process on the FastAPI app, so agents operate on the exact
same in-memory store as the REST API and the web UI — a change made by an agent
is immediately visible to the user, and vice versa. All tools are thin wrappers
over the same handlers the REST routes use, so validation and response shapes
(camelCase JSON) are identical.

Tasks move through a four-status workflow — `backlog` → `todo` →
`in_progress` → `complete` — and new tasks start in `todo`. The `completed`
boolean is derived (true exactly when `status` is `complete`); agents should
prefer reading and writing `status`.

> **In-app connection page:** log in to the web UI and open **MCP** in the
> header nav (http://localhost:3000/mcp). It shows the server URL, your
> current session token with copy buttons, a ready-to-paste connect command,
> and the live tool catalog (served by the authenticated `GET /mcp-info`
> endpoint, introspected from the running MCP server).

## Authentication

`/mcp` requires the same JWT bearer tokens as the REST API. Get one from the
login endpoint:

```bash
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password123"}'
# => {"token": "<JWT>", "user": {"email": "admin@example.com"}}
```

Requests without a valid `Authorization: Bearer <token>` header receive
`401 {"detail": "Not authenticated"}`.

## Connecting

Example with Claude Code:

```bash
claude mcp add --transport http taskflow http://localhost:3001/mcp \
  --header "Authorization: Bearer <token>"
```

Any MCP client that supports the Streamable HTTP transport and custom headers
works the same way. The server runs in stateless HTTP mode, so no session
handshake state needs to survive restarts.

## Tool catalog

| Tool | When to use | Returns |
|---|---|---|
| `list_tasks(page, limit, search, status)` | See the user's tasks; find ids before mutating. Filters: `search` (title substring), `status` (a specific status — `backlog`/`todo`/`in_progress`/`complete` — or `active` = not complete, `completed`, `all`). | One page of tasks, newest first, plus `total`, `page`, `limit`, `totalPages`. |
| `create_task(title)` | Add a new task (starts in `todo`). | The created task with its server-assigned integer id. |
| `update_task(task_id, title?, status?, completed?)` | Rename a task and/or move it through the workflow (at least one field required). Prefer `status`; the legacy `completed` boolean maps true → `complete`, false → `todo`, and `status` wins when both are sent. | The updated task. |
| `complete_task(task_id)` | Mark a task done (status `complete`). Idempotent. | The task in its completed state. |
| `delete_task(task_id)` | Permanently remove a task (and its activity history). | `{"deleted": true, "taskId": <id>}`. |
| `get_stats()` | Quick overview; good first call. | Spec'd `{"total", "completed", "pending"}` plus per-status counts (`backlog`, `todo`, `inProgress`). |
| `get_activity(task_id)` | Audit-trail questions ("when was this renamed or moved?"). | Activity entries, newest first, with `action`, `oldValue`, `newValue` (status names for `status_changed`), `timestamp`. |

Missing task ids and invalid input (e.g. an empty title) come back as tool
errors with a clear message, not protocol failures.

## Resources

`docs://usage` — a Markdown usage guide (data model, recommended workflow,
validation rules, edge cases) that agents can read on demand.

## Self-describing

The server is self-describing: connect and call `tools/list` to get the full
tool inventory with parameter schemas and descriptions, `resources/list` for
resources, and the `initialize` response includes server-level instructions
with a suggested workflow.
