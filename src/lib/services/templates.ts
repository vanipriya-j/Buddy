import { randomBytes } from "crypto";
import type { AuthToken } from "@/lib/auth";
import { assertParentMode } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseRecurrenceDays } from "@/lib/recurrence";
import { copyObject } from "@/lib/storage";
import type { TemplateView } from "@/lib/views";
import { ServiceError } from "@/lib/services/errors";
import { ensureDailyPlan } from "@/lib/services/daily-plan";

export async function listTemplates(auth: AuthToken): Promise<TemplateView[]> {
  assertParentMode(auth);
  const rows = await prisma.weeklyTemplate.findMany({
    where: { parentId: auth.parentId },
    include: { activities: { where: { active: true }, orderBy: { sequence: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    activities: row.activities.map((activity) => ({
      title: activity.title,
      category: activity.category,
      estimatedMinutes: activity.estimatedMinutes,
      daily: activity.daily,
      recurrenceDays: parseRecurrenceDays(activity.recurrenceDays),
    })),
  }));
}

export async function saveLiveAsTemplate(auth: AuthToken, name: string, description = ""): Promise<TemplateView> {
  assertParentMode(auth);
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) throw new ServiceError("Give the template a short name", 400);
  const live = await prisma.activity.findMany({
    where: { parentId: auth.parentId, isLive: true, active: true },
    include: { materials: true },
    orderBy: { sequence: "asc" },
  });
  if (live.length === 0) throw new ServiceError("Add some activities before saving a template", 400);
  const template = await prisma.weeklyTemplate.create({
    data: { parentId: auth.parentId, name: trimmed, description: description.trim() },
  });
  for (const activity of live) {
    await copyActivity(activity, { parentId: auth.parentId, templateId: template.id, isLive: false });
  }
  const views = await listTemplates(auth);
  const created = views.find((view) => view.id === template.id);
  if (!created) throw new ServiceError("Template was not saved", 500);
  return created;
}

export async function applyTemplate(auth: AuthToken, templateId: string, date: string): Promise<void> {
  assertParentMode(auth);
  const template = await prisma.weeklyTemplate.findFirst({
    where: { id: templateId, parentId: auth.parentId },
    include: { activities: { where: { active: true }, include: { materials: true }, orderBy: { sequence: "asc" } } },
  });
  if (!template) throw new ServiceError("Template not found", 404);
  if (template.activities.length === 0) throw new ServiceError("That template is empty", 400);
  const open = await prisma.session.findFirst({
    where: { parentId: auth.parentId, status: { in: ["active", "paused"] } },
  });
  if (open) throw new ServiceError("End the open session before changing the weekly template", 409);

  await prisma.dailyInstance.deleteMany({
    where: {
      date,
      status: "scheduled",
      activity: { parentId: auth.parentId, isLive: true },
    },
  });
  await prisma.activity.updateMany({
    where: { parentId: auth.parentId, isLive: true, active: true },
    data: { active: false },
  });
  for (const activity of template.activities) {
    await copyActivity(activity, { parentId: auth.parentId, templateId: null, isLive: true });
  }
  await ensureDailyPlan(auth.parentId, date);
}

async function copyActivity(
  activity: {
    title: string;
    instructions: string;
    category: string;
    sequence: number;
    scheduledTime: string | null;
    estimatedMinutes: number;
    daily: boolean;
    recurrenceDays: string;
    priority: string;
    stepCount: number;
    breakAfter: boolean;
    breakMinutes: number;
    rewardStars: number;
    rewardNote: string;
    completionCriteria: string;
    learningNotes: string;
    configJson: string;
    onlyDate: string | null;
    materials: Array<{ filename: string; mimeType: string; kind: string; storageKey: string }>;
  },
  target: { parentId: string; templateId: string | null; isLive: boolean },
) {
  const created = await prisma.activity.create({
    data: {
      parentId: target.parentId,
      templateId: target.templateId,
      isLive: target.isLive,
      active: true,
      title: activity.title,
      instructions: activity.instructions,
      category: activity.category,
      sequence: activity.sequence,
      scheduledTime: activity.scheduledTime,
      estimatedMinutes: activity.estimatedMinutes,
      daily: activity.daily,
      recurrenceDays: activity.recurrenceDays,
      priority: activity.priority,
      stepCount: activity.stepCount,
      breakAfter: activity.breakAfter,
      breakMinutes: activity.breakMinutes,
      rewardStars: activity.rewardStars,
      rewardNote: activity.rewardNote,
      completionCriteria: activity.completionCriteria,
      learningNotes: activity.learningNotes,
      configJson: activity.configJson,
      onlyDate: activity.onlyDate,
    },
  });
  for (const material of activity.materials) {
    const storageKey = randomBytes(16).toString("hex");
    const copied = await copyObject(material.storageKey, storageKey, material.mimeType);
    if (!copied) continue;
    await prisma.material.create({
      data: {
        activityId: created.id,
        filename: material.filename,
        mimeType: material.mimeType,
        kind: material.kind,
        storageKey,
      },
    });
  }
  return created;
}
