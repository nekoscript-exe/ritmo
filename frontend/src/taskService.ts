import { api } from './api';
import type { TaskFilters, TaskPage, TaskProgress } from './models';
export interface TaskSnapshot { page: TaskPage; progress: TaskProgress }
export async function loadTaskSnapshot(day: string, filters: TaskFilters): Promise<TaskSnapshot> {
    const [page, progress] = await Promise.all([api.tasks(filters), api.taskProgress(day)]);
    return { page, progress };
}
