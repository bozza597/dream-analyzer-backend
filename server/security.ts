import { Adapters, AppContext } from "./types/context.type"
import { error } from "./types/http-response"
import { UserRecord, getAuth } from "firebase-admin/auth"
import * as admin from 'firebase-admin'
import { getApps, initializeApp } from "firebase-admin/app";
import ApplicationError, { ErrorCode } from "./types/ApplicationError"
import { NextRequest, NextResponse } from "next/server"
import { UsersAdapter } from "./adapters/db/users.adapter";
import { UserModel } from "./models/User";
import { FileAdapter } from "./adapters/file.adapter";
import { UsersService } from "./services/users.service";

if (!getApps().length) {
  try {
    //eslint-disable-next-line
    const firebaseCredentials = require("./firebase-cred.json");
    initializeApp({
      //eslint-disable-next-line
      credential: admin.cert(firebaseCredentials),
    });
  } catch (error) {
    console.error("Firebase initialization error:", error);
  }
}

const initAdapters = async (db: DBClient): Promise<Adapters> => {
  const usersAdapter = new UsersAdapter(db)

  return {
    db: {
      users: usersAdapter,
    },
    file: new FileAdapter(),
  }
}

const buildContext = async (req: NextRequest): Promise<AppContext> => {
  const adapters = await initAdapters(db)
  const usersService = new UsersService(adapters.db.users)

  const authorization = req.headers.get("Authorization")
  const token = authorization?.replace("Bearer ", "")
  
  let user: UserModel | null = null
  let authUser: UserRecord | null = null
  if (token) {
    let decoded
    try {
      decoded = await getAuth().verifyIdToken(token ?? "")
      if (decoded) {
        authUser = await getAuth().getUser(decoded.uid)
        user = await usersService.getUserById(decoded.uid)
      }
    } catch (e) {
      // User not authendicated
      console.error("Error verifying token", e)
    }
  }

  return {
    req,
    jwt: token ?? null,
    authUser,
    user,
    adapters,
    services: {
      users: usersService,
    }
  }
}

export const publicHandler = async (req: NextRequest, next: (ctx: AppContext) => Promise<object>) => {
  try {
    const ctx = await buildContext(req)
    return NextResponse.json(await next(ctx))
  } catch (e) {
    if (e instanceof ApplicationError) {
      return error(e.code ?? ErrorCode.INTERNAL_SERVER_ERROR, e.message)
    }
    return error(ErrorCode.INTERNAL_SERVER_ERROR, (e as Error).message)
  }
}

// It requires only to be logged in firebase, not to be signed up
export const authenticatedHandler = async (req: NextRequest, next: (ctx: AppContext) => Promise<object>) => {
  try {
    const ctx = await buildContext(req)
    if (!ctx.jwt) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }
    
    return NextResponse.json(await next(ctx))
  } catch (e) {
    if (e instanceof ApplicationError) {
      console.error("Error in authenticatedHandler", e)
      return error(e.code ?? ErrorCode.INTERNAL_SERVER_ERROR, e.message)
    }
    return error(ErrorCode.INTERNAL_SERVER_ERROR, (e as Error).message)
  }
}

// It requires to be already signed up
export const protectedHandler = async (req: NextRequest, next: (ctx: AppContext) => Promise<object>) => {
  try {
    const ctx = await buildContext(req)
    if (!ctx.user) {
      throw new ApplicationError("User not authenticated", ErrorCode.UNAUTHORIZED_ERROR)
    }

    return NextResponse.json(await next(ctx))
  } catch (e) {
    console.error(e)
    if (e instanceof ApplicationError) {
      return error(e.code ?? ErrorCode.INTERNAL_SERVER_ERROR, e.message)
    }
    return error(ErrorCode.INTERNAL_SERVER_ERROR, (e as Error).message)
  }
}