"""Integración real, habilitada exclusivamente en el PostgreSQL efímero de Compose."""
import os
import sys
from pathlib import Path
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def require_test_database():
    expected = {
        "RITMO_TESTING": "1", "PGHOST": "db-test", "PGPORT": "5432",
        "PGDATABASE": "ritmo_test", "PGUSER": "ritmo_test",
    }
    if any(os.environ.get(key) != value for key, value in expected.items()):
        pytest.fail("Base no autorizada: ejecuta con compose.test.yaml. No se abrió ninguna conexión.")
    if any(os.environ.get(key) for key in ("PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR", "PGOPTIONS")):
        pytest.fail("Variables de conexión alternativas no permitidas en las pruebas.")


@pytest.fixture(scope="session")
def application():
    require_test_database()  # Antes del lifespan: migrate() solo puede tocar db-test.
    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app):
        yield app


@pytest.fixture
def db(application):
    from db import connect

    require_test_database()
    with connect() as connection:
        yield connection


@pytest.fixture
def client(application):
    from fastapi.testclient import TestClient

    instance = TestClient(application)
    yield instance
    instance.close()


@pytest.fixture
def credentials():
    return {"username": "u_" + uuid4().hex[:20], "password": "test-password-12345"}


@pytest.fixture
def signed_in(client, credentials):
    assert client.post("/api/account/register", json=credentials).status_code == 201
    return client


@pytest.fixture
def block_data():
    return {"title": "Estudiar", "day": "2026-11-09", "starts_at": "09:00",
            "ends_at": "10:00", "category": "estudio"}
