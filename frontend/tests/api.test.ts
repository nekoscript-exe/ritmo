import assert from 'node:assert/strict';
import test from 'node:test';
import { api, isUnauthorized } from '../src/api.ts';

test('adaptador usa endpoints existentes, separa hábitos y bloques y conserva la cookie', async t => {
  const calls: { path: string; method: string; body: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    calls.push({ path, method: options.method!, body: options.body ? JSON.parse(String(options.body)) : undefined });
    assert.equal(options.credentials, undefined); // fetch usa same-origin, sin tokens en JS.
    return new Response(null, { status: 204 });
  });
  const block = { title: 'Real', day: '2026-11-09', starts_at: '09:00', ends_at: '10:00', category: 'personal' as const };
  await api.account('login', 'usuario', 'only-test-password'); await api.day(block.day);
  await api.addHabit('Leer'); await api.checkHabit(3, block.day, true); await api.deleteHabit(3);
  await api.saveBlock(block); await api.saveBlock(block, 7); await api.deleteBlock(7); await api.logout();
  assert.deepEqual(calls.map(c => [c.method, c.path]), [
    ['POST', '/api/account/login'], ['GET', '/api/days/2026-11-09'], ['POST', '/api/habits'],
    ['PUT', '/api/habits/3/checks/2026-11-09'], ['DELETE', '/api/habits/3'], ['POST', '/api/blocks'],
    ['PUT', '/api/blocks/7'], ['DELETE', '/api/blocks/7'], ['POST', '/api/account/logout'],
  ]);
  assert.deepEqual(calls[3].body, { done: true });
  assert.ok(calls.every(c => !c.path.includes('/tasks')));
});
test('sesión expirada se propaga con status, sin convertirla en datos vacíos', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Inicia sesión.' }, { status: 401 }));
  await assert.rejects(api.day('2026-11-09'), isUnauthorized);
});

test('editar hábito conserva el identificador y envía solo el nombre', async t => {
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    assert.equal(path, '/api/habits/7');
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(String(options.body)), { name: 'Leer más' });
    return new Response(null, { status: 204 });
  });
  assert.equal(await api.updateHabit(7, 'Leer más'), undefined);
});
