import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { connectAccountSchema } from "@/lib/validation/schemas";
import { connectAccount, oauthRedirectUri, signOAuthState } from "@/lib/services/integrations";
import { getAdapter } from "@/lib/social";
import { isDemoMode } from "@/lib/env";

/**
 * Starts a connection.
 *
 * With real OAuth credentials and Demo Mode off, this returns the platform's
 * authorization URL for the browser to follow. Otherwise it provisions the
 * simulated account immediately and says so.
 */
export const POST = withUser(async (user, request) => {
  try {
    const { platform } = connectAccountSchema.parse(await readJson(request));
    const adapter = getAdapter(platform);

    if (adapter.isConfigured() && !isDemoMode()) {
      const state = signOAuthState(user.id, platform);
      const url = adapter.getAuthorizationUrl(state, oauthRedirectUri(platform));
      return ok({ mode: "oauth" as const, authorizationUrl: url });
    }

    const account = await connectAccount({ userId: user.id, platform });
    return ok({
      mode: "demo" as const,
      account: {
        id: account.id,
        platform: account.platform,
        handle: account.handle,
        displayName: account.displayName,
        followerCount: account.followerCount,
        isDemo: account.isDemo,
      },
    });
  } catch (error) {
    return fail(error);
  }
});
