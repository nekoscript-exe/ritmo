"""Pruebas puras: no importan FastAPI, no abren conexiones y no sustituyen PostgreSQL."""
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'api'))
from focus_domain import active_delta, elapsed, transition
from metrics import period_bounds, split_segment, streaks, percentage


class FocusDomainTests(unittest.TestCase):
    def row(self):
        now = datetime(2026, 11, 10, 10, tzinfo=timezone.utc)
        return {'state': 'running', 'started_at': now, 'resumed_at': now,
                'duration_seconds': Decimal(0), 'planned_seconds': 1500, 'version': 0}

    def test_pause_resume_finish_excludes_pause(self):
        row = self.row(); start = row['started_at']
        updates, end, opened = transition(row, 'pause', start + timedelta(seconds=90))
        row.update(updates)
        self.assertEqual(row['duration_seconds'], Decimal(90)); self.assertFalse(opened)
        self.assertEqual(end, start + timedelta(seconds=90))
        row.update(transition(row, 'resume', start + timedelta(seconds=300))[0])
        row.update(transition(row, 'finish', start + timedelta(seconds=360))[0])
        self.assertEqual(row['duration_seconds'], Decimal(150)); self.assertEqual(row['state'], 'completed')

    def test_cap_and_cancel(self):
        row = self.row(); now = row['started_at'] + timedelta(days=2)
        self.assertEqual(elapsed(row, now), Decimal(1500))
        updates, end, _ = transition(row, 'cancel', now)
        self.assertEqual(end, row['started_at'] + timedelta(seconds=1500))
        self.assertEqual(updates['state'], 'cancelled')
        self.assertEqual(updates['duration_seconds'], Decimal(1500))
        # Leer no modifica estado ni contabiliza una finalización.
        self.assertEqual(row['state'], 'running')

    def test_idempotent_target_and_invalid_terminal_transition(self):
        row = self.row(); row.update(transition(row, 'finish', row['started_at'])[0])
        self.assertEqual(transition(row, 'finish', row['started_at']), ({}, None, False))
        with self.assertRaises(ValueError): transition(row, 'resume', row['started_at'])
        with self.assertRaises(ValueError): transition(row, 'cancel', row['started_at'])

    def test_clock_regression_and_milliseconds(self):
        row = self.row()
        self.assertEqual(active_delta(row, row['started_at'] - timedelta(seconds=1)), 0)
        self.assertEqual(active_delta(row, row['started_at'] + timedelta(seconds=1.2349)), Decimal('1.234'))

    def test_dst_uses_elapsed_utc_not_wall_clock(self):
        ny = ZoneInfo('America/New_York'); row = self.row()
        row.update(started_at=datetime(2026, 3, 8, 1, 30, tzinfo=ny), resumed_at=datetime(2026, 3, 8, 1, 30, tzinfo=ny), planned_seconds=14400)
        self.assertEqual(elapsed(row, datetime(2026, 3, 8, 3, 30, tzinfo=ny)), Decimal(3600))


class MetricsTests(unittest.TestCase):
    def test_period_validation(self):
        _, a, b = period_bounds(date(2024, 2, 1), date(2024, 2, 29), 'UTC')
        self.assertEqual((b-a).days, 29)
        for start, end, zone in [(date(2026,1,2),date(2026,1,1),'UTC'), (date(2026,1,1),date(2026,2,1),'UTC'),
                                 (date(2026,1,1),date(2026,1,2),'Not/AZone'), (date.max,date.max,'UTC')]:
            with self.assertRaises(ValueError): period_bounds(start, end, zone)

    def test_local_midnight_split(self):
        zone = ZoneInfo('America/Mexico_City'); day = date(2026, 11, 10)
        a = datetime(2026, 11, 11, 5, 30, tzinfo=timezone.utc); b = a + timedelta(hours=1)
        self.assertEqual(split_segment(a,b,day,day+timedelta(days=1),zone), {day: Decimal(1800),day+timedelta(days=1):Decimal(1800)})

    def test_dst_days_23_and_25_hours(self):
        for day, hours in [(date(2026,3,8),23), (date(2026,11,1),25)]:
            zone, a, b = period_bounds(day, day, 'America/New_York')
            self.assertEqual(split_segment(a,b,day,day,zone)[day], Decimal(hours*3600))

    def test_streaks_with_pending_today_and_gap(self):
        start = date(2026,11,1); today = date(2026,11,5)
        self.assertEqual(streaks({start,start+timedelta(days=1),today-timedelta(days=1)},start,today,today),(1,2))
        self.assertEqual(streaks({today-timedelta(days=1),today},start,today,today),(2,2))
        self.assertEqual(streaks(set(),date.min,date.min,date.min),(0,0))
        self.assertEqual(streaks({date.min},date.min,date.min,date.min),(1,1))
        self.assertEqual(percentage(0,0),0)

    def test_interval_intersection_no_minutes_outside(self):
        zone, a, b = period_bounds(date(2026,11,10),date(2026,11,10),'UTC')
        self.assertEqual(split_segment(a-timedelta(hours=2),a+timedelta(minutes=15),date(2026,11,10),date(2026,11,10),zone),{date(2026,11,10):Decimal(900)})

if __name__ == '__main__': unittest.main()
