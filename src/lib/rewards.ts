export const REWARD_KINDS = ["trying", "starting", "step", "help", "return", "completion"] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

export interface RewardRecord {
  kind: RewardKind;
  stars: number;
  validated: boolean;
}

export const REWARD_LABELS: Record<RewardKind, string> = {
  trying: "Trying",
  starting: "Starting",
  step: "A step",
  help: "Asking for help",
  return: "Coming back",
  completion: "Finishing the activity",
};

export function validatePending(rewards: RewardRecord[]): RewardRecord[] {
  return rewards.map((reward) => ({
    kind: reward.kind,
    stars: Math.max(0, reward.stars),
    validated: true,
  }));
}

export function totalValidatedStars(rewards: RewardRecord[]): number {
  return rewards.reduce((sum, reward) => sum + (reward.validated ? Math.max(0, reward.stars) : 0), 0);
}
