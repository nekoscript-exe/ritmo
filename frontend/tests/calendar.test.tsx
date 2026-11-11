import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { addDays, calendarRange, navigateCalendar, monthGrid, positionBlocks, activitiesForDay, rangeDays } from '../src/calendarDomain.ts';
import { calendarService } from '../src/calendarService.ts';
import { CalendarViews } from '../src/components/calendar/CalendarViews';
import { CalendarWorkspace } from '../src/components/calendar/CalendarWorkspace';
import type { CalendarBlock, CalendarData } from '../src/models';
import { resolveApiBase, apiConfig } from '../config.js';

const makeBlock = (id: number, start: string, end: string): CalendarBlock => ({ id, day: '2026-11-10', title: `Bloque ${id}`, starts_at: start, ends_at: end, category: 'personal' });
const sample: CalendarData = { start: '2026-11-09', end: '2026-11-15', blocks: [makeBlock(2, '15:00', '16:00'), makeBlock(1, '09:00', '10:00')], tasks: [
    { id: 1, title: 'Tarea con vencimiento', due_date: '2026-11-10', description: null, completed: false, priority: 'media', category: 'personal', created_at: '2026-11-01T00:00:00Z', completed_at: null },
] };
test('intervalos: lunes-domingo, fin de año, mes bisiesto y días límite', () => {
    assert.deepEqual(calendarRange('2027-01-01', 'week'), { start: '2026-12-28', end: '2027-01-03' });
    assert.deepEqual(calendarRange('2024-02-29', 'month'), { start: '2024-02-01', end: '2024-02-29' });
    assert.deepEqual(calendarRange('9999-12-31', 'week'), { start: '9999-12-27', end: '9999-12-31' });
    assert.equal(addDays('0001-01-01', -1), '0001-01-01');
    assert.equal(addDays('9999-12-31', 1), '9999-12-31');
    assert.equal(rangeDays('9999-12-30', '9999-12-31').length, 2);
});
test('navegación: conserva día cuando es posible y evita saltos por meses cortos', () => {
    assert.equal(navigateCalendar('2024-01-31', 'month', 1), '2024-02-29');
    assert.equal(navigateCalendar('2025-03-31', 'month', -1), '2025-02-28');
    assert.equal(navigateCalendar('2026-12-31', 'week', 1), '2027-01-07');
    assert.equal(navigateCalendar('0001-01-01', 'month', -1), '0001-01-01');
    assert.equal(navigateCalendar('9999-12-31', 'month', 1), '9999-12-31');
    assert.equal(monthGrid('2024-02-29').filter(Boolean).length, 29);
    assert.equal(monthGrid('2026-03-01').length % 7, 0);
});
test('posiciones: horarios reales, segundos y carriles para solapamientos', () => {
    const result = positionBlocks([makeBlock(1, '09:00', '10:00'), makeBlock(2, '09:30', '10:30'), makeBlock(3, '10:30', '11:00')]);
    assert.equal(result[0].top, 9 / 24 * 100);
    assert.equal(result[0].lanes, 2); assert.equal(result[1].lane, 1);
    assert.equal(result[2].lanes, 1);
    const second = positionBlocks([makeBlock(4, '00:00:30', '00:01:30')])[0];
    assert.equal(second.height, 1 / 1440 * 100);
});
test('actividades: tareas sin horas inventadas y bloques ordenados cronológicamente', () => {
    const activities = activitiesForDay(sample, '2026-11-10');
    assert.deepEqual(activities.map(a => a.kind), ['task', 'block', 'block']);
    assert.equal(activities[1].kind === 'block' && activities[1].block.id, 1);
    assert.equal(activitiesForDay(sample, '2026-11-11').length, 0);
});
test('vistas: día accesible, siete columnas en semana e indicadores reales en mes', () => {
    const props = { data: sample, day: '2026-11-10', onSelect: () => {}, onOpen: () => {} };
    const daily = renderToStaticMarkup(<CalendarViews {...props} view="day"/>);
    assert.ok(daily.indexOf('09:00') < daily.indexOf('15:00'));
    assert.match(daily, /Sin horario/); assert.match(daily, /Tarea con vencimiento/);
    const weekly = renderToStaticMarkup(<CalendarViews {...props} view="week"/>);
    assert.equal((weekly.match(/class="week-time-column"/g) || []).length, 7);
    assert.match(weekly, /positioned-block/);
    const monthly = renderToStaticMarkup(<CalendarViews {...props} view="month"/>);
    assert.match(monthly, /1 tareas, 2 bloques/); assert.match(monthly, /Abrir día/);
});
test('carga: muestra estado honesto y selector de tres vistas sin actividades ficticias', () => {
    const html = renderToStaticMarkup(<CalendarWorkspace day="2026-11-10" view="week" onDayChange={() => {}} onViewChange={() => {}} blocked={false} onBusyChange={() => {}} onChanged={() => {}} onUnauthorized={() => {}}/>);
    assert.match(html, /Cargando calendario/); assert.match(html, />Día</); assert.match(html, />Semana</); assert.match(html, />Mes</);
    assert.ok(!html.includes('Tarea con vencimiento'));
});
test('servicio: una sola petición por intervalo; escrituras reutilizan los endpoints actuales', async t => {
    const calls: string[] = [];
    t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
        calls.push(`${options.method} ${url}`);
        return options.method === 'GET' ? Response.json(sample) : new Response(null, { status: 204 });
    });
    assert.deepEqual(await calendarService.load(sample.start, sample.end), sample);
    assert.deepEqual(calls, ['GET /api/calendar?start=2026-11-09&end=2026-11-15']);
    await calendarService.saveBlock(sample.blocks[0], 2);
    await calendarService.saveTask(sample.tasks[0], 1);
    await calendarService.toggleTask({ kind: 'task', task: sample.tasks[0] });
    await calendarService.remove({ kind: 'block', block: sample.blocks[0] });
    assert.deepEqual(calls.slice(1).map(c => c.split(' ')[0]), ['PUT', 'PATCH', 'PATCH', 'DELETE']);
});
test('servicio: un fallo nunca se convierte en un calendario vacío', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Inicia sesión.' }, { status: 401 }));
    await assert.rejects(calendarService.load(sample.start, sample.end), (e: any) => e.status === 401);
});
test('configuración portable: origen relativo por omisión y HTTPS externo sin credenciales', () => {
    assert.equal(apiConfig.baseURL, '/api'); assert.equal(apiConfig.credentials, 'same-origin');
    assert.equal(resolveApiBase('/gateway/api/'), '/gateway/api');
    assert.equal(resolveApiBase('https://api.example.test/api/'), 'https://api.example.test/api');
    for (const invalid of ['http://example.test/api', '//example.test/api', 'https://u:p@example.test/api', 'https://example.test/api?token=private']) assert.throws(() => resolveApiBase(invalid));
});
