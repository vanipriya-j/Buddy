import { z } from "zod";
import { reorderActivities } from "@/lib/services/activities";
import { errorResponse, withParent } from "@/lib/http";

const bodySchema = z.object({
  id: z.string().min(1),
  direction: z.enum(["up", "down"]),
}).strict();

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    return await withParent(async (auth) => {
      await reorderActivities(auth, body.id, body.direction);
      return { ok: true };
    });
  } catch (error) {
    return errorResponse(error);
  }
}
