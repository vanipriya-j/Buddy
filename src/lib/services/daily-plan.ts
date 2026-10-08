import type { AuthToken } from "@/lib/auth";
import { assertParentMode } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canReschedule, lightenPlan, moveInList, occursOn, parseRecurrenceDays, restorePlan } from "@/lib/recurrence";
import { assertCanTransition, type TaskStatus } from "@/lib/routine/status";
import { addDays, parseDateString } from "@/lib/utils";
import type { TodayAction } from "@/lib/validation";
import type { TodayView } from "@/lib/views";
import { ServiceError } from "@/lib/services/errors";

export async function ensureDailyPlan(parentId: string, date: string): Promise<void> {
  parseDateString(date);
  const activities = await prisma.activity.findMany({
    where: { parentId, isLive: true, active: true },
  });
  for (const activity of activities) {
    const happens = occursOn({
      active: activity.active,
      isLive: activity.isLive,
      daily: activity.daily,
      recurrenceDays: parseRecurrenceDays(activity.recurrenceDays),
      onlyDate: activity.onlyDate,
    }, date);
    if (!happens) continue;
    await prisma.dailyInstance.upsert({
      where: { activityId_date: { activityId: activity.id, date } },
      create: {
        activityId: activity.id,
        date,
        sequence: activity.sequence,
        estimatedMinutes: activity.estimatedMinutes,
        baselineMinutes: activity.estimatedMinutes,
        status: "scheduled",
      },
      update: {},
    });
  }
}

export async function getToday(auth: AuthToken, date: string): Promise<TodayView> {
  assertParentMode(auth);
  await ensureDailyPlan(auth.parentId, date);
  const parent = await prisma.parent.findUnique({
    where: { id: auth.parentId },
    include: { child: true },
  });
  if (!parent?.child) throw new ServiceError("Child profile missing", 404);
  const [items, observations, session] = await Promise.all([
    prisma.dailyInstance.findMany({
      where: { date, activity: { parentId: auth.parentId } },
      include: { activity: true },
      orderBy: { sequence: "asc" },
    }),
    prisma.observation.findMany({
      where: { parentId: auth.parentId, date },
      orderBy: { createdAt: "asc" },
    }),
    prisma.session.findFirst({
      where: { parentId: auth.parentId, date, status: { in: ["active", "paused"] } },
    }),
  ]);
  return {
    date,
    childName: parent.child.name,
    session: session ? { id: session.id, status: session.status } : null,
    observations: observations.map((note) => ({
      id: note.id,
      date: note.date,
      note: note.note,
      createdAt: note.createdAt.toISOString(),
    })),
    items: items.map((item) => ({
      id: item.id,
      activityId: item.activityId,
      title: item.activity.title,
      category: item.activity.category,
      scheduledTime: item.activity.scheduledTime,
      estimatedMinutes: item.estimatedMinutes,
      baselineMinutes: item.baselineMinutes,
      sequence: item.sequence,
      included: item.included,
      status: item.status,
      priority: item.activity.priority,
      breakAfter: item.activity.breakAfter,
      breakMinutes: item.activity.breakMinutes,
      autoSkipped: item.autoSkipped,
      helpCount: item.helpCount,
      breakCount: item.breakCount,
      refusalCount: item.refusalCount,
      activeSeconds: item.activeSeconds,
      completionCriteria: item.activity.completionCriteria,
      rewardNote: item.activity.rewardNote,
    })),
  };
}

async function ownedInstance(parentId: string, id: string, date: string) {
  const item = await prisma.dailyInstance.findFirst({
    where: { id, date, activity: { parentId } },
    include: { activity: true },
  });
  if (!item) throw new ServiceError("That activity is not on this day", 404);
  return item;
}

export async function applyTodayAction(auth: AuthToken, action: TodayAction): Promise<TodayView> {
  assertParentMode(auth);
  if (action.action === "note") {
    await prisma.observation.create({
      data: { parentId: auth.parentId, date: action.date, note: action.note },
    });
    return getToday(auth, action.date);
  }
  if (action.action === "lighten" || action.action === "restore") {
    const today = await getToday(auth, action.date);
    const patches = action.action === "lighten"
      ? lightenPlan(today.items)
      : restorePlan(today.items);
    await prisma.$transaction(patches.map((patch) => prisma.dailyInstance.update({
      where: { id: patch.id },
      data: {
        estimatedMinutes: patch.estimatedMinutes,
        included: patch.included,
        autoSkipped: patch.autoSkipped,
      },
    })));
    return getToday(auth, action.date);
  }
  if (action.action === "reorder") {
    const today = await getToday(auth, action.date);
    const ordered = moveInList(today.items.map((item) => item.id), action.id, action.direction);
    await prisma.$transaction(ordered.map((id, index) => prisma.dailyInstance.update({
      where: { id },
      data: { sequence: index + 1 },
    })));
    return getToday(auth, action.date);
  }
  if (action.action === "patch") {
    const item = await ownedInstance(auth.parentId, action.id, action.date);
    if (item.status !== "scheduled" && item.status !== "ready" && item.status !== "skipped") {
      throw new ServiceError("This activity has already started", 409);
    }
    const data: { estimatedMinutes?: number; included?: boolean; autoSkipped?: boolean; status?: string } = {};
    if (action.estimatedMinutes) data.estimatedMinutes = action.estimatedMinutes;
    if (typeof action.included === "boolean") {
      data.included = action.included;
      data.autoSkipped = false;
      if (!action.included && item.status === "ready") {
        assertCanTransition(item.status as TaskStatus, "skipped", "parent");
        data.status = "skipped";
      }
      if (action.included && item.status === "skipped") {
        assertCanTransition("skipped", "scheduled", "parent");
        data.status = "scheduled";
      }
    }
    await prisma.dailyInstance.update({ where: { id: item.id }, data });
    return getToday(auth, action.date);
  }
  const item = await ownedInstance(auth.parentId, action.id, action.date);
  if (!canReschedule(item.status)) {
    throw new ServiceError("Started activities stay on today. You can skip them instead.", 409);
  }
  if (action.toDate === action.date) return getToday(auth, action.date);
  const open = await prisma.session.findFirst({
    where: { parentId: auth.parentId, status: { in: ["active", "paused"] }, currentInstanceId: item.id },
  });
  if (open) throw new ServiceError("Pause and leave this activity before moving it", 409);
  const clash = await prisma.dailyInstance.findUnique({
    where: { activityId_date: { activityId: item.activityId, date: action.toDate } },
  });
  if (clash) throw new ServiceError("That activity is already on the other day", 409);
  if (item.status === "ready") assertCanTransition("ready", "scheduled", "parent");
  const last = await prisma.dailyInstance.findFirst({
    where: { date: action.toDate, activity: { parentId: auth.parentId } },
    orderBy: { sequence: "desc" },
  });
  await prisma.dailyInstance.update({
    where: { id: item.id },
    data: {
      date: action.toDate,
      sequence: (last?.sequence ?? 0) + 1,
      status: "scheduled",
      coachJson: "",
      workAnchor: null,
    },
  });
  await ensureDailyPlan(auth.parentId, action.date);
  return getToday(auth, action.date);
}

export function tomorrow(date: string): string {
  return addDays(date, 1);
}
