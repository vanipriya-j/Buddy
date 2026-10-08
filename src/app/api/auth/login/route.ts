import { NextResponse } from "next/server";
import { z } from "zod";
import { parentToken, verifyPin } from "@/lib/auth";
import { writeAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { assertPinAttempts, clearPinFailures, recordPinFailure } from "@/lib/pin-guard";

const bodySchema = z.object({ pin: z.string().regex(/^\d{4,6}$/) }).strict();

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const parent = await prisma.parent.findFirst({ include: { child: true } });
    if (!parent) return NextResponse.json({ error: "Buddy is not set up yet" }, { status: 500 });
    assertPinAttempts(`pin:${parent.id}`);
    const ok = await verifyPin(body.pin, parent.pinHash);
    if (!ok) {
      recordPinFailure(`pin:${parent.id}`);
      return NextResponse.json({ error: "That PIN didn't match" }, { status: 401 });
    }
    clearPinFailures(`pin:${parent.id}`);
    await writeAuth(parentToken(parent.id));
    return NextResponse.json({ ok: true, childName: parent.child?.name ?? "" });
  } catch (error) {
    return errorResponse(error);
  }
}
