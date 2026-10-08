import { applyTodayAction } from "@/lib/services/daily-plan";
import { todayActionSchema } from "@/lib/validation";
import { errorResponse, withParent } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const action = todayActionSchema.parse(await request.json());
    return await withParent((auth) => applyTodayAction(auth, action));
  } catch (error) {
    return errorResponse(error);
  }
}
