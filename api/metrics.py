"""Agregación acotada y fechas civiles; funciones puras, reutilizables en pruebas."""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

UTC = timezone.utc


def period_bounds(start, end, zone_name):
    if end < start or (end - start).days >= 31:
        raise ValueError('El periodo debe estar ordenado y abarcar de 1 a 31 días inclusive.')
    try:
        zone = ZoneInfo(zone_name)
        lower = datetime.combine(start, time.min, zone).astimezone(UTC)
        upper = datetime.combine(end + timedelta(days=1), time.min, zone).astimezone(UTC)
    except (ZoneInfoNotFoundError, ValueError, OverflowError) as exc:
        raise ValueError('Zona IANA o límites de fechas no válidos para este periodo.') from exc
    return zone, lower, upper


def days_between(start, end):
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def streaks(history, start, anchor, today):
    """Rachas dentro del periodo. Hoy pendiente permite prolongar desde ayer."""
    days = set(history)
    best = run = 0
    for day in days_between(start, anchor) if anchor >= start else []:
        run = run + 1 if day in days else 0
        best = max(best, run)
    cursor = anchor
    if cursor == today and cursor not in days:
        if cursor == date.min:
            return 0, best
        cursor -= timedelta(days=1)
    current = 0
    while cursor >= start and cursor in days:
        current += 1
        if cursor == start:
            break
        cursor -= timedelta(days=1)
    return current, best


def split_segment(started, ended, start, end, zone):
    """Intersección exacta en UTC con días locales (incluidos días de 23/25 horas)."""
    a, b = started.astimezone(UTC), ended.astimezone(UTC)
    result = {}
    for day in days_between(start, end):
        left = datetime.combine(day, time.min, zone).astimezone(UTC)
        right = datetime.combine(day + timedelta(days=1), time.min, zone).astimezone(UTC)
        seconds = Decimal(str(max(0, (min(b, right) - max(a, left)).total_seconds())))
        if seconds:
            result[day] = seconds
    return result


def percentage(done, total):
    return round(done * 100 / total, 2) if total else 0.0
