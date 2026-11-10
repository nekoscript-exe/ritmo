import { remainingSeconds } from './domain';
export interface TimerState {
    minutes: number;
    remaining: number;
    deadline: number;
    running: boolean;
    finished: boolean;
}
export type TimerAction = {
    type: 'start' | 'pause' | 'tick';
    now: number;
} | {
    type: 'reset';
} | {
    type: 'configure';
    minutes: number;
};
export const initialTimer: TimerState = { minutes: 25, remaining: 1500, deadline: 0, running: false, finished: false };
export function timerReducer(state: TimerState, action: TimerAction): TimerState {
    if (action.type === 'reset')
        return { ...state, remaining: state.minutes * 60, deadline: 0, running: false, finished: false };
    if (action.type === 'configure') {
        if (state.running || ![15, 25, 45, 60].includes(action.minutes))
            return state;
        return { minutes: action.minutes, remaining: action.minutes * 60, deadline: 0, running: false, finished: false };
    }
    if (action.type === 'start')
        return state.running || !state.remaining ? state : { ...state, deadline: action.now + state.remaining * 1000, running: true, finished: false };
    if (!state.running)
        return state;
    const remaining = remainingSeconds(state.deadline, action.now);
    return { ...state, remaining, running: action.type !== 'pause' && remaining > 0, finished: remaining === 0 };
}
