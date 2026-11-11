from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel

from db import connect
from tasks import Owner
from focus_routes import server_now
from metrics import days_between, percentage, period_bounds, split_segment, streaks

router = APIRouter(prefix='/api/statistics', tags=['statistics'])
CATEGORIES = ('personal', 'trabajo', 'estudio', 'salud', 'descanso')


class HabitDay(BaseModel):
    day: date
    done: bool
    eligible: bool


class HabitStats(BaseModel):
    id: int
    name: str
    fulfilled_days: int
    expected_days: int
    percent: float
    current_streak: int
    max_streak: int
    history: list[HabitDay]


class DailyStats(BaseModel):
    day: date
    tasks_total: int = 0
    tasks_completed: int = 0
    tasks_overdue: int = 0
    habits_completed: int = 0
    habits_expected: int = 0
    planned_minutes: float = 0
    focus_minutes: float = 0
    focus_completed_minutes: float = 0
    focus_interrupted_minutes: float = 0


class CategoryMinutes(BaseModel):
    category: str
    minutes: float


class StatisticsOut(BaseModel):
    start: date
    end: date
    timezone: str
    as_of: str
    summary: dict[str, int | float]
    daily: list[DailyStats]
    by_category: list[CategoryMinutes]
    habits: list[HabitStats]


@router.get('', response_model=StatisticsOut)
def statistics(owner: Owner, response: Response, start: date, end: date,
               timezone: Annotated[str, Query(min_length=1, max_length=64)] = 'UTC'):
    try:
        zone, lower, upper = period_bounds(start, end, timezone)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    response.headers['Cache-Control'] = 'no-store'
    with connect() as db:
        db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        now = server_now(db)
        today = now.astimezone(zone).date()
        task_rows = db.execute('''SELECT due_date AS day, count(*) AS total,
            count(*) FILTER (WHERE completed) AS completed,
            count(*) FILTER (WHERE NOT completed AND due_date < %s) AS overdue
            FROM tasks WHERE account_id = %s AND due_date BETWEEN %s AND %s GROUP BY due_date''',
            (today, owner, start, end)).fetchall()
        habits = db.execute('SELECT id, name FROM habits WHERE account_id = %s ORDER BY id LIMIT 1001', (owner,)).fetchall()
        if len(habits) > 1000:
            raise HTTPException(413, 'Demasiados hábitos para este informe; máximo 1000.')
        checks = db.execute('''SELECT c.habit_id, c.day FROM habit_checks c JOIN habits h ON h.id = c.habit_id
            WHERE h.account_id = %s AND c.day BETWEEN %s AND %s AND c.day <= %s''', (owner, start, end, today)).fetchall()
        blocks = db.execute('''SELECT day, category, sum(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60) AS minutes
            FROM time_blocks WHERE account_id = %s AND day BETWEEN %s AND %s GROUP BY day, category''', (owner, start, end)).fetchall()
        segments = db.execute('''SELECT f.state, s.started_at, s.ended_at FROM focus_segments s
            JOIN focus_sessions f ON f.id = s.session_id
            WHERE f.account_id = %s AND f.deleted_at IS NULL AND f.state IN ('completed','cancelled')
            AND s.ended_at > %s AND s.started_at < %s ORDER BY s.started_at, s.id LIMIT 10001''', (owner, lower, upper)).fetchall()
        if len(segments) > 10000:
            raise HTTPException(413, 'Demasiados segmentos Focus para el periodo. Selecciona uno más pequeño.')
        counts = db.execute('''SELECT state, count(*) AS total FROM focus_sessions
            WHERE account_id = %s AND deleted_at IS NULL AND state IN ('completed','cancelled')
            AND ended_at >= %s AND ended_at < %s GROUP BY state''', (owner, lower, upper)).fetchall()
    daily = {day: DailyStats(day=day).model_dump() for day in days_between(start, end)}
    for row in task_rows:
        daily[row['day']].update(tasks_total=row['total'], tasks_completed=row['completed'], tasks_overdue=row['overdue'])
    by_category = {category: Decimal(0) for category in CATEGORIES}
    for row in blocks:
        by_category[row['category']] += row['minutes']
        daily[row['day']]['planned_minutes'] += float(row['minutes'])
    checked = defaultdict(set)
    for check in checks:
        checked[check['habit_id']].add(check['day'])
        daily[check['day']]['habits_completed'] += 1
    anchor = min(end, today)
    expected = max(0, (anchor - start).days + 1)
    habit_stats = []
    for habit in habits:
        completed = checked[habit['id']]
        current, best = streaks(completed, start, anchor, today)
        habit_stats.append({**habit, 'fulfilled_days': len(completed), 'expected_days': expected,
            'percent': percentage(len(completed), expected), 'current_streak': current, 'max_streak': best,
            'history': [{'day': d, 'done': d in completed, 'eligible': d <= today} for d in daily]})
    for day in daily:
        daily[day]['habits_expected'] = len(habits) if day <= today else 0
    focus_seconds = {'completed': defaultdict(Decimal), 'cancelled': defaultdict(Decimal)}
    for segment in segments:
        for day, seconds in split_segment(segment['started_at'], segment['ended_at'], start, end, zone).items():
            focus_seconds[segment['state']][day] += seconds
    for day in daily:
        complete = focus_seconds['completed'][day] / 60
        interrupted = focus_seconds['cancelled'][day] / 60
        daily[day].update(focus_minutes=float(complete + interrupted), focus_completed_minutes=float(complete), focus_interrupted_minutes=float(interrupted))
    keys = ('tasks_total', 'tasks_completed', 'tasks_overdue', 'habits_completed', 'habits_expected', 'planned_minutes',
            'focus_minutes', 'focus_completed_minutes', 'focus_interrupted_minutes')
    summary = {key: sum(row[key] for row in daily.values()) for key in keys}
    summary.update(tasks_percent=percentage(summary['tasks_completed'], summary['tasks_total']),
                   habits_percent=percentage(summary['habits_completed'], summary['habits_expected']), habit_count=len(habits),
                   focus_completed_sessions=next((r['total'] for r in counts if r['state'] == 'completed'), 0),
                   focus_interrupted_sessions=next((r['total'] for r in counts if r['state'] == 'cancelled'), 0))
    return {'start': start, 'end': end, 'timezone': timezone, 'as_of': now.isoformat(), 'summary': summary,
            'daily': list(daily.values()), 'by_category': [{'category': c, 'minutes': float(v)} for c, v in by_category.items()], 'habits': habit_stats}
