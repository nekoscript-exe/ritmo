import { useState } from 'react';
import type { FocusPage, FocusSession, HabitStatistics, StatisticsDaily } from '../../models';
import { focusLabels } from '../../focusService';
import { isBrowserTimezone, numberLabel } from '../../statisticsService';

export function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
    return <article className="metric-card"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}
export function BarChart({ title, unit, values }: { title: string; unit: string; values: { label: string; value: number }[] }) {
    const maximum = Math.max(1, ...values.map(v => v.value));
    return <figure className="statistics-chart"><figcaption>{title}</figcaption><div className="bar-chart" role="img" aria-label={`${title}. ${values.map(v => `${v.label}: ${numberLabel(v.value)} ${unit}`).join('; ')}`}>
        {values.map(v => <div className="chart-row" key={v.label}><span>{v.label}</span><div className="chart-track"><div style={{ width: `${v.value / maximum * 100}%` }}/></div><strong>{numberLabel(v.value)} {unit}</strong></div>)}
    </div></figure>;
}
export function PeriodFilter({ anchor, mode, timezone, disabled, onApply }: { anchor: string; mode: 'week' | 'month'; timezone: string; disabled: boolean; onApply: (anchor: string, mode: 'week' | 'month', timezone: string) => void }) {
    const [date, setDate] = useState(anchor), [period, setPeriod] = useState(mode), [zone, setZone] = useState(timezone);
    const [zoneError, setZoneError] = useState('');
    return <form className="statistics-filters" onSubmit={e => { e.preventDefault(); if (!isBrowserTimezone(zone.trim())) { setZoneError('Indica una zona IANA reconocida por el navegador.'); return; } setZoneError(''); onApply(date, period, zone.trim()); }}><fieldset disabled={disabled}>
        <label>Periodo<select value={period} onChange={e => setPeriod(e.target.value as 'week' | 'month')}><option value="week">Semana</option><option value="month">Mes</option></select></label>
        <label>Fecha de referencia<input type="date" min="0001-01-01" max="9999-12-30" required value={date} onChange={e => setDate(e.target.value)}/></label>
        <label>Zona IANA<input required maxLength={64} value={zone} onChange={e => setZone(e.target.value)} placeholder="America/Mexico_City"/></label><button className="soft-button">Aplicar</button>
    </fieldset>{zoneError && <p className="form-error" role="alert">{zoneError}</p>}</form>;
}
export function HabitStreaks({ habits }: { habits: HabitStatistics[] }) {
    return <section className="card habit-streaks"><h2>Hábitos: constancia del periodo</h2><p className="tiny muted">Hábitos actuales, sin inferir su fecha de alta. Rachas limitadas al periodo; hoy pendiente puede continuar la racha de ayer.</p>
        {!habits.length && <p className="empty-copy">No hay hábitos para analizar.</p>}
        {habits.map(h => <article key={h.id}><h3>{h.name}</h3><p>{h.fulfilled_days}/{h.expected_days} días · {numberLabel(h.percent)}% · racha actual {h.current_streak} · máxima {h.max_streak}</p>
            <div className="habit-history">{h.history.map(d => <span key={d.day} role="img" className={d.eligible ? d.done ? 'history-done' : 'history-missed' : 'history-future'} title={`${d.day}: ${d.done ? 'cumplido' : d.eligible ? 'pendiente' : 'futuro, no evaluado'}`} aria-label={`${d.day}: ${d.done ? 'cumplido' : d.eligible ? 'pendiente' : 'futuro, no evaluado'}`}>{d.done ? '✓' : d.eligible ? '·' : '–'}</span>)}</div>
        </article>)}
    </section>;
}
export function DailyActivity({ days }: { days: StatisticsDaily[] }) {
    return <section className="card daily-activity"><h2>Actividad diaria</h2><p className="tiny muted">Tareas por vencimiento (estado actual); hábitos por fecha local; Focus por segmentos activos confirmados.</p>
        <div className="daily-activity-list">{days.map(d => <article key={d.day}><time>{d.day}</time><span>Tareas {d.tasks_completed}/{d.tasks_total}</span><span>Hábitos {d.habits_completed}/{d.habits_expected}</span><span>Planeado {numberLabel(d.planned_minutes)} min</span><strong>Focus {numberLabel(d.focus_minutes)} min</strong></article>)}</div>
    </section>;
}
export function FocusHistory({ page, disabled, onPage, onDelete, timezone = 'UTC' }: { page: FocusPage | null; disabled: boolean; onPage: (offset: number) => void; onDelete: (session: FocusSession) => void; timezone?: string }) {
    return <section className="card focus-history"><h2>Historial Focus</h2><p className="tiny muted">Sesiones que cruzan el periodo; duración total de cada sesión. Las estadísticas recortan sus segmentos al periodo.</p>
        {!page ? <p className="empty-copy">Historial no disponible.</p> : !page.items.length ? <p className="empty-copy">No hay sesiones en este periodo.</p> : <ul>{page.items.map(s => <li key={s.id}><div><strong>{focusLabels[s.state]}</strong><span>{new Date(s.started_at).toLocaleString('es-MX', { timeZone: timezone })} · {numberLabel(s.duration_seconds / 60)} min registrados{s.task_id ? ` · tarea #${s.task_id}` : ''}</span><span>{s.ended_at ? `Finalizada ${new Date(s.ended_at).toLocaleString('es-MX', { timeZone: timezone })}` : 'Sin finalizar; no contribuye a las estadísticas'}</span></div>{(s.state === 'completed' || s.state === 'cancelled') && <button className="text-button danger" disabled={disabled} onClick={() => onDelete(s)}>Retirar</button>}</li>)}</ul>}
        {page && <div className="card-footer"><span className="tiny muted">{page.total} sesiones</span><button className="text-button" disabled={disabled || !page.offset} onClick={() => onPage(Math.max(0, page.offset - 50))}>Anterior</button><button className="text-button" disabled={disabled || page.offset + page.limit >= page.total} onClick={() => onPage(page.offset + 50)}>Siguiente</button></div>}
    </section>;
}
