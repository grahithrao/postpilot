/** Domain error taxonomy — every API route maps these onto HTTP status codes. */
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "APPROVAL_REQUIRED"
  | "INVALID_STATE"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  APPROVAL_REQUIRED: 403,
  INVALID_STATE: 409,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const unauthenticated = (m = "You must be signed in.") => new AppError("UNAUTHENTICATED", m);
export const forbidden = (m = "You do not have access to this resource.") => new AppError("FORBIDDEN", m);
export const notFound = (m = "Resource not found.") => new AppError("NOT_FOUND", m);
export const invalidState = (m: string) => new AppError("INVALID_STATE", m);
export const conflict = (m: string) => new AppError("CONFLICT", m);

/**
 * The single canonical message for the product's core safety rule.
 * Anything that blocks publishing for lack of human sign-off must use this.
 */
export const APPROVAL_REQUIRED_MESSAGE = "Publishing blocked: human approval is required.";
export const approvalRequired = (detail?: string) =>
  new AppError("APPROVAL_REQUIRED", APPROVAL_REQUIRED_MESSAGE, detail ? { detail } : undefined);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function errorMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return "Unexpected error";
}
