"""Tareas independientes de los bloques de horario. Propiedad validada en cada SQL."""
from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from psycopg import sql
from pydantic import BaseModel, ConfigDict, StringConstraints, StrictBool, field_validator, model_validator

from auth import account
from db import connect

router = APIRouter(prefix="/api/tasks", tags=["tasks"])
Owner = Annotated[int, Depends(account)]
TaskId = Annotated[int, Path(gt=0, le=2147483647)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Priority = Literal["baja", "media", "alta"]
Category = Literal["personal", "trabajo", "estudio", "salud", "descanso"]
FIELDS = "id, title, description, completed, priority, category, due_date, created_at, completed_at"


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Title
    description: Description | None = None
    completed: StrictBool = False
    priority: Priority = "media"
    category: Category = "personal"
    due_date: date | None = None

    @field_validator("description")
    @classmethod
    def empty_description(cls, value):
        return value or None


class TaskPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Title | None = None
    description: Description | None = None
    completed: StrictBool | None = None
    priority: Priority | None = None
    category: Category | None = None
    due_date: date | None = None

    @field_validator("description")
    @classmethod
    def empty_description(cls, value):
        return value or None

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Indica al menos un campo para actualizar.")
        for field in ("title", "completed", "priority", "category"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError("El título, el estado, la prioridad y la categoría no admiten null.")
        return self


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    completed: bool
    priority: Priority
    category: Category
    due_date: date | None
    created_at: datetime
    completed_at: datetime | None


class TaskPage(BaseModel):
    items: list[TaskOut]
    total: int
    limit: int
    offset: int


class DailyProgress(BaseModel):
    day: date
    total: int
    completed: int
    percent: int


@router.get("", response_model=TaskPage)
def list_tasks(
    owner: Owner, response: Response,
    status: Literal["pending", "completed"] | None = None,
    category: Category | None = None, priority: Priority | None = None,
    due_date: date | None = None, undated: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=2147483647)] = 0,
):
    if undated and due_date is not None:
        raise HTTPException(422, "Elige una fecha o tareas sin fecha, no ambas.")
    response.headers["Cache-Control"] = "no-store"
    conditions, values = ["account_id = %s"], [owner]
    for column, value in (("completed", None if status is None else status == "completed"),
                          ("category", category), ("priority", priority), ("due_date", due_date)):
        if value is not None:
            # Los nombres de columna proceden exclusivamente de esta lista fija.
            conditions.append(f"{column} = %s")
            values.append(value)
    if undated:
        conditions.append("due_date IS NULL")
    where = " AND ".join(conditions)
    with connect() as db:
        # Cuenta y página consistentes aunque haya otros clientes modificando tareas.
        db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        total = db.execute(f"SELECT count(*) AS total FROM tasks WHERE {where}", values).fetchone()["total"]
        items = db.execute(f"""
            SELECT {FIELDS} FROM tasks WHERE {where}
            ORDER BY completed, due_date NULLS LAST,
                     CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, id DESC
            LIMIT %s OFFSET %s
        """, [*values, limit, offset]).fetchall()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/progress/{day}", response_model=DailyProgress)
def daily_progress(day: date, owner: Owner, response: Response):
    """Estado actual de las tareas con vencimiento ese día, no un historial temporal."""
    response.headers["Cache-Control"] = "no-store"
    with connect() as db:
        counts = db.execute("""
            SELECT count(*) AS total, count(*) FILTER (WHERE completed) AS completed
            FROM tasks WHERE account_id = %s AND due_date = %s
        """, (owner, day)).fetchone()
    return {"day": day, **counts,
            "percent": int(counts["completed"] * 100 / counts["total"] + 0.5) if counts["total"] else 0}


@router.post("", status_code=201, response_model=TaskOut)
def create_task(task: TaskCreate, owner: Owner):
    with connect() as db:
        return db.execute(f"""
            INSERT INTO tasks (account_id, title, description, completed, priority, category, due_date, completed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE NULL END)
            RETURNING {FIELDS}
        """, (owner, task.title, task.description, task.completed, task.priority,
              task.category, task.due_date, task.completed)).fetchone()


@router.get("/{task_id}", response_model=TaskOut)
def read_task(task_id: TaskId, owner: Owner, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with connect() as db:
        task = db.execute(f"SELECT {FIELDS} FROM tasks WHERE id = %s AND account_id = %s", (task_id, owner)).fetchone()
    if not task:
        raise HTTPException(404, "Tarea no encontrada.")
    return task


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: TaskId, task: TaskPatch, owner: Owner):
    updates = task.model_dump(exclude_unset=True)
    assignments, values = [], []
    for column, value in updates.items():
        assignments.append(sql.SQL("{} = %s").format(sql.Identifier(column)))
        values.append(value)
    if "completed" in updates:
        assignments.append(sql.SQL("completed_at = CASE WHEN %s THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END"))
        values.append(updates["completed"])
    query = sql.SQL("UPDATE tasks SET {} WHERE id = %s AND account_id = %s RETURNING {}")\
        .format(sql.SQL(", ").join(assignments), sql.SQL(FIELDS))
    with connect() as db:
        task = db.execute(query, [*values, task_id, owner]).fetchone()
    if not task:
        raise HTTPException(404, "Tarea no encontrada.")
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: TaskId, owner: Owner):
    with connect() as db:
        if not db.execute("DELETE FROM tasks WHERE id = %s AND account_id = %s", (task_id, owner)).rowcount:
            raise HTTPException(404, "Tarea no encontrada.")
