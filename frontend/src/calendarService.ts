import { api } from './api';
import type { BlockInput, TaskInput } from './models';
import type { CalendarActivity } from './calendarDomain';
export const calendarService = {
    load: (start: string, end: string) => api.calendar(start, end),
    saveTask: (draft: TaskInput, id?: number) => id ? api.updateTask(id, draft) : api.createTask(draft),
    saveBlock: (draft: BlockInput, id?: number) => api.saveBlock(draft, id),
    toggleTask: (activity: Extract<CalendarActivity, { kind: 'task' }>) => api.updateTask(activity.task.id, { completed: !activity.task.completed }),
    remove: (activity: CalendarActivity) => activity.kind === 'task' ? api.deleteTask(activity.task.id) : api.deleteBlock(activity.block.id),
};
