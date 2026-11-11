import { useState } from 'react';
import { api, errorMessage } from '../api';
import type { Habit } from '../models';
import { Icon } from './Icon';
import { HabitEditor } from './HabitEditor';

export function Habits({ day, habits, busy, query, mutate }: {
    day: string;
    habits: Habit[];
    busy: boolean;
    query: string;
    mutate: (operation: () => Promise<unknown>, onSuccess?: () => void) => Promise<void>;
}) {
    const [editor, setEditor] = useState<{ id?: number; name: string } | null>(null);
    const [editorError, setEditorError] = useState('');
    const done = habits.filter(h => h.done).length;
    const visible = habits.filter(h => h.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    function open(id?: number, name = '') { setEditorError(''); setEditor({ id, name }); }
    function save() {
        if (!editor || busy) return;
        const { id, name } = editor;
        setEditorError('');
        void mutate(async () => {
            try { return id ? await api.updateHabit(id, name.trim()) : await api.addHabit(name.trim()); }
            catch (error) { setEditorError(errorMessage(error)); throw error; }
        }, () => setEditor(null));
    }
    return <section className="card habits-card" id="habits" aria-labelledby="habits-title">
        <div className="card-heading"><div><span className="eyebrow">PEQUEÑOS PASOS, GRANDES CAMBIOS</span><h2 id="habits-title">Tus hábitos</h2></div>
            <button className="soft-button" disabled={busy} onClick={() => open()}><Icon name="plus" size={16}/>Nuevo hábito</button>
        </div>
        <div className="habit-progress"><span>{done} de {habits.length} completados</span><strong>{habits.length ? Math.round(done / habits.length * 100) : 0}%</strong></div>
        <progress max={Math.max(habits.length, 1)} value={done} aria-label="Hábitos completados"/>
        <ul className="habit-list">{visible.map(habit => <li key={habit.id}>
            <label><input type="checkbox" checked={habit.done} disabled={busy} onChange={e => { const checked = e.target.checked; void mutate(() => api.checkHabit(habit.id, day, checked)); }}/><span className={habit.done ? 'completed' : ''}>{habit.name}</span></label>
            <div className="habit-actions"><button className="icon-button" disabled={busy} aria-label={`Editar hábito ${habit.name}`} onClick={() => open(habit.id, habit.name)}><Icon name="edit" size={15}/></button>
                <button className="icon-button danger" disabled={busy} aria-label={`Eliminar hábito ${habit.name}`} onClick={() => { if (window.confirm(`¿Eliminar «${habit.name}» y todo su historial?`)) void mutate(() => api.deleteHabit(habit.id)); }}><Icon name="trash" size={15}/></button>
            </div>
        </li>)}</ul>
        {!visible.length && <p className="empty-copy">{query ? 'Sin coincidencias.' : '¿Qué pequeño hábito quieres cultivar hoy?'}</p>}
        {editor && <HabitEditor editing={editor.id !== undefined} name={editor.name} busy={busy} error={editorError}
            onChange={name => setEditor({ ...editor, name })} onSubmit={save}
            onClose={() => { if (!busy) { setEditor(null); setEditorError(''); } }}/>}
    </section>;
}
