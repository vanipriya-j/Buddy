import { cookies } from "next/headers";
import { childToken, lockedToken, parentToken, signToken, verifyToken, type AuthToken } from "@/lib/auth";

export const SESSION_COOKIE = "buddy_session";

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET must be at least 16 characters");
  }
  return value;
}

export async function readAuth(): Promise<AuthToken | null> {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  return verifyToken(value, secret());
}

export async function writeAuth(token: AuthToken): Promise<void> {
  const jar = await cookies();
  const signed = signToken(token, secret());
  jar.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(60, Math.floor((token.exp - Date.now()) / 1000)),
  });
}

export async function clearAuth(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function writeMode(parentId: string, mode: "parent" | "child" | "locked", sessionId?: string): Promise<void> {
  if (mode === "child" && sessionId) await writeAuth(childToken(parentId, sessionId));
  else if (mode === "locked") await writeAuth(lockedToken(parentId));
  else await writeAuth(parentToken(parentId));
}
