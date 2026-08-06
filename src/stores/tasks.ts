import { create } from 'zustand';

export type TaskKind = 'quiz' | 'chat' | 'analyze' | 'organize' | 'questions' | 'revision' | 'explain';

export interface RunningTask {
  id: string;
  kind: TaskKind;
  label: string;
  section: string; // AiModuleKey or 'quiz'
  startedAt: number;
  streamText?: string;
  status: 'running' | 'done' | 'error';
  resultText?: string;
  error?: string;
}

interface TasksState {
  tasks: RunningTask[];
  startTask: (t: Omit<RunningTask, 'id' | 'startedAt' | 'status'>) => string;
  appendStream: (id: string, text: string) => void;
  finishTask: (id: string, resultText: string) => void;
  failTask: (id: string, error: string) => void;
  clearTask: (id: string) => void;
}

// Global task registry: AI work that must survive navigation (component
// unmount). Any page can subscribe; the work continues in the store, and a
// live "what the AI is doing" indicator can read it from anywhere.
export const useTasks = create<TasksState>((set) => ({
  tasks: [],
  startTask: (t) => {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ tasks: [...s.tasks, { ...t, id, startedAt: Date.now(), status: 'running' as const }] }));
    return id;
  },
  appendStream: (id, text) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, streamText: (t.streamText || '') + text } : t)) })),
  finishTask: (id, resultText) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: 'done' as const, resultText } : t)) })),
  failTask: (id, error) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: 'error' as const, error } : t)) })),
  clearTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
}));
