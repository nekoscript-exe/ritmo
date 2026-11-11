import { api } from './api';
export const statisticsService = {
    load: api.statistics,
    history: api.focusHistory,
    remove: api.focusDelete,
};
export function browserTimezone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
export function numberLabel(value: number): string { return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value); }

export function isBrowserTimezone(value: string): boolean {
    try { new Intl.DateTimeFormat('es-MX', { timeZone: value }).format(0); return true; }
    catch { return false; }
}
