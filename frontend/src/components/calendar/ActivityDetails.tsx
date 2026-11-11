import type { CalendarActivity } from '../../calendarDomain';
import { categories } from '../../models';
import { Modal } from '../Modal';
export function ActivityDetails({ activity, busy, error, onClose, onEdit, onDelete, onToggle }: {
    activity: CalendarActivity; busy: boolean; error: string; onClose: () => void; onEdit: () => void; onDelete: () => void; onToggle: () => void;
}) {
    const task = activity.kind === 'task';
    const item = task ? activity.task : activity.block;
    return <Modal title={task ? 'Detalles de tarea' : 'Detalles de bloque'} busy={busy} onClose={onClose}>
        {error && <div role="alert" className="alert">{error}</div>}
        <h3 className="activity-detail-title">{item.title}</h3>
        <dl className="activity-details"><dt>Categoría</dt><dd>{categories[item.category]}</dd>
            {activity.kind === 'task' ? <><dt>Descripción</dt><dd>{activity.task.description || 'Sin descripción'}</dd><dt>Prioridad</dt><dd>{activity.task.priority}</dd><dt>Vencimiento</dt><dd>{activity.task.due_date || 'Sin fecha'}</dd><dt>Estado</dt><dd>{activity.task.completed ? 'Completada' : 'Pendiente'}</dd><dt>Creada</dt><dd>{new Date(activity.task.created_at).toLocaleString('es-MX')}</dd>{activity.task.completed_at && <><dt>Finalizada</dt><dd>{new Date(activity.task.completed_at).toLocaleString('es-MX')}</dd></>}</>
                : <><dt>Fecha</dt><dd>{activity.block.day}</dd><dt>Horario</dt><dd>{activity.block.starts_at}–{activity.block.ends_at}</dd></>}
        </dl>
        <div className="activity-detail-actions"><button data-autofocus className="primary" disabled={busy} onClick={onEdit}>Editar</button>
            {task && <button disabled={busy} onClick={onToggle}>{activity.task.completed ? 'Reabrir' : 'Completar'}</button>}
            <button className="text-button danger" disabled={busy} onClick={onDelete}>Eliminar</button>
        </div>
    </Modal>;
}
