"""Auth: login, protected routes (REST and MCP), and token rotation."""

DEMO_CREDENTIALS = {"email": "admin@example.com", "password": "password123"}


def test_login_returns_token_and_user(client):
    response = client.post("/auth/login", json=DEMO_CREDENTIALS)
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["token"], str) and body["token"]
    assert body["user"] == {"email": "admin@example.com"}


def test_login_wrong_password_rejected(client):
    response = client.post(
        "/auth/login", json={**DEMO_CREDENTIALS, "password": "wrong"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_tasks_require_authentication(client):
    response = client.get("/tasks")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_mcp_requires_authentication(client):
    # The MCP mount is gated by the same bearer middleware as the REST API
    # (including the bare-/mcp path rewrite — no redirect around auth).
    assert client.post("/mcp", json={}).status_code == 401


def test_rotate_revokes_previous_tokens(client, auth):
    assert client.get("/tasks", headers=auth).status_code == 200

    rotated = client.post("/auth/rotate", headers=auth)
    assert rotated.status_code == 200
    new_auth = {"Authorization": f"Bearer {rotated.json()['token']}"}

    # Old token is revoked immediately; the rotated one is the only valid one.
    assert client.get("/tasks", headers=auth).status_code == 401
    assert client.get("/tasks", headers=new_auth).status_code == 200
