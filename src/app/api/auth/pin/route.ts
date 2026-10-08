import { z } from "zod";
import { hashPin, verifyPin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { errorResponse, withParent } from "@/lib/http";
import { assertPinAttempts, clearPinFailures, recordPinFailure } from "@/lib/pin-guard";
import { ServiceError } from "@/lib/services/errors";

const bodySchema = z.object({
  currentPin: z.string().regex(/^\d{4,6}$/),
  nextPin: z.string().regex(/^\d{4,6}$/),
}).strict();

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    return await withParent(async (auth) => {
      assertPinAttempts(`pin:${auth.parentId}`);
      const parent = await prisma.parent.findUnique({ where: { id: auth.parentId } });
      if (!parent) throw new ServiceError("Sign in required", 401);
      const ok = await verifyPin(body.currentPin, parent.pinHash);
      if (!ok) {
        recordPinFailure(`pin:${auth.parentId}`);
        throw new ServiceError("That PIN didn't match", 401);
      }
      clearPinFailures(`pin:${auth.parentId}`);
      await prisma.parent.update({
        where: { id: parent.id },
        data: { pinHash: await hashPin(body.nextPin) },
      });
      return { ok: true };
    });
  } catch (error) {
    return errorResponse(error);
  }
}
