import { describe, expect, it } from "vitest";
import { canRestartEndedSession, pinAttemptAllowed, signToken, verifyToken } from "@/lib/auth";
import { summarizeWeek } from "@/lib/progress";
import { canReschedule, lightenPlan, occursOn, restorePlan } from "@/lib/recurrence";
import { validatePending } from "@/lib/rewards";
import { isCheckInDue, isSessionExpired, quietDelayMs } from "@/lib/session-policy";
import { sessionActionSchema } from "@/lib/validation";

describe("recurrence and workload", () => {
  const activity = { active: true, isLive: true, daily: false, recurrenceDays: [1, 2, 3, 4, 5], onlyDate: null };

  it("places weekday activities on the matching day only", () => {
    expect(occursOn(activity, "2026-10-08")).toBe(true);
    expect(occursOn(activity, "2026-10-10")).toBe(false);
    expect(occursOn({ ...activity, daily: true }, "2026-10-10")).toBe(true);
    expect(occursOn({ ...activity, active: false }, "2026-10-08")).toBe(false);
    expect(occursOn({ ...activity, isLive: false }, "2026-10-08")).toBe(false);
    expect(occursOn({ ...activity, onlyDate: "2026-10-09", daily: true }, "2026-10-09")).toBe(true);
    expect(occursOn({ ...activity, onlyDate: "2026-10-09", daily: true }, "2026-10-08")).toBe(false);
  });

  it("lightens low-priority plans without removing a manual skip on restore", () => {
    const items = [
      { id: "low", priority: "low", estimatedMinutes: 15, baselineMinutes: 15, included: true, status: "scheduled", autoSkipped: false },
      { id: "normal", priority: "normal", estimatedMinutes: 15, baselineMinutes: 15, included: true, status: "scheduled", autoSkipped: false },
      { id: "high", priority: "high", estimatedMinutes: 15, baselineMinutes: 15, included: true, status: "scheduled", autoSkipped: false },
      { id: "busy", priority: "normal", estimatedMinutes: 15, baselineMinutes: 15, included: true, status: "working", autoSkipped: false },
    ];
    const light = lightenPlan(items);
    expect(light).toEqual([
      { id: "low", included: false, autoSkipped: true },
      { id: "normal", estimatedMinutes: 10 },
    ]);
    const restored = restorePlan([
      { ...items[0], included: false, autoSkipped: true },
      { ...items[1], estimatedMinutes: 10 },
      { id: "manual", priority: "low", estimatedMinutes: 15, baselineMinutes: 15, included: false, status: "scheduled", autoSkipped: false },
    ]);
    expect(restored.find((item) => item.id === "manual")).toBeUndefined();
    expect(restored.find((item) => item.id === "low")?.included).toBe(true);
    expect(canReschedule("working")).toBe(false);
    expect(canReschedule("scheduled")).toBe(true);
  });
});

describe("session policy", () => {
  it("ends at the limit and pauses when a check-in is due", () => {
    const start = new Date("2026-10-08T10:00:00");
    expect(isSessionExpired(start, 20, new Date("2026-10-08T10:19:00"))).toBe(false);
    expect(isSessionExpired(start, 20, new Date("2026-10-08T10:20:00"))).toBe(true);
    expect(isCheckInDue(start, 10, new Date("2026-10-08T10:09:00"))).toBe(false);
    expect(isCheckInDue(start, 10, new Date("2026-10-08T10:10:00"))).toBe(true);
    expect(quietDelayMs(15)).toBeGreaterThanOrEqual(3 * 60_000);
    expect(quietDelayMs(15)).toBeLessThanOrEqual(8 * 60_000);
  });

  it("rejects stored transcripts and ended-session restarts", () => {
    const parsed = sessionActionSchema.safeParse({ action: "child_intent", intent: "ready", transcript: "hello" });
    expect(parsed.success).toBe(false);
    const emptyNote = sessionActionSchema.safeParse({ action: "parent_observation", pin: "2468", note: "  " });
    expect(emptyNote.success).toBe(false);
    if (!emptyNote.success) expect(emptyNote.error.issues[0]?.message).toBe("Write a short note first.");
    expect(canRestartEndedSession()).toBe(false);
    expect(pinAttemptAllowed([{ at: 0 }, { at: 1 }, { at: 2 }, { at: 3 }, { at: 4 }], 5)).toBe(false);
    expect(pinAttemptAllowed([{ at: 0 }], 10 * 60 * 1000)).toBe(true);
  });

  it("signs parent and child modes", () => {
    const secret = "test-secret-test-secret";
    const token = signToken({ parentId: "p1", mode: "child", sessionId: "s1", exp: Date.now() + 1000 }, secret);
    expect(verifyToken(token, secret)?.sessionId).toBe("s1");
    expect(verifyToken(`${token}x`, secret)).toBeNull();
    expect(verifyToken(token, "another-secret-value")).toBeNull();
  });
});

describe("progress and rewards", () => {
  it("reports what happened without a judgement", () => {
    const summary = summarizeWeek([
      {
        date: "2026-10-08",
        observations: ["Sat together for maths"],
        activities: [
          { title: "School studies", category: "school", status: "completed", included: true, activeSeconds: 600, helpCount: 1, breakCount: 1, refusalCount: 0 },
          { title: "Free play", category: "play", status: "scheduled", included: true, activeSeconds: 0, helpCount: 0, breakCount: 0, refusalCount: 0 },
        ],
      },
    ], "Aaroh");
    expect(summary.daysWithFollowThrough).toBe(1);
    expect(summary.consistency).toMatch(/1 of 1/);
    expect(summary.disclaimer).toMatch(/not a measure/);
    expect(JSON.stringify(summary)).not.toMatch(/adhd|intelligence|wellbeing|diagnose/i);
    const validated = validatePending([{ kind: "trying", stars: 1, validated: false }, { kind: "help", stars: -2, validated: false }]);
    expect(validated.every((reward) => reward.validated)).toBe(true);
    expect(validated[1]?.stars).toBe(0);
  });
});
