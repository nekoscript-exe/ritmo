export const categories = { personal: 'Personal', trabajo: 'Trabajo', estudio: 'Estudio', salud: 'Salud', descanso: 'Descanso' } as const;
export type Category = keyof typeof categories;
export interface Habit {
    id: number;
    name: string;
    done: boolean;
}
export interface Block {
    id: number;
    title: string;
    starts_at: string;
    ends_at: string;
    category: Category;
}
export interface BlockInput {
    title: string;
    day: string;
    starts_at: string;
    ends_at: string;
    category: Category;
}
export interface DayData {
    habits: Habit[];
    blocks: Block[];
}
export type Priority = 'baja' | 'media' | 'alta';
export interface TaskInput {
    title: string;
    description: string | null;
    priority: Priority;
    category: Category;
    due_date: string | null;
}
export interface Task extends TaskInput {
    id: number;
    completed: boolean;
    created_at: string;
    completed_at: string | null;
}
export interface TaskFilters {
    status?: 'pending' | 'completed';
    category?: Category;
    priority?: Priority;
    due_date?: string;
    undated?: boolean;
    limit?: number;
    offset?: number;
}
export interface TaskPage { items: Task[]; total: number; limit: number; offset: number }
export interface TaskProgress { day: string; total: number; completed: number; percent: number }
export interface CalendarBlock extends Block { day: string }
export interface CalendarData { start: string; end: string; blocks: CalendarBlock[]; tasks: Task[] }
export type CalendarView = 'day' | 'week' | 'month';
export type Section = 'Dashboard' | 'Tareas' | 'Calendario' | 'Hábitos' | 'Focus' | 'Estadísticas';
