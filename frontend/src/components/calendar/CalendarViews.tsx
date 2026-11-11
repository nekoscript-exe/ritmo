import type { CalendarData, CalendarView } from '../../models';
import { activitiesForDay, monthGrid, positionBlocks, rangeDays } from '../../calendarDomain';
import type { CalendarActivity } from '../../calendarDomain';
import { parseDay } from '../../domain';
import { Icon } from '../Icon';

export function ActivityButton({ activity, onOpen, compact = false }: { activity: CalendarActivity; onOpen: (activity: CalendarActivity) => void; compact?: boolean }) {
    const task = activity.kind === 'task';
    const title = task ? activity.task.title : activity.block.title;
    const time = !task ? `${activity.block.starts_at.slice(0, 5)}–${activity.block.ends_at.slice(0, 5)}` : 'Sin horario';
    return <button className={`calendar-activity ${task ? 'activity-task' : 'activity-block'} ${task && activity.task.completed ? 'activity-completed' : ''} ${compact ? 'activity-compact' : ''}`}
        aria-label={`${task ? 'Tarea' : 'Bloque'}: ${title}. ${time}${task ? activity.task.completed ? '. Completada' : '. Pendiente' : ''}. Consultar detalles`}
        onClick={() => onOpen(activity)}>
        <Icon name={task ? 'tasks' : 'calendar'} size={14}/><span>{!task && <small>{time}</small>}<strong>{title}</strong>{task && !compact && <small>{activity.task.completed ? 'Completada' : 'Pendiente'} · sin horario</small>}</span>
    </button>;
}
function fullDate(day: string) { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' }).format(parseDay(day)); }
export function DaySchedule({ data, day, onOpen }: { data: CalendarData; day: string; onOpen: (activity: CalendarActivity) => void }) {
    const activities = activitiesForDay(data, day);
    const tasks = activities.filter(a => a.kind === 'task');
    const blocks = activities.filter(a => a.kind === 'block');
    return <div className="day-schedule"><h3>{fullDate(day)}</h3>
        <section aria-label="Tareas sin horario"><h4>Tareas que vencen este día <span className="count">{tasks.length}</span></h4>
            {tasks.length ? tasks.map(a => <ActivityButton key={`t-${a.kind === 'task' && a.task.id}`} activity={a} onOpen={onOpen}/>) : <p className="empty-copy">Sin tareas con vencimiento este día.</p>}
        </section>
        <section aria-label="Bloques cronológicos"><h4>Bloques de horario <span className="count">{blocks.length}</span></h4>
            {blocks.length ? blocks.map(a => <ActivityButton key={`b-${a.kind === 'block' && a.block.id}`} activity={a} onOpen={onOpen}/>) : <p className="empty-copy">Sin bloques. Hay espacio para tus planes.</p>}
        </section>
    </div>;
}
export function MonthSchedule({ data, day, onSelect, onOpen }: { data: CalendarData; day: string; onSelect: (day: string) => void; onOpen: (activity: CalendarActivity) => void }) {
    return <div className="month-schedule"><div className="month-week-labels" aria-hidden="true">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <span key={d}>{d}</span>)}</div>
        <div className="month-cells">{monthGrid(day).map((date, index) => {
            if (!date) return <div className="month-cell month-padding" key={`blank-${index}`} aria-hidden="true"/>;
            const activities = activitiesForDay(data, date);
            const tasks = activities.filter(a => a.kind === 'task').length;
            const blocks = activities.length - tasks;
            return <article key={date} className={`month-cell ${date === day ? 'calendar-selected-day' : ''}`}>
                <button className="month-day-number" aria-label={`Abrir día ${fullDate(date)}`} aria-pressed={date === day} onClick={() => onSelect(date)}>{Number(date.slice(-2))}</button>
                <div className="month-counts" aria-label={`${tasks} tareas, ${blocks} bloques`}><span className="task-count" title="Tareas">T {tasks}</span><span className="block-count" title="Bloques">B {blocks}</span></div>
                <div className="month-events">{activities.slice(0, 3).map(a => <ActivityButton compact key={`${a.kind}-${a.kind === 'task' ? a.task.id : a.block.id}`} activity={a} onOpen={onOpen}/>)}</div>
                {!!activities.length && <button className="text-button month-more" onClick={() => onSelect(date)}>{activities.length > 3 ? `Ver ${activities.length - 3} más` : 'Ver día'}</button>}
            </article>;
        })}</div>
    </div>;
}
export function WeekSchedule({ data, onSelect, onOpen }: { data: CalendarData; onSelect: (day: string) => void; onOpen: (activity: CalendarActivity) => void }) {
    const dates: (string | null)[] = rangeDays(data.start, data.end);
    while (dates.length < 7) dates.push(null);
    return <div className="week-schedule">
        <div className="week-desktop">
            <div className="week-heading-grid"><div><span className="sr-only">Hora</span></div>{dates.map((day, index) => <div key={day || index} className="week-day-heading">{day && <>
                <button className="text-button" aria-label={`Abrir día ${fullDate(day)}`} onClick={() => onSelect(day)}>{new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric' }).format(parseDay(day))}</button>
                <div className="week-tasks">{data.tasks.filter(t => t.due_date === day).slice(0, 2).map(task => <ActivityButton compact key={task.id} activity={{ kind: 'task', task }} onOpen={onOpen}/>)}
                    {data.tasks.filter(t => t.due_date === day).length > 2 && <button className="text-button" onClick={() => onSelect(day)}>Más tareas</button>}
                </div></>}</div>)}</div>
            <div className="calendar-time-scroll" tabIndex={0} aria-label="Horario semanal de 00 a 24 horas, desplazable">
                <div className="week-body-grid"><div className="time-axis" aria-hidden="true">{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, '0')}:00</span>)}</div>
                    {dates.map((day, index) => <div key={day || index} className="week-time-column">{day && positionBlocks(data.blocks.filter(b => b.day === day)).map(({ block, top, height, lane, lanes }) =>
                        <div className="positioned-block" key={block.id} style={{ top: `${top}%`, height: `${height}%`, left: `${lane / lanes * 100}%`, width: `${100 / lanes}%` }}><ActivityButton compact activity={{ kind: 'block', block }} onOpen={onOpen}/></div>
                    )}</div>)}
                </div>
            </div>
        </div>
        <div className="week-mobile">{dates.filter((day): day is string => !!day).map(day => <section key={day}><button className="text-button" onClick={() => onSelect(day)}>{fullDate(day)}</button><DaySchedule data={data} day={day} onOpen={onOpen}/></section>)}</div>
    </div>;
}
export function CalendarViews({ view, data, day, onSelect, onOpen }: { view: CalendarView; data: CalendarData; day: string; onSelect: (day: string) => void; onOpen: (activity: CalendarActivity) => void }) {
    return view === 'month' ? <MonthSchedule data={data} day={day} onSelect={onSelect} onOpen={onOpen}/>
        : view === 'week' ? <WeekSchedule data={data} onSelect={onSelect} onOpen={onOpen}/>
        : <DaySchedule data={data} day={day} onOpen={onOpen}/>;
}
