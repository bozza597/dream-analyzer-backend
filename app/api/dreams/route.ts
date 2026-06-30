import { DreamType } from "@/generated/prisma/enums";
import { protectedHandler } from "@/server/security";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";
import { NextRequest } from "next/server";

const parseType = (value: unknown): DreamType | undefined => {
  if (typeof value !== "string") return undefined;
  const upper = value.toUpperCase();
  return upper in DreamType ? (upper as DreamType) : undefined;
};

const parseDate = (value: unknown): Date | undefined => {
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
};

export const GET = async (req: NextRequest) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);

    const from = parseDate(req.nextUrl.searchParams.get("from"));
    const to = parseDate(req.nextUrl.searchParams.get("to"));
    const range = from || to ? { from, to } : undefined;

    const dreams = await ctx.services.dreams.list(user.id, range);
    return { dreams };
  });
};

export const POST = async (req: NextRequest) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);

    const body = await req.json();
    const { content, title, type, emotions, vividness, occurredAt, analyze } = body;

    const dream = await ctx.services.dreams.create(user.id, {
      content,
      title,
      type: parseType(type),
      emotions: Array.isArray(emotions) ? emotions.map(String) : undefined,
      vividness: typeof vividness === "number" ? vividness : undefined,
      occurredAt: parseDate(occurredAt),
    });

    // Optionally run the analyzer immediately after creation.
    if (analyze) {
      try {
        return await ctx.services.dreams.analyze(user.id, dream.id);
      } catch (e) {
        console.error("Analysis on create failed", e);
      }
    }

    return dream;
  });
};
