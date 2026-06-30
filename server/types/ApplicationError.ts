export enum ErrorCode {
  INTERNAL_SERVER_ERROR = 500,
  BAD_REQUEST = 400,
  CONFLICT_ERROR = 409,
  NOT_FOUND_ERROR = 404,
  UNAUTHORIZED_ERROR = 401,
  RATE_LIMIT = 429,
}

export default class ApplicationError extends Error {
  public readonly code: number;

  constructor(message: string, code: number = 500) {
    super(message);
    this.code = code
  }
}