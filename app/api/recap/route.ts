import { protectedHandler } from "@/server/security";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";
import { NextRequest } from "next/server";

export const GET = async (req: NextRequest) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);

    const periodParam = req.nextUrl.searchParams.get("period");
    const period = periodParam === "month" ? "month" : "week";

    const refParam = req.nextUrl.searchParams.get("reference");
    const reference = refParam ? new Date(refParam) : new Date();
    if (isNaN(reference.getTime())) {
      throw new ApplicationError("Data di riferimento non valida", ErrorCode.BAD_REQUEST);
    }

    return ctx.services.dreams.getRecap(user.id, period, reference);
  });
};
