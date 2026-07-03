import { Adapters, AppContext } from "./types/context.type"
import { error } from "./types/http-response"
import { UserRecord, getAuth } from "firebase-admin/auth"
import * as admin from 'firebase-admin'
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { createHash } from "node:crypto";
import ApplicationError, { ErrorCode } from "./types/ApplicationError"
import { NextRequest, NextResponse } from "next/server"
import { UsersAdapter } from "./adapters/db/users.adapter";
import { DreamsAdapter } from "./adapters/db/dreams.adapter";
import { RecapsAdapter } from "./adapters/db/recaps.adapter";
import { UserModel } from "./models/User";
import { FileAdapter } from "./adapters/file.adapter";
import { UsersService } from "./services/users.service";
import { DreamsService } from "./services/dreams.service";
import { RecapsService } from "./services/recaps.service";
import { AnalysisService } from "./services/analysis.service";
import { db, DBClient } from "./db";

const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY
const privateKey = rawPrivateKey?.replace(/\\n/g, "\n")

// TEMP DEBUG - remove after diagnosing invalid_grant issue
const base64Payload = privateKey
  ?.replace(/-----BEGIN PRIVATE KEY-----/, "")
  ?.replace(/-----END PRIVATE KEY-----/, "")
  ?.replace(/\s+/g, "")
console.log("[firebase-debug]", {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  rawKeyLength: rawPrivateKey?.length,
  keyLength: privateKey?.length,
  keyHash: privateKey ? createHash("sha256").update(privateKey).digest("hex") : null,
  startsWithQuote: rawPrivateKey?.startsWith('"'),
  endsWithQuote: rawPrivateKey?.endsWith('"'),
  newlineCount: (privateKey?.match(/\n/g) || []).length,
  doubleBackslashCount: (rawPrivateKey?.match(/\\\\n/g) || []).length,
  startsWithHeader: privateKey?.startsWith("-----BEGIN PRIVATE KEY-----\n"),
  endsWithFooterNewline: privateKey?.endsWith("-----END PRIVATE KEY-----\n"),
  endsWithFooterNoNewline: privateKey?.endsWith("-----END PRIVATE KEY-----"),
  base64PayloadLength: base64Payload?.length,
  base64PayloadHash: base64Payload ? createHash("sha256").update(base64Payload).digest("hex") : null,
})

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      })
    });
  } catch (error) {
    console.error("Firebase initialization error:", error);
  }
}

const initAdapters = async (db: DBClient): Promise<Adapters> => {
  const usersAdapter = new UsersAdapter(db)
  const dreamsAdapter = new DreamsAdapter(db)
  const recapsAdapter = new RecapsAdapter(db)

  return {
    db: {
      users: usersAdapter,
      dreams: dreamsAdapter,
      recaps: recapsAdapter,
    },
    file: new FileAdapter(),
  }
}

const buildContext = async (req: NextRequest): Promise<AppContext> => {
  const adapters = await initAdapters(db)
  const usersService = new UsersService(adapters.db.users)
  const analysisService = new AnalysisService()
  const dreamsService = new DreamsService(adapters.db.dreams, analysisService)
  const recapsService = new RecapsService(adapters.db.dreams, adapters.db.recaps, analysisService)

  const authorization = req.headers.get("Authorization")
  console.log("Authorization header:", authorization)
  const token = authorization?.replace("Bearer ", "")
  console.log("Extracted token:", token)

  let user: UserModel | null = null
  let authUser: UserRecord | null = null
  if (token) {
    let decoded
    try {
      console.log("Verifying token...")
      decoded = await getAuth().verifyIdToken(token ?? "")
      console.log("Decoded token:", decoded)
      if (decoded) {
        authUser = await getAuth().getUser(decoded.uid)
        console.log("Authenticated user:", authUser)
        user = await usersService.getUserById(decoded.uid)
        console.log("User from database:", user)
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
      dreams: dreamsService,
      recaps: recapsService,
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