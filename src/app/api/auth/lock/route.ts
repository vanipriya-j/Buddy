import { NextResponse } from "next/server";
import { lockedToken } from "@/lib/auth";
import { readAuth, writeAuth } from "@/lib/auth-server";

export async function POST() {
  const auth = await readAuth();
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await writeAuth(lockedToken(auth.parentId));
  return NextResponse.json({ ok: true });
}
