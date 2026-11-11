from datetime import datetime, timezone

import pytest

from auth import COOKIE, digest, password_hash


def test_register_login_and_password_storage(client, credentials, db):
    response = client.post("/api/account/register", json=credentials)
    assert response.status_code == 201
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "max-age=604800" in cookie
    row = db.execute("SELECT * FROM accounts WHERE username = %s", (credentials["username"],)).fetchone()
    salt, stored = row["password_hash"].split(":")
    assert len(bytes.fromhex(salt)) == 16
    assert stored == password_hash(credentials["password"], bytes.fromhex(salt))
    assert credentials["password"] not in row["password_hash"]
    token = client.cookies.get(COOKIE)
    session = db.execute("SELECT * FROM sessions WHERE token_hash = %s", (digest(token),)).fetchone()
    assert session["account_id"] == row["id"]
    assert session["token_hash"] != token
    assert 6 * 86400 < (session["expires_at"] - datetime.now(timezone.utc)).total_seconds() <= 7 * 86400
    assert client.post("/api/account/logout").status_code == 204
    login = client.post("/api/account/login", json={**credentials, "username": credentials["username"].upper()})
    assert login.status_code == 200
    assert client.get("/api/days/2026-11-09").status_code == 200


def test_duplicate_user_and_invalid_login(signed_in, credentials):
    assert signed_in.post("/api/account/register", json={**credentials, "username": credentials["username"].upper()}).status_code == 409
    for payload in ({**credentials, "password": "incorrect-password"},
                    {**credentials, "username": "nonexistent_" + credentials["username"][-15:]}):
        response = signed_in.post("/api/account/login", json=payload)
        assert response.status_code == 401
        assert response.json()["detail"] == "Usuario o contraseña incorrectos."


def test_logout_revokes_token(signed_in, db):
    token = signed_in.cookies.get(COOKIE)
    assert signed_in.post("/api/account/logout").status_code == 204
    assert signed_in.cookies.get(COOKIE) is None
    assert db.execute("SELECT 1 FROM sessions WHERE token_hash = %s", (digest(token),)).fetchone() is None
    signed_in.cookies.set(COOKIE, token)
    assert signed_in.get("/api/days/2026-11-09").status_code == 401
    assert signed_in.post("/api/account/logout").status_code == 204


def test_expired_session_is_rejected(signed_in, db):
    token = signed_in.cookies.get(COOKIE)
    db.execute("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = %s", (digest(token),))
    db.commit()  # El servidor usa otra conexión.
    assert signed_in.get("/api/days/2026-11-09").status_code == 401
    assert signed_in.get("/api/weeks/2026-11-09").status_code == 401


@pytest.mark.parametrize("token", [None, "not-a-valid-session"])
def test_all_business_routes_require_session(client, block_data, token):
    if token:
        client.cookies.set(COOKIE, token)
    requests = [
        ("GET", "/api/days/2026-11-09", None), ("GET", "/api/weeks/2026-11-09", None),
        ("POST", "/api/habits", {"name": "Leer"}),
        ("PUT", "/api/habits/1", {"name": "Leer más"}),
        ("PUT", "/api/habits/1/checks/2026-11-09", {"done": True}),
        ("DELETE", "/api/habits/1", None), ("POST", "/api/blocks", block_data),
        ("PUT", "/api/blocks/1", block_data), ("DELETE", "/api/blocks/1", None),
    ]
    for method, path, payload in requests:
        assert client.request(method, path, json=payload).status_code == 401


@pytest.mark.parametrize("payload", [
    {"username": "a", "password": "test-password-12345"},
    {"username": "bad name", "password": "test-password-12345"},
    {"username": "valid_user", "password": "short"},
    {"username": "valid_user", "password": "x" * 129},
])
@pytest.mark.parametrize("action", ["register", "login"])
def test_credentials_validation(client, action, payload):
    assert client.post("/api/account/" + action, json=payload).status_code == 422


def test_secure_cookie_setting(client, credentials, monkeypatch):
    monkeypatch.setenv("SECURE_COOKIES", "1")
    response = client.post("/api/account/register", json=credentials)
    assert "; Secure" in response.headers["set-cookie"]
