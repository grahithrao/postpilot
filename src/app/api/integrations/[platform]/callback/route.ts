import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { connectAccount, verifyOAuthState } from "@/lib/services/integrations";

type Ctx = { params: Promise<{ platform: string }> };

/**
 * OAuth 2.0 redirect target.
 *
 * The `state` parameter is HMAC-signed and carries the user id, so the callback
 * is verified without a server-side session lookup and cannot be forged. On any
 * failure the user is returned to /integrations with a readable message rather
 * than a raw error page.
 */
export async function GET(request: Request, { params }: Ctx) {
  const url = new URL(request.url);
  const origin = url.origin;

  const back = (message: string, ok = false) =>
    NextResponse.redirect(
      `${origin}/integrations?${new URLSearchParams({ [ok ? "connected" : "error"]: message })}`,
    );

  try {
    const { platform: raw } = await params;
    const platform = raw.toUpperCase() as Platform;
    if (!(platform in Platform)) return back("Unknown platform.");

    const error = url.searchParams.get("error");
    if (error) return back(url.searchParams.get("error_description") ?? error);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return back("The platform did not return an authorization code.");

    const verified = verifyOAuthState(state);
    if (verified.platform !== platform) return back("The OAuth state does not match this platform.");

    const account = await connectAccount({ userId: verified.userId, platform, code });
    return back(account.handle, true);
  } catch (err) {
    return back(err instanceof Error ? err.message : "The connection could not be completed.");
  }
}
