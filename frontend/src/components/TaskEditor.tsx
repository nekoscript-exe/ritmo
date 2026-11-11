import { Modal } from './Modal';
import { categories } from '../models';
import type { Category, Priority, TaskInput } from '../models';

export function TaskEditor({ id, draft, busy, error, onChange, onSubmit, onClose }: {
    id?: number;
    draft: TaskInput;
    busy: boolean;
    error: string;
    onChange: (patch: Partial<TaskInput>) => void;
    onSubmit: () => void;
    onClose: () => void;
}) {
    return <Modal title={id ? 'Editar tarea' : 'Nueva tarea'} onClose={onClose} busy={busy}>
        <form className="modal-form" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
            {error && <div className="alert" role="alert">{error}</div>}
            <fieldset disabled={busy}>
                <legend className="sr-only">Datos de la tarea</legend>
                <label>Título<input data-autofocus value={draft.title} required maxLength={80} onChange={e => onChange({ title: e.target.value })}/></label>
                <label>Descripción opcional<textarea value={draft.description || ''} maxLength={2000} rows={4} onChange={e => onChange({ description: e.target.value || null })}/></label>
                <div className="form-row">
                    <label>Prioridad<select value={draft.priority} onChange={e => onChange({ priority: e.target.value as Priority })}>{['baja', 'media', 'alta'].map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                    <label>Categoría<select value={draft.category} onChange={e => onChange({ category: e.target.value as Category })}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                </div>
                <label>Fecha límite opcional<input type="date" min="0001-01-01" max="9999-12-31" value={draft.due_date || ''} onChange={e => onChange({ due_date: e.target.value || null })}/></label>
                <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={!draft.title.trim()}>{busy ? 'Guardando…' : 'Guardar tarea'}</button></div>
            </fieldset>
        </form>
    </Modal>;
}
