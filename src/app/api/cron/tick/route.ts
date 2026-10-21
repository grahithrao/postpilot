import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security/crypto";
import { fail, ok } from "@/lib/api/handler";
import { runSchedulerTick } from "@/lib/services/scheduling";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scheduler tick.
 *
 * Point any external cron at this (Vercel Cron, GitHub Actions, systemd timer,
 * `curl` in a loop) with the shared secret. It is authenticated with a
 * constant-time comparison and never uses a user session, because it runs with
 * no user present — the per-post ownership and approval checks live in the
 * publishing service, which it calls.
 */
async function handle(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : (new URL(request.url).searchParams.get("secret") ?? "");

  if (!provided || !safeEqual(provided, env().CRON_SECRET)) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Invalid cron secret." } },
      { status: 401 },
    );
  }

  try {
    const result = await runSchedulerTick({ limit: 10 });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

export const POST = handle;
export const GET = handle;
