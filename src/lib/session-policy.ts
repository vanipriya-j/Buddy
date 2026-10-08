export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 40;
export const DEFAULT_SESSION_MINUTES = 20;
export const DEFAULT_CHECKIN_MINUTES = 10;

export function isSessionExpired(startedAt: Date, limitMinutes: number, now: Date): boolean {
  return now.getTime() >= startedAt.getTime() + limitMinutes * 60_000;
}

export function remainingSeconds(startedAt: Date, limitMinutes: number, now: Date): number {
  const end = startedAt.getTime() + limitMinutes * 60_000;
  return Math.max(0, Math.ceil((end - now.getTime()) / 1000));
}

export function isCheckInDue(lastCheckInAt: Date, intervalMinutes: number, now: Date): boolean {
  return now.getTime() >= lastCheckInAt.getTime() + intervalMinutes * 60_000;
}

export function quietDelayMs(estimatedMinutes: number): number {
  const half = (estimatedMinutes * 60_000) / 2;
  return Math.min(Math.max(half, 3 * 60_000), 8 * 60_000);
}

export const PRODUCT_LIMITS = {
  continuousMicrophone: false,
  entertainmentFeed: false,
  leaderboard: false,
  streakPressure: false,
  freeChat: false,
  storesChildTranscripts: false,
  storesRawAudio: false,
  childCanStartSession: false,
  childCanRestartEndedSession: false,
} as const;
