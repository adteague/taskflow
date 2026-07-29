# TaskFlow

A task management app built as a take-home for Carbon Arc: **FastAPI** backend,
**React + TypeScript** frontend, fully Dockerized — plus an **MCP server** so AI
agents can manage the same live task list a human sees in the UI.

The interface adopts Carbon Arc's visual identity (dark-first, `#ff5a00` accent,
Inter) as a Solutions Engineering nod: demoing your product's aesthetic back to
you.

## Quick start

```bash
docker-compose up --build   # or: docker compose up --build
```

| Surface | URL | Notes |
|---|---|---|
| Web app | http://localhost:3000 | Log in with `admin@example.com` / `password123` |
| REST API | http://localhost:3001 | Interactive OpenAPI docs at `/docs` |
| MCP server | http://localhost:3001/mcp | See [docs/MCP.md](docs/MCP.md), or the in-app **MCP** page |

The app starts with 14 seeded demo tasks (two weeks of realistic activity
history). Set `SEED_DATA=false` to start empty. Other env knobs (all optional,
sensible defaults): `JWT_SECRET`, `CORS_ORIGINS`, `VITE_API_URL` (frontend
build arg).

## What's here

**Spec requirements** — JWT login, task CRUD, server-side pagination, stats,
per-task activity log (timestamp, old status, new status), task detail page
with title editing and completion toggling, loading/error/empty states, React
Router navigation, auth-validated API requests, Dockerfiles + compose.

**Beyond spec:**

- **MCP server, in-process** — agents connect over Streamable HTTP at `/mcp`
  (same JWT auth as the API) and operate on the *same in-memory store* as the
  UI: an agent-created task appears in the browser instantly, with an activity
  log entry. The in-app "Connect an Agent" page shows your token, a
  ready-to-paste connect command, and the live tool catalog (introspected from
  the running server via `GET /mcp-info`, so it can't drift).
- **Token rotation with real revocation** — tokens carry a version claim;
  `POST /auth/rotate` (two-step confirmation in the UI) mints a fresh token and
  immediately invalidates every previously issued one.
- **Server-side search & status filtering** applied before pagination, exposed
  in both REST and MCP, with debounced, URL-persisted controls in the UI.
- **Optimistic UI** — toggle/edit/delete update instantly with snapshot
  rollback and toasts on failure.
- **Seeded demo data**, dark/light theming (dark default, pre-paint script to
  avoid flash), health-check-gated compose startup.

## Architecture

```
docker-compose
├── backend  (FastAPI, port 3001)
│   ├── routes_*        REST endpoints (camelCase JSON, /tasks/stats before /tasks/{id})
│   ├── mcp_server      FastMCP mounted at /mcp — thin wrappers over the same handlers
│   ├── store           in-memory TaskStore behind a narrow interface (DB-swappable)
│   └── security        JWT create/verify + version-based revocation
└── frontend (nginx serving static build, port 3000)
    └── Vite + React 19 + TS strict, React Router v7, TanStack Query v5,
        Tailwind v4 + shadcn-style components
```

**Networking:** Direct + CORS — the browser calls `localhost:3001` directly and
the backend allowlists the frontend origin. Chosen deliberately to mirror a
split-host production topology (static bundle on a CDN, API elsewhere).
Accepted tradeoffs, documented rather than discovered: the API URL is baked
into the bundle at build time (per-environment image builds), and cross-origin
requests pay CORS preflights. The alternative (nginx reverse proxy, single
origin, build-once images) is a config-level change away.

**Framework note:** Next.js was considered for the frontend and rejected — the
spec explicitly requires React Router, which Next.js replaces with its own
router.

## API

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/auth/login` | → `{token, user}`; 401 on bad credentials |
| POST | `/auth/rotate` | Mint fresh token, revoke all prior tokens *(added)* |
| GET | `/tasks?page&limit&search&status` | Paginated envelope, newest first |
| POST | `/tasks` | 201; title validated (1–200 chars, trimmed) |
| GET | `/tasks/{id}` | 404 when missing |
| PATCH | `/tasks/{id}` | Edit title and/or completed *(added — see assumptions)* |
| PUT | `/tasks/{id}/complete` | Idempotent mark-complete |
| DELETE | `/tasks/{id}` | 204 |
| GET | `/tasks/stats` | `{total, completed, pending}` |
| GET | `/tasks/{id}/activity` | Newest-first entries with old/new values |
| GET | `/mcp-info` | Live MCP tool catalog *(added)* |
| GET | `/health` | Unauthenticated; Docker healthcheck *(added)* |

All `/tasks*` and `/mcp*` routes require `Authorization: Bearer <token>`.

## Assumptions & simplifications

1. **The spec's API table has no update endpoint, but the frontend must edit
   titles** ("Buttons to edit", "Allow editing title") — added
   `PATCH /tasks/{id}`. Similarly, the UI needs to *toggle* completion while
   `PUT .../complete` only marks complete: `/complete` stays idempotent as
   spec'd; un-completing goes through `PATCH`.
2. **Port contradiction in the spec** — sample curls use `localhost:5000`, the
   notes say expose on 3001. The explicit instruction wins: 3001.
3. **Auth everywhere** — the spec's sample curls carry no token, but "API
   requests must include login auth validation" is explicit; all task routes
   are protected (so the sample curls need a login first).
4. **In-memory, single-process store** (explicitly allowed) — data resets on
   restart, and the design requires exactly one uvicorn worker. The store sits
   behind a seven-method interface, so a real database is a contained swap.
   Token-version revocation is in-memory too and resets with the process.
5. **Single hardcoded demo user** — the spec implies at least one rejectable
   credential case; a user store was out of scope. JWTs expire after 24h.
6. **Pagination contract invented** (the spec requires paginated UI but no
   backend shape): `{items, total, page, limit, totalPages}`, newest-first,
   filters applied before pagination.
7. **Seed data on by default** for a good first-run demo; `SEED_DATA=false`
   for a clean slate.

## Q&A

### How did you handle API errors?

On the backend: consistent error bodies (`{"detail": ...}`) with correct
status codes — 401 for missing/invalid/revoked tokens (with
`WWW-Authenticate`), 404 for missing tasks, 422 for validation failures
(pydantic-enforced title bounds, invalid filter values, empty PATCH), 204 for
deletes. The MCP layer converts those same errors into MCP *tool errors* with
readable messages rather than protocol failures, and `/tasks/stats` is
registered before `/tasks/{id}` so "stats" is never parsed as an id.

On the frontend: a single fetch wrapper normalizes failures into typed
`ApiError` / `NetworkError` (offline/CORS) classes; every data surface has its
own error state with retry rather than a blank screen; any 401 from a
protected endpoint clears the session and redirects to login; optimistic
mutations snapshot the cache and roll back with a prominent toast on failure;
stats failures degrade to placeholders instead of blocking the page; a missing
task id renders a not-found view with a way back.

### What tests would you write if given more time?

- **Backend (pytest + FastAPI TestClient):** auth (bad credentials, expired
  and post-rotation tokens), CRUD + validation edges (title bounds, empty
  PATCH, 404s, non-numeric ids), pagination/filter combinations including
  past-the-end pages and `totalPages` floors, activity ordering and the
  idempotent-complete guarantee (exactly one status entry), and a regression
  test that `/tasks/stats` isn't shadowed by `/tasks/{id}`. `SEED_DATA=false`
  gives tests a clean store.
- **MCP integration:** SDK-client tests asserting the handshake, the 7-tool
  inventory, auth middleware (401 without a token), and the shared-store
  property (create via MCP → visible via REST).
- **Frontend (Vitest + Testing Library + MSW):** auth guard redirects,
  optimistic rollback on mutation failure, pagination stepping back when a
  delete empties the page, and debounced search + filter state.
- **End-to-end (Playwright against compose):** login → create → edit →
  complete → verify activity → delete, as a CI smoke.

### What would you improve with 1 extra hour?

1. Ship the test suite above and wire it into GitHub Actions (typecheck,
   build, backend tests, compose smoke).
2. Swap the in-memory store for SQLite behind the existing store interface —
   persistence across restarts and multi-worker safety with minimal churn.
3. Harden auth: short-lived access tokens with refresh, per-user token
   versions, and rate limiting on login.
4. Accessibility and polish pass: focus management in dialogs, keyboard
   shortcuts, `aria-live` for optimistic updates and toasts.

## Running tests

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
```

14 example tests (pytest + FastAPI `TestClient`, fully in-process — no ports or
Docker required) covering auth and rotation-revocation, CRUD validation edges,
the `/tasks/stats` route-order regression, pagination and filters, idempotent
completion's activity logging, and the MCP auth gate.

## Repo notes

- `NOTES.md` is the working log kept during the build — spec-gap analysis,
  decision rationale (networking, framework), and verification records.
- `docs/MCP.md` documents the MCP server for humans; the server itself is
  self-describing to agents.
