import pytest
from fastapi.testclient import TestClient


DAY = "2026-11-09"


def test_habit_lifecycle(signed_in, db):
    response = signed_in.post("/api/habits", json={"name": "  Leer  "})
    assert response.status_code == 201
    habit = response.json()
    assert habit["name"] == "Leer"
    assert signed_in.get(f"/api/days/{DAY}").json()["habits"] == [{**habit, "done": False}]
    path = f"/api/habits/{habit['id']}/checks/{DAY}"
    for _ in range(2):
        assert signed_in.put(path, json={"done": True}).status_code == 204
    assert signed_in.get(f"/api/days/{DAY}").json()["habits"][0]["done"] is True
    assert signed_in.get("/api/days/2026-11-10").json()["habits"][0]["done"] is False
    assert signed_in.put(path, json={"done": False}).status_code == 204
    assert signed_in.get(f"/api/days/{DAY}").json()["habits"][0]["done"] is False
    assert signed_in.put(path, json={"done": True}).status_code == 204
    assert signed_in.delete(f"/api/habits/{habit['id']}").status_code == 204
    assert signed_in.get(f"/api/days/{DAY}").json()["habits"] == []
    assert db.execute("SELECT 1 FROM habit_checks WHERE habit_id = %s", (habit["id"],)).fetchone() is None
    assert signed_in.delete(f"/api/habits/{habit['id']}").status_code == 404
    assert signed_in.put(path, json={"done": True}).status_code == 404


def test_block_crud_and_week(signed_in, block_data):
    response = signed_in.post("/api/blocks", json=block_data)
    assert response.status_code == 201
    block_id = response.json()["id"]
    response = signed_in.get(f"/api/days/{DAY}")
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["blocks"][0]["id"] == block_id
    updated = {**block_data, "title": "Trabajo", "day": "2026-11-10", "category": "trabajo", "ends_at": "11:00"}
    assert signed_in.put(f"/api/blocks/{block_id}", json=updated).status_code == 204
    assert signed_in.get(f"/api/days/{DAY}").json()["blocks"] == []
    week = signed_in.get(f"/api/weeks/{DAY}")
    assert week.headers["cache-control"] == "no-store"
    data = week.json()
    assert (data["start"], data["end"]) == ("2026-11-09", "2026-11-15")
    assert data["blocks"][0]["title"] == "Trabajo"
    assert data["blocks"][0]["category"] == "trabajo"
    assert signed_in.delete(f"/api/blocks/{block_id}").status_code == 204
    assert signed_in.get(f"/api/weeks/{DAY}").json()["blocks"] == []
    assert signed_in.put(f"/api/blocks/{block_id}", json=updated).status_code == 404
    assert signed_in.delete(f"/api/blocks/{block_id}").status_code == 404


def test_two_account_isolation(application, signed_in, credentials, block_data, db):
    owner = signed_in
    habit_id = owner.post("/api/habits", json={"name": "Privado"}).json()["id"]
    block_id = owner.post("/api/blocks", json=block_data).json()["id"]
    check_path = f"/api/habits/{habit_id}/checks/{DAY}"
    assert owner.put(check_path, json={"done": True}).status_code == 204
    owner_id = db.execute("SELECT id FROM accounts WHERE username = %s", (credentials["username"],)).fetchone()["id"]
    with TestClient(application) as other:
        assert other.post("/api/account/register", json={**credentials, "username": credentials["username"] + "b"}).status_code == 201
        # Propietario enviado por el cliente no puede seleccionar otra cuenta.
        own_habit = other.post("/api/habits", json={"name": "Otro", "account_id": owner_id}).json()["id"]
        assert other.get(f"/api/days/{DAY}").json() == {"habits": [{"id": own_habit, "name": "Otro", "done": False}], "blocks": []}
        assert other.get(f"/api/weeks/{DAY}").json()["checks"] == []
        assert other.get(f"/api/weeks/{DAY}").json()["blocks"] == []
        own_block = other.post("/api/blocks", json={**block_data, "account_id": owner_id}).json()["id"]
        assert other.get(f"/api/days/{DAY}").json()["blocks"][0]["id"] == own_block
        for done in [True, False]:
            assert other.put(check_path, json={"done": done}).status_code == 404
        assert other.delete(f"/api/habits/{habit_id}").status_code == 404
        assert other.put(f"/api/habits/{habit_id}", json={"name": "Ajeno"}).status_code == 404
        assert other.put(f"/api/blocks/{block_id}", json={**block_data, "title": "Intrusión"}).status_code == 404
        assert other.delete(f"/api/blocks/{block_id}").status_code == 404
    data = owner.get(f"/api/days/{DAY}").json()
    assert data["habits"] == [{"id": habit_id, "name": "Privado", "done": True}]
    assert data["blocks"][0]["title"] == block_data["title"]
    assert owner.get(f"/api/weeks/{DAY}").json()["checks"] == [{"day": DAY, "completed": 1}]


@pytest.mark.parametrize("name", ["", "   ", "x" * 81])
def test_invalid_habit_name(signed_in, name):
    assert signed_in.post("/api/habits", json={"name": name}).status_code == 422
    habit_id = signed_in.post("/api/habits", json={"name": "Original"}).json()["id"]
    assert signed_in.put(f"/api/habits/{habit_id}", json={"name": name}).status_code == 422


@pytest.mark.parametrize("change", [
    {"title": " "}, {"title": "x" * 81}, {"day": "2026-02-30"}, {"day": "not-a-date"},
    {"day": "0000-01-01"}, {"starts_at": "25:00"}, {"ends_at": "08:00"},
    {"ends_at": "09:00"}, {"starts_at": "09:00:00Z"}, {"ends_at": "10:00:00+01:00"},
    {"category": "unknown"},
])
def test_block_validation_on_create_and_update(signed_in, block_data, change):
    block_id = signed_in.post("/api/blocks", json=block_data).json()["id"]
    payload = {**block_data, **change}
    assert signed_in.post("/api/blocks", json=payload).status_code == 422
    assert signed_in.put(f"/api/blocks/{block_id}", json=payload).status_code == 422
    assert signed_in.get(f"/api/days/{DAY}").json()["blocks"][0]["title"] == block_data["title"]


@pytest.mark.parametrize("category", ["personal", "trabajo", "estudio", "salud", "descanso"])
def test_categories_and_default(signed_in, block_data, category):
    response = signed_in.post("/api/blocks", json={**block_data, "category": category})
    assert response.status_code == 201
    assert response.json()["category"] == category
    payload = {key: value for key, value in block_data.items() if key != "category"}
    assert signed_in.post("/api/blocks", json=payload).json()["category"] == "personal"


@pytest.mark.parametrize("day", ["invalid", "2026-02-30", "10000-01-01"])
def test_invalid_route_dates(signed_in, day):
    assert signed_in.get(f"/api/days/{day}").status_code == 422
    assert signed_in.get(f"/api/weeks/{day}").status_code == 422
    habit_id = signed_in.post("/api/habits", json={"name": "Leer"}).json()["id"]
    assert signed_in.put(f"/api/habits/{habit_id}/checks/{day}", json={"done": True}).status_code == 422


@pytest.mark.parametrize("day", ["0001-01-01", "9999-12-31", "2024-02-29"])
def test_valid_boundary_dates(signed_in, day):
    assert signed_in.get(f"/api/days/{day}").status_code == 200
    assert signed_in.get(f"/api/weeks/{day}").status_code == 200


@pytest.mark.parametrize("item_id", [0, -1, 2147483648, "abc"])
def test_invalid_ids(signed_in, block_data, item_id):
    assert signed_in.delete(f"/api/blocks/{item_id}").status_code == 422
    assert signed_in.put(f"/api/blocks/{item_id}", json=block_data).status_code == 422
    assert signed_in.delete(f"/api/habits/{item_id}").status_code == 422
    assert signed_in.put(f"/api/habits/{item_id}", json={"name": "Nuevo"}).status_code == 422


def test_check_validation_and_habit_editing(signed_in):
    habit_id = signed_in.post("/api/habits", json={"name": "Leer"}).json()["id"]
    assert signed_in.put(f"/api/habits/{habit_id}/checks/{DAY}", json={"done": "invalid"}).status_code == 422
    assert signed_in.put(f"/api/habits/{habit_id}/checks/{DAY}", json={"done": True}).status_code == 204
    assert signed_in.put(f"/api/habits/{habit_id}", json={"name": "  Nuevo  "}).status_code == 204
    assert signed_in.get(f"/api/days/{DAY}").json()["habits"] == [{"id": habit_id, "name": "Nuevo", "done": True}]
    assert signed_in.put("/api/habits/2147483647", json={"name": "No existe"}).status_code == 404
