import { ErrorCode } from "./ApplicationError";
import { NextResponse } from "next/server";

export const error = (statusCode?: number, message?: string) => {
  return new NextResponse(message ?? "Internal Server Error", {
    status: statusCode ?? ErrorCode.INTERNAL_SERVER_ERROR
  })
}