import { useEffect, useState } from 'react';
import type { Block, BlockInput } from '../models';
import { categories } from '../models';
import { Icon } from './Icon';
import { api, errorMessage } from '../api';
import { BlockEditor } from './BlockEditor';
const empty = (day: string): BlockInput => ({ title: '', day, starts_at: '09:00', ends_at: '10:00', category: 'personal' });
export function Agenda({ day, blocks, busy, query, mutate }: {
    day: string;
    blocks: Block[];
    busy: boolean;
    query: string;
    mutate: (operation: () => Promise<unknown>, onSuccess?: () => void) => Promise<void>;
}) {
    const [draft, setDraft] = useState<BlockInput>(() => empty(day));
    const [editing, setEditing] = useState<number | undefined>();
    const [open, setOpen] = useState(false);
    const [validationError, setValidationError] = useState('');
    useEffect(() => { setDraft(empty(day)); setEditing(undefined); setOpen(false); }, [day]);
    const visible = blocks.filter(block => block.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    function reset() { setValidationError(''); setDraft(empty(day)); setEditing(undefined); setOpen(false); }
    function save() {
        if (busy) return;
        if (draft.ends_at <= draft.starts_at) {
            setValidationError('La hora de fin debe ser posterior a la de inicio.');
            return;
        }
        setValidationError('');
        void mutate(async () => {
            try { return await api.saveBlock({ ...draft, day }, editing); }
            catch (error) { setValidationError(errorMessage(error)); throw error; }
        }, reset);
    }
    return <section className="card agenda-card" id="agenda" aria-labelledby="agenda-title"><div className="card-heading"><div><span className="eyebrow">HAZ ESPACIO</span><h2 id="agenda-title">Tu agenda del día <span className="count">{blocks.length}</span></h2></div><button className="soft-button" disabled={busy} onClick={() => { setDraft(empty(day)); setEditing(undefined); setValidationError(''); setOpen(true); }}><Icon name="plus" size={16}/>Añadir bloque</button></div>
    <p className="muted small">Bloques de horario · tus tareas se gestionan por separado.</p>
    {open && <BlockEditor editing={editing !== undefined} draft={draft} busy={busy} error={validationError}
        onChange={patch => { setValidationError(''); setDraft({ ...draft, ...patch }); }} onSubmit={save}
        onClose={() => { if (!busy) reset(); }}/>}
    <ul className="agenda-list">{visible.map(block => <li key={block.id}><div className={`category-line ${block.category}`}/><div className="block-time"><strong>{block.starts_at.slice(0, 5)}</strong><span>{block.ends_at.slice(0, 5)}</span></div><div className="block-description"><strong>{block.title}</strong><span className={`tag ${block.category}`}>{categories[block.category]}</span></div><div className="row-actions"><button className="icon-button" disabled={busy} aria-label={`Editar ${block.title}`} onClick={() => { setValidationError(''); setEditing(block.id); setDraft({ ...block, day }); setOpen(true); }}><Icon name="edit" size={16}/></button><button className="icon-button danger" disabled={busy} aria-label={`Eliminar ${block.title}`} onClick={async () => { if (!window.confirm(`¿Eliminar el bloque «${block.title}»?`))
        return; await mutate(() => api.deleteBlock(block.id), () => { if (editing === block.id)
        reset(); }); }}><Icon name="trash" size={16}/></button></div></li>)}</ul>
    {!visible.length && <div className="empty-state"><span className="empty-icon"><Icon name="calendar" size={26}/></span><strong>{query ? 'No hay bloques que coincidan' : 'Un poco de espacio para tus planes'}</strong><p>{query ? 'Prueba otra búsqueda.' : 'Añade tu primer bloque para organizar este día.'}</p></div>}
  </section>;
}
