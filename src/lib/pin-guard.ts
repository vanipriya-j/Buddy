import { pinAttemptAllowed, recentFailures, type PinAttempt } from "@/lib/auth";
import { ServiceError } from "@/lib/services/errors";

const buckets = new Map<string, PinAttempt[]>();

export function resetPinAttempts(): void {
  buckets.clear();
}

export function recordPinFailure(key: string, now = Date.now()): void {
  const next = recentFailures(buckets.get(key) ?? [], now);
  next.push({ at: now });
  buckets.set(key, next);
}

export function clearPinFailures(key: string): void {
  buckets.delete(key);
}

export function assertPinAttempts(key: string, now = Date.now()): void {
  const attempts = buckets.get(key) ?? [];
  if (!pinAttemptAllowed(attempts, now)) {
    throw new ServiceError("Too many PIN attempts. Wait a few minutes.", 429);
  }
}
