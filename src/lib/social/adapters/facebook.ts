import type { SocialAccount } from "@prisma/client";
import { env } from "@/lib/env";
import { BasePlatformAdapter } from "../base-adapter";
import { PlatformError, type PublishRequest, type PublishResult, type RemoteAccount } from "../types";

/** Facebook Pages (Graph API). Posts are made as the Page, not the person. */
export class FacebookAdapter extends BasePlatformAdapter {
  constructor() {
    super({
      platform: "FACEBOOK",
      clientId: env().FACEBOOK_CLIENT_ID,
      clientSecret: env().FACEBOOK_CLIENT_SECRET,
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
      scopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
      permalink: (handle, id) => `https://www.facebook.com/${handle}/posts/${id}`,
    });
  }

  protected async fetchRemoteAccount(accessToken: string): Promise<RemoteAccount> {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,username,fan_count,picture&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!response.ok) {
      throw new PlatformError("FACEBOOK", "PROFILE_FETCH_FAILED", `Facebook page fetch failed (${response.status}).`, {
        httpStatus: response.status,
        retryable: response.status >= 500,
      });
    }
    const body = (await response.json()) as {
      data?: Array<{
        id: string;
        name: string;
        username?: string;
        fan_count?: number;
        picture?: { data?: { url?: string } };
      }>;
    };
    const page = body.data?.[0];
    if (!page) {
      throw new PlatformError("FACEBOOK", "NO_PAGE", "This account does not manage any Facebook Page.");
    }
    return {
      platformAccountId: page.id,
      handle: page.username ?? page.id,
      displayName: page.name,
      avatarUrl: page.picture?.data?.url ?? null,
      followerCount: page.fan_count ?? 0,
    };
  }

  protected async performRealPublish(
    account: SocialAccount,
    request: PublishRequest,
    accessToken: string,
  ): Promise<PublishResult> {
    const response = await fetch(`https://graph.facebook.com/v21.0/${account.platformAccountId}/feed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: this.renderPayload(request), access_token: accessToken }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new PlatformError(
        "FACEBOOK",
        "PUBLISH_FAILED",
        `Facebook rejected the post (${response.status}): ${detail.slice(0, 200)}`,
        { httpStatus: response.status, retryable: response.status === 429 || response.status >= 500 },
      );
    }

    const body = (await response.json()) as { id: string };
    return {
      externalId: body.id,
      externalUrl: `https://www.facebook.com/${body.id}`,
      publishedAt: new Date(),
      raw: { status: response.status },
    };
  }
}
