import { startSession } from "@/lib/services/sessions";
import { startSessionSchema } from "@/lib/validation";
import { errorResponse, withSession } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = startSessionSchema.parse(await request.json());
    return await withSession((auth) => startSession(auth, body));
  } catch (error) {
    return errorResponse(error);
  }
}
