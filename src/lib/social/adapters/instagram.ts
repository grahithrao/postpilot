import type { SocialAccount } from "@prisma/client";
import { env } from "@/lib/env";
import { BasePlatformAdapter } from "../base-adapter";
import { PlatformError, type PublishRequest, type PublishResult, type RemoteAccount } from "../types";

/**
 * Instagram (Graph API, Business/Creator accounts).
 *
 * Publishing is a two-step container flow: create a media container, then
 * publish it. Instagram requires media, so a post with no visual is rejected
 * before it reaches the network.
 */
export class InstagramAdapter extends BasePlatformAdapter {
  constructor() {
    super({
      platform: "INSTAGRAM",
      clientId: env().INSTAGRAM_CLIENT_ID,
      clientSecret: env().INSTAGRAM_CLIENT_SECRET,
      authorizeUrl: "https://api.instagram.com/oauth/authorize",
      tokenUrl: "https://api.instagram.com/oauth/access_token",
      scopes: ["instagram_business_basic", "instagram_business_content_publish"],
      permalink: (_handle, id) => `https://www.instagram.com/p/${id}/`,
    });
  }

  protected validate(request: PublishRequest): void {
    super.validate(request);

    // Instagram is media-first: the API has no text-only post type. In demo
    // mode the image prompt stands in for the asset the pipeline would render,
    // so either a media URL or a prompt satisfies the rule.
    if (!request.mediaUrl && !request.imagePrompt?.trim()) {
      throw new PlatformError(
        "INSTAGRAM",
        "MEDIA_REQUIRED",
        "Instagram posts require an image or video. Generate a visual before publishing.",
      );
    }

    if (/https?:\/\//i.test(request.caption)) {
      throw new PlatformError(
        "INSTAGRAM",
        "LINK_NOT_CLICKABLE",
        "Instagram captions do not render clickable links. Move the URL to the profile link and reference it in the copy.",
      );
    }
  }

  protected async fetchRemoteAccount(accessToken: string): Promise<RemoteAccount> {
    const response = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,account_type,followers_count&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!response.ok) {
      throw new PlatformError(
        "INSTAGRAM",
        "PROFILE_FETCH_FAILED",
        `Instagram profile fetch failed (${response.status}).`,
        { httpStatus: response.status, retryable: response.status >= 500 },
      );
    }
    const body = (await response.json()) as { id: string; username: string; followers_count?: number };
    return {
      platformAccountId: body.id,
      handle: body.username,
      displayName: body.username,
      avatarUrl: null,
      followerCount: body.followers_count ?? 0,
    };
  }

  protected async performRealPublish(
    account: SocialAccount,
    request: PublishRequest,
    accessToken: string,
  ): Promise<PublishResult> {
    if (!request.mediaUrl) {
      throw new PlatformError(
        "INSTAGRAM",
        "MEDIA_REQUIRED",
        "A publicly reachable media URL is required by the Graph API.",
      );
    }

    const container = await fetch(`https://graph.instagram.com/v21.0/${account.platformAccountId}/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image_url: request.mediaUrl,
        caption: this.renderPayload(request),
        access_token: accessToken,
      }),
    });
    if (!container.ok) {
      const detail = await container.text().catch(() => "");
      throw new PlatformError(
        "INSTAGRAM",
        "CONTAINER_FAILED",
        `Instagram container creation failed (${container.status}): ${detail.slice(0, 200)}`,
        { httpStatus: container.status, retryable: container.status >= 500 },
      );
    }
    const { id: creationId } = (await container.json()) as { id: string };

    const published = await fetch(`https://graph.instagram.com/v21.0/${account.platformAccountId}/media_publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
    });
    if (!published.ok) {
      const detail = await published.text().catch(() => "");
      throw new PlatformError(
        "INSTAGRAM",
        "PUBLISH_FAILED",
        `Instagram publish failed (${published.status}): ${detail.slice(0, 200)}`,
        { httpStatus: published.status, retryable: published.status === 429 || published.status >= 500 },
      );
    }

    const body = (await published.json()) as { id: string };
    return {
      externalId: body.id,
      externalUrl: `https://www.instagram.com/p/${body.id}/`,
      publishedAt: new Date(),
      raw: { creationId },
    };
  }
}
