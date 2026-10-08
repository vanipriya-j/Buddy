import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { AuthToken } from "@/lib/auth";
import { readAuth, writeMode } from "@/lib/auth-server";
import { ServiceError } from "@/lib/services/errors";
import type { SessionActionResponse } from "@/lib/views";

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Check the form and try again" }, { status: 400 });
  }
  if (error instanceof Error && error.message === "Parent screen only") {
    return NextResponse.json({ error: "Parent screen only" }, { status: 403 });
  }
  console.error(error instanceof Error ? error.message : "request failed");
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function withParent(work: (auth: AuthToken) => Promise<unknown>): Promise<NextResponse> {
  try {
    const auth = await readAuth();
    if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (auth.mode !== "parent") return NextResponse.json({ error: "Parent screen only" }, { status: 403 });
    return NextResponse.json(await work(auth));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function withSession(
  work: (auth: AuthToken) => Promise<SessionActionResponse>,
): Promise<NextResponse> {
  try {
    const auth = await readAuth();
    if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const result = await work(auth);
    await writeMode(auth.parentId, result.nextMode, result.view.sessionId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
