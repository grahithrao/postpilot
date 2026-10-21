import type { SocialAccount } from "@prisma/client";
import { env } from "@/lib/env";
import { BasePlatformAdapter } from "../base-adapter";
import { PlatformError, type PublishRequest, type PublishResult, type RemoteAccount } from "../types";

/**
 * X / Twitter (API v2).
 *
 * The strictest of the four: everything, hashtags included, has to fit in 280
 * characters, so `renderPayload` is deliberately compact.
 */
export class XAdapter extends BasePlatformAdapter {
  constructor() {
    super({
      platform: "X",
      clientId: env().X_CLIENT_ID,
      clientSecret: env().X_CLIENT_SECRET,
      authorizeUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      permalink: (handle, id) => `https://x.com/${handle}/status/${id}`,
    });
  }

  /** X counts the whole tweet, so hashtags share the 280 character budget. */
  renderPayload(request: PublishRequest): string {
    const tags = request.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
    return [request.caption.trim(), tags].filter(Boolean).join(" ");
  }

  protected validate(request: PublishRequest): void {
    super.validate(request);
    if (request.caption.includes("\n\n\n")) {
      throw new PlatformError("X", "FORMATTING", "X posts should not contain blank-line paragraph breaks.");
    }
  }

  protected async fetchRemoteAccount(accessToken: string): Promise<RemoteAccount> {
    const response = await fetch(
      "https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url",
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      throw new PlatformError("X", "PROFILE_FETCH_FAILED", `X profile fetch failed (${response.status}).`, {
        httpStatus: response.status,
        retryable: response.status >= 500,
      });
    }
    const body = (await response.json()) as {
      data: {
        id: string;
        username: string;
        name: string;
        profile_image_url?: string;
        public_metrics?: { followers_count?: number };
      };
    };
    return {
      platformAccountId: body.data.id,
      handle: body.data.username,
      displayName: body.data.name,
      avatarUrl: body.data.profile_image_url ?? null,
      followerCount: body.data.public_metrics?.followers_count ?? 0,
    };
  }

  protected async performRealPublish(
    account: SocialAccount,
    request: PublishRequest,
    accessToken: string,
  ): Promise<PublishResult> {
    const response = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ text: this.renderPayload(request) }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new PlatformError("X", "PUBLISH_FAILED", `X rejected the post (${response.status}): ${detail.slice(0, 200)}`, {
        httpStatus: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    const body = (await response.json()) as { data: { id: string } };
    return {
      externalId: body.data.id,
      externalUrl: `https://x.com/${account.handle}/status/${body.data.id}`,
      publishedAt: new Date(),
      raw: { status: response.status },
    };
  }
}
