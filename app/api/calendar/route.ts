import { protectedHandler } from "@/server/security";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";
import { NextRequest } from "next/server";

// Returns the dream occurrences for a given month, grouped by day, for the calendar view.
export const GET = async (req: NextRequest) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);

    // month=YYYY-MM (defaults to the current month).
    const monthParam = req.nextUrl.searchParams.get("month");
    const now = new Date();
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth();

    if (monthParam) {
      const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
      if (!match) throw new ApplicationError("Parametro 'month' non valido (YYYY-MM)", ErrorCode.BAD_REQUEST);
      year = Number(match[1]);
      month = Number(match[2]) - 1;
    }

    const from = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));

    const days = await ctx.services.dreams.getCalendar(user.id, { from, to });
    return { month: `${year}-${String(month + 1).padStart(2, "0")}`, days };
  });
};
