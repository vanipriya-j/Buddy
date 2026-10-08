import { NextResponse } from "next/server";
import { clearAuth } from "@/lib/auth-server";

export async function POST() {
  await clearAuth();
  return NextResponse.json({ ok: true });
}
