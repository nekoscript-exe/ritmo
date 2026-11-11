from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from psycopg import sql
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from db import connect
from tasks import Owner, TaskId
from focus_domain import elapsed, transition, TERMINAL
from metrics import period_bounds, UTC

router = APIRouter(prefix='/api/focus', tags=['focus'])


class StartFocus(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: UUID
    planned_seconds: Annotated[StrictInt, Field(ge=60, le=14400)]
    task_id: Annotated[StrictInt, Field(gt=0, le=2147483647)] | None = None


class Command(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: UUID
    expected_version: Annotated[StrictInt, Field(ge=0, le=2147483647)]


class EditFocus(Command):
    task_id: Annotated[StrictInt, Field(gt=0, le=2147483647)] | None


class FocusOut(BaseModel):
    id: int
    task_id: int | None
    planned_seconds: int
    duration_seconds: float
    elapsed_seconds: float
    state: Literal['running', 'paused', 'completed', 'cancelled']
    started_at: datetime
    ended_at: datetime | None
    created_at: datetime
    version: int


class Snapshot(BaseModel):
    session: FocusOut | None
    server_time: datetime


class FocusPage(BaseModel):
    items: list[FocusOut]
    total: int
    limit: int
    offset: int
    server_time: datetime


def server_now(db):
    return db.execute('SELECT clock_timestamp() AS now').fetchone()['now'].astimezone(UTC)


def serial(db, owner):
    # Serializa inicios, comandos y reintentos de una misma cuenta entre procesos.
    db.execute('SELECT id FROM accounts WHERE id = %s FOR UPDATE', (owner,))


def own(db, owner, identifier, include_deleted=False):
    row = db.execute('SELECT * FROM focus_sessions WHERE id = %s AND account_id = %s FOR UPDATE', (identifier, owner)).fetchone()
    if not row or (row['deleted_at'] and not include_deleted):
        raise HTTPException(404, 'Sesión Focus no encontrada.')
    return row


def validate_task(db, owner, task_id):
    if task_id is not None and not db.execute('SELECT id FROM tasks WHERE id = %s AND account_id = %s FOR KEY SHARE', (task_id, owner)).fetchone():
        raise HTTPException(404, 'Tarea no encontrada.')


def public(row, now):
    return {**{k: row[k] for k in FocusOut.model_fields if k != 'elapsed_seconds'}, 'elapsed_seconds': elapsed(row, now)}


def replay(db, owner, operation, request, identifier=None):
    payload = request.model_dump(mode='json', exclude={'request_id'})
    previous = db.execute('SELECT * FROM focus_requests WHERE account_id = %s AND request_id = %s', (owner, request.request_id)).fetchone()
    if previous:
        if previous['operation'] != operation or previous['payload'] != payload or (identifier is not None and previous['session_id'] != identifier):
            raise HTTPException(409, 'La clave de petición ya se usó para otra operación.')
        # Devolver estado actual, nunca aplicar de nuevo un comando antiguo.
        return own(db, owner, previous['session_id'], include_deleted=operation == 'delete')
    return None


def remember(db, owner, operation, request, identifier):
    db.execute('INSERT INTO focus_requests (account_id, request_id, session_id, operation, payload) VALUES (%s,%s,%s,%s,%s)',
               (owner, request.request_id, identifier, operation, Jsonb(request.model_dump(mode='json', exclude={'request_id'}))))


def update(db, row, updates):
    if not updates:
        return row
    query = sql.SQL('UPDATE focus_sessions SET {} WHERE id = %s RETURNING *').format(
        sql.SQL(', ').join(sql.SQL('{} = %s').format(sql.Identifier(k)) for k in updates))
    return db.execute(query, [*updates.values(), row['id']]).fetchone()


def version(row, expected):
    if row['version'] != expected:
        raise HTTPException(409, 'La sesión cambió en otra pestaña. Actualiza su estado antes de continuar.')


@router.get('/active', response_model=Snapshot)
def active(owner: Owner, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    with connect() as db:
        now = server_now(db)
        row = db.execute("SELECT * FROM focus_sessions WHERE account_id = %s AND state IN ('running','paused') AND deleted_at IS NULL", (owner,)).fetchone()
    return {'session': public(row, now) if row else None, 'server_time': now}


@router.post('', status_code=201, response_model=Snapshot)
def start_focus(body: StartFocus, owner: Owner):
    with connect() as db:
        serial(db, owner)
        previous = replay(db, owner, 'start', body)
        if previous:
            now = server_now(db)
            return {'session': public(previous, now), 'server_time': now}
        if db.execute("SELECT id FROM focus_sessions WHERE account_id = %s AND state IN ('running','paused') AND deleted_at IS NULL", (owner,)).fetchone():
            raise HTTPException(409, 'Ya hay una sesión activa. Actualízala, finalízala o cancélala.')
        validate_task(db, owner, body.task_id)
        now = server_now(db)
        row = db.execute('''INSERT INTO focus_sessions (account_id, task_id, request_id, planned_seconds, started_at, resumed_at)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING *''', (owner, body.task_id, body.request_id, body.planned_seconds, now, now)).fetchone()
        db.execute('INSERT INTO focus_segments (session_id, started_at) VALUES (%s,%s)', (row['id'], now))
        remember(db, owner, 'start', body, row['id'])
    return {'session': public(row, now), 'server_time': now}


@router.get('', response_model=FocusPage)
def history(owner: Owner, response: Response, start: date, end: date,
            timezone: Annotated[str, Query(min_length=1, max_length=64)] = 'UTC',
            limit: Annotated[int, Query(ge=1, le=100)] = 50,
            offset: Annotated[int, Query(ge=0, le=2147483647)] = 0):
    try:
        _, lower, upper = period_bounds(start, end, timezone)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    response.headers['Cache-Control'] = 'no-store'
    where = 'account_id = %s AND deleted_at IS NULL AND started_at < %s AND COALESCE(ended_at, %s) >= %s'
    with connect() as db:
        db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        now = server_now(db)
        params = (owner, upper, now, lower)
        total = db.execute(f'SELECT count(*) AS n FROM focus_sessions WHERE {where}', params).fetchone()['n']
        rows = db.execute(f'SELECT * FROM focus_sessions WHERE {where} ORDER BY started_at DESC, id DESC LIMIT %s OFFSET %s', (*params, limit, offset)).fetchall()
    return {'items': [public(row, now) for row in rows], 'total': total, 'limit': limit, 'offset': offset, 'server_time': now}


@router.get('/{focus_id}', response_model=Snapshot)
def read_focus(focus_id: TaskId, owner: Owner, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    with connect() as db:
        row = own(db, owner, focus_id)
        now = server_now(db)
    return {'session': public(row, now), 'server_time': now}


@router.post('/{focus_id}/{action}', response_model=Snapshot)
def command(focus_id: TaskId, action: Literal['pause', 'resume', 'finish', 'cancel'], body: Command, owner: Owner):
    with connect() as db:
        serial(db, owner)
        row = replay(db, owner, action, body, focus_id)
        now = server_now(db)
        if row:
            return {'session': public(row, now), 'server_time': now}
        row = own(db, owner, focus_id)
        version(row, body.expected_version)
        now = server_now(db)
        try:
            updates, segment_end, opened = transition(row, action, now)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        if segment_end is not None:
            db.execute('UPDATE focus_segments SET ended_at = %s WHERE session_id = %s AND ended_at IS NULL', (segment_end, focus_id))
        if opened:
            db.execute('INSERT INTO focus_segments (session_id, started_at) VALUES (%s,%s)', (focus_id, now))
        row = update(db, row, updates)
        remember(db, owner, action, body, focus_id)
    return {'session': public(row, now), 'server_time': now}


@router.patch('/{focus_id}', response_model=Snapshot)
def edit_focus(focus_id: TaskId, body: EditFocus, owner: Owner):
    with connect() as db:
        serial(db, owner)
        row = replay(db, owner, 'edit', body, focus_id)
        if not row:
            # Mismo orden de locks que una eliminación de tarea: tarea antes de Focus.
            validate_task(db, owner, body.task_id)
            row = own(db, owner, focus_id)
            version(row, body.expected_version)
            row = update(db, row, {'task_id': body.task_id, 'version': row['version'] + 1})
            remember(db, owner, 'edit', body, focus_id)
        now = server_now(db)
    return {'session': public(row, now), 'server_time': now}


@router.delete('/{focus_id}', status_code=204)
def delete_focus(focus_id: TaskId, request_id: UUID, expected_version: Annotated[int, Query(ge=0, le=2147483647)], owner: Owner):
    body = Command(request_id=request_id, expected_version=expected_version)
    with connect() as db:
        serial(db, owner)
        if replay(db, owner, 'delete', body, focus_id):
            return
        row = own(db, owner, focus_id)
        version(row, expected_version)
        if row['state'] not in TERMINAL:
            raise HTTPException(409, 'Finaliza o cancela antes de retirar la sesión del historial.')
        update(db, row, {'deleted_at': server_now(db), 'version': row['version'] + 1})
        remember(db, owner, 'delete', body, focus_id)
