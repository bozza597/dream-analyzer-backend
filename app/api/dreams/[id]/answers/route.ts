import { protectedHandler } from "@/server/security";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";
import { NextRequest } from "next/server";

// Submits answers to the analyzer's follow-up questions and re-runs the analysis.
export const POST = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);
    const { id } = await params;

    const body = await req.json();
    const rawAnswers = Array.isArray(body?.answers) ? body.answers : [];
    const answers = rawAnswers
      .filter((a: unknown): a is { questionId: string; answer: string } =>
        !!a && typeof (a as { questionId?: unknown }).questionId === "string" &&
        typeof (a as { answer?: unknown }).answer === "string"
      )
      .map((a: { questionId: string; answer: string }) => ({ questionId: a.questionId, answer: a.answer }));

    if (answers.length === 0) {
      throw new ApplicationError("Nessuna risposta fornita", ErrorCode.BAD_REQUEST);
    }

    const dream = await ctx.services.dreams.answerAndRefine(user.id, id, answers);
    const counts = await ctx.adapters.db.dreams.entityCountsByUser(user.id);

    return {
      ...dream,
      entities: (dream.entities ?? []).map((e) => ({ ...e, recurrence: counts[e.key] ?? 1 })),
    };
  });
};
