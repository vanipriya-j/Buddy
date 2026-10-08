import { weekdayIndex } from "@/lib/utils";

export interface RecurrenceInput {
  active: boolean;
  isLive: boolean;
  daily: boolean;
  recurrenceDays: number[];
  onlyDate?: string | null;
}

export function occursOn(activity: RecurrenceInput, date: string): boolean {
  if (!activity.active || !activity.isLive) return false;
  if (activity.onlyDate) return activity.onlyDate === date;
  if (activity.daily) return true;
  return activity.recurrenceDays.includes(weekdayIndex(date));
}

export function parseRecurrenceDays(raw: string): number[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((day): day is number => typeof day === "number" && day >= 0 && day <= 6);
  } catch {
    return [];
  }
}

export interface LightenItem {
  id: string;
  priority: "low" | "normal" | "high" | string;
  estimatedMinutes: number;
  baselineMinutes: number;
  included: boolean;
  status: string;
  autoSkipped: boolean;
}

export interface LightenPatch {
  id: string;
  estimatedMinutes?: number;
  included?: boolean;
  autoSkipped?: boolean;
}

export function lightenPlan(items: LightenItem[]): LightenPatch[] {
  const patches: LightenPatch[] = [];
  for (const item of items) {
    if (item.status !== "scheduled") continue;
    if (item.priority === "low" && item.included) {
      patches.push({ id: item.id, included: false, autoSkipped: true });
      continue;
    }
    if (item.priority === "normal" && item.included) {
      const next = Math.max(5, item.estimatedMinutes - 5);
      if (next !== item.estimatedMinutes) {
        patches.push({ id: item.id, estimatedMinutes: next });
      }
    }
  }
  return patches;
}

export function restorePlan(items: LightenItem[]): LightenPatch[] {
  const patches: LightenPatch[] = [];
  for (const item of items) {
    if (item.status !== "scheduled" && !(item.autoSkipped && item.status === "scheduled")) continue;
    const patch: LightenPatch = { id: item.id };
    let changed = false;
    if (item.estimatedMinutes !== item.baselineMinutes && item.status === "scheduled") {
      patch.estimatedMinutes = item.baselineMinutes;
      changed = true;
    }
    if (item.autoSkipped) {
      patch.included = true;
      patch.autoSkipped = false;
      changed = true;
    }
    if (changed) patches.push(patch);
  }
  return patches;
}

export function moveInList(ids: string[], id: string, direction: "up" | "down"): string[] {
  const index = ids.indexOf(id);
  if (index < 0) return ids;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function canReschedule(status: string): boolean {
  return status === "scheduled" || status === "ready";
}
