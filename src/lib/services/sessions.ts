import type { Activity, DailyInstance, Material, Session } from "@prisma/client";
import type { AuthToken } from "@/lib/auth";
import { assertParentMode, verifyPin } from "@/lib/auth";
import { isCategory, type Category } from "@/lib/categories";
import { beginActivity, deterministicEngine, projectCoach } from "@/lib/dialogue/reduce";
import type { CoachContext, CoachEvent, CoachState } from "@/lib/dialogue/types";
import { buildScript } from "@/lib/dialogue/scripts";
import { SESSION_GOODBYE } from "@/lib/dialogue/copy";
import { prisma } from "@/lib/db";
import { assertPinAttempts, clearPinFailures, recordPinFailure } from "@/lib/pin-guard";
import { isTerminal, OPEN_STATUSES, type TaskStatus } from "@/lib/routine/status";
import { isCheckInDue, isSessionExpired, quietDelayMs, remainingSeconds } from "@/lib/session-policy";
import type { SessionAction } from "@/lib/validation";
import { PRESENCE_NOTE, type ChildSessionView, type PlanItemView, type SessionActionResponse } from "@/lib/views";
import { ServiceError } from "@/lib/services/errors";
import { ensureDailyPlan } from "@/lib/services/daily-plan";

type InstanceBundle = DailyInstance & { activity: Activity & { materials: Material[] } };

const TIMED = new Set<TaskStatus>(["started", "working", "needs_help"]);

function parseCoach(raw: string | null | undefined): CoachState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as CoachState;
    if (!value || typeof value.phase !== "string" || typeof value.taskStatus !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

function pinKey(parentId: string): string {
  return `pin:${parentId}`;
}

async function requirePin(parentId: string, pin: string): Promise<void> {
  assertPinAttempts(pinKey(parentId));
  const parent = await prisma.parent.findUnique({ where: { id: parentId } });
  if (!parent) throw new ServiceError("Parent profile missing", 404);
  const ok = await verifyPin(pin, parent.pinHash);
  if (!ok) {
    recordPinFailure(pinKey(parentId));
    throw new ServiceError("That PIN didn't match", 401);
  }
  clearPinFailures(pinKey(parentId));
}

async function dayItems(parentId: string, date: string): Promise<InstanceBundle[]> {
  return prisma.dailyInstance.findMany({
    where: { date, activity: { parentId } },
    include: { activity: { include: { materials: true } } },
    orderBy: { sequence: "asc" },
  });
}

function isOpen(status: string): boolean {
  return OPEN_STATUSES.includes(status as TaskStatus);
}

function contextFor(instance: InstanceBundle, childName: string, greet: boolean, hasNext: boolean, hintIndex: number): CoachContext {
  if (!isCategory(instance.activity.category)) throw new ServiceError("Unknown activity", 500);
  const config = JSON.parse(instance.activity.configJson) as Record<string, unknown>;
  const script = buildScript({
    category: instance.activity.category as Category,
    title: instance.activity.title,
    minutes: instance.estimatedMinutes,
    instructions: instance.activity.instructions,
    childName,
    greet,
    stepCount: instance.activity.stepCount,
    config,
    hintIndex,
  });
  return {
    category: instance.activity.category,
    script,
    childName,
    greet,
    hasNext,
    breakAfter: instance.activity.breakAfter,
    rewardStars: instance.activity.rewardStars,
    hasReferenceAudio: instance.activity.materials.some((material) => material.mimeType.startsWith("audio/")),
  };
}

function account(instance: DailyInstance, nextStatus: TaskStatus, now: Date) {
  const previous = instance.status as TaskStatus;
  let activeSeconds = instance.activeSeconds;
  let workAnchor = instance.workAnchor;
  const wasTimed = TIMED.has(previous);
  const nowTimed = TIMED.has(nextStatus);
  if (wasTimed && workAnchor && !nowTimed) {
    activeSeconds += Math.max(0, Math.floor((now.getTime() - workAnchor.getTime()) / 1000));
    workAnchor = null;
  } else if (nowTimed && !workAnchor) {
    workAnchor = now;
  }
  return { activeSeconds, workAnchor };
}

function eventPayload(action: SessionAction): string {
  switch (action.action) {
    case "child_intent":
      return JSON.stringify({ intent: action.intent });
    case "quiet_elapsed":
      return JSON.stringify({ token: action.token });
    case "parent_approve":
      return JSON.stringify({ outcome: action.outcome });
    case "parent_observation":
      return JSON.stringify({ noted: true });
    default:
      return JSON.stringify({ action: action.action });
  }
}

function toEvent(action: SessionAction | null, expired: boolean, checkIn: boolean): CoachEvent | null {
  if (expired) return { type: "session_limit" };
  if (checkIn) return { type: "check_in_due" };
  if (!action) return null;
  switch (action.action) {
    case "child_intent":
      return { type: "child_intent", intent: action.intent };
    case "quiet_elapsed":
      return { type: "quiet_elapsed", token: action.token };
    case "parent_pause":
      return { type: "parent_pause" };
    case "parent_present":
      return { type: "parent_present" };
    case "parent_approve":
      return { type: "parent_approve", outcome: action.outcome };
    case "parent_skip":
      return { type: "parent_skip" };
    case "parent_offer_again":
      return { type: "parent_offer_again" };
    case "session_tick":
    case "parent_stop":
    case "parent_validate_rewards":
    case "parent_observation":
    case "parent_exit":
      return null;
    default:
      return null;
  }
}

async function requireSession(auth: AuthToken, sessionId: string) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, parentId: auth.parentId },
    include: { child: true },
  });
  if (!session) throw new ServiceError("Session not found", 404);
  if (auth.mode === "locked") throw new ServiceError("Ask your parent", 403);
  if (auth.mode === "child" && auth.sessionId !== session.id) {
    throw new ServiceError("Ask your parent", 403);
  }
  return session;
}

function planPlaces(items: InstanceBundle[], currentId: string | null): PlanItemView[] {
  return items.filter((item) => item.included || item.status === "skipped" || isTerminal(item.status as TaskStatus)).map((item) => {
    let place: PlanItemView["place"] = "later";
    if (!item.included || item.status === "skipped") place = "skipped";
    else if (item.status === "completed" || item.status === "partial") place = "done";
    else if (item.id === currentId) place = "now";
    return {
      id: item.id,
      title: item.activity.title,
      minutes: item.estimatedMinutes,
      breakAfter: item.activity.breakAfter,
      place,
    };
  });
}

function viewFrom(
  session: Session & { child: { name: string } },
  items: InstanceBundle[],
  current: InstanceBundle | null,
  state: CoachState | null,
  now: Date,
): ChildSessionView {
  const projected = state ? projectCoach(state) : null;
  const audio = current?.activity.materials.find((material) => material.mimeType.startsWith("audio/"));
  const quiet = Boolean(state && state.phase === "quiet_work" && !state.playSilence && state.quietCheckins < 2 && session.status !== "ended");
  return {
    sessionId: session.id,
    status: session.status === "ended" ? "ended" : session.status === "paused" ? "paused" : "active",
    childName: session.child.name,
    say: session.status === "ended" ? (state?.lastSay ?? SESSION_GOODBYE) : projected?.say ?? null,
    utteranceId: state?.utteranceId ?? "u0",
    buttons: session.status === "ended" ? [] : projected?.buttons ?? [],
    dim: projected?.dim ?? false,
    listen: Boolean(projected?.listen) && !session.buttonsOnly && session.status !== "ended",
    buttonsOnly: session.buttonsOnly,
    autoOpenParent: Boolean(projected?.showParentGate) || session.status === "paused",
    parentCheckpoint: Boolean(projected?.parentCheckpoint),
    elephant: session.status === "ended" ? "done" : projected?.elephant ?? "wait",
    remainingSec: session.status === "ended" ? 0 : remainingSeconds(session.startedAt, session.limitMinutes, now),
    phase: state?.phase ?? "session_goodbye",
    taskStatus: state?.taskStatus ?? current?.status ?? "scheduled",
    quietAfterMs: quiet && current ? quietDelayMs(current.estimatedMinutes) : null,
    quietToken: quiet && state ? state.quietToken : null,
    activity: current ? {
      instanceId: current.id,
      title: current.activity.title,
      category: current.activity.category,
      minutes: current.estimatedMinutes,
      stepIndex: state?.stepIndex ?? 0,
      stepCount: current.activity.stepCount,
      referenceAudioUrl: audio ? `/api/materials/${audio.id}` : null,
      rewardNote: current.activity.rewardNote,
    } : null,
    plan: planPlaces(items, current?.id ?? null),
    pendingRewards: state?.pendingRewards ?? [],
    ended: session.status === "ended",
    presenceNote: PRESENCE_NOTE,
  };
}

async function saveInstance(instance: InstanceBundle, state: CoachState, now: Date) {
  const timing = account(instance, state.taskStatus, now);
  const started = instance.startedAt ?? (state.taskStatus !== "scheduled" && state.taskStatus !== "ready" ? now : null);
  await prisma.dailyInstance.update({
    where: { id: instance.id },
    data: {
      status: state.taskStatus,
      refusalCount: state.refusalCount,
      helpCount: state.helpRequests,
      breakCount: state.breakCount,
      activeSeconds: timing.activeSeconds,
      workAnchor: timing.workAnchor,
      coachJson: JSON.stringify(state),
      startedAt: started,
      endedAt: isTerminal(state.taskStatus) ? (instance.endedAt ?? now) : null,
    },
  });
}

async function addRewards(sessionId: string, instanceId: string, state: CoachState, previous: CoachState | null) {
  const prior = previous?.pendingRewards.length ?? 0;
  const fresh = state.pendingRewards.slice(prior);
  for (const reward of fresh) {
    await prisma.reward.create({
      data: {
        sessionId,
        instanceId,
        kind: reward.kind,
        stars: reward.stars,
        validated: false,
      },
    });
  }
}

function responseFor(
  view: ChildSessionView,
  nextMode: SessionActionResponse["nextMode"],
): SessionActionResponse {
  const redirect = nextMode === "parent"
    ? "/parent"
    : nextMode === "locked"
      ? "/locked"
      : `/child/${view.sessionId}`;
  return { view, nextMode, redirect };
}

async function closeWork(instanceId: string, now: Date) {
  const row = await prisma.dailyInstance.findUnique({ where: { id: instanceId } });
  if (!row?.workAnchor) return;
  const extra = Math.max(0, Math.floor((now.getTime() - row.workAnchor.getTime()) / 1000));
  await prisma.dailyInstance.update({
    where: { id: instanceId },
    data: { activeSeconds: row.activeSeconds + extra, workAnchor: null },
  });
}

export async function startSession(
  auth: AuthToken,
  input: { pin: string; limitMinutes: number; buttonsOnly: boolean; checkInIntervalMinutes: number; date: string },
): Promise<SessionActionResponse> {
  assertParentMode(auth);
  await requirePin(auth.parentId, input.pin);
  const parent = await prisma.parent.findUnique({ where: { id: auth.parentId }, include: { child: true } });
  if (!parent?.child) throw new ServiceError("Child profile missing", 404);
  const existing = await prisma.session.findFirst({
    where: { parentId: auth.parentId, status: { in: ["active", "paused"] } },
  });
  if (existing) throw new ServiceError("A session is already open", 409);
  await ensureDailyPlan(auth.parentId, input.date);
  const items = await dayItems(auth.parentId, input.date);
  const first = items.find((item) => item.included && isOpen(item.status));
  if (!first) throw new ServiceError("Nothing is left to start today", 400);
  const now = new Date();
  const session = await prisma.session.create({
    data: {
      parentId: auth.parentId,
      childId: parent.child.id,
      date: input.date,
      status: "active",
      limitMinutes: input.limitMinutes,
      buttonsOnly: input.buttonsOnly,
      parentPresentAt: now,
      lastCheckInAt: now,
      checkInIntervalMinutes: input.checkInIntervalMinutes,
      currentInstanceId: first.id,
      greeted: false,
    },
    include: { child: true },
  });
  const hasNext = items.some((item) => item.id !== first.id && item.included && isOpen(item.status));
  const restored = parseCoach(first.coachJson);
  const state = restored && first.status !== "scheduled"
    ? restored
    : beginActivity(
      contextFor(first, parent.child.name, !restored, hasNext, restored?.helpRequests ?? 0),
      first.status === "ready" ? "ready" : "scheduled",
    ).state;
  await saveInstance(first, state, now);
  await prisma.session.update({
    where: { id: session.id },
    data: {
      coachJson: JSON.stringify(state),
      greeted: true,
      currentInstanceId: first.id,
      status: state.phase === "session_paused_parent" ? "paused" : "active",
    },
  });
  await prisma.sessionEvent.create({
    data: { sessionId: session.id, instanceId: first.id, kind: "session_start", payload: "{}" },
  });
  const fresh = await requireSession(auth, session.id);
  const view = await buildView(fresh, now);
  return responseFor(view, "child");
}

async function buildView(session: Awaited<ReturnType<typeof requireSession>>, now: Date): Promise<ChildSessionView> {
  const items = await dayItems(session.parentId, session.date);
  const current = session.currentInstanceId ? items.find((item) => item.id === session.currentInstanceId) ?? null : null;
  const state = parseCoach(session.coachJson) ?? (current ? parseCoach(current.coachJson) : null);
  return viewFrom(session, items, current, state, now);
}

async function applyCoach(
  session: Awaited<ReturnType<typeof requireSession>>,
  event: CoachEvent,
  action: SessionAction | null,
  now: Date,
): Promise<SessionActionResponse> {
  const items = await dayItems(session.parentId, session.date);
  const current = session.currentInstanceId ? items.find((item) => item.id === session.currentInstanceId) ?? null : null;
  if (!current) throw new ServiceError("There is no current activity", 409);
  const previous = parseCoach(session.coachJson) ?? parseCoach(current.coachJson);
  if (!previous) throw new ServiceError("The activity needs to be started again by a parent", 409);
  if (event.type === "session_limit") {
    await closeWork(current.id, now);
    const goodbye: CoachState = {
      ...previous,
      phase: "session_goodbye",
      lastSay: SESSION_GOODBYE,
      promptStopped: true,
      utteranceSeq: previous.utteranceSeq + 1,
      utteranceId: `u${previous.utteranceSeq + 1}`,
    };
    await prisma.session.update({
      where: { id: session.id },
      data: { status: "ended", endedAt: now, coachJson: JSON.stringify(goodbye) },
    });
    await prisma.sessionEvent.create({
      data: { sessionId: session.id, instanceId: current.id, kind: "session_limit", payload: "{}" },
    });
    const ended = await requireSession({ parentId: session.parentId, mode: "parent", exp: Date.now() + 1000 }, session.id);
    return responseFor(await buildView(ended, now), "locked");
  }
  const hasNext = items.some((item) => item.id !== current.id && item.included && isOpen(item.status));
  const ctx = contextFor(current, session.child.name, false, hasNext, previous.helpRequests);
  const result = deterministicEngine.reduce(previous, event, ctx);
  await saveInstance(current, result.state, now);
  await addRewards(session.id, current.id, result.state, previous);
  if (action) {
    await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        instanceId: current.id,
        kind: event.type === "check_in_due" ? event.type : action.action,
        payload: action ? eventPayload(action) : JSON.stringify({ type: event.type }),
      },
    });
  } else {
    await prisma.sessionEvent.create({
      data: { sessionId: session.id, instanceId: current.id, kind: event.type, payload: "{}" },
    });
  }

  let nextMode: SessionActionResponse["nextMode"] = "child";
  let coach = result.state;
  let currentId = current.id;
  let status: string = result.state.phase === "session_paused_parent" ? "paused" : "active";

  if (result.effect.advance === "next") {
    const refreshed = await dayItems(session.parentId, session.date);
    const next = refreshed.find((item) => item.id !== current.id && item.included && isOpen(item.status));
    if (!next) {
      status = "ended";
      coach = { ...result.state, phase: "session_goodbye", lastSay: result.state.lastSay ?? SESSION_GOODBYE, promptStopped: true };
    } else {
      const nextHas = refreshed.some((item) => item.id !== next.id && item.included && isOpen(item.status) && item.id !== current.id);
      const restored = parseCoach(next.coachJson);
      if (restored && next.status !== "scheduled") {
        coach = restored;
      } else {
        const begun = beginActivity(
          contextFor(next, session.child.name, false, nextHas, 0),
          next.status === "scheduled" ? "scheduled" : next.status as TaskStatus,
        );
        coach = begun.state;
      }
      await saveInstance(next, coach, now);
      currentId = next.id;
      status = "active";
    }
  }

  if (result.effect.advance === "end_session") {
    status = "ended";
    nextMode = "locked";
  }

  await prisma.session.update({
    where: { id: session.id },
    data: {
      coachJson: JSON.stringify(coach),
      currentInstanceId: currentId,
      status,
      endedAt: status === "ended" ? now : null,
      lastCheckInAt: action && "pin" in action ? now : session.lastCheckInAt,
      parentPresentAt: action?.action === "parent_present" ? now : session.parentPresentAt,
    },
  });

  if (status === "ended") {
    nextMode = "locked";
  }

  const fresh = await requireSession(
    { parentId: session.parentId, mode: "parent", exp: Date.now() + 1000 },
    session.id,
  );
  const view = await buildView(fresh, now);
  return responseFor(view, nextMode);
}

export async function enterSession(auth: AuthToken, sessionId: string, now = new Date()): Promise<SessionActionResponse> {
  assertParentMode(auth);
  const result = await getSession(auth, sessionId, now);
  if (result.view.ended || result.nextMode === "locked") return result;
  return { ...result, nextMode: "child" };
}

export async function getSession(auth: AuthToken, sessionId: string, now = new Date()): Promise<SessionActionResponse> {
  const session = await requireSession(auth, sessionId);
  if (session.status === "ended") {
    if (auth.mode === "child") {
      throw new ServiceError("This session is finished. A parent needs to start a new one.", 403);
    }
    return responseFor(await buildView(session, now), auth.mode === "parent" ? "parent" : "locked");
  }
  if (isSessionExpired(session.startedAt, session.limitMinutes, now)) {
    return applyCoach(session, { type: "session_limit" }, null, now);
  }
  const coach = parseCoach(session.coachJson);
  const due = isCheckInDue(session.lastCheckInAt, session.checkInIntervalMinutes, now);
  if (due && coach && coach.phase !== "session_paused_parent" && coach.phase !== "parent_checkpoint" && coach.phase !== "session_goodbye") {
    return applyCoach(session, { type: "check_in_due" }, null, now);
  }
  const mode = auth.mode === "parent" ? "parent" : "child";
  return responseFor(await buildView(session, now), mode);
}

export async function actOnSession(auth: AuthToken, sessionId: string, action: SessionAction, now = new Date()): Promise<SessionActionResponse> {
  const session = await requireSession(auth, sessionId);
  if (session.status === "ended") {
    throw new ServiceError("This session is finished. A parent needs to start a new one.", 403);
  }
  if (auth.mode === "child" && action.action === "parent_exit") {
    await requirePin(auth.parentId, action.pin);
    return responseFor(await buildView(session, now), "parent");
  }
  if ("pin" in action) await requirePin(auth.parentId, action.pin);

  if (action.action === "parent_stop") {
    if (session.currentInstanceId) await closeWork(session.currentInstanceId, now);
    const coach = parseCoach(session.coachJson);
    const goodbye = coach
      ? {
        ...coach,
        phase: "session_goodbye" as const,
        lastSay: SESSION_GOODBYE,
        promptStopped: true,
        utteranceSeq: coach.utteranceSeq + 1,
        utteranceId: `u${coach.utteranceSeq + 1}`,
      }
      : null;
    await prisma.session.update({
      where: { id: session.id },
      data: { status: "ended", endedAt: now, coachJson: goodbye ? JSON.stringify(goodbye) : session.coachJson },
    });
    await prisma.sessionEvent.create({
      data: { sessionId: session.id, instanceId: session.currentInstanceId, kind: "parent_stop", payload: "{}" },
    });
    const fresh = await requireSession({ parentId: auth.parentId, mode: "parent", exp: auth.exp }, session.id);
    return responseFor(await buildView(fresh, now), "locked");
  }

  if (action.action === "parent_validate_rewards") {
    await prisma.reward.updateMany({
      where: { validated: false, session: { parentId: auth.parentId, date: session.date } },
      data: { validated: true },
    });
    await prisma.session.update({
      where: { id: session.id },
      data: { lastCheckInAt: now, parentPresentAt: now },
    });
    const fresh = await requireSession(auth, session.id);
    return responseFor(await buildView(fresh, now), "child");
  }

  if (action.action === "parent_observation") {
    await prisma.observation.create({
      data: {
        parentId: auth.parentId,
        date: session.date,
        instanceId: session.currentInstanceId,
        note: action.note,
      },
    });
    await prisma.session.update({
      where: { id: session.id },
      data: { lastCheckInAt: now, parentPresentAt: now },
    });
    const fresh = await requireSession(auth, session.id);
    return responseFor(await buildView(fresh, now), "child");
  }

  if (action.action === "parent_exit") {
    return responseFor(await buildView(session, now), "parent");
  }

  if (isSessionExpired(session.startedAt, session.limitMinutes, now)) {
    return applyCoach(session, { type: "session_limit" }, action, now);
  }

  const childLike = action.action === "child_intent" || action.action === "quiet_elapsed" || action.action === "session_tick";
  const coach = parseCoach(session.coachJson);
  const due = isCheckInDue(session.lastCheckInAt, session.checkInIntervalMinutes, now);
  if (childLike && due && coach && coach.phase !== "session_paused_parent" && coach.phase !== "parent_checkpoint") {
    return applyCoach(session, { type: "check_in_due" }, action, now);
  }
  if (action.action === "session_tick") {
    return responseFor(await buildView(session, now), "child");
  }

  const event = toEvent(action, false, false);
  if (!event) return responseFor(await buildView(session, now), "child");
  const result = await applyCoach(session, event, action, now);
  if (action.action === "parent_present" || action.action === "parent_pause") {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastCheckInAt: action.action === "parent_present" ? now : undefined,
        status: action.action === "parent_pause" && result.view.status !== "ended" ? "paused" : undefined,
      },
    });
    const fresh = await requireSession({ parentId: auth.parentId, mode: "parent", exp: auth.exp }, session.id);
    return responseFor(await buildView(fresh, now), result.nextMode);
  }
  return result;
}
