"""Tiempo activo y transiciones puros: sin reloj del cliente ni dependencias de IO."""
from datetime import timedelta, timezone
from decimal import Decimal, ROUND_DOWN

MILLISECOND = Decimal('0.001')
TERMINAL = {'completed', 'cancelled'}


def active_delta(row, now):
    if row['state'] != 'running':
        return Decimal(0)
    delta = Decimal(str(max(0, (now.astimezone(timezone.utc) - row['resumed_at'].astimezone(timezone.utc)).total_seconds())))
    return min(delta, Decimal(row['planned_seconds']) - Decimal(row['duration_seconds'])).quantize(MILLISECOND, rounding=ROUND_DOWN)


def elapsed(row, now):
    return Decimal(row['duration_seconds']) + active_delta(row, now)


def transition(row, action, now):
    target = {'pause': 'paused', 'resume': 'running', 'finish': 'completed', 'cancel': 'cancelled'}[action]
    if row['state'] == target:
        return {}, None, False
    if row['state'] in TERMINAL:
        raise ValueError('La sesión ya terminó; no puede cambiar a otro estado.')
    if action == 'resume':
        if Decimal(row['duration_seconds']) >= row['planned_seconds']:
            raise ValueError('El tiempo elegido ya terminó. Finaliza o cancela la sesión.')
        return {'state': 'running', 'resumed_at': now, 'version': row['version'] + 1}, None, True
    duration = elapsed(row, now)
    segment_end = row['resumed_at'].astimezone(timezone.utc) + timedelta(seconds=float(active_delta(row, now))) if row['state'] == 'running' else None
    updates = {'state': target, 'resumed_at': None, 'duration_seconds': duration, 'version': row['version'] + 1}
    if target in TERMINAL:
        updates['ended_at'] = max(now, row['started_at'])
    return updates, segment_end, False
