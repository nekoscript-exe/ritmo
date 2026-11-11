import { useEffect, useRef, useState } from 'react';
import type { BlockInput, CalendarData, CalendarView, TaskInput } from '../../models';
import { calendarRange, MAX_DAY, MIN_DAY, navigateCalendar } from '../../calendarDomain';
import type { CalendarActivity } from '../../calendarDomain';
import { calendarService } from '../../calendarService';
import { errorMessage, isUnauthorized } from '../../api';
import { localDay, parseDay } from '../../domain';
import { CalendarViews } from './CalendarViews';
import { ActivityDetails } from './ActivityDetails';
import { TaskEditor } from '../TaskEditor';
import { BlockEditor } from '../BlockEditor';
import { Icon } from '../Icon';

type Editor = { kind: 'task'; id?: number; draft: TaskInput } | { kind: 'block'; id?: number; draft: BlockInput };
export function CalendarWorkspace({ day, view, onDayChange, onViewChange, blocked, onBusyChange, onUnauthorized, onChanged }: {
    day: string; view: CalendarView; onDayChange: (day: string) => void; onViewChange: (view: CalendarView) => void;
    blocked: boolean; onBusyChange: (busy: boolean) => void; onUnauthorized: () => void; onChanged: () => void;
}) {
    const range = calendarRange(day, view), key = `${range.start}/${range.end}`;
    const [snapshot, setSnapshot] = useState<{ key: string; data: CalendarData } | null>(null);
    const [loading, setLoading] = useState(true), [writing, setWriting] = useState(false);
    const [error, setError] = useState(''), [editorError, setEditorError] = useState(''), [notice, setNotice] = useState('');
    const [revision, setRevision] = useState(0);
    const [activity, setActivity] = useState<CalendarActivity | null>(null);
    const [editor, setEditor] = useState<Editor | null>(null);
    const lock = useRef(false), mounted = useRef(true), confirmed = useRef(false);
    const data = snapshot?.key === key ? snapshot.data : null;
    const disabled = blocked || writing;
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        let active = true;
        setLoading(true); setError(''); setActivity(null); setEditor(null); setEditorError('');
        calendarService.load(range.start, range.end).then(data => {
            if (active) { setSnapshot({ key, data }); confirmed.current = false; }
        }).catch(err => {
            if (!active) return;
            setSnapshot(null); setError((confirmed.current ? 'El cambio se guardó, pero no se pudo recargar el calendario. ' : '') + errorMessage(err));
            if (isUnauthorized(err)) onUnauthorized();
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [key, revision]);
    async function change(operation: () => Promise<unknown>) {
        if (lock.current || blocked) return;
        lock.current = true; setWriting(true); onBusyChange(true); setEditorError('');
        try {
            await operation(); confirmed.current = true; onChanged();
            if (mounted.current) { setEditor(null); setActivity(null); setNotice('Cambio guardado.'); setRevision(v => v + 1); }
        } catch (err) {
            if (isUnauthorized(err)) onUnauthorized();
            if (mounted.current) setEditorError(errorMessage(err));
        } finally { lock.current = false; if (mounted.current) setWriting(false); onBusyChange(false); }
    }
    function select(date: string) { onDayChange(date); onViewChange('day'); }
    function edit() {
        if (!activity) return;
        setEditorError('');
        if (activity.kind === 'task') {
            const t = activity.task;
            setEditor({ kind: 'task', id: t.id, draft: { title: t.title, description: t.description, category: t.category, priority: t.priority, due_date: t.due_date } });
        } else { const { id, ...draft } = activity.block; setEditor({ kind: 'block', id, draft }); }
        setActivity(null);
    }
    function save() {
        if (!editor) return;
        if (editor.kind === 'block') {
            if (editor.draft.ends_at <= editor.draft.starts_at) { setEditorError('La hora de fin debe ser posterior a la de inicio.'); return; }
            void change(() => calendarService.saveBlock(editor.draft, editor.id));
        } else void change(() => calendarService.saveTask(editor.draft, editor.id));
    }
    function create(kind: 'task' | 'block') {
        setEditorError('');
        setEditor(kind === 'task' ? { kind, draft: { title: '', description: null, category: 'personal', priority: 'media', due_date: day } }
            : { kind, draft: { title: '', day, starts_at: '09:00', ends_at: '10:00', category: 'personal' } });
    }
    const title = view === 'month' ? new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(parseDay(day))
        : view === 'week' ? `${range.start} — ${range.end}` : new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(parseDay(day));
    return <section className="card advanced-calendar" aria-labelledby="advanced-calendar-title">
        <div className="card-heading"><div><span className="eyebrow">ENCUENTRA ESPACIO</span><h2 id="advanced-calendar-title">Tu calendario</h2></div><div className="calendar-create-actions"><button className="soft-button" disabled={disabled} onClick={() => create('task')}><Icon name="plus" size={15}/>Nueva tarea</button><button className="soft-button" disabled={disabled} onClick={() => create('block')}><Icon name="plus" size={15}/>Añadir bloque</button></div></div>
        <div className="advanced-calendar-toolbar"><div className="calendar-view-tabs" role="group" aria-label="Vista del calendario">{([['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']] as const).map(([value, label]) => <button key={value} aria-pressed={view === value} disabled={disabled} onClick={() => onViewChange(value)}>{label}</button>)}</div>
            <label><span className="sr-only">Fecha del calendario</span><input type="date" min={MIN_DAY} max={MAX_DAY} value={day} disabled={disabled} onChange={e => { if (e.target.validity.valid && e.target.value) onDayChange(e.target.value); }}/></label>
            <div className="calendar-period-nav"><button className="icon-button" aria-label="Periodo anterior" disabled={disabled || range.start === MIN_DAY || navigateCalendar(day, view, -1) === day} onClick={() => onDayChange(navigateCalendar(day, view, -1))}><Icon name="left" size={16}/></button><button className="text-button" disabled={disabled} onClick={() => onDayChange(localDay())}>Hoy</button><button className="icon-button" aria-label="Periodo siguiente" disabled={disabled || range.end === MAX_DAY || navigateCalendar(day, view, 1) === day} onClick={() => onDayChange(navigateCalendar(day, view, 1))}><Icon name="right" size={16}/></button></div>
        </div>
        <h3 className="calendar-period-title" aria-live="polite">{title}</h3>
        <p className="calendar-legend"><span className="task-count">Tareas · por vencimiento, sin hora</span><span className="block-count">Bloques · por horario</span></p>
        <p className="tiny muted">Las tareas sin fecha se consultan en Tareas. Selecciona una actividad para ver o editar sus detalles.</p>
        {notice && <p className="calendar-notice" role="status">{notice}</p>}
        {error && <div className="alert" role="alert">{error}<button className="text-button" disabled={disabled || loading} onClick={() => setRevision(v => v + 1)}>Reintentar</button></div>}
        {loading ? <p className="empty-copy" role="status">Cargando calendario…</p> : data ? <>
            {!data.blocks.length && !data.tasks.length && <p className="empty-copy" role="status">Sin actividades en este periodo. Puedes crear una tarea o un bloque.</p>}
            <CalendarViews view={view} data={data} day={day} onSelect={select} onOpen={a => { setEditorError(''); setActivity(a); }}/>
        </> : !error && <p className="empty-copy">Calendario no disponible.</p>}
        {activity && <ActivityDetails activity={activity} busy={writing} error={editorError} onClose={() => { if (!writing) setActivity(null); }} onEdit={edit}
            onToggle={() => { if (activity.kind === 'task') void change(() => calendarService.toggleTask(activity)); }}
            onDelete={() => { if (window.confirm('¿Eliminar esta actividad?')) void change(() => calendarService.remove(activity)); }}/>}
        {editor?.kind === 'task' && <TaskEditor id={editor.id} draft={editor.draft} busy={writing} error={editorError} onChange={patch => setEditor({ ...editor, draft: { ...editor.draft, ...patch } })} onSubmit={save} onClose={() => { if (!writing) setEditor(null); }}/>}
        {editor?.kind === 'block' && <BlockEditor editing={editor.id !== undefined} draft={editor.draft} allowDayChange busy={writing} error={editorError} onChange={patch => setEditor({ ...editor, draft: { ...editor.draft, ...patch } })} onSubmit={save} onClose={() => { if (!writing) setEditor(null); }}/>}
    </section>;
}
