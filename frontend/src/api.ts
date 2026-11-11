import { requestJSON } from '../http.js';
import type { BlockInput, DayData, Task, TaskInput, TaskFilters, TaskPage, TaskProgress, CalendarData } from './models';
export function taskQuery(filters: TaskFilters): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return params.toString();
}
export const api = {
    calendar: (start: string, end: string): Promise<CalendarData> => requestJSON(`/calendar?${new URLSearchParams({ start, end })}`, 'GET', undefined),
    tasks: (filters: TaskFilters = {}): Promise<TaskPage> => requestJSON(`/tasks?${taskQuery(filters)}`, 'GET', undefined),
    task: (id: number): Promise<Task> => requestJSON(`/tasks/${id}`, 'GET', undefined),
    taskProgress: (day: string): Promise<TaskProgress> => requestJSON(`/tasks/progress/${day}`, 'GET', undefined),
    createTask: (task: TaskInput): Promise<Task> => requestJSON('/tasks', 'POST', task),
    updateTask: (id: number, patch: Partial<TaskInput> & { completed?: boolean }): Promise<Task> => requestJSON(`/tasks/${id}`, 'PATCH', patch),
    deleteTask: (id: number): Promise<void> => requestJSON(`/tasks/${id}`, 'DELETE', undefined),
    day: (day: string): Promise<DayData> => requestJSON(`/days/${day}`, 'GET', undefined),
    account: (action: 'login' | 'register', username: string, password: string): Promise<void> => requestJSON(`/account/${action}`, 'POST', { username, password }),
    logout: (): Promise<void> => requestJSON('/account/logout', 'POST', undefined),
    addHabit: (name: string): Promise<unknown> => requestJSON('/habits', 'POST', { name }),
    updateHabit: (id: number, name: string): Promise<void> => requestJSON(`/habits/${id}`, 'PUT', { name }),
    checkHabit: (id: number, day: string, done: boolean): Promise<void> => requestJSON(`/habits/${id}/checks/${day}`, 'PUT', { done }),
    deleteHabit: (id: number): Promise<void> => requestJSON(`/habits/${id}`, 'DELETE', undefined),
    saveBlock: (block: BlockInput, id?: number): Promise<unknown> => requestJSON(id ? `/blocks/${id}` : '/blocks', id ? 'PUT' : 'POST', block),
    deleteBlock: (id: number): Promise<void> => requestJSON(`/blocks/${id}`, 'DELETE', undefined),
};
export const isUnauthorized = (error: unknown): boolean => typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'No se pudo completar la operación.';
