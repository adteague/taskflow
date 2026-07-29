"""Shared fixtures: the app under test with a clean, unseeded in-memory store.

The TestClient is session-scoped because the MCP streamable-HTTP session
manager (started by the app lifespan) can only be run once per FastMCP
instance — per-test lifespans would crash on the second startup. Test
isolation comes from resetting the store singleton between tests instead.
"""

import os
import sys
from pathlib import Path

import pytest

# Make the backend package importable regardless of where pytest is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Tests always start from an empty store. Must be set before the app lifespan
# runs (seeding happens on startup).
os.environ["SEED_DATA"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.store import store  # noqa: E402

DEMO_CREDENTIALS = {"email": "admin@example.com", "password": "password123"}


@pytest.fixture(scope="session")
def client():
    # Context-manager form runs the lifespan (seed guard + MCP session manager).
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def clean_store():
    """Reset the in-memory singleton so every test starts empty.

    Reaches into private members, which is acceptable in tests: the store is
    process-local and deliberately has no public truncate operation.
    """
    with store._lock:
        store._tasks.clear()
        store._activity.clear()
        store._next_task_id = 1
        store._next_activity_id = 1
    yield


@pytest.fixture
def auth(client):
    """Fresh Authorization headers per test.

    Logging in per test keeps tests order-independent even across the token
    rotation test: new logins always carry the current token version.
    """
    response = client.post("/auth/login", json=DEMO_CREDENTIALS)
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}
