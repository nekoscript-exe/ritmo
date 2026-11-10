import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { api, taskQuery } from '../src/api.ts';
import { loadTaskSnapshot } from '../src/taskService.ts';
import { TaskList } from '../src/components/TasksPanel';
import type { Task } from '../src/models';

test('integración frontend: crear, consultar, editar, completar, reabrir y eliminar mediante fetch', async t => {
    // Servidor simulado solo en esta prueba: ninguna conexión ni persistencia ficticia en la aplicación.
    let task: Task | null = null;
    const day = '2026-11-09';
    const requests: string[] = [];
    t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
        const url = new URL(path, 'http://test.invalid');
        requests.push(`${options.method} ${url.pathname}`);
        if (url.pathname === '/api/tasks' && options.method === 'POST') {
            task = { ...JSON.parse(String(options.body)), id: 1, completed: false, created_at: '2026-11-09T09:00:00Z', completed_at: null };
            return Response.json(task, { status: 201 });
        }
        if (url.pathname === '/api/tasks/1' && options.method === 'PATCH') {
            const patch = JSON.parse(String(options.body));
            task = { ...task!, ...patch, completed_at: patch.completed ? '2026-11-09T10:00:00Z' : null };
            return Response.json(task);
        }
        if (url.pathname === '/api/tasks/1' && options.method === 'DELETE') {
            task = null; return new Response(null, { status: 204 });
        }
        if (url.pathname === `/api/tasks/progress/${day}`) {
            const total = task?.due_date === day ? 1 : 0;
            const completed = total && task?.completed ? 1 : 0;
            return Response.json({ day, total, completed, percent: completed * 100 });
        }
        if (url.pathname === '/api/tasks' && options.method === 'GET') {
            const items = task && (!url.searchParams.has('due_date') || task.due_date === url.searchParams.get('due_date')) ? [task] : [];
            return Response.json({ items, total: items.length, limit: 50, offset: 0 });
        }
        throw new Error(`Petición inesperada: ${url.pathname}`);
    });
    const created = await api.createTask({ title: '<script>Tarea</script>', description: 'Descripción recibida', priority: 'alta', category: 'trabajo', due_date: day });
    let snapshot = await loadTaskSnapshot(day, { due_date: day });
    assert.equal(snapshot.page.items[0].id, created.id);
    assert.equal(snapshot.progress.percent, 0);
    let html = renderToStaticMarkup(<TaskList tasks={snapshot.page.items} disabled={false} onEdit={() => {}} onComplete={() => {}} onDelete={() => {}}/>);
    assert.match(html, /Completar tarea/); assert.match(html, /&lt;script&gt;/); assert.ok(!html.includes('<script>'));
    await api.updateTask(created.id, { title: 'Editada', completed: true });
    snapshot = await loadTaskSnapshot(day, {});
    assert.equal(snapshot.progress.percent, 100);
    html = renderToStaticMarkup(<TaskList tasks={snapshot.page.items} disabled={false} onEdit={() => {}} onComplete={() => {}} onDelete={() => {}}/>);
    assert.match(html, /Reabrir tarea Editada/); assert.match(html, /checked/);
    await api.updateTask(created.id, { completed: false, due_date: null, description: null });
    snapshot = await loadTaskSnapshot(day, { due_date: day });
    assert.equal(snapshot.page.total, 0); assert.equal(snapshot.progress.total, 0);
    await api.deleteTask(created.id);
    assert.equal((await loadTaskSnapshot(day, {})).page.total, 0);
    assert.ok(requests.every(path => !path.includes('/blocks')));
});

test('filtros serializados sin perder false o cero y sin campos vacíos', () => {
    const params = new URLSearchParams(taskQuery({ status: 'pending', priority: 'alta', category: 'trabajo', due_date: '2026-11-09', limit: 50, offset: 0 }));
    assert.equal(params.get('status'), 'pending'); assert.equal(params.get('priority'), 'alta');
    assert.equal(params.get('due_date'), '2026-11-09'); assert.equal(params.get('offset'), '0');
    assert.equal(taskQuery({ undated: true, status: undefined }), 'undated=true');
});

test('carga fallida o sesión vencida no se convierten en una lista vacía satisfactoria', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Inicia sesión.' }, { status: 401 }));
    await assert.rejects(loadTaskSnapshot('2026-11-09', {}), (error: any) => error.status === 401);
    globalThis.fetch = async () => new Response('Proxy error', { status: 503 });
    await assert.rejects(loadTaskSnapshot('2026-11-09', {}), /servidor no está disponible/);
});
