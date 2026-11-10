from datetime import datetime, timezone

import psycopg
import pytest
from fastapi.testclient import TestClient

DAY = "2026-11-09"


def create(client, **changes):
    response = client.post("/api/tasks", json={"title": "Preparar informe", "due_date": DAY, **changes})
    assert response.status_code == 201, response.text
    return response.json()


def test_tasks_crud_and_postgres_persistence(signed_in, db, application):
    task = create(signed_in, title="  Informe  ", description="  Detalles  ", priority="alta", category="trabajo")
    assert task["title"] == "Informe" and task["description"] == "Detalles"
    assert task["completed"] is False and task["completed_at"] is None
    assert datetime.fromisoformat(task["created_at"]) <= datetime.now(timezone.utc)
    path = f"/api/tasks/{task['id']}"
    read = signed_in.get(path)
    assert read.status_code == 200 and read.json() == task
    assert read.headers["cache-control"] == "no-store"
    # Una conexión PostgreSQL independiente observa los cambios confirmados.
    stored = db.execute("SELECT * FROM tasks WHERE id = %s", (task["id"],)).fetchone()
    assert stored["title"] == "Informe" and stored["priority"] == "alta"
    assert stored["account_id"] is not None
    with TestClient(application) as reopened:
        reopened.cookies.update(signed_in.cookies)
        assert reopened.get(path).json() == task
    assert signed_in.get("/api/tasks").json()["items"] == [task]
    updated = signed_in.patch(path, json={"title": "Terminar informe", "description": None, "due_date": None, "category": "estudio", "priority": "baja"})
    assert updated.status_code == 200
    assert updated.json()["due_date"] is None and updated.json()["description"] is None
    first = signed_in.patch(path, json={"completed": True}).json()
    assert first["completed"] is True and first["completed_at"] is not None
    assert signed_in.patch(path, json={"completed": True}).json()["completed_at"] == first["completed_at"]
    assert signed_in.patch(path, json={"title": "Final"}).json()["completed_at"] == first["completed_at"]
    reopened_task = signed_in.patch(path, json={"completed": False}).json()
    assert reopened_task["completed_at"] is None and reopened_task["completed"] is False
    assert signed_in.delete(path).status_code == 204
    assert signed_in.get(path).status_code == 404
    assert signed_in.patch(path, json={"completed": True}).status_code == 404
    assert signed_in.delete(path).status_code == 404
    assert db.execute("SELECT 1 FROM tasks WHERE id = %s", (task["id"],)).fetchone() is None


def test_defaults_and_initial_completion(signed_in):
    task = create(signed_in, due_date=None, description="  ")
    assert task["priority"] == "media" and task["category"] == "personal"
    assert task["description"] is None and task["due_date"] is None
    assert create(signed_in, completed=True)["completed_at"] is not None


def test_account_isolation(application, signed_in, credentials):
    task = create(signed_in, completed=True)
    path = f"/api/tasks/{task['id']}"
    with TestClient(application) as other:
        assert other.post("/api/account/register", json={**credentials, "username": credentials["username"] + "b"}).status_code == 201
        assert other.get("/api/tasks").json()["total"] == 0
        assert other.get(f"/api/tasks/progress/{DAY}").json()["total"] == 0
        assert other.get(path).status_code == 404
        for patch in ({"title": "Intrusión"}, {"completed": False}, {"due_date": None}):
            assert other.patch(path, json=patch).status_code == 404
        assert other.delete(path).status_code == 404
        assert other.post("/api/tasks", json={"title": "Forjada", "account_id": 1}).status_code == 422
        assert other.patch(path, json={"account_id": 1}).status_code == 422
        owned = create(other)
        assert signed_in.get(f"/api/tasks/{owned['id']}").status_code == 404
    assert signed_in.get(path).json() == task


def test_filters_pagination_progress_and_no_block_side_effects(signed_in, block_data):
    pending = create(signed_in, priority="alta", category="trabajo")
    completed = create(signed_in, completed=True, priority="baja", category="salud")
    undated = create(signed_in, due_date=None)
    other_day = create(signed_in, due_date="2026-11-10")
    assert signed_in.post("/api/blocks", json=block_data).status_code == 201
    def ids(params):
        response = signed_in.get("/api/tasks", params=params)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        return {task["id"] for task in response.json()["items"]}
    assert ids({"status": "pending"}) == {pending["id"], undated["id"], other_day["id"]}
    assert ids({"status": "completed"}) == {completed["id"]}
    assert ids({"category": "trabajo"}) == {pending["id"]}
    assert ids({"priority": "alta"}) == {pending["id"]}
    assert ids({"due_date": DAY}) == {pending["id"], completed["id"]}
    assert ids({"undated": True}) == {undated["id"]}
    assert ids({"due_date": DAY, "priority": "alta", "category": "trabajo", "status": "pending"}) == {pending["id"]}
    assert ids({"status": "completed", "priority": "alta"}) == set()
    page1 = signed_in.get("/api/tasks", params={"limit": 2}).json()
    page2 = signed_in.get("/api/tasks", params={"limit": 2, "offset": 2}).json()
    assert page1["total"] == page2["total"] == 4
    assert {item["id"] for item in page1["items"]}.isdisjoint(item["id"] for item in page2["items"])
    assert ids({"offset": 50}) == set()
    progress = signed_in.get(f"/api/tasks/progress/{DAY}")
    assert progress.headers["cache-control"] == "no-store"
    assert progress.json() == {"day": DAY, "total": 2, "completed": 1, "percent": 50}
    signed_in.patch(f"/api/tasks/{completed['id']}", json={"completed": False})
    assert signed_in.get(f"/api/tasks/progress/{DAY}").json()["completed"] == 0
    assert signed_in.get("/api/tasks/progress/2020-01-01").json()["percent"] == 0
    assert len(signed_in.get(f"/api/days/{DAY}").json()["blocks"]) == 1


@pytest.mark.parametrize("change", [
    {"title": ""}, {"title": " "}, {"title": "x" * 81}, {"description": "x" * 2001},
    {"priority": "urgent"}, {"category": "other"}, {"due_date": "2026-02-30"},
    {"due_date": "0000-01-01"}, {"completed": "true"}, {"completed": 1},
    {"title": None}, {"completed": None}, {"category": None}, {"priority": None},
    {"account_id": 1}, {"created_at": "2026-01-01T00:00:00Z"}, {"completed_at": None},
])
def test_task_validation_on_create_and_patch(signed_in, change):
    task = create(signed_in)
    assert signed_in.post("/api/tasks", json={"title": "Válida", **change}).status_code == 422
    assert signed_in.patch(f"/api/tasks/{task['id']}", json=change).status_code == 422
    assert signed_in.get(f"/api/tasks/{task['id']}").json() == task


@pytest.mark.parametrize("params", [
    {"status": "unknown"}, {"category": "unknown"}, {"priority": "unknown"},
    {"due_date": "invalid"}, {"undated": "invalid"}, {"due_date": DAY, "undated": True},
    {"limit": 0}, {"limit": 101}, {"offset": -1},
])
def test_invalid_filters(signed_in, params):
    assert signed_in.get("/api/tasks", params=params).status_code == 422


@pytest.mark.parametrize("identifier", [0, -1, 2147483648, "abc"])
def test_invalid_task_ids(signed_in, identifier):
    path = f"/api/tasks/{identifier}"
    assert signed_in.get(path).status_code == 422
    assert signed_in.patch(path, json={"completed": True}).status_code == 422
    assert signed_in.delete(path).status_code == 422


def test_empty_patch_and_empty_progress(signed_in):
    task = create(signed_in)
    assert signed_in.patch(f"/api/tasks/{task['id']}", json={}).status_code == 422
    assert signed_in.get("/api/tasks/progress/not-a-date").status_code == 422


def test_all_task_routes_need_session(client):
    for method, path, data in [
        ("GET", "/api/tasks", None), ("GET", f"/api/tasks/progress/{DAY}", None),
        ("GET", "/api/tasks/1", None), ("POST", "/api/tasks", {"title": "Nueva"}),
        ("PATCH", "/api/tasks/1", {"completed": True}), ("DELETE", "/api/tasks/1", None),
    ]:
        assert client.request(method, path, json=data).status_code == 401


def test_migration_idempotency_preserves_rows(signed_in, db):
    from db import migrate
    task = create(signed_in)
    migrate()
    assert signed_in.get(f"/api/tasks/{task['id']}").json() == task
    assert db.execute("SELECT count(*) AS n FROM schema_migrations WHERE name = '004_tasks.sql'").fetchone()["n"] == 1


def test_database_constraints(signed_in, db, credentials):
    owner = db.execute("SELECT id FROM accounts WHERE username = %s", (credentials["username"],)).fetchone()["id"]
    with pytest.raises(psycopg.errors.CheckViolation):
        with db.transaction():
            db.execute("INSERT INTO tasks (account_id, title, completed) VALUES (%s, 'Inválida', true)", (owner,))
    with pytest.raises(psycopg.errors.NotNullViolation):
        with db.transaction():
            db.execute("INSERT INTO tasks (title) VALUES ('Sin propietario')")
