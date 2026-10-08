import { saveMaterial } from "@/lib/services/activities";
import { errorResponse, withParent } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Choose a file" }, { status: 400 });
    }
    const kind = typeof form.get("kind") === "string" ? String(form.get("kind")) : undefined;
    const bytes = Buffer.from(await file.arrayBuffer());
    return await withParent((auth) => saveMaterial(auth, id, {
      name: file.name,
      type: file.type,
      size: file.size,
      bytes,
    }, kind));
  } catch (error) {
    return errorResponse(error);
  }
}
