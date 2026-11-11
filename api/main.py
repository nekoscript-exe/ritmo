from contextlib import asynccontextmanager
from datetime import date, time, timedelta
from typing import Annotated, Literal

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Path, Response
from pydantic import BaseModel, StringConstraints, model_validator

from auth import account, router
from db import connect, migrate
from tasks import router as tasks_router
from calendar_routes import router as calendar_router
from focus_routes import router as focus_router
from statistics_routes import router as statistics_router

Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Account = Annotated[int, Depends(account)]
ItemId = Annotated[int, Path(gt=0, le=2147483647)]


class Habit(BaseModel):
    name: Label


class Check(BaseModel):
    done: bool


class Block(BaseModel):
    title: Label
    day: date
    starts_at: time
    ends_at: time
    category: Literal["personal", "trabajo", "estudio", "salud", "descanso"] = "personal"

    @model_validator(mode="after")
    def validate_times(self):
        if self.starts_at.tzinfo is not None or self.ends_at.tzinfo is not None:
            raise ValueError("Usa horas locales sin zona horaria.")
        if self.ends_at <= self.starts_at:
            raise ValueError("La hora de fin debe ser posterior a la de inicio.")
        return self


@asynccontextmanager
async def lifespan(app: FastAPI):
    migrate()
    yield


app = FastAPI(title="Ritmo", lifespan=lifespan, docs_url="/api/docs",
              openapi_url="/api/openapi.json", redoc_url=None)


app.include_router(router)
app.include_router(tasks_router)
app.include_router(calendar_router)
app.include_router(focus_router)
app.include_router(statistics_router)


@app.get("/api/health")
def health():
    try:
        with connect() as db:
            db.execute("SELECT 1")
    except psycopg.OperationalError as exc:
        raise HTTPException(503, "Base de datos no disponible.") from exc
    return {"status": "ok"}


@app.get("/api/days/{day}")
def read_day(day: date, response: Response, owner: Account):
    response.headers["Cache-Control"] = "no-store"
    with connect() as db:
        habits = db.execute("""
            SELECT h.id, h.name, (c.habit_id IS NOT NULL) AS done
            FROM habits h
            LEFT JOIN habit_checks c ON c.habit_id = h.id AND c.day = %s
            WHERE h.account_id = %s ORDER BY h.id
        """, (day, owner)).fetchall()
        blocks = db.execute("""
            SELECT id, title, starts_at, ends_at, category
            FROM time_blocks WHERE day = %s AND account_id = %s ORDER BY starts_at, id
        """, (day, owner)).fetchall()
    return {"habits": habits, "blocks": blocks}


@app.post("/api/habits", status_code=201)
def create_habit(habit: Habit, owner: Account):
    with connect() as db:
        return db.execute(
            "INSERT INTO habits (name, account_id) VALUES (%s, %s) RETURNING id, name",
            (habit.name, owner),
        ).fetchone()


@app.put("/api/habits/{habit_id}/checks/{day}", status_code=204)
def set_check(habit_id: ItemId, day: date, check: Check, owner: Account):
    with connect() as db:
        if not db.execute("SELECT id FROM habits WHERE id = %s AND account_id = %s FOR UPDATE", (habit_id, owner)).fetchone():
            raise HTTPException(404, "Hábito no encontrado.")
        if check.done:
            db.execute("""
                INSERT INTO habit_checks (habit_id, day)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (habit_id, day))
        else:
            db.execute("DELETE FROM habit_checks WHERE habit_id = %s AND day = %s", (habit_id, day))


@app.delete("/api/habits/{habit_id}", status_code=204)
def delete_habit(habit_id: ItemId, owner: Account):
    with connect() as db:
        if not db.execute("DELETE FROM habits WHERE id = %s AND account_id = %s", (habit_id, owner)).rowcount:
            raise HTTPException(404, "Hábito no encontrado.")


@app.put("/api/habits/{habit_id}", status_code=204)
def update_habit(habit_id: ItemId, habit: Habit, owner: Account):
    with connect() as db:
        if not db.execute("UPDATE habits SET name = %s WHERE id = %s AND account_id = %s",
                          (habit.name, habit_id, owner)).rowcount:
            raise HTTPException(404, "Hábito no encontrado.")


@app.post("/api/blocks", status_code=201)
def create_block(block: Block, owner: Account):
    with connect() as db:
        return db.execute("""
            INSERT INTO time_blocks (title, day, starts_at, ends_at, category, account_id)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, title, day, starts_at, ends_at, category
        """, (block.title, block.day, block.starts_at, block.ends_at, block.category, owner)).fetchone()


@app.delete("/api/blocks/{block_id}", status_code=204)
def delete_block(block_id: ItemId, owner: Account):
    with connect() as db:
        if not db.execute("DELETE FROM time_blocks WHERE id = %s AND account_id = %s", (block_id, owner)).rowcount:
            raise HTTPException(404, "Bloque no encontrado.")

@app.put("/api/blocks/{block_id}", status_code=204)
def update_block(block_id: ItemId, block: Block, owner: Account):
    with connect() as db:
        if not db.execute("""
            UPDATE time_blocks SET title = %s, day = %s, starts_at = %s, ends_at = %s, category = %s
            WHERE id = %s AND account_id = %s
        """, (block.title, block.day, block.starts_at, block.ends_at, block.category, block_id, owner)).rowcount:
            raise HTTPException(404, "Bloque no encontrado.")


@app.get("/api/weeks/{day}")
def read_week(day: date, owner: Account, response: Response):
    response.headers["Cache-Control"] = "no-store"
    start = day - timedelta(days=day.weekday())
    end = start + timedelta(days=min(6, (date.max - start).days))
    with connect() as db:
        blocks = db.execute("""
            SELECT id, day, title, category, starts_at, ends_at FROM time_blocks
            WHERE account_id = %s AND day BETWEEN %s AND %s
            ORDER BY day, starts_at, id
        """, (owner, start, end)).fetchall()
        checks = db.execute("""
            SELECT c.day, count(*) AS completed FROM habit_checks c
            JOIN habits h ON h.id = c.habit_id
            WHERE h.account_id = %s AND c.day BETWEEN %s AND %s GROUP BY c.day
        """, (owner, start, end)).fetchall()
    return {"start": start, "end": end, "blocks": blocks, "checks": checks}
