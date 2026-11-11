import type { CalendarBlock, CalendarData, CalendarView, Task } from './models';
export const MIN_DAY = '0001-01-01';
export const MAX_DAY = '9999-12-31';
const DAY = 86400000;
function date(day: string): Date {
    const [year, month, number] = day.split('-').map(Number);
    const d = new Date(0); d.setUTCHours(12, 0, 0, 0); d.setUTCFullYear(year, month - 1, number); return d;
}
function key(d: Date): string {
    if (d.getUTCFullYear() < 1) return MIN_DAY;
    if (d.getUTCFullYear() > 9999) return MAX_DAY;
    return d.toISOString().slice(0, 10);
}
export function addDays(day: string, count: number): string { return key(new Date(date(day).getTime() + count * DAY)); }
export function calendarRange(day: string, view: CalendarView): { start: string; end: string } {
    if (view === 'day') return { start: day, end: day };
    const d = date(day);
    if (view === 'week') {
        const start = addDays(day, -((d.getUTCDay() + 6) % 7));
        return { start, end: addDays(start, 6) };
    }
    d.setUTCDate(1); const start = key(d); d.setUTCMonth(d.getUTCMonth() + 1, 0);
    return { start, end: key(d) };
}
export function rangeDays(start: string, end: string): string[] {
    const result: string[] = [];
    for (let day = start; day <= end;) {
        result.push(day); const next = addDays(day, 1); if (next === day) break; day = next;
    }
    return result;
}
export function navigateCalendar(day: string, view: CalendarView, offset: number): string {
    if (view !== 'month') return addDays(day, offset * (view === 'week' ? 7 : 1));
    const d = date(day); const number = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset);
    if (d.getUTCFullYear() < 1) return MIN_DAY;
    if (d.getUTCFullYear() > 9999) return MAX_DAY;
    const end = new Date(d); end.setUTCMonth(end.getUTCMonth() + 1, 0);
    d.setUTCDate(Math.min(number, end.getUTCDate())); return key(d);
}
export function monthGrid(day: string): (string | null)[] {
    const { start, end } = calendarRange(day, 'month');
    const leading = (date(start).getUTCDay() + 6) % 7;
    const cells: (string | null)[] = [...Array(leading).fill(null), ...rangeDays(start, end)];
    while (cells.length % 7) cells.push(null); return cells;
}
export function timeMinutes(time: string): number {
    const [h, m, s = 0] = time.split(':').map(Number); return h * 60 + m + s / 60;
}
export interface PositionedBlock { block: CalendarBlock; top: number; height: number; lane: number; lanes: number }
export function positionBlocks(blocks: CalendarBlock[]): PositionedBlock[] {
    const sorted = [...blocks].sort((a, b) => timeMinutes(a.starts_at) - timeMinutes(b.starts_at) || timeMinutes(a.ends_at) - timeMinutes(b.ends_at) || a.id - b.id);
    const result: PositionedBlock[] = []; let group: PositionedBlock[] = []; let ends: number[] = []; let groupEnd = -1;
    function flush() { for (const row of group) result.push({ ...row, lanes: ends.length }); group = []; ends = []; }
    for (const block of sorted) {
        const start = timeMinutes(block.starts_at), end = timeMinutes(block.ends_at);
        if (start >= groupEnd) flush();
        let lane = ends.findIndex(value => value <= start); if (lane < 0) lane = ends.length;
        ends[lane] = end; groupEnd = Math.max(start >= groupEnd ? -1 : groupEnd, end);
        group.push({ block, lane, lanes: 1, top: start / 1440 * 100, height: (end - start) / 1440 * 100 });
    }
    flush(); return result;
}
export type CalendarActivity = { kind: 'task'; task: Task } | { kind: 'block'; block: CalendarBlock };
export function activitiesForDay(data: CalendarData, day: string): CalendarActivity[] {
    return [
        ...data.tasks.filter(t => t.due_date === day).map(task => ({ kind: 'task' as const, task })),
        ...data.blocks.filter(b => b.day === day).sort((a, b) => timeMinutes(a.starts_at) - timeMinutes(b.starts_at) || a.id - b.id).map(block => ({ kind: 'block' as const, block })),
    ];
}
