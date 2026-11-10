import hashlib
import os
import secrets

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, Field

from db import connect

router = APIRouter(prefix="/api/account")
COOKIE = "ritmo_session"
WEEK = 604800


class Credentials(BaseModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_.-]{3,32}$")
    password: str = Field(min_length=10, max_length=128)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=1,
                          maxmem=64 * 1024 * 1024).hex()


def account(ritmo_session: str | None = Cookie(default=None)):
    if ritmo_session:
        with connect() as db:
            session = db.execute("""
                SELECT account_id FROM sessions WHERE token_hash = %s AND expires_at > now()
            """, (digest(ritmo_session),)).fetchone()
        if session:
            return session["account_id"]
    raise HTTPException(401, "Inicia sesión para continuar.")


def start_session(db, response, account_id):
    token = secrets.token_urlsafe(32)
    db.execute("DELETE FROM sessions WHERE expires_at <= now()")
    db.execute("INSERT INTO sessions (token_hash, account_id) VALUES (%s, %s)",
               (digest(token), account_id))
    response.set_cookie(COOKIE, token, max_age=WEEK, httponly=True, samesite="lax",
                        secure=os.getenv("SECURE_COOKIES") == "1")


@router.post("/register", status_code=201)
def register(credentials: Credentials, response: Response):
    salt = secrets.token_bytes(16)
    stored = salt.hex() + ":" + password_hash(credentials.password, salt)
    with connect() as db:
        row = db.execute("""
            INSERT INTO accounts (username, password_hash) VALUES (%s, %s)
            ON CONFLICT DO NOTHING RETURNING id
        """, (credentials.username.lower(), stored)).fetchone()
        if not row:
            raise HTTPException(409, "Ese usuario ya existe.")
        start_session(db, response, row["id"])
    return {"status": "ok"}


@router.post("/login")
def login(credentials: Credentials, response: Response):
    with connect() as db:
        row = db.execute("SELECT id, password_hash FROM accounts WHERE username = %s",
                         (credentials.username.lower(),)).fetchone()
        salt, expected = row["password_hash"].split(":") if row else ("00" * 16, "00" * 64)
        actual = password_hash(credentials.password, bytes.fromhex(salt))
        if not secrets.compare_digest(expected, actual) or not row:
            raise HTTPException(401, "Usuario o contraseña incorrectos.")
        start_session(db, response, row["id"])
    return {"status": "ok"}


@router.post("/logout", status_code=204)
def logout(response: Response, ritmo_session: str | None = Cookie(default=None)):
    if ritmo_session:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = %s", (digest(ritmo_session),))
    response.delete_cookie(COOKIE)
