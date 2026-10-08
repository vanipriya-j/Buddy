import { NextResponse } from "next/server";
import { readAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export async function GET() {
  const auth = await readAuth();
  if (!auth || auth.mode === "locked") {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const parent = await prisma.parent.findUnique({
    where: { id: auth.parentId },
    include: { child: true },
  });
  if (!parent) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({
    mode: auth.mode,
    sessionId: auth.sessionId ?? null,
    parentName: parent.name,
    childName: parent.child?.name ?? "",
  });
}
