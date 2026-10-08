import { z } from "zod";
import { applyTemplate } from "@/lib/services/templates";
import { dateSchema } from "@/lib/validation";
import { errorResponse, withParent } from "@/lib/http";

const bodySchema = z.object({
  action: z.literal("apply"),
  date: dateSchema,
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    return await withParent(async (auth) => {
      await applyTemplate(auth, id, body.date);
      return { ok: true };
    });
  } catch (error) {
    return errorResponse(error);
  }
}
