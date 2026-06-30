import { protectedHandler } from "@/server/security";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";
import { getAuth } from "firebase-admin/auth";
import { NextRequest } from "next/server";

export const GET = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx
    const { id } = await params

    if (!user) {
      throw new ApplicationError("User not found", ErrorCode.NOT_FOUND_ERROR)
    }

    if (user?.id !== id) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }

    return user
  })
}

export const PUT = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx
    const { id } = await params

    if (!user) {
      throw new ApplicationError("User not found", ErrorCode.NOT_FOUND_ERROR)
    }

    if (user?.id !== id) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }

    const body = await req.json()
    const { name, onboardingCompleted } = body

    const data: { name?: string; onboardedAt?: Date } = {}

    if (typeof name === "string" && name.trim()) {
      data.name = name.trim()
    }

    if (onboardingCompleted) {
      data.onboardedAt = new Date()
    }

    return ctx.services.users.updateUserById(user.id, data)
  })
}

export const DELETE = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx
    if (!user) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }

    const { id } = await params

    if(user.id !== id) {
      throw new ApplicationError("User not authorized", ErrorCode.UNAUTHORIZED_ERROR)
    }

    await ctx.services.users.updateUserById(user.id, {
      name: null,
      email: null,
      deletedAt: new Date()
    })

    await getAuth().deleteUser(user.id)
    
    return { success: true }
  })
}