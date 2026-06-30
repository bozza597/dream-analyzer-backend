import { UserModel } from "@/server/models/User";
import { authenticatedHandler, protectedHandler } from "@/server/security";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";
import { getAuth } from "firebase-admin/auth";
import { NextRequest } from "next/server";

export const POST = async (req: NextRequest) => {
  return authenticatedHandler(req, async (ctx) => {
    let { user, authUser } = ctx

    const body = await req.json()
    const { timezone, country, appVersion } = body

    if (!authUser) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }

    const userPayload: Partial<UserModel> = {
      id: authUser.uid
    }

    if(!authUser.email) {
      userPayload.isAnonymous = true
    } else {
      userPayload.isAnonymous = false
    }

    if (authUser.email) {
      userPayload.email = authUser.email
    }

    if (!user) {
      user = await ctx.services.users.createUser({
        id: authUser.uid,
        name: authUser.displayName,
        ...userPayload
      }) as UserModel
    }

    if (!user) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }

    user = await ctx.services.users.updateUserById(user.id, {
      timezone,
      country,
      lastAppVersionUsed: appVersion,
      lastAccess: new Date(),
      ...userPayload
    }) as UserModel

    if(!user) {
      throw new ApplicationError("User not found", ErrorCode.NOT_FOUND_ERROR)
    }

    const updated = await ctx.services.users.getUserById(user.id)
    if (!updated) {
      throw new ApplicationError("User not found", ErrorCode.NOT_FOUND_ERROR)
    }

    return updated
  })
}
