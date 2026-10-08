import { enterSession } from "@/lib/services/sessions";
import { withSession } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withSession((auth) => enterSession(auth, id));
}