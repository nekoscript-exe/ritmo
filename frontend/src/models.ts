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
export type FocusState = 'running' | 'paused' | 'completed' | 'cancelled';
export interface FocusSession {
    id: number; task_id: number | null; planned_seconds: number; duration_seconds: number;
    elapsed_seconds: number; state: FocusState; started_at: string; ended_at: string | null;
    created_at: string; version: number;
}
export interface FocusSnapshot { session: FocusSession | null; server_time: string }
export interface FocusCommand { request_id: string; expected_version: number }
export type FocusAction = 'pause' | 'resume' | 'finish' | 'cancel';
export interface FocusStart { request_id: string; planned_seconds: number; task_id: number | null }
export interface FocusPage { items: FocusSession[]; total: number; limit: number; offset: number; server_time: string }
export interface StatisticsDaily {
    day: string; tasks_total: number; tasks_completed: number; tasks_overdue: number;
    habits_completed: number; habits_expected: number; planned_minutes: number;
    focus_minutes: number; focus_completed_minutes: number; focus_interrupted_minutes: number;
}
export interface HabitStatistics {
    id: number; name: string; fulfilled_days: number; expected_days: number; percent: number;
    current_streak: number; max_streak: number; history: { day: string; done: boolean; eligible: boolean }[];
}
export interface StatisticsData {
    start: string; end: string; timezone: string; as_of: string;
    summary: Record<string, number>; daily: StatisticsDaily[];
    by_category: { category: Category; minutes: number }[]; habits: HabitStatistics[];
}
