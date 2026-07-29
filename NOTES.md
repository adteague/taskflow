# NOTES — Carbon Arc take-home build

Living notepad owned by Claude. Chain-of-thought, open questions, decisions, and
things worth remembering land here. Newest log entries at the bottom.

---

## Spec TL;DR

- Lightweight task manager: REST backend (Python or Node), TypeScript React
  frontend, everything runnable via `docker-compose up --build`.
- Backend on **3001**, frontend on **3000**. In-memory storage is fine.
- Auth: `POST /auth/login` returns a token; all task API calls must validate it.
- Explicitly scoped ~2h, "minimum requirements — try to impress us."
- README must answer: how errors were handled, what tests we'd add, what we'd
  improve with 1 extra hour. Example tests "optional but appreciated."

## Endpoint digest (as spec'd)

| Method | Endpoint              | Notes                                  |
|--------|-----------------------|----------------------------------------|
| GET    | /tasks                | list (frontend needs pagination)       |
| POST   | /tasks                | create                                 |
| GET    | /tasks/:id            | detail                                 |
| PUT    | /tasks/:id/complete   | mark completed                         |
| DELETE | /tasks/:id            | delete                                 |
| GET    | /tasks/stats          | { total, completed, pending }          |
| GET    | /tasks/:id/activity   | entries: timestamp, old status, new    |
| POST   | /auth/login           | returns token                          |

## Gaps & ambiguities found (with proposed resolutions)

1. **No update endpoint in the API table**, but the frontend requires editing
   titles ("Buttons to edit", "Allow editing title"). → Add `PATCH /tasks/:id`
   accepting `{ title?, completed? }`. Keeps the spec'd table intact, fills the
   gap. Call this out in the README assumptions.
2. **Toggle vs. complete**: `PUT /tasks/:id/complete` only marks complete, but
   the UI needs *toggle*. → Keep `/complete` idempotent exactly as spec'd;
   un-completing goes through `PATCH /tasks/:id {completed: false}`. A frontend
   `toggleTask()` helper picks the right call. (Rejected alternative: make
   `/complete` a toggle — surprising semantics for a route named "complete".)
3. **Task model is too thin**: detail page shows "created time"; activity log
   needs old/new values. → Fields: `id, title, completed, createdAt,
   updatedAt`. Activity entry: `{ id, taskId, timestamp, action, field,
   oldValue, newValue }` — covers status changes (required) plus creation and
   title edits (impress).
4. **Pagination**: frontend needs a paginated list but the API table is a bare
   `GET /tasks`. → Server-side pagination: `GET /tasks?page=&limit=` returning
   `{ items, total, page, limit, totalPages }`. Defaults keep the sample curl
   usable.
5. **Port contradiction**: sample curls use `localhost:5000`, the Notes section
   says expose 3001. → 3001 wins (it's the explicit instruction); mention in
   README.
6. **Route-order gotcha**: `/tasks/stats` must be registered before
   `/tasks/:id` or "stats" gets parsed as an ID → 404/422. Easy trap; test it.
7. **ID type**: sample curl does `PUT /tasks/1/complete` → simple incrementing
   ints keep the samples copy-pasteable. In-memory store makes this trivial.
8. **Auth scope**: no user store spec'd, but "show error for invalid
   credentials" implies at least one rejectable case → hardcoded demo user
   (creds displayed on the login page), signed JWT with expiry, auth middleware
   on all `/tasks*` routes. Frontend: 401 → clear token, redirect to login.
9. **"Update UI after edits"** on the detail page → mutation → invalidate/refetch
   task + activity + stats. TanStack Query invalidation handles this cleanly.
10. **Auth vs. sample curls**: the spec requires auth validation on API
    requests, but its sample curls carry no token. → Protect all `/tasks*`
    routes (the explicit requirement wins); README shows the login-first curl
    flow. Unauthenticated `GET /health` added for Docker healthchecks.

## Decisions (PM-approved)

- Backend framework: **FastAPI (Python)** — pydantic validation, free OpenAPI docs.
- UI approach: **Tailwind + shadcn/ui**.
- Docker networking: **Direct + CORS** (PM decision after full tradeoff review,
  2026-07-29). Browser calls the backend on :3001 directly. FastAPI CORS
  middleware, origins from `CORS_ORIGINS` env (default localhost:3000);
  frontend API base from `VITE_API_URL` build arg (default
  http://localhost:3001); nginx serves static only. Rationale: mirror a
  split-host production topology (bundle on CDN, API elsewhere). Accepted
  costs to state in the README: per-env image rebuild (Vite bakes the URL at
  build time), preflight round-trips, containers don't talk directly.
- Impress-features scope: PM selected **all four** (tests, optimistic UI,
  search & filter, seed + polish) — but see sequencing directive below.
- **Sequencing directive (PM, 2026-07-29): get the core build LIVE
  (docker-compose up, all spec requirements working end-to-end) before touching
  any beyond-spec features.**
- Set by me (flag if you disagree): Vite + React 19 + TypeScript, React Router
  (spec requires it), TanStack Query for server state, no global state lib
  (auth token in a tiny context + localStorage).

## Architecture sketch

```
docker-compose
├── backend   (port 3001)
│   ├── routes/    auth, tasks (stats registered before :id)
│   ├── service/   task ops + activity logging (append-only per task)
│   ├── store/     in-memory repo behind a small interface (DB-swappable)
│   └── auth/      login + token verify middleware
└── frontend  (port 3000)
    ├── api/       typed client, auth header injection, 401 interceptor
    ├── pages/     Login, TaskList, TaskDetail
    ├── components/ TaskRow, StatsBar, Pagination, forms, states
    └── router     protected routes (no token → /login)
```

## Build phases (re-scoped per PM: core live first)

1. **Core build** — backend + frontend built in parallel against a fixed API
   contract; Dockerfiles included. No extras: standard query invalidation (no
   optimistic updates), no search/filter, no seed, no dark mode. Loading/error
   states ARE core (spec requires them).
2. **Integration** — docker-compose.yml, `docker-compose up --build`, curl
   smoke test of every endpoint, browser-path verification. **Milestone: LIVE.**
3. **README** — run instructions, assumptions (gap list above), retro answers.
4. **Extras** — tests, optimistic UI, search & filter, seed + polish, CORS
   env-flag. Only after the live milestone.

## Impress backlog (candidates)

- Example tests (spec explicitly appreciates): pytest/vitest API tests, a
  component test or two.
- OpenAPI docs (free with FastAPI at `/docs`).
- Optimistic updates + toasts (instant-feeling toggles/deletes with rollback).
- Search / filter (all-active-completed) / sort on the list page.
- Seed data so the app demos well on first `docker-compose up`.
- Empty states, loading skeletons, dark mode.
- Compose healthchecks + `depends_on: condition: service_healthy`.

## MCP server idea (PM-raised, assessed 2026-07-29)

Difficulty: LOW (~30–60 min) because the store sits behind a narrow interface.
- **Must be in-process**: the store is in-memory in the FastAPI process. Mount
  the official MCP Python SDK's FastMCP as an ASGI sub-app at `/mcp`
  (Streamable HTTP transport). A separate-process MCP server importing
  TaskStore would get its own empty copy — trap. (Alternative: separate stdio
  server proxying the REST API — works, but extra moving part.)
- Tools map 1:1 onto the store/service: list_tasks, create_task, update_task,
  complete_task, delete_task, get_stats, get_activity.
- Agent actions flow through the same service → activity log + UI stats update
  live. Great demo: agent creates a task, human sees it appear.
- Auth: reuse the JWT as a Bearer header on /mcp (spec-consistent; full OAuth
  2.1 is overkill here). Claude Code connects via
  `claude mcp add --transport http --header "Authorization: Bearer <t>"`.
- Docs for agents: MCP is self-describing (tools/list returns name +
  description + JSON schema on connect) → the tool descriptions ARE the agent
  docs, write them deliberately. Plus: server `instructions` field on
  initialize, optional `docs://usage` MCP resource, and a human-facing
  `docs/MCP.md` + README section.

## Extras phase (PM-scoped, 2026-07-29)

Context from PM: this is a technical assessment for a **Solutions Engineering
role at Carbon Arc** (carbonarc.co). UI must adopt their brand.

Brand tokens extracted from carbonarc.co's live CSS bundle:
- Accent: **#ff5a00 orange** (dominant; lighter #ff8a3d, darker #e65100)
- Dark theme (their default): background `0 0% 0%` (pure black), card
  `240 6% 10%` (#17171a-ish), border `0 0% 30%`, foreground `0 0% 98%`
- Light theme tokens also present (background white, borders `20 5.9% 90%`)
- Font: **Inter** (loaded from rsms.me/inter), ui-monospace stack for code
- They use shadcn-style HSL custom properties — same convention as our app
- Ignore markdown-editor lib colors (#0d1117 GitHub palette) — not brand

Agent assignments (PM-directed):
1. Seed agent → realistic SE-themed seed data (backdated, real activity
   histories) + backend `search`/`status` params (needed by agent 3).
2. MCP agent (after 1, same files) → in-process FastMCP at /mcp, JWT Bearer,
   prescriptive tool descriptions, instructions, docs://usage resource,
   repo-root docs/MCP.md.
3. Frontend agent (parallel) → Carbon Arc dark-default restyle, then
   optimistic UI, skeleton polish, search/filter UI.

Still pending after this phase: tests, README (+ retro answers), final
integration re-verify.

## Log

- **2026-07-29** — **STATUS WORKFLOW + KANBAN (final feature phase).** With
  ~15 min left on the exam clock the PM requested: four statuses
  (backlog → todo → in_progress → complete, "pending" renamed to
  in progress, new tasks land in todo), clickable badge-dropdown for status
  changes, status filter dropdown replacing the segmented control, and a
  Kanban board. Key ruling: `status` is the source of truth while the spec's
  required `completed: boolean`, stats trio, and PUT /complete stay intact
  (completed derived = status=="complete") — extend the contract, never break
  it. Split for speed: backend + tests inline, frontend via a
  context-inheriting fork (vendored dropdown-menu, /board route with
  optimistic column moves). Seed redistributed 3/3/3/5 across columns; MCP
  update_task/list_tasks made status-aware. 15/15 tests, 9/9 live checks,
  pushed as 016827a.
- **2026-07-29** — Docs polish (PM-requested): status workflow documented in
  all three MCP-doc homes — docs/MCP.md (intro + tool catalog), the
  docs://usage resource, and the connect-time instructions text. Tool schemas
  were already current via self-description; the prose now matches.

- **2026-07-29** — Reviewed spec. Found 10 gaps/ambiguities (above), the big
  three: no update endpoint despite edit requirements, toggle-vs-complete
  semantics, pagination unspecified on the backend. Proposed architecture and
  phases; presenting stack decisions to PM.
- **2026-07-29** — PM decisions: FastAPI, Tailwind+shadcn/ui, all four extras.
  PM directive: core build live before extras. Networking question deferred
  mid-discussion → building proxy-only core, CORS flag in backlog. Kicking off
  parallel backend/frontend build against the frozen contract below.
- **2026-07-29** — PM refinements to the MCP page: removed the curl
  "mint a fresh token" block and the Resources & instructions card; added
  in-app **token rotation** with two-step confirmation. Backend now has REAL
  revocation (in-memory token-version claim "tv" checked in verify_token;
  `POST /auth/rotate` bumps it — all prior tokens 401 instantly across REST,
  /mcp-info, and /mcp; verified live). Frontend swaps the fresh token into the
  session in place (no re-login). Renamed MCP server "task-manager" →
  "TaskFlow" and the client alias in connect commands → `taskflow` (lowercase
  alias convention: it becomes tool prefixes in MCP clients). Note: rotation
  is version-based and in-memory — a backend restart resets versions (and all
  data), consistent with the app's ephemerality; README should mention it.
- **2026-07-29** — PM hit 401 visiting /mcp in a browser and asked how MCP
  auth works + for an MCP details page. Built (inline, not agents): backend
  `GET /mcp-info` (authenticated; introspects FastMCP live via
  list_tools/list_resources — page can't drift from reality) + frontend
  "Connect an Agent" page at /mcp (connection card, masked/revealable session
  JWT with copy, ready-to-paste `claude mcp add` command, fresh-token curl,
  live tool catalog with param badges, resources + connect instructions),
  MCP nav link in header. Verified live: /mcp-info 401/200, page serves,
  tsc + build clean. Key clarification for PM: no settings page needed —
  the MCP token IS the session JWT from /auth/login.
- **2026-07-29** — **EXTRAS PHASE VERIFIED LIVE.** Rebuilt containers; 12/12
  checks passed: 14 seeded SE-themed tasks (5 completed) with backdated
  chronological activity, server-side search/status filters (+422 on invalid),
  /mcp 401-gated (incl. the bare-path 307 bypass the MCP agent caught and
  fixed), full MCP client handshake through the composed stack (7 tools,
  get_stats + filtered list_tasks returning seeded data), branded frontend
  serving: dark pre-paint script w/ #000 flash guard, self-hosted Inter,
  primary #ff5900/#c74600 (dark/light), card #18181b, border #2e2e2e.
  Frontend adds: optimistic toggle/edit/delete w/ rollback toasts,
  filter-aware cache updates, debounced search + segmented filter w/ URL
  state, theme toggle (default dark). Remaining scope: example tests,
  README + retro answers.
- **2026-07-29** — Delivered full networking tradeoff review to PM (image
  portability, preflight tax, compose networking, misconfig surface,
  split-host future). PM ruled: **Direct + CORS** to mirror split-host
  production. Contract + compose updated; parallel backend/frontend build
  launched. Docker Desktop was down — started it for the integration phase.
- **2026-07-29** — **LIVE MILESTONE.** `docker compose up --build` brings up
  both services (backend healthy-gated); 26/26 end-to-end smoke checks passed
  against the running containers: full auth flow, CRUD, pagination
  (newest-first, totalPages), stats, idempotent complete, activity history,
  404s, CORS preflight, SPA fallback, baked API URL verified in the served
  bundle. Store left empty after test cleanup. Backend agent: 100% pass, no
  contract deviations. Frontend agent: zero TS errors, 133KB gzipped bundle.
- **2026-07-29** — PM proposed switching to Next.js mid-build. Stopped the
  build (no files written yet) and flagged the conflict: the spec explicitly
  says "Use React Router for navigation," and Next.js replaces React Router
  with its own file-based router. Offered Next.js-anyway and React Router v7
  framework mode as alternatives. **PM ruled: stay with Vite + React Router
  (library mode).** Good README material: Next.js was considered and rejected
  for spec compliance. Backend relaunched separately (run wf_a77db62e-01d),
  frontend relaunched after the decision.

## API contract (frozen for the core build)

JSON is camelCase. Every non-2xx response body carries `detail`.
- `POST /auth/login` `{email, password}` → 200 `{token, user:{email}}` | 401.
  Demo user: `admin@example.com` / `password123` (shown on login page). JWT
  HS256, 24h expiry, secret from `JWT_SECRET` env (dev default).
- All `/tasks*` routes require `Authorization: Bearer <token>` → else 401.
- Task: `{id:int, title, completed, createdAt, updatedAt}` (ISO-8601 UTC).
- `GET /tasks?page=&limit=` → `{items, total, page, limit, totalPages}`
  (page≥1 default 1; limit 1–100 default 10; past-the-end page → empty items).
- `POST /tasks {title}` → 201 Task (title trimmed, 1–200 chars, else 422).
- `GET /tasks/stats` → `{total, completed, pending}` (before /:id in routing!).
- `GET /tasks/{id}` → Task | 404. `PATCH /tasks/{id} {title?, completed?}` →
  Task | 404 | 422 (at least one field). `PUT /tasks/{id}/complete` → Task,
  idempotent | 404. `DELETE /tasks/{id}` → 204 | 404.
- `GET /tasks/{id}/activity` → `[{id, taskId, timestamp, action, oldValue,
  newValue}]` newest-first | 404. Actions: `created`, `title_changed`,
  `status_changed` (old/new = "pending"/"completed").
- `GET /health` (no auth) → `{status: "ok"}` — for Docker healthcheck.
- **Extras addendum (2026-07-29):** `GET /tasks` gains optional `search`
  (case-insensitive substring on title) and `status` (`all`|`active`|
  `completed`, default `all`), applied BEFORE pagination; envelope unchanged;
  invalid status → 422. Seed data behind `SEED_DATA` env (default true).
  MCP server mounted in-process at `/mcp` (Streamable HTTP, same JWT Bearer).
- Direct + CORS: browser calls `VITE_API_URL` (default
  `http://localhost:3001`) straight from the frontend; nginx serves static
  only; backend allows origins from `CORS_ORIGINS`. Vite dev server pinned to
  port 3000 for origin parity.
- List order: `GET /tasks` returns newest-first (id desc);
  `totalPages = max(1, ceil(total/limit))`.
