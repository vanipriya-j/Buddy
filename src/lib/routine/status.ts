export const TASK_STATUSES = [
  "scheduled",
  "ready",
  "started",
  "working",
  "paused",
  "needs_help",
  "completed",
  "partial",
  "skipped",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TERMINAL_STATUSES: TaskStatus[] = ["completed", "partial", "skipped"];

export const OPEN_STATUSES: TaskStatus[] = [
  "scheduled",
  "ready",
  "started",
  "working",
  "paused",
  "needs_help",
];

const CHILD_OR_SYSTEM: Record<TaskStatus, TaskStatus[]> = {
  scheduled: ["ready", "skipped"],
  ready: ["started", "paused", "needs_help", "skipped"],
  started: ["working", "paused", "needs_help", "skipped"],
  working: ["paused", "needs_help", "working"],
  paused: ["working", "ready", "needs_help", "skipped"],
  needs_help: ["working", "paused", "skipped"],
  completed: [],
  partial: [],
  skipped: [],
};

const PARENT_EXTRA: Record<TaskStatus, TaskStatus[]> = {
  scheduled: ["skipped", "ready"],
  ready: ["completed", "partial", "skipped", "paused", "scheduled"],
  started: ["completed", "partial", "skipped", "paused"],
  working: ["completed", "partial", "skipped", "paused"],
  paused: ["completed", "partial", "skipped", "working", "ready"],
  needs_help: ["completed", "partial", "skipped", "working", "ready"],
  completed: [],
  partial: [],
  skipped: ["scheduled"],
};

export type TransitionActor = "child" | "parent" | "system";

export function canTransition(from: TaskStatus, to: TaskStatus, by: TransitionActor): boolean {
  if (from === to) return true;
  if (by === "parent") {
    return PARENT_EXTRA[from].includes(to) || CHILD_OR_SYSTEM[from].includes(to);
  }
  return CHILD_OR_SYSTEM[from].includes(to);
}

export function assertCanTransition(from: TaskStatus, to: TaskStatus, by: TransitionActor): void {
  if (!canTransition(from, to, by)) {
    throw new Error(`Illegal ${by} transition ${from} -> ${to}`);
  }
}

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  scheduled: "Planned",
  ready: "Ready",
  started: "Started",
  working: "Working",
  paused: "Paused",
  needs_help: "Needs support",
  completed: "Completed",
  partial: "Partly done",
  skipped: "Skipped",
};
