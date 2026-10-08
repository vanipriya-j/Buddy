import { z } from "zod";
import { listTemplates, saveLiveAsTemplate } from "@/lib/services/templates";
import { errorResponse, withParent } from "@/lib/http";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
}).strict();

export async function GET() {
  return withParent((auth) => listTemplates(auth));
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    return await withParent((auth) => saveLiveAsTemplate(auth, body.name, body.description));
  } catch (error) {
    return errorResponse(error);
  }
}
