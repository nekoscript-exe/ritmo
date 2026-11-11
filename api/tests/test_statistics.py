from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient


def test_statistics_aggregation(signed_in, db, monkeypatch):
    import statistics_routes
    import focus_routes
    now = datetime(2026,11,3,12,tzinfo=timezone.utc)
    monkeypatch.setattr(statistics_routes,'server_now',lambda db: now)
    monkeypatch.setattr(focus_routes,'server_now',lambda db: now)
    for payload in [{'title':'Completa','due_date':'2026-11-02','completed':True}, {'title':'Vencida','due_date':'2026-11-01'}, {'title':'Sin fecha'}]:
        assert signed_in.post('/api/tasks',json=payload).status_code == 201
    habit = signed_in.post('/api/habits',json={'name':'Leer'}).json()
    for day in ['2026-11-01','2026-11-02']:
        assert signed_in.put(f"/api/habits/{habit['id']}/checks/{day}",json={'done':True}).status_code == 204
    assert signed_in.post('/api/blocks',json={'title':'Trabajo','day':'2026-11-02','starts_at':'09:00','ends_at':'10:00','category':'trabajo'}).status_code == 201
    session = signed_in.post('/api/focus',json={'request_id':str(uuid4()),'planned_seconds':1500}).json()['session']
    now += timedelta(minutes=10)
    assert signed_in.post(f"/api/focus/{session['id']}/finish",json={'request_id':str(uuid4()),'expected_version':0}).status_code == 200
    result = signed_in.get('/api/statistics',params={'start':'2026-11-01','end':'2026-11-07','timezone':'UTC'})
    assert result.status_code == 200, result.text
    assert result.headers['cache-control'] == 'no-store'
    data = result.json(); summary = data['summary']
    assert summary['tasks_total'] == 2 and summary['tasks_completed'] == 1 and summary['tasks_percent'] == 50
    assert summary['tasks_overdue'] == 1 and summary['planned_minutes'] == 60
    assert summary['habits_expected'] == 3 and summary['habits_completed'] == 2
    assert summary['focus_minutes'] == 10 and summary['focus_completed_sessions'] == 1
    assert data['habits'][0]['current_streak'] == 2 and data['habits'][0]['max_streak'] == 2
    assert data['daily'][2]['focus_minutes'] == 10
    assert data['daily'][3]['habits_expected'] == 0
    assert next(c for c in data['by_category'] if c['category']=='trabajo')['minutes'] == 60


def test_active_focus_excluded_and_cancelled_separate(signed_in, monkeypatch):
    import focus_routes
    import statistics_routes
    now=datetime(2026,11,10,12,tzinfo=timezone.utc)
    monkeypatch.setattr(focus_routes,'server_now',lambda db:now)
    monkeypatch.setattr(statistics_routes,'server_now',lambda db:now)
    session=signed_in.post('/api/focus',json={'request_id':str(uuid4()),'planned_seconds':1500}).json()['session']
    now+=timedelta(minutes=5)
    params={'start':'2026-11-10','end':'2026-11-10','timezone':'UTC'}
    assert signed_in.get('/api/statistics',params=params).json()['summary']['focus_minutes']==0
    signed_in.post(f"/api/focus/{session['id']}/cancel",json={'request_id':str(uuid4()),'expected_version':0})
    summary=signed_in.get('/api/statistics',params=params).json()['summary']
    assert summary['focus_completed_minutes']==0 and summary['focus_interrupted_minutes']==5
    assert summary['focus_interrupted_sessions']==1


def test_statistics_isolation(signed_in, application, credentials):
    signed_in.post('/api/tasks',json={'title':'Privada','due_date':'2026-11-10'})
    signed_in.post('/api/habits',json={'name':'Privado'})
    with TestClient(application) as other:
        other.post('/api/account/register',json={**credentials,'username':credentials['username']+'b'})
        data=other.get('/api/statistics?start=2026-11-01&end=2026-11-30&timezone=UTC').json()
        assert data['summary']['tasks_total']==0 and data['habits']==[] and data['summary']['focus_minutes']==0


@pytest.mark.parametrize('params',[
    {'start':'2026-01-02','end':'2026-01-01'}, {'start':'2026-01-01','end':'2026-02-01'},
    {'start':'2026-02-30','end':'2026-03-01'}, {'start':'2026-01-01','end':'2026-01-01','timezone':'Invalid/Zone'},
    {'start':'9999-12-31','end':'9999-12-31'},
])
def test_statistics_invalid_period(signed_in,params):
    assert signed_in.get('/api/statistics',params=params).status_code==422
    assert signed_in.get('/api/focus',params=params).status_code==422


def test_focus_minutes_split_at_local_midnight(signed_in, monkeypatch):
    import focus_routes
    import statistics_routes
    now=datetime(2026,11,11,5,50,tzinfo=timezone.utc)
    monkeypatch.setattr(focus_routes,'server_now',lambda db:now)
    monkeypatch.setattr(statistics_routes,'server_now',lambda db:now)
    session=signed_in.post('/api/focus',json={'request_id':str(uuid4()),'planned_seconds':3600}).json()['session']
    now+=timedelta(minutes=20)
    signed_in.post(f"/api/focus/{session['id']}/finish",json={'request_id':str(uuid4()),'expected_version':0})
    for day in ['2026-11-10','2026-11-11']:
        summary=signed_in.get('/api/statistics',params={'start':day,'end':day,'timezone':'America/Mexico_City'}).json()['summary']
        assert summary['focus_minutes']==10
    utc=signed_in.get('/api/statistics?start=2026-11-11&end=2026-11-11&timezone=UTC').json()['summary']
    assert utc['focus_minutes']==20
