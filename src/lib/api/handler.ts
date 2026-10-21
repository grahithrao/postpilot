import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, isAppError } from "@/lib/errors";
import { ProviderError } from "@/lib/ai/types";
import { PlatformError } from "@/lib/social/types";
import { requireUser } from "@/lib/auth";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, { status });
}

/**
 * Maps every error the application can raise onto a stable HTTP response.
 *
 * Internal details are never leaked: unrecognised errors become a generic 500
 * with the real message logged server-side only.
 */
export function fail(error: unknown) {
  if (isAppError(error)) {
    return NextResponse.json<ApiFailure>(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json<ApiFailure>(
      {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "Some fields need attention.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }

  if (error instanceof PlatformError) {
    return NextResponse.json<ApiFailure>(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.httpStatus && error.httpStatus < 600 ? error.httpStatus : 502 },
    );
  }

  if (error instanceof ProviderError) {
    return NextResponse.json<ApiFailure>(
      { ok: false, error: { code: "PROVIDER_ERROR", message: error.message } },
      { status: 502 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json<ApiFailure>(
        { ok: false, error: { code: "CONFLICT", message: "That record already exists." } },
        { status: 409 },
      );
    }
    if (error.code === "P2025") {
      return NextResponse.json<ApiFailure>(
        { ok: false, error: { code: "NOT_FOUND", message: "Record not found." } },
        { status: 404 },
      );
    }
  }

  console.error("[api] unhandled error:", error);
  return NextResponse.json<ApiFailure>(
    { ok: false, error: { code: "INTERNAL", message: "Something went wrong on our side." } },
    { status: 500 },
  );
}

export interface RouteUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  timezone: string;
}

/**
 * Wraps a route handler with authentication and the shared error mapper.
 * Every mutating endpoint in the app goes through this, so "who is asking"
 * is never an open question inside a service.
 */
export function withUser<Ctx = unknown>(
  handler: (user: RouteUser, request: Request, context: Ctx) => Promise<Response>,
) {
  return async (request: Request, context: Ctx): Promise<Response> => {
    try {
      const user = await requireUser();
      return await handler(user as RouteUser, request, context);
    } catch (error) {
      return fail(error);
    }
  };
}

/** Parses a JSON body, turning malformed input into a 422 rather than a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("VALIDATION", "The request body must be valid JSON.");
  }
}
