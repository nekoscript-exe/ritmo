import { useEffect, useRef, useState } from 'react';
import { errorMessage, isUnauthorized } from '../api';
import { actionRequest, focusService, startRequest } from '../focusService';
import type { PendingFocus } from '../focusService';
import type { FocusAction, FocusSession } from '../models';

export function useFocusSession(options: { onUnauthorized?: () => void; onBusyChange?: (busy: boolean) => void; onChanged?: () => void }) {
    const callbacks = useRef(options); callbacks.current = options;
    const [session, setSession] = useState<FocusSession | null>(null);
    const [receivedAt, setReceivedAt] = useState(0);
    const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [synchronized, setSynchronized] = useState(false);
    const [error, setError] = useState(''); const [pending, setPending] = useState<PendingFocus | null>(null);
    const mounted = useRef(true), locked = useRef(false), generation = useRef(0);
    async function refresh() {
        if (locked.current) return;
        const token = ++generation.current;
        setLoading(true);
        try {
            const snapshot = await focusService.active();
            if (mounted.current && token === generation.current) { setSession(snapshot.session); setReceivedAt(Date.now()); setSynchronized(true); setError(''); }
        } catch (err) {
            if (mounted.current && token === generation.current) { setError(errorMessage(err)); setSynchronized(false); if (isUnauthorized(err)) callbacks.current.onUnauthorized?.(); }
        } finally { if (mounted.current && token === generation.current) setLoading(false); }
    }
    useEffect(() => {
        mounted.current = true; void refresh();
        const check = () => { if (!document.hidden) void refresh(); };
        const interval = setInterval(check, 30000);
        document.addEventListener('visibilitychange', check); window.addEventListener('focus', check);
        return () => { mounted.current = false; generation.current++; clearInterval(interval); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
    }, []);
    async function execute(request: PendingFocus) {
        if (locked.current) return;
        locked.current = true; generation.current++; setBusy(true); setLoading(false); setError(''); setPending(request);
        callbacks.current.onBusyChange?.(true);
        try {
            const snapshot = await focusService.execute(request);
            if (mounted.current) { setSession(snapshot.session); setReceivedAt(Date.now()); setSynchronized(true); setPending(null); callbacks.current.onChanged?.(); }
        } catch (err) {
            if (mounted.current) {
                setSynchronized(false); setError(errorMessage(err));
                // Un error HTTP 4xx es definitivo; un corte sin respuesta conserva la misma clave para reintentar.
                if (typeof err === 'object' && err && 'status' in err && Number(err.status) >= 400 && Number(err.status) < 500) setPending(null);
                if (isUnauthorized(err)) callbacks.current.onUnauthorized?.();
            }
        } finally { locked.current = false; if (mounted.current) setBusy(false); callbacks.current.onBusyChange?.(false); }
    }
    const ready = !loading && !busy && synchronized && !pending;
    return { session, receivedAt, loading, busy, error, pending, ready, refresh,
        retry: () => { if (pending) void execute(pending); },
        start: (seconds: number, task: number | null) => { if (ready) void execute(startRequest(seconds, task)); },
        command: (action: FocusAction) => { if (ready && session) void execute(actionRequest(session, action)); },
    };
}
