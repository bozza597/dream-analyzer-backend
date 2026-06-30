import { protectedHandler } from "@/server/security"
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError"
import { NextRequest } from "next/server"

export const POST = async (req: NextRequest) => {
  return protectedHandler(req, async (ctx) => {
    const { user } = ctx
    if (!user) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }
    
    const { token, platform } = await req.json()

    const tokens = await ctx.adapters.db.users.getFCMTokensByUserId([user.id])
    const existingToken = tokens.find(t => t.token === token)
    if(existingToken) {
      if(existingToken.userId !== user.id) {
        await ctx.adapters.db.users.updateFCMToken(user.id, token)
      }
    } else {
      try {
        await ctx.adapters.db.users.insertFCMTokens(user.id, [token], platform)
      } catch (e) {
        console.error(e)
      }
    }

    return user
  })
}