"""Lectura acotada por intervalo; las escrituras reutilizan tareas y bloques existentes."""
from datetime import date, time

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from db import connect
from tasks import Owner, Category, TaskOut, FIELDS

router = APIRouter(prefix="/api/calendar", tags=["calendar"])
MAX_DAYS = 42
MAX_ITEMS_PER_TYPE = 1000


class CalendarBlock(BaseModel):
    id: int
    title: str
    day: date
    starts_at: time
    ends_at: time
    category: Category


class CalendarRange(BaseModel):
    start: date
    end: date
    blocks: list[CalendarBlock]
    tasks: list[TaskOut]


@router.get("", response_model=CalendarRange)
def read_calendar(start: date, end: date, owner: Owner, response: Response):
    if end < start or (end - start).days >= MAX_DAYS:
        raise HTTPException(422, "El intervalo debe estar ordenado y abarcar entre 1 y 42 días, ambos inclusive.")
    response.headers["Cache-Control"] = "no-store"
    with connect() as db:
        db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        blocks = db.execute("""
            SELECT id, title, day, starts_at, ends_at, category FROM time_blocks
            WHERE account_id = %s AND day BETWEEN %s AND %s
            ORDER BY day, starts_at, ends_at, id LIMIT %s
        """, (owner, start, end, MAX_ITEMS_PER_TYPE + 1)).fetchall()
        tasks = db.execute(f"""
            SELECT {FIELDS} FROM tasks
            WHERE account_id = %s AND due_date BETWEEN %s AND %s
            ORDER BY due_date, completed, id LIMIT %s
        """, (owner, start, end, MAX_ITEMS_PER_TYPE + 1)).fetchall()
    if len(blocks) > MAX_ITEMS_PER_TYPE or len(tasks) > MAX_ITEMS_PER_TYPE:
        raise HTTPException(413, "Hay demasiadas actividades para este intervalo. Selecciona una vista o intervalo más pequeño.")
    return {"start": start, "end": end, "blocks": blocks, "tasks": tasks}
