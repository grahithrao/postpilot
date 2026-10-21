import type { SocialAccount } from "@prisma/client";
import { env } from "@/lib/env";
import { BasePlatformAdapter } from "../base-adapter";
import { PlatformError, type PublishRequest, type PublishResult, type RemoteAccount } from "../types";

/**
 * LinkedIn (UGC Posts API).
 *
 * Real calls go to /v2/userinfo and /rest/posts. Without LINKEDIN_CLIENT_ID and
 * LINKEDIN_CLIENT_SECRET the adapter runs through the demo simulator instead.
 */
export class LinkedInAdapter extends BasePlatformAdapter {
  constructor() {
    super({
      platform: "LINKEDIN",
      clientId: env().LINKEDIN_CLIENT_ID,
      clientSecret: env().LINKEDIN_CLIENT_SECRET,
      authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes: ["openid", "profile", "email", "w_member_social"],
      permalink: (_handle, id) => `https://www.linkedin.com/feed/update/urn:li:share:${id}/`,
    });
  }

  protected validate(request: PublishRequest): void {
    super.validate(request);
    // LinkedIn truncates the preview at the "see more" fold; fail loudly rather
    // than shipping a post whose hook is cut in half.
    const firstLine = request.caption.split("\n")[0] ?? "";
    if (firstLine.length > 210) {
      throw new PlatformError(
        "LINKEDIN",
        "HOOK_TOO_LONG",
        "LinkedIn truncates the first line at roughly 210 characters. Shorten the opening line so the hook survives the fold.",
      );
    }
  }

  protected async fetchRemoteAccount(accessToken: string): Promise<RemoteAccount> {
    const response = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new PlatformError("LINKEDIN", "PROFILE_FETCH_FAILED", `LinkedIn profile fetch failed (${response.status}).`, {
        httpStatus: response.status,
        retryable: response.status >= 500,
      });
    }
    const body = (await response.json()) as { sub: string; name?: string; picture?: string };
    return {
      platformAccountId: body.sub,
      handle: body.sub,
      displayName: body.name ?? "LinkedIn member",
      avatarUrl: body.picture ?? null,
      followerCount: 0,
    };
  }

  protected async performRealPublish(
    account: SocialAccount,
    request: PublishRequest,
    accessToken: string,
  ): Promise<PublishResult> {
    const response = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "LinkedIn-Version": "202405",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: `urn:li:person:${account.platformAccountId}`,
        commentary: this.renderPayload(request),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new PlatformError(
        "LINKEDIN",
        "PUBLISH_FAILED",
        `LinkedIn rejected the post (${response.status}): ${detail.slice(0, 200)}`,
        { httpStatus: response.status, retryable: response.status === 429 || response.status >= 500 },
      );
    }

    const externalId = response.headers.get("x-restli-id") ?? `li_${Date.now()}`;
    return {
      externalId,
      externalUrl: `https://www.linkedin.com/feed/update/${externalId}/`,
      publishedAt: new Date(),
      raw: { status: response.status },
    };
  }
}
