import { createActivity, listActivities } from "@/lib/services/activities";
import { withParent } from "@/lib/http";

export async function GET() {
  return withParent((auth) => listActivities(auth));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return withParent((auth) => createActivity(auth, body));
}
