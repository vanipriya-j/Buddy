import type { AuthToken } from "@/lib/auth";
import { assertParentMode } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { summarizeWeek, type ProgressDay } from "@/lib/progress";
import { addDays } from "@/lib/utils";
import { totalValidatedStars, type RewardRecord, type RewardKind } from "@/lib/rewards";
import { ServiceError } from "@/lib/services/errors";
import { ensureDailyPlan } from "@/lib/services/daily-plan";

export async function getProgress(auth: AuthToken, weekStart: string) {
  assertParentMode(auth);
  const parent = await prisma.parent.findUnique({ where: { id: auth.parentId }, include: { child: true } });
  if (!parent?.child) throw new ServiceError("Child profile missing", 404);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const days: ProgressDay[] = [];
  for (const date of dates) {
    await ensureDailyPlan(auth.parentId, date);
    const [items, observations] = await Promise.all([
      prisma.dailyInstance.findMany({
        where: { date, activity: { parentId: auth.parentId } },
        include: { activity: true },
      }),
      prisma.observation.findMany({ where: { parentId: auth.parentId, date } }),
    ]);
    days.push({
      date,
      observations: observations.map((note) => note.note),
      activities: items.map((item) => ({
        title: item.activity.title,
        category: item.activity.category,
        status: item.status,
        included: item.included,
        activeSeconds: item.activeSeconds,
        helpCount: item.helpCount,
        breakCount: item.breakCount,
        refusalCount: item.refusalCount,
      })),
    });
  }
  const rewards = await prisma.reward.findMany({
    where: { session: { parentId: auth.parentId, date: { gte: dates[0], lte: dates[6] } } },
  });
  const records: RewardRecord[] = rewards.map((reward) => ({
    kind: reward.kind as RewardKind,
    stars: reward.stars,
    validated: reward.validated,
  }));
  return {
    weekStart,
    childName: parent.child.name,
    summary: summarizeWeek(days, parent.child.name),
    starsValidated: totalValidatedStars(records),
    starsWaiting: records.filter((reward) => !reward.validated).reduce((sum, reward) => sum + reward.stars, 0),
    observations: days.flatMap((day) => day.observations.map((note) => ({ date: day.date, note }))),
  };
}
