import { deactivateActivity, getActivity, updateActivity } from "@/lib/services/activities";
import { withParent } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withParent((auth) => getActivity(auth, id));
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  return withParent((auth) => updateActivity(auth, id, body));
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withParent(async (auth) => {
    await deactivateActivity(auth, id);
    return { ok: true };
  });
}
