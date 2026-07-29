"""App factory: CORS middleware, router registration, /health, /mcp mount,
combined seed + MCP session-manager lifespan."""

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app.mcp_server import build_mcp_asgi_app, mcp
from app.routes_auth import router as auth_router
from app.routes_mcp_info import router as mcp_info_router
from app.routes_tasks import router as tasks_router
from app.seed import seed_if_enabled

DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


class MCPPathRewriteMiddleware:
    """Serve bare /mcp without a redirect.

    Starlette mounts only match "/mcp/...", so a request to exactly "/mcp"
    would get a 307 redirect from the outer router BEFORE the MCP bearer-auth
    middleware runs. Rewriting the path up front means /mcp answers directly
    (401 without a token, MCP protocol with one) and clients that don't follow
    POST redirects still connect at the documented URL.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path") == "/mcp":
            scope = {**scope, "path": "/mcp/", "raw_path": b"/mcp/"}
        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Seed demo data on startup (no-op when SEED_DATA is disabled).
    seed_if_enabled()
    # The MCP streamable-HTTP session manager must be running for the /mcp
    # mount to serve requests (mounted sub-apps don't get their own lifespan
    # events, so we run it inside the FastAPI lifespan). Without this, every
    # /mcp request would 500.
    async with mcp.session_manager.run():
        yield


def create_app() -> FastAPI:
    app = FastAPI(title="Task Manager API", version="1.0.0", lifespan=lifespan)

    origins = [
        origin.strip()
        for origin in os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,  # Bearer tokens, not cookies
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_middleware(MCPPathRewriteMiddleware)

    app.include_router(auth_router)
    app.include_router(tasks_router)
    app.include_router(mcp_info_router)

    # MCP server, in-process so it shares the same in-memory store as the
    # REST routes. Bearer-auth-wrapped; must be built before startup so the
    # session manager exists when the lifespan starts it.
    app.mount("/mcp", build_mcp_asgi_app())

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
