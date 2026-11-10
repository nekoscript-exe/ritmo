import assert from 'node:assert/strict';
import test from 'node:test';
import { clock, greeting, localDay, monthCells, parseDay, remainingSeconds } from '../src/domain.ts';
import { initialTimer, timerReducer } from '../src/timer.ts';

test('calendario: lunes primero, febrero bisiesto y fecha seleccionable', () => {
  const cells = monthCells(2024, 1);
  assert.deepEqual(cells.slice(0, 4), [null, null, null, '2024-02-01']);
  assert.equal(cells.filter(Boolean).length, 29);
  assert.equal(cells.at(-1), '2024-02-29');
  assert.equal(monthCells(2026, 10)[0], null);
  assert.equal(monthCells(2026, 10).filter(Boolean).length, 30);
});
test('calendario: años límite y cambio de año sin conversión UTC', () => {
  assert.equal(monthCells(1, 0)[0], '0001-01-01');
  assert.equal(monthCells(9999, 11).at(-1), '9999-12-31');
  assert.equal(localDay(parseDay('2026-12-31')), '2026-12-31');
  assert.equal(localDay(parseDay('0001-01-01')), '0001-01-01');
});
test('Focus: calcula por fecha límite, no por cantidad de ticks', () => {
  const end = 1500000;
  assert.equal(remainingSeconds(end, 0), 1500);
  assert.equal(remainingSeconds(end, 60000), 1440);
  assert.equal(remainingSeconds(end, 1499999), 1);
  assert.equal(remainingSeconds(end, 1500000), 0);
  assert.equal(remainingSeconds(end, 1600000), 0);
  assert.equal(clock(1500), '25:00'); assert.equal(clock(0), '00:00');
});
test('saludo dinámico según hora local', () => {
  assert.equal(greeting(8), 'Buenos días');
  assert.equal(greeting(14), 'Buenas tardes');
  assert.equal(greeting(22), 'Buenas noches');
});
test('Focus: iniciar, pausar, reanudar y reiniciar usan el mismo estado del componente', () => {
  let state = timerReducer(initialTimer, { type: 'start', now: 1000 });
  assert.equal(state.running, true);
  state = timerReducer(state, { type: 'pause', now: 61000 });
  assert.equal(state.remaining, 1440); assert.equal(state.running, false);
  state = timerReducer(state, { type: 'tick', now: 100000 });
  assert.equal(state.remaining, 1440);
  state = timerReducer(state, { type: 'start', now: 200000 });
  state = timerReducer(state, { type: 'tick', now: 220000 });
  assert.equal(state.remaining, 1420);
  state = timerReducer(state, { type: 'reset' });
  assert.equal(state.remaining, 1500); assert.equal(state.running, false);
});
test('Focus: configuración acotada, finalización y ausencia de ticks tras reset', () => {
  let state = timerReducer(initialTimer, { type: 'configure', minutes: 15 });
  assert.equal(state.remaining, 900);
  assert.equal(timerReducer(state, { type: 'configure', minutes: -1 }), state);
  state = timerReducer(state, { type: 'start', now: 0 });
  assert.equal(timerReducer(state, { type: 'configure', minutes: 60 }), state);
  state = timerReducer(state, { type: 'tick', now: 1000000 });
  assert.equal(state.finished, true); assert.equal(state.remaining, 0); assert.equal(state.running, false);
  assert.equal(timerReducer(state, { type: 'start', now: 1000000 }), state);
  state = timerReducer(state, { type: 'reset' });
  assert.equal(timerReducer(state, { type: 'tick', now: 2000000 }), state);
});
