import { getToday } from "@/lib/services/daily-plan";
import { dateSchema } from "@/lib/validation";
import { errorResponse, withParent } from "@/lib/http";
import { todayString } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const date = dateSchema.parse(url.searchParams.get("date") ?? todayString());
    return await withParent((auth) => getToday(auth, date));
  } catch (error) {
    return errorResponse(error);
  }
}
