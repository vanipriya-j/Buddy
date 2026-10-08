import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetPinAttempts } from "@/lib/pin-guard";
import { updateActivity } from "@/lib/services/activities";
import { getToday } from "@/lib/services/daily-plan";
import { actOnSession, getSession, startSession } from "@/lib/services/sessions";
import type { AuthToken } from "@/lib/auth";
import { seedDatabase } from "../../prisma/seed";

const DATE = "2026-10-08";

async function parentAuth(): Promise<AuthToken> {
  const parent = await prisma.parent.findFirstOrThrow();
  return { parentId: parent.id, mode: "parent", exp: Date.now() + 60_000 };
}

describe("supervised sessions", () => {
  beforeEach(async () => {
    resetPinAttempts();
    await seedDatabase();
  });

  it("builds Thursday from the weekly schedule", async () => {
    const auth = await parentAuth();
    const today = await getToday(auth, DATE);
    expect(today.childName).toBe("Aaroh");
    expect(today.items.map((item) => item.title)).toEqual([
      "School studies",
      "Paattu practice",
      "Reading",
      "Free play",
    ]);
  });

  it("requires a parent to approve, then moves on, and blocks a restart", async () => {
    const auth = await parentAuth();
    const started = await startSession(auth, {
      pin: "2468",
      limitMinutes: 20,
      buttonsOnly: true,
      checkInIntervalMinutes: 10,
      date: DATE,
    });
    expect(started.view.activity?.title).toBe("School studies");
    expect(started.view.say).toMatch(/Hi Aaroh/);
    expect(started.nextMode).toBe("child");

    const child: AuthToken = { ...auth, mode: "child", sessionId: started.view.sessionId };
    await expect(updateActivity(child, "missing", {})).rejects.toThrow(/Parent screen only/);
    await expect(startSession(child, {
      pin: "2468",
      limitMinutes: 20,
      buttonsOnly: false,
      checkInIntervalMinutes: 10,
      date: DATE,
    })).rejects.toThrow(/Parent screen only/);

    const ready = await actOnSession(child, started.view.sessionId, { action: "child_intent", intent: "ready" });
    expect(ready.view.taskStatus).toBe("started");
    const done = await actOnSession(child, started.view.sessionId, { action: "child_intent", intent: "done" });
    expect(done.view.taskStatus).not.toBe("completed");

    await expect(actOnSession(child, started.view.sessionId, {
      action: "parent_approve",
      pin: "0000",
      outcome: "completed",
    })).rejects.toThrow(/PIN/);

    const approved = await actOnSession(child, started.view.sessionId, {
      action: "parent_approve",
      pin: "2468",
      outcome: "completed",
    });
    expect(approved.view.taskStatus).toBe("completed");
    expect(approved.view.phase).toBe("between_break");

    const back = await actOnSession(child, started.view.sessionId, { action: "child_intent", intent: "ready" });
    expect(back.view.parentCheckpoint).toBe(true);
    const next = await actOnSession(child, started.view.sessionId, { action: "parent_present", pin: "2468" });
    expect(next.view.activity?.title).toBe("Paattu practice");
    expect(next.view.activity?.referenceAudioUrl).toMatch(/\/api\/materials\//);

    const stopped = await actOnSession(child, started.view.sessionId, { action: "parent_stop" });
    expect(stopped.view.ended).toBe(true);
    expect(stopped.nextMode).toBe("locked");
    const paattu = await prisma.dailyInstance.findFirst({
      where: { id: next.view.activity?.instanceId },
    });
    expect(paattu?.status).not.toBe("completed");
    await expect(actOnSession(child, started.view.sessionId, { action: "child_intent", intent: "ready" })).rejects.toThrow(/finished/);
    await expect(getSession(child, started.view.sessionId)).rejects.toThrow(/finished/);
  });

  it("ends at the time limit without completing the activity", async () => {
    const auth = await parentAuth();
    const started = await startSession(auth, {
      pin: "2468",
      limitMinutes: 10,
      buttonsOnly: true,
      checkInIntervalMinutes: 30,
      date: DATE,
    });
    await prisma.session.update({
      where: { id: started.view.sessionId },
      data: { startedAt: new Date(Date.now() - 11 * 60_000) },
    });
    const ended = await actOnSession(
      { ...auth, mode: "child", sessionId: started.view.sessionId },
      started.view.sessionId,
      { action: "session_tick" },
    );
    expect(ended.view.ended).toBe(true);
    expect(ended.view.say).toMatch(/keep going without Buddy/);
    const school = await prisma.dailyInstance.findFirst({
      where: { activity: { title: "School studies", isLive: true }, date: DATE },
    });
    expect(school?.status).toBe("ready");
  });

  it("pauses for a missed parent check-in", async () => {
    const auth = await parentAuth();
    const started = await startSession(auth, {
      pin: "2468",
      limitMinutes: 30,
      buttonsOnly: false,
      checkInIntervalMinutes: 5,
      date: DATE,
    });
    await prisma.session.update({
      where: { id: started.view.sessionId },
      data: { lastCheckInAt: new Date(Date.now() - 6 * 60_000) },
    });
    const paused = await actOnSession(
      { ...auth, mode: "child", sessionId: started.view.sessionId },
      started.view.sessionId,
      { action: "child_intent", intent: "ready" },
    );
    expect(paused.view.phase).toBe("session_paused_parent");
    expect(paused.view.taskStatus).not.toBe("started");
    const resumed = await actOnSession(
      { ...auth, mode: "child", sessionId: started.view.sessionId },
      started.view.sessionId,
      { action: "parent_present", pin: "2468" },
    );
    expect(resumed.view.phase).not.toBe("session_paused_parent");
  });
});
