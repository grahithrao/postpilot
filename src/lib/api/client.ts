import type { ApiResult } from "./handler";

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when the failure is the human-approval gate rather than a bug. */
  get isApprovalBlock() {
    return this.code === "APPROVAL_REQUIRED";
  }
}

/**
 * The single fetch wrapper every client component uses.
 * Turns the API's envelope into either data or a typed ApiError.
 */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  let payload: ApiResult<T> | null = null;
  try {
    payload = (await response.json()) as ApiResult<T>;
  } catch {
    throw new ApiError("INTERNAL", `The server returned ${response.status} with no body.`, response.status);
  }

  if (!payload || payload.ok !== true) {
    const error = payload && "error" in payload ? payload.error : undefined;
    throw new ApiError(
      error?.code ?? "INTERNAL",
      error?.message ?? "Something went wrong.",
      response.status,
      error?.details,
    );
  }

  return payload.data;
}
