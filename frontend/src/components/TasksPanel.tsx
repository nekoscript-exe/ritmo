import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, isUnauthorized } from '../api';
import { categories } from '../models';
import type { Category, Priority, Task, TaskFilters, TaskInput } from '../models';
import { loadTaskSnapshot } from '../taskService';
import type { TaskSnapshot } from '../taskService';
import { Icon } from './Icon';
import { TaskEditor } from './TaskEditor';

interface Props {
    day: string;
    dashboard: boolean;
    blocked: boolean;
    onUnauthorized: () => void;
    onBusyChange: (busy: boolean) => void;
}
const blank = (day: string): TaskInput => ({ title: '', description: null, priority: 'media', category: 'personal', due_date: day });

export function TasksPanel({ day, dashboard, blocked, onUnauthorized, onBusyChange }: Props) {
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState<TaskFilters['status']>();
    const [category, setCategory] = useState<Category | ''>('');
    const [priority, setPriority] = useState<Priority | ''>('');
    const [dateMode, setDateMode] = useState<'selected' | 'any' | 'undated'>(dashboard ? 'selected' : 'any');
    const [offset, setOffset] = useState(0);
    const [revision, setRevision] = useState(0);
    const [snapshot, setSnapshot] = useState<{ key: string; data: TaskSnapshot } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [writing, setWriting] = useState(false);
    const [editorError, setEditorError] = useState('');
    const [editor, setEditor] = useState<{ id?: number; draft: TaskInput } | null>(null);
    const lock = useRef(false);
    const writeConfirmed = useRef(false);
    const mounted = useRef(true);
    const filters: TaskFilters = { status, category: category || undefined, priority: priority || undefined,
        due_date: dateMode === 'selected' ? day : undefined, undated: dateMode === 'undated' || undefined, limit: 50, offset };
    const key = JSON.stringify({ day, filters });
    const current = snapshot?.key === key ? snapshot.data : null;
    const disabled = blocked || writing || loading;

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { setDateMode(dashboard ? 'selected' : 'any'); setOffset(0); setEditor(null); setTitle(''); }, [day, dashboard]);
    useEffect(() => {
        let active = true;
        setLoading(true); setError('');
        loadTaskSnapshot(day, filters).then(data => {
            if (!active) return;
            // Una eliminación puede dejar vacía la última página.
            if (offset > 0 && !data.page.items.length) { setOffset(Math.max(0, offset - 50)); return; }
            setSnapshot({ key, data });
            writeConfirmed.current = false;
        }).catch(err => {
            if (!active) return;
            setSnapshot(null); setError((writeConfirmed.current ? 'El cambio se guardó, pero no se pudo actualizar la lista. Reintenta la consulta antes de repetirlo. ' : '') + errorMessage(err));
            if (isUnauthorized(err)) onUnauthorized();
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [key, revision]);

    async function change(operation: () => Promise<unknown>, onSuccess?: () => void, onError?: (message: string) => void) {
        if (lock.current || blocked || loading) return;
        lock.current = true; setWriting(true); onBusyChange(true); setError(''); setNotice('');
        try {
            await operation();
            if (mounted.current) { writeConfirmed.current = true; onSuccess?.(); setNotice('Cambio guardado. La lista muestra los resultados de los filtros actuales.'); setRevision(v => v + 1); }
        } catch (err) {
            if (mounted.current) { const message = errorMessage(err); if (onError) onError(message); else setError(message); if (isUnauthorized(err)) onUnauthorized(); }
        } finally {
            lock.current = false;
            if (mounted.current) setWriting(false);
            onBusyChange(false);
        }
    }
    function edit(task: Task) {
        setEditorError('');
        setEditor({ id: task.id, draft: { title: task.title, description: task.description,
            priority: task.priority, category: task.category, due_date: task.due_date } });
    }
    function updateDraft(patch: Partial<TaskInput>) { setEditor(value => value ? { ...value, draft: { ...value.draft, ...patch } } : null); }
    const progress = current?.progress;
    return <section className="card tasks-card" aria-labelledby="tasks-title" aria-busy={loading || writing}>
        <div className="card-heading"><div><span className="eyebrow">PASO A PASO</span><h2 id="tasks-title">{dashboard ? 'Tus tareas del día' : 'Tus tareas'}</h2></div><button className="soft-button" disabled={disabled} onClick={() => { setEditorError(''); setEditor({ draft: blank(day) }); }}><Icon name="plus" size={16}/>Nueva tarea</button></div>
        <form className="task-quick-form" onSubmit={e => { e.preventDefault(); void change(() => api.createTask({ ...blank(day), title: title.trim() }), () => setTitle('')); }}>
            <Icon name="plus" size={18}/><label className="sr-only" htmlFor="quick-task">Título de la nueva tarea</label>
            <input id="quick-task" value={title} required maxLength={80} disabled={disabled} onChange={e => setTitle(e.target.value)} placeholder="¿Qué te gustaría completar hoy?"/>
            <button disabled={disabled || !title.trim()}>Añadir tarea</button>
        </form>
        <p className="tiny muted task-date-help">La captura rápida asigna vencimiento {day}. Puedes cambiarlo o quitarlo al editar.</p>
        <div className="task-progress" aria-live="polite">
            {progress ? <><div><span>{progress.completed} de {progress.total} tareas completadas</span><strong>{progress.percent}%</strong></div><progress max={Math.max(1, progress.total)} value={progress.completed} aria-label={`Progreso de tareas con vencimiento ${day}`}/></> : <span className="tiny muted">Progreso diario no disponible</span>}
            <p className="tiny muted">Estado actual de las tareas que vencen el {day}, sin aplicar los filtros de lista.</p>
        </div>
        <fieldset className="task-filters" disabled={disabled}><legend className="sr-only">Filtrar tareas</legend>
            <label>Estado<select value={status || ''} onChange={e => { setStatus(e.target.value as TaskFilters['status'] || undefined); setOffset(0); }}><option value="">Todos</option><option value="pending">Pendientes</option><option value="completed">Completadas</option></select></label>
            <label>Categoría<select value={category} onChange={e => { setCategory(e.target.value as Category | ''); setOffset(0); }}><option value="">Todas</option>{Object.entries(categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label>Prioridad<select value={priority} onChange={e => { setPriority(e.target.value as Priority | ''); setOffset(0); }}><option value="">Todas</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
            <label>Fecha<select value={dateMode} onChange={e => { setDateMode(e.target.value as typeof dateMode); setOffset(0); }}><option value="selected">Vencen el {day}</option><option value="any">Cualquier fecha</option><option value="undated">Sin fecha límite</option></select></label>
        </fieldset>
        {editor && <TaskEditor id={editor.id} draft={editor.draft} busy={writing} error={editorError}
            onChange={updateDraft} onClose={() => { if (!writing) { setEditor(null); setEditorError(''); } }}
            onSubmit={() => {
                const { id, draft } = editor;
                setEditorError('');
                void change(() => id ? api.updateTask(id, draft) : api.createTask(draft), () => setEditor(null), setEditorError);
            }}/>}
        {error && <div className="alert" role="alert">{error}<button className="text-button" disabled={disabled || loading} onClick={() => setRevision(v => v + 1)}>Reintentar consulta</button></div>}
        {notice && <p className="tiny muted" role="status">{notice}</p>}
        {loading ? <p className="empty-copy" role="status">Cargando tareas…</p> : current ? <TaskList tasks={current.page.items} disabled={disabled} onEdit={edit} onComplete={task => void change(() => api.updateTask(task.id, { completed: !task.completed }))} onDelete={task => { if (window.confirm(`¿Eliminar la tarea «${task.title}»?`)) void change(() => api.deleteTask(task.id), () => { if (editor?.id === task.id) setEditor(null); }); }}/>
            : <p className="empty-copy">No se pudo cargar la lista. Reintenta la consulta.</p>}
        {current && <div className="card-footer"><span className="tiny muted">{current.page.total} tareas con estos filtros · sin bloques de horario</span><div className="task-pagination"><button className="text-button" disabled={disabled || loading || offset === 0} onClick={() => setOffset(v => Math.max(0, v - 50))}>Anterior</button><button className="text-button" disabled={disabled || loading || offset + 50 >= current.page.total} onClick={() => setOffset(v => v + 50)}>Siguiente</button></div></div>}
    </section>;
}

export function TaskList({ tasks, disabled, onEdit, onComplete, onDelete }: {
    tasks: Task[]; disabled: boolean; onEdit: (task: Task) => void; onComplete: (task: Task) => void; onDelete: (task: Task) => void;
}) {
    if (!tasks.length) return <div className="empty-state task-empty"><span className="empty-icon"><Icon name="tasks" size={26}/></span><strong>No hay tareas con estos filtros</strong><p>Añade una tarea o ajusta la fecha y los filtros.</p></div>;
    return <ul className="task-list">{tasks.map(task => <li key={task.id}>
        <label className="task-check"><input type="checkbox" checked={task.completed} disabled={disabled} aria-label={`${task.completed ? 'Reabrir' : 'Completar'} tarea ${task.title}`} onChange={() => onComplete(task)}/><span className={task.completed ? 'completed' : ''}>{task.title}</span></label>
        {task.description && <p className="task-description">{task.description}</p>}
        <div className="task-meta"><span className={`tag ${task.category}`}>{categories[task.category]}</span><span className={`priority-badge ${task.priority}`}>Prioridad {task.priority}</span><span>{task.due_date ? `Vence ${task.due_date}` : 'Sin fecha límite'}</span></div>
        <div className="row-actions"><button className="icon-button" aria-label={`Editar tarea ${task.title}`} disabled={disabled} onClick={() => onEdit(task)}><Icon name="edit" size={16}/></button><button className="icon-button danger" aria-label={`Eliminar tarea ${task.title}`} disabled={disabled} onClick={() => onDelete(task)}><Icon name="trash" size={16}/></button></div>
    </li>)}</ul>;
}
