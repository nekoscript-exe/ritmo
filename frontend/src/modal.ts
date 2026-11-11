// El navegador proporciona la capa modal y la contención del foco mediante showModal().
export function activateDialog(dialog: HTMLDialogElement): () => void {
    const document = dialog.ownerDocument;
    const view = document.defaultView!;
    const opener = document.activeElement as HTMLElement | null;
    const { style } = document.documentElement;
    const previous = { overflow: style.overflow, width: style.width };
    const { scrollX, scrollY } = view;
    const width = document.documentElement.clientWidth;
    // Bloquear la raíz sin sacar body del flujo conserva también las zonas sticky.
    // Congelar su anchura evita saltos cuando desaparece la barra de desplazamiento.
    Object.assign(style, { overflow: 'hidden', width: `${width}px` });
    // La capa superior, el fondo inerte y ::backdrop provienen de esta llamada nativa.
    // No usar setAttribute('open') ni show(): ambos crearían un diálogo no modal.
    try { dialog.showModal(); }
    catch (error) { Object.assign(style, previous); throw error; }
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    return () => {
        if (dialog.open) dialog.close();
        Object.assign(style, previous);
        view.scrollTo(scrollX, scrollY);
        if (opener?.isConnected && !opener.matches(':disabled')) opener.focus({ preventScroll: true });
        else document.getElementById('main')?.focus({ preventScroll: true });
    };
}

export function outsideDialog(dialog: HTMLDialogElement, x: number, y: number): boolean {
    const rect = dialog.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
}

export function dismissDialog(busy: boolean, onClose: () => void): void {
    if (!busy) onClose();
}
