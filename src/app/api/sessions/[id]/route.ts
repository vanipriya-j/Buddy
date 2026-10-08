import { getSession } from "@/lib/services/sessions";
import { withSession } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withSession((auth) => getSession(auth, id));
}
