import { api } from './api';
import type { FocusAction, FocusCommand, FocusSession, FocusStart } from './models';
export type PendingFocus = { kind: 'start'; body: FocusStart } | { kind: FocusAction; id: number; body: FocusCommand };
export function startRequest(planned_seconds: number, task_id: number | null, request_id = crypto.randomUUID()): PendingFocus {
    return { kind: 'start', body: { request_id, planned_seconds, task_id } };
}
export function actionRequest(session: FocusSession, kind: FocusAction, request_id = crypto.randomUUID()): PendingFocus {
    return { kind, id: session.id, body: { request_id, expected_version: session.version } };
}
export const focusService = {
    active: api.focusActive,
    execute: (request: PendingFocus) => request.kind === 'start' ? api.focusStart(request.body) : api.focusCommand(request.id, request.kind, request.body),
    taskChoices: () => api.tasks({ limit: 100 }),
};
export function displayElapsed(session: FocusSession, receivedAt: number, now: number): number {
    const delta = session.state === 'running' ? Math.max(0, now - receivedAt) / 1000 : 0;
    return Math.min(session.planned_seconds, session.elapsed_seconds + delta);
}
export const focusLabels = { running: 'En curso', paused: 'En pausa', completed: 'Completada', cancelled: 'Interrumpida' } as const;
