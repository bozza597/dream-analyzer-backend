import { protectedHandler } from "@/server/security";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";
import { NextRequest } from "next/server";

// Runs (or re-runs) the AI analyzer for a dream: interpretation, symbols, questions.
export const POST = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);
    const { id } = await params;

    const dream = await ctx.services.dreams.analyze(user.id, id);
    const counts = await ctx.adapters.db.dreams.entityCountsByUser(user.id);

    return {
      ...dream,
      entities: (dream.entities ?? []).map((e) => ({ ...e, recurrence: counts[e.key] ?? 1 })),
    };
  });
};
