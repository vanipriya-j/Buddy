import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);

export type SessionMode = "parent" | "child" | "locked";

export interface AuthToken {
  parentId: string;
  mode: SessionMode;
  sessionId?: string;
  exp: number;
}

const PIN_PATTERN = /^\d{4,6}$/;

export function assertPinFormat(pin: string): void {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error("PIN must be 4 to 6 digits");
  }
}

export async function hashPin(pin: string): Promise<string> {
  assertPinFormat(pin);
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(pin, salt, 32)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (!PIN_PATTERN.test(pin)) return false;
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = (await scrypt(pin, salt, 32)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signToken(token: AuthToken, secret: string, now = Date.now()): string {
  const body: AuthToken = { ...token, exp: token.exp ?? now + 1000 * 60 * 60 * 12 };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(value: string, secret: string, now = Date.now()): AuthToken | null {
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthToken;
    if (!parsed.parentId || !parsed.mode || typeof parsed.exp !== "number") return null;
    if (parsed.exp < now) return null;
    if (!["parent", "child", "locked"].includes(parsed.mode)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface PinAttempt {
  at: number;
}

export function recentFailures(attempts: PinAttempt[], now: number, windowMs = 10 * 60 * 1000): PinAttempt[] {
  return attempts.filter((attempt) => now - attempt.at < windowMs);
}

export function pinAttemptAllowed(attempts: PinAttempt[], now: number, limit = 5): boolean {
  return recentFailures(attempts, now).length < limit;
}

export function parentToken(parentId: string, now = Date.now()): AuthToken {
  return { parentId, mode: "parent", exp: now + 12 * 60 * 60 * 1000 };
}

export function childToken(parentId: string, sessionId: string, now = Date.now()): AuthToken {
  return { parentId, mode: "child", sessionId, exp: now + 12 * 60 * 60 * 1000 };
}

export function lockedToken(parentId: string, now = Date.now()): AuthToken {
  return { parentId, mode: "locked", exp: now + 12 * 60 * 60 * 1000 };
}

export function assertParentMode(auth: AuthToken | null): asserts auth is AuthToken & { mode: "parent" } {
  if (!auth || auth.mode !== "parent") {
    throw new Error("Parent screen only");
  }
}

export function canRestartEndedSession(): boolean {
  return false;
}

export function childMayOpenSession(auth: AuthToken, session: { id: string; status: string }): boolean {
  if (auth.mode !== "child") return false;
  if (auth.sessionId !== session.id) return false;
  return session.status === "active" || session.status === "paused";
}
