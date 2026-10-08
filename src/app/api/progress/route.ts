import { getProgress } from "@/lib/services/progress-report";
import { dateSchema } from "@/lib/validation";
import { errorResponse, withParent } from "@/lib/http";
import { startOfWeek, todayString } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const date = dateSchema.parse(url.searchParams.get("date") ?? todayString());
    const weekStart = startOfWeek(date);
    return await withParent((auth) => getProgress(auth, weekStart));
  } catch (error) {
    return errorResponse(error);
  }
}
