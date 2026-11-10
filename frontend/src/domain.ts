export function localDay(date = new Date()): string {
    return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
export function parseDay(day: string): Date { return new Date(`${day}T12:00:00`); }
export function monthCells(year: number, month: number): (string | null)[] {
    const first = new Date(2000, month, 1, 12);
    first.setFullYear(year);
    const offset = (first.getDay() + 6) % 7;
    const end = new Date(first);
    end.setMonth(month + 1, 0);
    return [...Array<null>(offset).fill(null), ...Array.from({ length: end.getDate() }, (_, index) => {
            const day = new Date(first);
            day.setDate(index + 1);
            return localDay(day);
        })];
}
export function greeting(hour: number): string { return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'; }
export function remainingSeconds(deadline: number, now: number): number { return Math.max(0, Math.ceil((deadline - now) / 1000)); }
export function clock(seconds: number): string { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
