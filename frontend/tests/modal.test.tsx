import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { activateDialog, dismissDialog, outsideDialog } from '../src/modal.ts';
import { TaskEditor } from '../src/components/TaskEditor';
import { HabitEditor } from '../src/components/HabitEditor';
import { BlockEditor } from '../src/components/BlockEditor';

function dialogHarness({ connected = true, disabled = false } = {}) {
    const events: string[] = [];
    const document = {
        activeElement: { isConnected: connected, matches: () => disabled, focus: () => events.push('restore-opener') },
        documentElement: { style: { overflow: 'auto', width: '' }, clientWidth: 980 },
        defaultView: { scrollX: 0, scrollY: 240, scrollTo: (x: number, y: number) => events.push(`scroll:${x},${y}`) },
        getElementById: () => ({ focus: () => events.push('focus-main') }),
    };
    const dialog = {
        ownerDocument: document, open: false,
        showModal() { this.open = true; events.push('show-modal'); },
        close() { this.open = false; events.push('close'); },
        querySelector: () => ({ focus: () => events.push('focus-first-field') }),
        getBoundingClientRect: () => ({ left: 100, right: 500, top: 100, bottom: 500 }),
    };
    return { dialog: dialog as unknown as HTMLDialogElement, document, events };
}

test('modal: apertura nativa, foco inicial, bloqueo de scroll y retorno al disparador', () => {
    const h = dialogHarness();
    const close = activateDialog(h.dialog);
    assert.deepEqual(h.events, ['show-modal', 'focus-first-field']);
    assert.equal(h.document.documentElement.style.overflow, 'hidden');
    close();
    assert.deepEqual(h.events.slice(2), ['close', 'scroll:0,240', 'restore-opener']);
    assert.equal(h.document.documentElement.style.overflow, 'auto');
    assert.equal(h.document.documentElement.style.width, '');
});

test('modal: inmoviliza el fondo sin cambiar su anchura y conserva la posición de scroll', () => {
    const h = dialogHarness();
    const close = activateDialog(h.dialog);
    assert.equal(h.document.documentElement.style.overflow, 'hidden');
    assert.equal(h.document.documentElement.style.width, '980px');
    close();
    assert.ok(h.events.includes('scroll:0,240'));
});

test('modal: si showModal falla, restaura los estilos sin fingir apertura modal', () => {
    const h = dialogHarness();
    h.dialog.showModal = () => { throw new Error('No se pudo abrir'); };
    assert.throws(() => activateDialog(h.dialog), /No se pudo abrir/);
    assert.equal(h.document.documentElement.style.overflow, 'auto');
});

test('modal: restauración segura si el disparador desaparece o queda deshabilitado', () => {
    for (const config of [{ connected: false }, { disabled: true }]) {
        const h = dialogHarness(config);
        activateDialog(h.dialog)();
        assert.equal(h.events.at(-1), 'focus-main');
    }
});

test('modal: el backdrop se distingue del relleno interior', () => {
    const h = dialogHarness();
    assert.equal(outsideDialog(h.dialog, 50, 200), true);
    assert.equal(outsideDialog(h.dialog, 200, 600), true);
    assert.equal(outsideDialog(h.dialog, 120, 120), false);
    assert.equal(outsideDialog(h.dialog, 100, 100), false);
});

test('modal: se puede cerrar salvo mientras se guarda, sin reenviar el formulario', () => {
    let closed = 0;
    dismissDialog(true, () => closed++);
    assert.equal(closed, 0);
    dismissDialog(false, () => closed++);
    assert.equal(closed, 1);
});

test('editor de tarea: modal etiquetado, datos precargados, validaciones y errores visibles', () => {
    const html = renderToStaticMarkup(<TaskEditor id={7} draft={{ title: 'Tarea recibida', description: 'Detalle', priority: 'alta', category: 'trabajo', due_date: '2026-11-09' }} busy={false} error="No se pudo guardar." onChange={() => {}} onSubmit={() => {}} onClose={() => {}}/>);
    assert.match(html, /<dialog/); assert.match(html, /aria-modal="true"/); assert.match(html, /aria-labelledby=/);
    assert.match(html, /Editar tarea/); assert.match(html, /Cerrar formulario/);
    assert.match(html, /value="Tarea recibida"/); assert.match(html, /Detalle/);
    assert.match(html, /value="alta" selected/); assert.match(html, /value="trabajo" selected/);
    assert.match(html, /value="2026-11-09"/); assert.match(html, /data-autofocus/);
    assert.match(html, /maxLength="80"/); assert.match(html, /maxLength="2000"/);
    assert.match(html, /role="alert">No se pudo guardar/); assert.match(html, /Cancelar/);
});

test('editor de hábito: variante pequeña, nombre precargado e historial conservado', () => {
    const html = renderToStaticMarkup(<HabitEditor editing name="Leer" busy={true} error="" onChange={() => {}} onSubmit={() => {}} onClose={() => {}}/>);
    assert.match(html, /ritmo-modal-small/); assert.match(html, /Editar hábito/);
    assert.match(html, /value="Leer"/); assert.match(html, /fieldset disabled/);
    assert.match(html, /Cerrar formulario" disabled/); assert.match(html, /conserva todas sus marcas/);
    assert.match(html, /Guardando/);
});

test('editor de bloque: mismo diálogo, precarga y precisión de segundos, sin formulario inline', () => {
    const html = renderToStaticMarkup(<BlockEditor editing draft={{ title: 'Bloque', day: '2026-11-09', starts_at: '09:00:15', ends_at: '10:00:30', category: 'estudio' }} busy={false} error="Fin inválido" onChange={() => {}} onSubmit={() => {}} onClose={() => {}}/>);
    assert.match(html, /<dialog/); assert.match(html, /Editar bloque/);
    assert.match(html, /value="09:00:15"/); assert.match(html, /value="10:00:30"/);
    assert.match(html, /step="1"/); assert.match(html, /data-autofocus/);
    assert.match(html, /role="alert">Fin inválido/);
    assert.ok(!html.includes('class="block-form"'));
});
