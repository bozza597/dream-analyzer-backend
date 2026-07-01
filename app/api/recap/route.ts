import { protectedHandler } from "@/server/security";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";
import { NextRequest } from "next/server";

// Overview: the current (in-progress) period + the list of finished periods that
// have dreams. Listing does NOT generate any recap.
export const GET = async (req: NextRequest) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);

    const periodParam = req.nextUrl.searchParams.get("period");
    const period = periodParam === "month" ? "month" : "week";

    return ctx.services.recaps.getOverview(user.id, period);
  });
};
