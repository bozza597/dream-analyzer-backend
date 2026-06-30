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

export const GET = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);
    const { id } = await params;

    return ctx.services.dreams.getWithRecurrence(user.id, id);
  });
};

export const PUT = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);
    const { id } = await params;

    const body = await req.json();
    const { content, title, type, emotions, vividness, occurredAt } = body;

    return ctx.services.dreams.update(user.id, id, {
      content,
      title,
      type: parseType(type),
      emotions: Array.isArray(emotions) ? emotions.map(String) : undefined,
      vividness: typeof vividness === "number" ? vividness : undefined,
      occurredAt: parseDate(occurredAt),
    });
  });
};

export const DELETE = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx;
    if (!user) throw new ApplicationError("Utente non autenticato", ErrorCode.UNAUTHORIZED_ERROR);
    const { id } = await params;

    await ctx.services.dreams.delete(user.id, id);
    return { success: true };
  });
};
