import { randomBytes } from "crypto";
import fs from "fs/promises";
import type { AuthToken } from "@/lib/auth";
import { assertParentMode } from "@/lib/auth";
import { isCategory } from "@/lib/categories";
import { prisma } from "@/lib/db";
import { moveInList, parseRecurrenceDays } from "@/lib/recurrence";
import { ensureUploadDir, safeUploadPath } from "@/lib/uploads";
import { ALLOWED_MATERIAL_TYPES, MAX_MATERIAL_BYTES, materialKindFor, parseActivityInput, type ActivityInput } from "@/lib/validation";
import type { ActivityView } from "@/lib/views";
import { ServiceError } from "@/lib/services/errors";

type ActivityRow = Awaited<ReturnType<typeof loadOwned>>;

function toView(activity: ActivityRow): ActivityView {
  return {
    id: activity.id,
    title: activity.title,
    instructions: activity.instructions,
    category: activity.category,
    sequence: activity.sequence,
    scheduledTime: activity.scheduledTime,
    estimatedMinutes: activity.estimatedMinutes,
    daily: activity.daily,
    recurrenceDays: parseRecurrenceDays(activity.recurrenceDays),
    priority: activity.priority,
    stepCount: activity.stepCount,
    breakAfter: activity.breakAfter,
    breakMinutes: activity.breakMinutes,
    rewardStars: activity.rewardStars,
    rewardNote: activity.rewardNote,
    completionCriteria: activity.completionCriteria,
    learningNotes: activity.learningNotes,
    onlyDate: activity.onlyDate,
    config: JSON.parse(activity.configJson) as Record<string, unknown>,
    materials: activity.materials.map((material) => ({
      id: material.id,
      filename: material.filename,
      mimeType: material.mimeType,
      kind: material.kind,
    })),
  };
}

async function loadOwned(parentId: string, id: string) {
  const activity = await prisma.activity.findFirst({
    where: { id, parentId, isLive: true },
    include: { materials: { orderBy: { createdAt: "asc" } } },
  });
  if (!activity) throw new ServiceError("Activity not found", 404);
  return activity;
}

function dataFromInput(parentId: string, input: ActivityInput, sequence: number) {
  if (!isCategory(input.category)) throw new ServiceError("Unknown category", 400);
  return {
    parentId,
    isLive: true,
    active: true,
    title: input.title,
    instructions: input.instructions,
    category: input.category,
    sequence,
    scheduledTime: input.scheduledTime ?? null,
    estimatedMinutes: input.estimatedMinutes,
    daily: input.daily,
    recurrenceDays: JSON.stringify(input.daily ? [] : input.recurrenceDays),
    priority: input.priority,
    stepCount: input.stepCount,
    breakAfter: input.breakAfter,
    breakMinutes: input.breakMinutes,
    rewardStars: input.rewardStars,
    rewardNote: input.rewardNote,
    completionCriteria: input.completionCriteria,
    learningNotes: input.learningNotes,
    onlyDate: input.onlyDate ?? null,
    configJson: JSON.stringify(input.config),
  };
}

export async function listActivities(auth: AuthToken): Promise<ActivityView[]> {
  assertParentMode(auth);
  const rows = await prisma.activity.findMany({
    where: { parentId: auth.parentId, isLive: true, active: true },
    include: { materials: { orderBy: { createdAt: "asc" } } },
    orderBy: { sequence: "asc" },
  });
  return rows.map(toView);
}

export async function getActivity(auth: AuthToken, id: string): Promise<ActivityView> {
  assertParentMode(auth);
  return toView(await loadOwned(auth.parentId, id));
}

export async function createActivity(auth: AuthToken, input: unknown): Promise<ActivityView> {
  assertParentMode(auth);
  const parsed = parseActivityInput(input);
  const last = await prisma.activity.findFirst({
    where: { parentId: auth.parentId, isLive: true, active: true },
    orderBy: { sequence: "desc" },
  });
  const sequence = parsed.sequence ?? (last ? last.sequence + 1 : 1);
  const created = await prisma.activity.create({
    data: dataFromInput(auth.parentId, parsed, sequence),
    include: { materials: true },
  });
  return toView(created);
}

export async function updateActivity(auth: AuthToken, id: string, input: unknown): Promise<ActivityView> {
  assertParentMode(auth);
  const existing = await loadOwned(auth.parentId, id);
  const parsed = parseActivityInput(input);
  const updated = await prisma.activity.update({
    where: { id: existing.id },
    data: dataFromInput(auth.parentId, parsed, parsed.sequence ?? existing.sequence),
    include: { materials: { orderBy: { createdAt: "asc" } } },
  });
  return toView(updated);
}

export async function deactivateActivity(auth: AuthToken, id: string): Promise<void> {
  assertParentMode(auth);
  const existing = await loadOwned(auth.parentId, id);
  await prisma.activity.update({ where: { id: existing.id }, data: { active: false } });
}

export async function reorderActivities(auth: AuthToken, id: string, direction: "up" | "down"): Promise<void> {
  assertParentMode(auth);
  const rows = await prisma.activity.findMany({
    where: { parentId: auth.parentId, isLive: true, active: true },
    orderBy: { sequence: "asc" },
  });
  const next = moveInList(rows.map((row) => row.id), id, direction);
  await prisma.$transaction(next.map((activityId, index) => prisma.activity.update({
    where: { id: activityId },
    data: { sequence: index + 1 },
  })));
}

export async function saveMaterial(
  auth: AuthToken,
  activityId: string,
  file: { name: string; type: string; size: number; bytes: Buffer },
  requestedKind?: string,
): Promise<ActivityView> {
  assertParentMode(auth);
  const activity = await loadOwned(auth.parentId, activityId);
  if (!ALLOWED_MATERIAL_TYPES.includes(file.type as (typeof ALLOWED_MATERIAL_TYPES)[number])) {
    throw new ServiceError("That file type is not allowed", 400);
  }
  if (file.size <= 0 || file.size > MAX_MATERIAL_BYTES) {
    throw new ServiceError("Files need to be under 8 MB", 400);
  }
  const storageKey = randomBytes(16).toString("hex");
  await ensureUploadDir();
  await fs.writeFile(safeUploadPath(storageKey), file.bytes);
  await prisma.material.create({
    data: {
      activityId: activity.id,
      filename: file.name.replace(/[^\w.\- ()]+/g, "").slice(0, 120) || "material",
      mimeType: file.type,
      kind: materialKindFor(file.type, requestedKind),
      storageKey,
    },
  });
  return getActivity(auth, activity.id);
}

export async function deleteMaterial(auth: AuthToken, materialId: string): Promise<void> {
  assertParentMode(auth);
  const material = await prisma.material.findFirst({
    where: { id: materialId, activity: { parentId: auth.parentId } },
  });
  if (!material) throw new ServiceError("Material not found", 404);
  await prisma.material.delete({ where: { id: material.id } });
  const stillUsed = await prisma.material.count({ where: { storageKey: material.storageKey } });
  if (stillUsed === 0) {
    await fs.unlink(safeUploadPath(material.storageKey)).catch(() => undefined);
  }
}

export async function readMaterial(auth: AuthToken, materialId: string) {
  const material = await prisma.material.findFirst({
    where: { id: materialId },
    include: { activity: true },
  });
  if (!material || material.activity.parentId !== auth.parentId) {
    throw new ServiceError("Material not found", 404);
  }
  if (auth.mode === "parent") return material;
  if (auth.mode !== "child" || !auth.sessionId) throw new ServiceError("Ask your parent", 403);
  const session = await prisma.session.findFirst({
    where: { id: auth.sessionId, parentId: auth.parentId, status: { in: ["active", "paused"] } },
  });
  if (!session) throw new ServiceError("Ask your parent", 403);
  const onPlan = await prisma.dailyInstance.findFirst({
    where: { activityId: material.activityId, date: session.date },
  });
  if (!onPlan) throw new ServiceError("Ask your parent", 403);
  return material;
}
