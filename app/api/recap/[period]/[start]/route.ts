import { protectedHandler } from "@/server/security";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";
import { NextRequest } from "next/server";

// Returns the saved recap for a finished period, generating + persisting it on
// first access. Refuses to generate for the current/unfinished period.
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ period: string; start: string }> }
) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);

    const { period, start } = await params;
    if (period !== "week" && period !== "month") {
      throw new ApplicationError("Periodo non valido", ErrorCode.BAD_REQUEST);
    }

    return ctx.services.recaps.getEntry(user.id, period, start);
  });
};
