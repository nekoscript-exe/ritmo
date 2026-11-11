import { Modal } from './Modal';

export function HabitEditor({ editing, name, busy, error, onChange, onSubmit, onClose }: {
    editing: boolean;
    name: string;
    busy: boolean;
    error: string;
    onChange: (name: string) => void;
    onSubmit: () => void;
    onClose: () => void;
}) {
    return <Modal title={editing ? 'Editar hábito' : 'Nuevo hábito'} onClose={onClose} busy={busy} small>
        <form className="modal-form" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
            {error && <div className="alert" role="alert">{error}</div>}
            <fieldset disabled={busy}><legend className="sr-only">Datos del hábito</legend>
                <label>Nombre del hábito<input data-autofocus value={name} required maxLength={80} onChange={e => onChange(e.target.value)} placeholder="Ej. Leer 15 minutos"/></label>
                <p className="tiny muted">Editar el nombre conserva todas sus marcas e historial.</p>
                <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={!name.trim()}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear hábito'}</button></div>
            </fieldset>
        </form>
    </Modal>;
}
