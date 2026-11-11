import pytest
from fastapi.testclient import TestClient


def add_task(client, day, title="Tarea"):
    response = client.post("/api/tasks", json={"title": title, "due_date": day})
    assert response.status_code == 201
    return response.json()


def add_block(client, day, start="09:00", end="10:00"):
    response = client.post("/api/blocks", json={"title": "Bloque", "day": day, "starts_at": start, "ends_at": end})
    assert response.status_code == 201
    return response.json()


def test_calendar_inclusive_range_and_order(signed_in):
    first = add_task(signed_in, "2024-02-29")
    last = add_task(signed_in, "2024-03-01")
    add_task(signed_in, "2024-02-28")
    add_task(signed_in, "2024-03-02")
    add_task(signed_in, None)
    late = add_block(signed_in, "2024-02-29", "15:00", "16:00")
    early = add_block(signed_in, "2024-02-29", "08:00", "09:00")
    end = add_block(signed_in, "2024-03-01")
    add_block(signed_in, "2024-03-02")
    response = signed_in.get("/api/calendar", params={"start": "2024-02-29", "end": "2024-03-01"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert data["start"] == "2024-02-29" and data["end"] == "2024-03-01"
    assert [t["id"] for t in data["tasks"]] == [first["id"], last["id"]]
    assert [b["id"] for b in data["blocks"]] == [early["id"], late["id"], end["id"]]
    assert all("account_id" not in item for item in [*data["tasks"], *data["blocks"]])


def test_calendar_account_isolation(signed_in, application, credentials):
    day = "2026-11-10"
    task = add_task(signed_in, day)
    block = add_block(signed_in, day)
    with TestClient(application) as other:
        assert other.post("/api/account/register", json={**credentials, "username": credentials["username"] + "b"}).status_code == 201
        empty = other.get("/api/calendar", params={"start": day, "end": day, "account_id": 1}).json()
        assert empty["tasks"] == [] and empty["blocks"] == []
        add_task(other, day)
        add_block(other, day)
    data = signed_in.get("/api/calendar", params={"start": day, "end": day}).json()
    assert [t["id"] for t in data["tasks"]] == [task["id"]]
    assert [b["id"] for b in data["blocks"]] == [block["id"]]


@pytest.mark.parametrize("start,end", [
    ("0001-01-01", "0001-01-01"), ("9999-12-31", "9999-12-31"),
    ("2024-02-01", "2024-03-13"), ("2026-12-28", "2027-01-03"),
])
def test_calendar_valid_ranges(signed_in, start, end):
    assert signed_in.get("/api/calendar", params={"start": start, "end": end}).status_code == 200


@pytest.mark.parametrize("params", [
    {}, {"start": "2026-01-01"}, {"start": "2026-01-02", "end": "2026-01-01"},
    {"start": "2024-02-01", "end": "2024-03-14"},
    {"start": "2026-02-30", "end": "2026-03-01"},
    {"start": "0000-01-01", "end": "0001-01-01"},
    {"start": "9999-12-31", "end": "10000-01-01"},
])
def test_calendar_invalid_ranges(signed_in, params):
    assert signed_in.get("/api/calendar", params=params).status_code == 422


def test_calendar_requires_session(client):
    assert client.get("/api/calendar", params={"start": "2026-11-10", "end": "2026-11-10"}).status_code == 401


def test_calendar_refuses_silent_truncation(signed_in, monkeypatch):
    import calendar_routes
    monkeypatch.setattr(calendar_routes, "MAX_ITEMS_PER_TYPE", 2)
    for _ in range(3):
        add_task(signed_in, "2026-11-10")
    response = signed_in.get("/api/calendar", params={"start": "2026-11-10", "end": "2026-11-10"})
    assert response.status_code == 413
    assert "intervalo" in response.json()["detail"]


def test_calendar_boundary_records_and_write_refresh(signed_in):
    first = add_block(signed_in, "0001-01-01", "00:00:00", "00:01:00")
    last = add_task(signed_in, "9999-12-31")
    assert signed_in.get("/api/calendar", params={"start": "0001-01-01", "end": "0001-01-01"}).json()["blocks"][0]["id"] == first["id"]
    assert signed_in.patch(f"/api/tasks/{last['id']}", json={"completed": True}).status_code == 200
    data = signed_in.get("/api/calendar", params={"start": "9999-12-31", "end": "9999-12-31"}).json()
    assert data["tasks"][0]["completed"] is True
    assert signed_in.patch(f"/api/tasks/{last['id']}", json={"due_date": None}).status_code == 200
    assert signed_in.get("/api/calendar", params={"start": "9999-12-31", "end": "9999-12-31"}).json()["tasks"] == []
