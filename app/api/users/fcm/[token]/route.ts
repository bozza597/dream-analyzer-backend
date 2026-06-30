import { protectedHandler } from "@/server/security"
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError"
import { NextRequest } from "next/server"

export const DELETE = async (req: NextRequest, { params }: { params: Promise<{ token: string }> }) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx
    if (!user) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }

    const { token } = await params

    const savedTokens = await ctx.adapters.db.users.getFCMTokensByUserId([user.id])
    if (!savedTokens) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }

    if(savedTokens.find(t => t.token === token)?.userId !== user.id) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }
    
    await ctx.adapters.db.users.deleteFCMTokensByTokenId(token)

    return { success: true }
  })
}