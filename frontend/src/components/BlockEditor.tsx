import { Modal } from './Modal';
import { categories } from '../models';
import type { BlockInput, Category } from '../models';

export function BlockEditor({ editing, draft, busy, error, onChange, onSubmit, onClose }: {
    editing: boolean;
    draft: BlockInput;
    busy: boolean;
    error: string;
    onChange: (patch: Partial<BlockInput>) => void;
    onSubmit: () => void;
    onClose: () => void;
}) {
    return <Modal title={editing ? 'Editar bloque' : 'Nuevo bloque'} onClose={onClose} busy={busy}>
        <form className="modal-form" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
            {error && <div className="alert" role="alert">{error}</div>}
            <fieldset disabled={busy}><legend className="sr-only">Datos del bloque de horario</legend>
                <label>Título<input data-autofocus required maxLength={80} value={draft.title} onChange={e => onChange({ title: e.target.value })}/></label>
                <p className="tiny muted">Fecha del bloque: {draft.day}. Inicio y fin pertenecen al mismo día.</p>
                <div className="form-row">
                    <label>Inicio<input type="time" step="1" required value={draft.starts_at} onChange={e => onChange({ starts_at: e.target.value })}/></label>
                    <label>Fin<input type="time" step="1" required value={draft.ends_at} onChange={e => onChange({ ends_at: e.target.value })}/></label>
                </div>
                <label>Categoría<select value={draft.category} onChange={e => onChange({ category: e.target.value as Category })}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={!draft.title.trim()}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear bloque'}</button></div>
            </fieldset>
        </form>
    </Modal>;
}
