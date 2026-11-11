from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


def start(client, **changes):
    body = {'request_id': str(uuid4()), 'planned_seconds': 1500, 'task_id': None, **changes}
    response = client.post('/api/focus', json=body)
    assert response.status_code == 201, response.text
    return body, response.json()['session']


def command(client, session, action, **changes):
    body = {'request_id': str(uuid4()), 'expected_version': session['version'], **changes}
    response = client.post(f"/api/focus/{session['id']}/{action}", json=body)
    assert response.status_code == 200, response.text
    return body, response.json()['session']


def test_focus_lifecycle_exact_time_and_recovery(signed_in, monkeypatch, application, db):
    import focus_routes
    now = datetime(2026,11,10,10,tzinfo=timezone.utc)
    monkeypatch.setattr(focus_routes, 'server_now', lambda db: now)
    _, session = start(signed_in)
    now += timedelta(seconds=90)
    _, paused = command(signed_in, session, 'pause')
    assert paused['duration_seconds'] == 90 and paused['state'] == 'paused'
    now += timedelta(seconds=200)
    with TestClient(application) as reopened:
        reopened.cookies.update(signed_in.cookies)
        restored = reopened.get('/api/focus/active').json()['session']
        assert restored['id'] == session['id'] and restored['elapsed_seconds'] == 90
    _, resumed = command(signed_in, paused, 'resume')
    now += timedelta(seconds=60)
    _, finished = command(signed_in, resumed, 'finish')
    assert finished['duration_seconds'] == 150 and finished['state'] == 'completed'
    assert finished['ended_at'] is not None
    assert signed_in.get('/api/focus/active').json()['session'] is None
    row = db.execute('SELECT * FROM focus_sessions WHERE id = %s', (session['id'],)).fetchone()
    assert float(row['duration_seconds']) == 150
    assert db.execute('SELECT count(*) AS n FROM focus_segments WHERE session_id = %s AND ended_at IS NULL', (session['id'],)).fetchone()['n'] == 0


def test_focus_replay_conflicts_and_one_active(signed_in, db):
    body, session = start(signed_in)
    assert signed_in.post('/api/focus', json=body).json()['session']['id'] == session['id']
    assert signed_in.post('/api/focus', json={**body, 'planned_seconds': 60}).status_code == 409
    assert signed_in.post('/api/focus', json={**body, 'request_id': str(uuid4())}).status_code == 409
    pause_body, paused = command(signed_in, session, 'pause')
    _, resumed = command(signed_in, paused, 'resume')
    replay = signed_in.post(f"/api/focus/{session['id']}/pause", json=pause_body)
    assert replay.status_code == 200 and replay.json()['session']['state'] == 'running'
    assert replay.json()['session']['version'] == resumed['version']
    assert signed_in.post(f"/api/focus/{session['id']}/pause", json={**pause_body, 'request_id': str(uuid4())}).status_code == 409
    assert db.execute('SELECT count(*) AS n FROM focus_sessions WHERE id = %s', (session['id'],)).fetchone()['n'] == 1


def test_focus_cap_without_auto_completion(signed_in, monkeypatch):
    import focus_routes
    now = datetime(2026,11,10,10,tzinfo=timezone.utc)
    monkeypatch.setattr(focus_routes, 'server_now', lambda db: now)
    _, session = start(signed_in, planned_seconds=60)
    now += timedelta(days=3)
    recovered = signed_in.get('/api/focus/active').json()['session']
    assert recovered['elapsed_seconds'] == 60 and recovered['state'] == 'running'
    assert recovered['duration_seconds'] == 0
    _, cancelled = command(signed_in, session, 'cancel')
    assert cancelled['state'] == 'cancelled' and cancelled['duration_seconds'] == 60
    assert signed_in.post(f"/api/focus/{session['id']}/resume", json={'request_id': str(uuid4()), 'expected_version': cancelled['version']}).status_code == 409


def test_focus_edit_delete_and_ownership(application, signed_in, credentials):
    task = signed_in.post('/api/tasks', json={'title': 'Vinculada'}).json()
    _, session = start(signed_in, task_id=task['id'])
    edit = {'request_id': str(uuid4()), 'expected_version': 0, 'task_id': None}
    edited = signed_in.patch(f"/api/focus/{session['id']}", json=edit)
    assert edited.status_code == 200 and edited.json()['session']['task_id'] is None
    session = edited.json()['session']
    with TestClient(application) as other:
        other.post('/api/account/register', json={**credentials, 'username': credentials['username']+'b'})
        assert other.get(f"/api/focus/{session['id']}").status_code == 404
        assert other.get('/api/focus/active').json()['session'] is None
        assert other.patch(f"/api/focus/{session['id']}", json=edit).status_code == 404
        for action in ['pause','resume','finish','cancel']:
            assert other.post(f"/api/focus/{session['id']}/{action}", json={'request_id':str(uuid4()),'expected_version':session['version']}).status_code == 404
        assert other.delete(f"/api/focus/{session['id']}", params={'request_id':str(uuid4()),'expected_version':session['version']}).status_code == 404
        assert other.post('/api/focus', json={'request_id':str(uuid4()),'planned_seconds':60,'task_id':task['id']}).status_code == 404
    assert signed_in.delete(f"/api/focus/{session['id']}", params={'request_id':str(uuid4()),'expected_version':session['version']}).status_code == 409
    _, finished = command(signed_in, session, 'finish')
    params = {'request_id':str(uuid4()),'expected_version':finished['version']}
    for _ in range(2): assert signed_in.delete(f"/api/focus/{session['id']}", params=params).status_code == 204
    assert signed_in.get(f"/api/focus/{session['id']}").status_code == 404


@pytest.mark.parametrize('change', [
    {'planned_seconds':0}, {'planned_seconds':14401}, {'planned_seconds':True},
    {'task_id':0}, {'request_id':'invalid'}, {'duration_seconds':1}, {'account_id':1},
])
def test_focus_validation(signed_in, change):
    assert signed_in.post('/api/focus', json={'request_id':str(uuid4()),'planned_seconds':1500,**change}).status_code == 422
    for version in [-1,2147483648]:
        assert signed_in.delete('/api/focus/1',params={'request_id':str(uuid4()),'expected_version':version}).status_code==422


def test_focus_auth_and_history(signed_in, client, application):
    # La fixture signed_in comparte client: crear otro cliente realmente anónimo.
    with TestClient(application) as anonymous:
        assert anonymous.get('/api/focus/active').status_code == 401
        assert anonymous.post('/api/focus',json={'request_id':str(uuid4()),'planned_seconds':60}).status_code == 401
        assert anonymous.get('/api/statistics?start=2026-01-01&end=2026-01-07').status_code == 401
    _, session = start(signed_in)
    _, finished = command(signed_in,session,'finish')
    day = finished['started_at'][:10]
    page = signed_in.get('/api/focus',params={'start':day,'end':day,'timezone':'UTC'})
    assert page.status_code == 200 and page.json()['total'] == 1
    assert page.headers['cache-control'] == 'no-store'


@pytest.mark.parametrize('same_key',[True,False])
def test_concurrent_start_serializes(signed_in, application, same_key):
    from concurrent.futures import ThreadPoolExecutor
    key=str(uuid4())
    cookies=dict(signed_in.cookies)
    def request(i):
        with TestClient(application) as client:
            client.cookies.update(cookies)
            return client.post('/api/focus',json={'request_id':key if same_key else str(uuid4()),'planned_seconds':60})
    with ThreadPoolExecutor(max_workers=2) as workers:
        responses=list(workers.map(request,range(2)))
    assert sorted(r.status_code for r in responses)==([201,201] if same_key else [201,409])
    if same_key: assert responses[0].json()['session']['id']==responses[1].json()['session']['id']


def test_linked_task_delete_preserves_focus(signed_in):
    task=signed_in.post('/api/tasks',json={'title':'Temporal'}).json()
    _,session=start(signed_in,task_id=task['id'])
    assert signed_in.delete(f"/api/tasks/{task['id']}").status_code==204
    restored=signed_in.get('/api/focus/active').json()['session']
    assert restored['id']==session['id'] and restored['task_id'] is None
