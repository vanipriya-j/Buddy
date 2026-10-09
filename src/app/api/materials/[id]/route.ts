import { NextResponse } from "next/server";
import { readAuth } from "@/lib/auth-server";
import { errorResponse } from "@/lib/http";
import { deleteMaterial, readMaterial } from "@/lib/services/activities";
import { getObject } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await readAuth();
    if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { id } = await context.params;
    const material = await readMaterial(auth, id);
    const bytes = await getObject(material.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": material.mimeType,
        "content-disposition": `inline; filename="${material.filename.replace(/"/g, "")}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await readAuth();
    if (!auth || auth.mode !== "parent") {
      return NextResponse.json({ error: "Parent screen only" }, { status: 403 });
    }
    const { id } = await context.params;
    await deleteMaterial(auth, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
