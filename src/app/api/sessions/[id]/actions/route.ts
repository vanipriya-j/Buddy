import { actOnSession } from "@/lib/services/sessions";
import { sessionActionSchema } from "@/lib/validation";
import { errorResponse, withSession } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const action = sessionActionSchema.parse(await request.json());
    return await withSession((auth) => actOnSession(auth, id, action));
  } catch (error) {
    return errorResponse(error);
  }
}
