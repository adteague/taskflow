"""Tasks API: CRUD, validation, pagination/filtering, stats, and activity."""


def create_task(client, auth, title):
    response = client.post("/tasks", json={"title": title}, headers=auth)
    assert response.status_code == 201
    return response.json()


def test_create_task_returns_camel_case_shape(client, auth):
    task = create_task(client, auth, "Write report")
    assert set(task) == {"id", "title", "completed", "status", "createdAt", "updatedAt"}
    assert task["id"] == 1
    assert task["title"] == "Write report"
    assert task["completed"] is False
    assert task["status"] == "todo"  # new tasks land in todo


def test_title_validation_bounds(client, auth):
    assert (
        client.post("/tasks", json={"title": "   "}, headers=auth).status_code == 422
    )
    assert (
        client.post("/tasks", json={"title": "x" * 201}, headers=auth).status_code
        == 422
    )
    # 200 chars after trimming is the inclusive maximum.
    assert (
        client.post("/tasks", json={"title": "x" * 200}, headers=auth).status_code
        == 201
    )


def test_get_missing_task_404(client, auth):
    response = client.get("/tasks/999", headers=auth)
    assert response.status_code == 404
    assert response.json()["detail"] == "Task not found"


def test_patch_requires_at_least_one_field(client, auth):
    task = create_task(client, auth, "Original")
    response = client.patch(f"/tasks/{task['id']}", json={}, headers=auth)
    assert response.status_code == 422


def test_delete_then_404(client, auth):
    task = create_task(client, auth, "Ephemeral")
    assert client.delete(f"/tasks/{task['id']}", headers=auth).status_code == 204
    assert client.get(f"/tasks/{task['id']}", headers=auth).status_code == 404


def test_stats_route_not_shadowed_by_id_route(client, auth):
    # /tasks/stats must be registered before /tasks/{id}, or "stats" would be
    # parsed as an id. This is the regression test for that route ordering.
    for i in range(3):
        create_task(client, auth, f"Task {i}")
    client.put("/tasks/1/complete", headers=auth)

    response = client.get("/tasks/stats", headers=auth)
    assert response.status_code == 200
    assert response.json() == {
        "total": 3,
        "completed": 1,
        "pending": 2,
        "backlog": 0,
        "todo": 2,
        "inProgress": 0,
    }


def test_pagination_newest_first_and_total_pages(client, auth):
    for i in range(5):
        create_task(client, auth, f"Task {i}")

    page1 = client.get("/tasks?page=1&limit=2", headers=auth).json()
    assert [task["id"] for task in page1["items"]] == [5, 4]
    assert page1["total"] == 5
    assert page1["totalPages"] == 3

    past_the_end = client.get("/tasks?page=99&limit=2", headers=auth).json()
    assert past_the_end["items"] == []
    assert past_the_end["total"] == 5


def test_search_and_status_filters(client, auth):
    create_task(client, auth, "Prepare platform demo")
    create_task(client, auth, "Write insights report")
    demo_env = create_task(client, auth, "Refresh demo environment")
    client.put(f"/tasks/{demo_env['id']}/complete", headers=auth)

    search = client.get("/tasks?search=DEMO", headers=auth).json()
    assert search["total"] == 2  # case-insensitive title substring

    combined = client.get("/tasks?search=demo&status=completed", headers=auth).json()
    assert [task["id"] for task in combined["items"]] == [demo_env["id"]]

    active = client.get("/tasks?status=active", headers=auth).json()
    assert active["total"] == 2

    assert client.get("/tasks?status=bogus", headers=auth).status_code == 422


def test_complete_is_idempotent_with_single_activity_entry(client, auth):
    task = create_task(client, auth, "Ship take-home")

    first = client.put(f"/tasks/{task['id']}/complete", headers=auth)
    second = client.put(f"/tasks/{task['id']}/complete", headers=auth)
    assert first.status_code == second.status_code == 200
    assert second.json()["completed"] is True

    entries = client.get(f"/tasks/{task['id']}/activity", headers=auth).json()
    # Newest first: the status change, then creation — and completing twice
    # must not have logged a second status_changed entry.
    assert [entry["action"] for entry in entries] == ["status_changed", "created"]
    assert entries[0]["oldValue"] == "todo"
    assert entries[0]["newValue"] == "complete"


def test_status_workflow_transitions(client, auth):
    task = create_task(client, auth, "Kanban candidate")

    moved = client.patch(
        f"/tasks/{task['id']}", json={"status": "in_progress"}, headers=auth
    )
    assert moved.status_code == 200
    assert moved.json()["status"] == "in_progress"
    assert moved.json()["completed"] is False

    filtered = client.get("/tasks?status=in_progress", headers=auth).json()
    assert [t["id"] for t in filtered["items"]] == [task["id"]]

    # Legacy boolean still works and maps onto the status model.
    done = client.patch(
        f"/tasks/{task['id']}", json={"completed": True}, headers=auth
    )
    assert done.json()["status"] == "complete"
    reopened = client.patch(
        f"/tasks/{task['id']}", json={"completed": False}, headers=auth
    )
    assert reopened.json()["status"] == "todo"
