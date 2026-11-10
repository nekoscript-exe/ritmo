from pathlib import Path

import psycopg
from psycopg.rows import dict_row


def connect():
    return psycopg.connect(connect_timeout=3, row_factory=dict_row)


def migrate():
    directory = Path(__file__).with_name("migrations")
    with connect() as db:
        db.execute("SELECT pg_advisory_xact_lock(820124)")
        db.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name text PRIMARY KEY
            )
        """)
        applied = {row["name"] for row in db.execute("SELECT name FROM schema_migrations")}
        for path in sorted(directory.glob("*.sql")):
            if path.name not in applied:
                db.execute(path.read_text(encoding="utf-8"))
                db.execute("INSERT INTO schema_migrations VALUES (%s)", (path.name,))
