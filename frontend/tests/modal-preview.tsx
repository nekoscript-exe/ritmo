// Página de pruebas de Vite, excluida de las entradas del build de producción.
// No importa api.ts, no realiza peticiones a la API y no guarda datos.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TaskEditor } from '../src/components/TaskEditor';
import { HabitEditor } from '../src/components/HabitEditor';
import { BlockEditor } from '../src/components/BlockEditor';
import type { BlockInput, TaskInput } from '../src/models';
import '../src/dashboard.css';

function Preview() {
    const [kind, setKind] = useState<'task' | 'habit' | 'block' | null>(null);
    const [editing, setEditing] = useState(false);
    const [report, setReport] = useState('Abre uno de los seis editores para medir la superposición.');
    const [task, setTask] = useState<TaskInput>({ title: '', description: null, priority: 'media', category: 'personal', due_date: null });
    const [block, setBlock] = useState<BlockInput>({ title: '', day: '2026-11-09', starts_at: '09:00', ends_at: '10:00', category: 'personal' });
    const [name, setName] = useState('');
    const before = useRef<DOMRect | null>(null);
    const dashboard = useRef<HTMLDivElement>(null);
    function open(next: 'task' | 'habit' | 'block', edit: boolean) {
        before.current = dashboard.current!.getBoundingClientRect();
        setTask({ title: edit ? 'Nombre de prueba' : '', description: null, priority: 'media', category: 'personal', due_date: null });
        setBlock({ title: edit ? 'Bloque de prueba' : '', day: '2026-11-09', starts_at: '09:00', ends_at: '10:00', category: 'personal' });
        setName(edit ? 'Hábito de prueba' : ''); setEditing(edit); setKind(next);
    }
    useEffect(() => {
        if (!kind) return;
        const frame = requestAnimationFrame(() => {
            const dialog = document.querySelector<HTMLDialogElement>('dialog:modal');
            const results: string[] = [];
            const check = (name: string, ok: boolean) => results.push(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
            check('apertura real con showModal() en top layer', !!dialog);
            if (dialog) {
                const rect = dialog.getBoundingClientRect();
                const after = dashboard.current!.getBoundingClientRect();
                check('portal directamente en body', dialog.parentElement === document.body);
                check('centrado horizontal', Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 3);
                check('centrado vertical', Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 3);
                check('dashboard sin desplazamiento ni cambio de altura', Math.abs(after.top - before.current!.top) < 1 && Math.abs(after.height - before.current!.height) < 1 && Math.abs(after.width - before.current!.width) < 1);
                check('foco inicial en primer campo', document.activeElement === dialog.querySelector('[data-autofocus]'));
                check('fondo inmovilizado', document.documentElement.style.overflow === 'hidden');
                check('backdrop semitransparente', getComputedStyle(dialog, '::backdrop').backgroundColor !== 'rgba(0, 0, 0, 0)');
            }
            setReport(results.join('\n'));
        });
        return () => cancelAnimationFrame(frame);
    }, [kind]);
    const close = () => setKind(null);
    return <main id="main" tabIndex={-1} style={{ padding: 30, minHeight: '180vh' }}>
        <h1>Verificación aislada de modales</h1><p>Sin API ni datos reales. Guardar solo cierra la prueba. El reporte mide el navegador; también revisa Tab, Esc, X y clic fuera.</p>
        <div ref={dashboard} className="card" style={{ marginTop: 25 }}>
            <h2>Dashboard inmóvil de prueba</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '20px 0' }}>{(['task', 'habit', 'block'] as const).flatMap(type => [false, true].map(edit => <button key={`${type}-${edit}`} onClick={() => open(type, edit)}>{edit ? 'Editar' : 'Crear'} {type === 'task' ? 'tarea' : type === 'habit' ? 'hábito' : 'bloque'}</button>))}</div>
            <p>Esta tarjeta debe conservar posición y altura al abrir cualquier editor.</p>
        </div>
        <pre aria-live="polite" style={{ position: 'fixed', bottom: 12, left: 12, margin: 0, padding: 12, fontSize: 11, whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid #dfe8e3', maxWidth: 'calc(100vw - 24px)' }}>{report}</pre>
        {kind === 'task' && <TaskEditor id={editing ? 1 : undefined} draft={task} busy={false} error="" onChange={patch => setTask({ ...task, ...patch })} onSubmit={close} onClose={close}/>}
        {kind === 'habit' && <HabitEditor editing={editing} name={name} busy={false} error="" onChange={setName} onSubmit={close} onClose={close}/>}
        {kind === 'block' && <BlockEditor editing={editing} draft={block} busy={false} error="" onChange={patch => setBlock({ ...block, ...patch })} onSubmit={close} onClose={close}/>}
    </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
