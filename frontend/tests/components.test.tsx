import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Calendar } from '../src/components/Calendar';
import { FocusTimer } from '../src/components/FocusTimer';
import { TasksPanel, TaskList } from '../src/components/TasksPanel';
import { Habits } from '../src/components/Habits';
import { Agenda } from '../src/components/Agenda';
import { Auth } from '../src/components/Auth';

test('tareas: captura rápida, filtros y carga sin inventar resultados', () => {
  const html = renderToStaticMarkup(<TasksPanel day="2026-11-09" dashboard={true} blocked={false} onUnauthorized={() => {}} onBusyChange={() => {}}/>);
  assert.match(html, /Título de la nueva tarea/);
  assert.match(html, /Cargando tareas/);
  assert.match(html, /Estado<select/);
  assert.match(html, /Prioridad<select/);
  assert.match(html, /Cualquier fecha/);
  assert.ok(!html.includes('Próximamente'));
  assert.ok(!html.includes('type="checkbox"'));
});
test('tareas: estado vacío real y filtro de cumplimiento separados de bloques', () => {
  const html = renderToStaticMarkup(<TaskList tasks={[]} disabled={false} onEdit={() => {}} onDelete={() => {}} onComplete={() => {}}/>);
  assert.match(html, /No hay tareas con estos filtros/);
  assert.ok(!html.includes('type="checkbox"'));
});
test('calendario: botones etiquetados, selección y navegación mensual', () => {
  const html = renderToStaticMarkup(<Calendar selected="2024-02-29" onSelect={() => {}} disabled={false}/>);
  assert.equal((html.match(/aria-pressed=/g) || []).length, 29);
  assert.match(html, /aria-pressed="true"[^>]*aria-label="[^"]*29 de febrero de 2024/);
  assert.match(html, /Mes anterior/); assert.match(html, /Mes siguiente/);
});
test('Focus: duración, estado inicial y controles accesibles sin simular persistencia', () => {
  const html = renderToStaticMarkup(<FocusTimer/>);
  assert.match(html, /25:00/); assert.match(html, /Reiniciar temporizador/);
  assert.match(html, /Iniciar/); assert.match(html, /no se guarda al salir/);
  assert.match(html, /60 minutos/);
});
test('hábitos: renderiza datos recibidos y cumplimiento, escapando HTML', () => {
  const html = renderToStaticMarkup(<Habits day="2026-11-09" habits={[{ id: 7, name: '<script>private</script>', done: true }]} busy={false} query="" mutate={async () => {}}/>);
  assert.match(html, /1 de 1 completados/); assert.match(html, /checked/);
  assert.match(html, /&lt;script&gt;private/); assert.ok(!html.includes('<script>private'));
});
test('agenda: conserva la distinción entre bloque horario y tarea', () => {
  const html = renderToStaticMarkup(<Agenda day="2026-11-09" blocks={[{ id: 1, title: 'Bloque recibido', starts_at: '09:00:15', ends_at: '10:00:30', category: 'trabajo' }]} busy={false} query="" mutate={async () => {}}/>);
  assert.match(html, /Bloque recibido/); assert.match(html, /09:00/);
  assert.match(html, /Editar Bloque recibido/); assert.match(html, /tareas se gestionan por separado/);
  assert.ok(!html.includes('type="checkbox"'));
});
test('login: autocomplete, etiquetas y alternativa legacy', () => {
  const html = renderToStaticMarkup(<Auth onSubmit={async () => {}} busy={false}/>);
  assert.match(html, /autoComplete="username"/); assert.match(html, /autoComplete="current-password"/);
  assert.match(html, /minLength="10"/); assert.match(html, /legacy.html/);
});
