import { useState } from 'react';
import { api } from '../api';
import type { Habit } from '../models';
import { Icon } from './Icon';
export function Habits({ day, habits, busy, query, mutate }: {
    day: string;
    habits: Habit[];
    busy: boolean;
    query: string;
    mutate: (operation: () => Promise<unknown>, onSuccess?: () => void) => Promise<void>;
}) {
    const [name, setName] = useState('');
    const done = habits.filter(h => h.done).length;
    const visible = habits.filter(h => h.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    return <section className="card habits-card" id="habits" aria-labelledby="habits-title"><div className="card-heading"><div><span className="eyebrow">PEQUEÑOS PASOS, GRANDES CAMBIOS</span><h2 id="habits-title">Tus hábitos</h2></div><span className="round-icon"><Icon name="leaf"/></span></div><div className="habit-progress"><span>{done} de {habits.length} completados</span><strong>{habits.length ? Math.round(done / habits.length * 100) : 0}%</strong></div><progress max={Math.max(habits.length, 1)} value={done} aria-label="Hábitos completados"/>
    <ul className="habit-list">{visible.map(habit => <li key={habit.id}><label><input type="checkbox" checked={habit.done} disabled={busy} onChange={e => { void mutate(() => api.checkHabit(habit.id, day, e.target.checked)); }}/><span className={habit.done ? 'completed' : ''}>{habit.name}</span></label><button className="icon-button danger" disabled={busy} aria-label={`Eliminar hábito ${habit.name}`} onClick={() => { if (window.confirm(`¿Eliminar «${habit.name}» y todo su historial?`))
        void mutate(() => api.deleteHabit(habit.id)); }}><Icon name="trash" size={15}/></button></li>)}</ul>
    {!visible.length && <p className="empty-copy">{query ? 'Sin coincidencias.' : '¿Qué pequeño hábito quieres cultivar hoy?'}</p>}
    <form className="inline-form" onSubmit={e => { e.preventDefault(); void mutate(() => api.addHabit(name.trim()), () => setName('')); }}><label className="sr-only" htmlFor="new-habit">Nombre del nuevo hábito</label><input id="new-habit" placeholder="Añadir un hábito…" value={name} required maxLength={80} disabled={busy} onChange={e => setName(e.target.value)}/><button className="icon-button" aria-label="Crear hábito" disabled={busy || !name.trim()}><Icon name="plus"/></button></form>
  </section>;
}
