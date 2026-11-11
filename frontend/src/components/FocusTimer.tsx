import { useEffect, useState } from 'react';
import { clock } from '../domain';
import { displayElapsed, focusLabels, focusService } from '../focusService';
import { useFocusSession } from '../hooks/useFocusSession';
import type { Task } from '../models';
import { Icon } from './Icon';
export function FocusTimer(props: { onUnauthorized?: () => void; onBusyChange?: (busy: boolean) => void; onChanged?: () => void; blocked?: boolean } = {}) {
    const focus = useFocusSession(props);
    const [minutes, setMinutes] = useState(25), [now, setNow] = useState(Date.now());
    const [taskId, setTaskId] = useState(''), [tasks, setTasks] = useState<Task[]>([]), [taskError, setTaskError] = useState('');
    useEffect(() => {
        if (focus.session?.state !== 'running') return;
        const timer = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(timer);
    }, [focus.session?.state]);
    const session = focus.session;
    const active = session?.state === 'running' || session?.state === 'paused';
    const planned = active && session ? session.planned_seconds : minutes * 60;
    const elapsed = session ? displayElapsed(session, focus.receivedAt, now) : 0;
    const remaining = active ? Math.max(0, Math.ceil(planned - elapsed)) : planned;
    const disabled = !focus.ready || props.blocked;
    async function choices() {
        try { const page = await focusService.taskChoices(); setTasks(page.items); setTaskId(current => page.items.some(t => String(t.id) === current) ? current : ''); setTaskError(page.total > 100 ? 'Se muestran las primeras 100 tareas.' : ''); }
        catch { setTaskError('No se pudieron cargar las tareas. Vuelve a abrir el selector para intentar.'); }
    }
    return <section className="card focus-card" id="focus" aria-labelledby="focus-title">
        <div className="card-heading"><h2 id="focus-title">Un momento de Focus</h2><span className="round-icon"><Icon name="focus"/></span></div>
        <p className="muted">Una cosa a la vez. El resto puede esperar.</p>
        <div className="timer-face" style={{ background: `conic-gradient(#3c9f85 ${active ? Math.min(1, elapsed / planned) * 360 : 0}deg, #d9eae4 0deg)` }}><div><span className="timer-number" role="timer" aria-label={`${clock(remaining)} restantes`}>{clock(remaining)}</span><span className="eyebrow">TIEMPO PARA TI</span></div></div>
        <label className="duration-label">Duración<select value={active && session ? session.planned_seconds / 60 : minutes} disabled={!!active || !focus.ready || props.blocked} onChange={e => setMinutes(Number(e.target.value))}>{[5, 15, 25, 45, 60, ...(active && session && ![5,15,25,45,60].includes(session.planned_seconds / 60) ? [session.planned_seconds / 60] : [])].map(n => <option key={n} value={n}>{n} minutos</option>)}</select></label>
        {!active && <label className="focus-task-picker">Tarea opcional<select value={taskId} onFocus={() => void choices()} disabled={!!disabled} onChange={e => setTaskId(e.target.value)}><option value="">Sin vincular</option>{tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>}
        {taskError && <p className="tiny muted">{taskError}</p>}
        <div className="timer-actions"><button className="primary" disabled={!!disabled || (!!active && remaining === 0)} onClick={() => active ? focus.command(session!.state === 'running' ? 'pause' : 'resume') : focus.start(minutes * 60, taskId ? Number(taskId) : null)}><Icon name={session?.state === 'running' ? 'pause' : 'play'} size={16}/>{session?.state === 'running' ? 'Pausar' : session?.state === 'paused' ? 'Reanudar' : 'Iniciar'}</button>
            {active && <button disabled={!!disabled} onClick={() => focus.command('finish')}>Finalizar</button>}
        </div>
        {active && <button className="text-button danger" disabled={!!disabled} onClick={() => { if (window.confirm('¿Cancelar la sesión? Su tiempo activo quedará como interrumpido.')) focus.command('cancel'); }}>Cancelar sesión</button>}
        {focus.error && <p className="focus-error" role="alert">{focus.error}</p>}
        {focus.pending && <button className="text-button" disabled={focus.busy || props.blocked} onClick={focus.retry}>Reintentar la misma petición</button>}
        <button className="text-button" disabled={focus.busy || focus.loading || props.blocked} onClick={() => void focus.refresh()}>Actualizar estado</button>
        <p className="tiny muted" role="status">{focus.loading ? 'Consultando sesión en el servidor…' : !focus.ready ? 'Estado pendiente de confirmar con la API.' : session ? `${focusLabels[session.state]} · ${Math.floor(session.elapsed_seconds / 60)} min confirmados al consultar${session.task_id ? ` · tarea #${session.task_id}` : ''}` : 'Historial en el servidor · sin sesión activa'}</p>
        {active && remaining === 0 && <p className="tiny muted">Tiempo alcanzado. Pulsa Finalizar para confirmar el registro; no se cuenta automáticamente.</p>}
    </section>;
}
