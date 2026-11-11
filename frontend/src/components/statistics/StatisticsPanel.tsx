import { useEffect, useRef, useState } from 'react';
import type { FocusPage, FocusSession, StatisticsData } from '../../models';
import { categories } from '../../models';
import { calendarRange } from '../../calendarDomain';
import { errorMessage, isUnauthorized } from '../../api';
import { browserTimezone, numberLabel, statisticsService } from '../../statisticsService';
import { BarChart, DailyActivity, FocusHistory, HabitStreaks, MetricCard, PeriodFilter } from './Widgets';

export function StatisticsPanel({ day, blocked, revision, onUnauthorized, onBusyChange }: { day: string; blocked: boolean; revision: number; onUnauthorized: () => void; onBusyChange: (busy: boolean) => void }) {
    const [filter, setFilter] = useState({ anchor: day, mode: 'week' as 'week' | 'month', timezone: browserTimezone() });
    const [offset, setOffset] = useState(0), [refresh, setRefresh] = useState(0);
    const range = calendarRange(filter.anchor, filter.mode), key = JSON.stringify({ ...range, timezone: filter.timezone, offset });
    const [result, setResult] = useState<{ key: string; stats: StatisticsData; history: FocusPage } | null>(null);
    const [loading, setLoading] = useState(true), [writing, setWriting] = useState(false), [error, setError] = useState('');
    const lock = useRef(false), mounted = useRef(true);
    const data = result?.key === key ? result : null;
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        let active = true; setLoading(true); setError('');
        Promise.all([statisticsService.load(range.start, range.end, filter.timezone), statisticsService.history(range.start, range.end, filter.timezone, offset)])
            .then(([stats, history]) => { if (active) { if (offset && !history.items.length) setOffset(Math.max(0, offset - 50)); else setResult({ key, stats, history }); } })
            .catch(err => { if (active) { setResult(null); setError(errorMessage(err)); if (isUnauthorized(err)) onUnauthorized(); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [key, refresh, revision]);
    async function remove(session: FocusSession) {
        if (lock.current || blocked || !window.confirm('¿Retirar esta sesión del historial y de las estadísticas? El registro se conserva internamente.')) return;
        lock.current = true; setWriting(true); onBusyChange(true); setError('');
        try { await statisticsService.remove(session, crypto.randomUUID()); if (mounted.current) setRefresh(v => v + 1); }
        catch (err) { if (mounted.current) { setError(errorMessage(err)); if (isUnauthorized(err)) onUnauthorized(); } }
        finally { lock.current = false; if (mounted.current) setWriting(false); onBusyChange(false); }
    }
    const disabled = blocked || writing;
    const summary = data?.stats.summary;
    return <div className="statistics-module"><section className="card"><div className="card-heading"><div><span className="eyebrow">TU CONSTANCIA, CON DATOS</span><h2>Estadísticas de productividad</h2></div><button className="text-button" disabled={disabled || loading} onClick={() => setRefresh(v => v + 1)}>Actualizar</button></div>
        <PeriodFilter anchor={filter.anchor} mode={filter.mode} timezone={filter.timezone} disabled={disabled || loading} onApply={(anchor, mode, timezone) => { setOffset(0); setFilter({ anchor, mode, timezone }); }}/>
        <p className="tiny muted">{range.start} — {range.end} · {filter.timezone}</p>
        {error && <div className="alert" role="alert">{error}</div>}
        {loading && <p className="empty-copy" role="status">Calculando estadísticas…</p>}
        {!loading && summary && <div className="metric-grid">
            <MetricCard label="Tareas con vencimiento" value={String(summary.tasks_total)} detail={`${summary.tasks_completed} completadas (estado actual)`}/>
            <MetricCard label="Cumplimiento de tareas" value={`${numberLabel(summary.tasks_percent)}%`}/>
            <MetricCard label="Tareas vencidas pendientes" value={String(summary.tasks_overdue)}/>
            <MetricCard label="Cumplimiento de hábitos actuales" value={`${numberLabel(summary.habits_percent)}%`} detail={`${summary.habits_completed}/${summary.habits_expected} oportunidades; futuro excluido`}/>
            <MetricCard label="Tiempo planeado" value={`${numberLabel(summary.planned_minutes)} min`} detail="Suma de bloques, incluidos solapamientos"/>
            <MetricCard label="Tiempo activo Focus confirmado" value={`${numberLabel(summary.focus_minutes)} min`} detail={`${numberLabel(summary.focus_completed_minutes)} completados · ${numberLabel(summary.focus_interrupted_minutes)} interrumpidos`}/>
            <MetricCard label="Sesiones finalizadas en el periodo" value={String(summary.focus_completed_sessions)} detail={`${summary.focus_interrupted_sessions} interrumpidas; activas excluidas`}/>
        </div>}
        {!loading && data && !summary?.tasks_total && !summary?.habit_count && !summary?.planned_minutes && !summary?.focus_minutes && !summary?.focus_completed_sessions && !summary?.focus_interrupted_sessions && <p className="empty-copy">No hay actividad registrada para este periodo.</p>}
    </section>
        {!loading && data && <><section className="card statistics-charts"><BarChart title="Tiempo planeado por categoría" unit="min" values={data.stats.by_category.map(c => ({ label: categories[c.category], value: c.minutes }))}/><BarChart title="Focus confirmado por día" unit="min" values={data.stats.daily.map(d => ({ label: d.day, value: d.focus_minutes }))}/></section>
            <DailyActivity days={data.stats.daily}/><HabitStreaks habits={data.stats.habits}/><FocusHistory timezone={filter.timezone} page={data.history} disabled={disabled} onPage={setOffset} onDelete={s => void remove(s)}/>
            <p className="tiny muted">Cálculo confirmado por el servidor: {new Date(data.stats.as_of).toLocaleString('es-MX')}. No se reconstruye el estado histórico de tareas o hábitos eliminados.</p>
        </>}
    </div>;
}
