import { useLayoutEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { activateDialog, dismissDialog, outsideDialog } from '../modal';

export function Modal({ title, children, onClose, busy = false, small = false }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    busy?: boolean;
    small?: boolean;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const startedOutside = useRef(false);
    const titleId = useId();
    const helpId = useId();
    // Abrir antes de pintar; nunca se presenta como un elemento inline transitorio.
    useLayoutEffect(() => activateDialog(dialog.current!), []);
    const content = <dialog ref={dialog} className={`ritmo-modal${small ? ' ritmo-modal-small' : ''}`}
        aria-labelledby={titleId} aria-describedby={helpId} aria-modal="true" aria-busy={busy}
        onCancel={event => { event.preventDefault(); dismissDialog(busy, onClose); }}
        onPointerDown={event => {
            startedOutside.current = event.target === event.currentTarget && outsideDialog(event.currentTarget, event.clientX, event.clientY);
        }}
        onClick={event => {
            if (startedOutside.current && event.target === event.currentTarget && outsideDialog(event.currentTarget, event.clientX, event.clientY)) dismissDialog(busy, onClose);
            startedOutside.current = false;
        }}>
        <header className="modal-heading"><div><span className="eyebrow">A TU RITMO</span><h2 id={titleId}>{title}</h2></div>
            <button type="button" className="icon-button modal-close" aria-label="Cerrar formulario" disabled={busy} onClick={() => dismissDialog(busy, onClose)}><span aria-hidden="true">×</span></button>
        </header>
        <p id={helpId} className="tiny muted modal-help">{busy ? 'Guardando cambios. Espera un momento antes de cerrar.' : 'Esc, Cancelar o un clic fuera cierran sin guardar.'}</p>
        {children}
    </dialog>;
    // La alternativa sin document es solo para renderizado estático/pruebas de servidor.
    // En navegador, todos los editores viven fuera de las tarjetas y del grid.
    return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
