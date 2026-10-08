import { BANNED_REPORT_PATTERNS } from "@/lib/validation";

export interface ProgressActivity {
  title: string;
  category: string;
  status: string;
  included: boolean;
  activeSeconds: number;
  helpCount: number;
  breakCount: number;
  refusalCount: number;
}

export interface ProgressDay {
  date: string;
  activities: ProgressActivity[];
  observations: string[];
}

export interface ProgressSummary {
  days: Array<{
    date: string;
    planned: number;
    attempted: number;
    completed: number;
    partial: number;
    skipped: number;
    needsSupport: number;
    activeSeconds: number;
    breaksRequested: number;
    lines: string[];
  }>;
  plannedDays: number;
  daysWithFollowThrough: number;
  consistency: string;
  disclaimer: string;
}

const ATTEMPTED = new Set(["started", "working", "paused", "needs_help", "completed", "partial"]);

export function summarizeWeek(days: ProgressDay[], childName = "your child"): ProgressSummary {
  let plannedDays = 0;
  let daysWithFollowThrough = 0;
  const summarised = days.map((day) => {
    const included = day.activities.filter((item) => item.included || item.status === "skipped" || ATTEMPTED.has(item.status) || item.status === "completed" || item.status === "partial");
    const planned = day.activities.filter((item) => item.included || ["completed", "partial", "started", "working", "paused", "needs_help"].includes(item.status)).length;
    const attempted = day.activities.filter((item) => ATTEMPTED.has(item.status)).length;
    const completed = day.activities.filter((item) => item.status === "completed").length;
    const partial = day.activities.filter((item) => item.status === "partial").length;
    const skipped = day.activities.filter((item) => item.status === "skipped" || (!item.included && item.status === "scheduled")).length;
    const needsSupport = day.activities.filter((item) => item.helpCount > 0 || item.status === "needs_help").length;
    const activeSeconds = day.activities.reduce((sum, item) => sum + item.activeSeconds, 0);
    const breaksRequested = day.activities.reduce((sum, item) => sum + item.breakCount, 0);
    if (planned > 0) plannedDays += 1;
    if (completed + partial > 0) daysWithFollowThrough += 1;
    const lines = included.map((item) => {
      const bits = [item.title, labelStatus(item)];
      if (item.activeSeconds > 0) bits.push(`${Math.max(1, Math.round(item.activeSeconds / 60))} min on task`);
      if (item.helpCount > 0) bits.push(`support ${item.helpCount}`);
      if (item.breakCount > 0) bits.push(`breaks ${item.breakCount}`);
      return bits.join(" — ");
    });
    return {
      date: day.date,
      planned,
      attempted,
      completed,
      partial,
      skipped,
      needsSupport,
      activeSeconds,
      breaksRequested,
      lines,
    };
  });

  const consistency = plannedDays === 0
    ? "No activities were planned this week."
    : `On ${daysWithFollowThrough} of ${plannedDays} planned days, at least one activity was completed or partly done.`;

  const disclaimer = `This is a record of the plan and what happened. It is not a measure of ability, attention, or how ${childName} is doing.`;

  const summary = { days: summarised, plannedDays, daysWithFollowThrough, consistency, disclaimer };
  assertNeutral(summary);
  return summary;
}

function labelStatus(item: ProgressActivity): string {
  if (!item.included && item.status === "scheduled") return "left out today";
  if (item.status === "completed") return "completed";
  if (item.status === "partial") return "partly done";
  if (item.status === "skipped") return "skipped";
  if (item.status === "scheduled") return "not started";
  if (item.status === "ready") return "ready";
  if (item.status === "needs_help") return "needs support";
  return "in progress";
}

function assertNeutral(summary: ProgressSummary): void {
  const text = JSON.stringify(summary);
  for (const pattern of BANNED_REPORT_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error("Progress report used language outside the neutral record");
    }
  }
}
