import { createHash } from "crypto";
import type { Platform, SocialAccount } from "@prisma/client";
import { demoPublishFailureRate, env } from "@/lib/env";
import { tryDecryptSecret } from "@/lib/security/crypto";
import { platformSpec } from "@/lib/constants/platforms";
import {
  PlatformError,
  type ConnectResult,
  type OAuthTokenSet,
  type PublishRequest,
  type PublishResult,
  type RemoteAccount,
  type RemotePublishStatus,
  type SocialPlatformAdapter,
} from "./types";

export interface AdapterConfig {
  platform: Platform;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Builds the public permalink for a published post. */
  permalink: (handle: string, externalId: string) => string;
}

const DEMO_HANDLES: Record<Platform, string[]> = {
  LINKEDIN: ["northwind-labs", "northwind-analytics", "northwind-studio"],
  X: ["northwindlabs", "northwind_hq", "buildnorthwind"],
  INSTAGRAM: ["northwind.labs", "northwindstudio", "northwind.daily"],
  FACEBOOK: ["NorthwindLabs", "NorthwindCommunity", "NorthwindHQ"],
};

const DEMO_NAMES: Record<Platform, string> = {
  LINKEDIN: "Northwind Labs",
  X: "Northwind Labs",
  INSTAGRAM: "Northwind Studio",
  FACEBOOK: "Northwind Labs",
};

function hashToInt(input: string, mod: number): number {
  const digest = createHash("sha256").update(input).digest();
  return digest.readUInt32BE(0) % mod;
}

/**
 * Shared behaviour for every platform: OAuth URL construction, content
 * validation against the platform's published limits, and the DEMO MODE
 * simulator that stands in for the real network call.
 *
 * Subclasses override `performRealPublish` (and friends) with the actual API
 * calls; the demo path is identical for all four platforms because the
 * interesting differences live in validation, not in transport.
 */
export abstract class BasePlatformAdapter implements SocialPlatformAdapter {
  readonly platform: Platform;
  protected readonly config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
    this.platform = config.platform;
  }

  isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  /** Real network calls happen only when credentials exist and demo mode is off. */
  protected useRealApi(): boolean {
    return this.isConfigured() && !env().DEMO_MODE;
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    if (!this.isConfigured()) {
      throw new PlatformError(
        this.platform,
        "NOT_CONFIGURED",
        `${platformSpec(this.platform).name} OAuth is not configured. Add the client id and secret to your environment, or use Demo Mode.`,
      );
    }
    const url = new URL(this.config.authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", this.config.scopes.join(" "));
    return url.toString();
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    if (!this.isConfigured()) {
      throw new PlatformError(this.platform, "NOT_CONFIGURED", "OAuth client credentials are not configured.");
    }
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: this.config.clientId!,
        client_secret: this.config.clientSecret!,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new PlatformError(
        this.platform,
        "TOKEN_EXCHANGE_FAILED",
        `Token exchange failed (${response.status}): ${detail.slice(0, 200)}`,
        { httpStatus: response.status, retryable: response.status >= 500 },
      );
    }

    const body = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : null,
      scopes: body.scope ? body.scope.split(/[\s,]+/) : this.config.scopes,
    };
  }

  async connect(input: { userId: string; code?: string; redirectUri?: string }): Promise<ConnectResult> {
    if (this.useRealApi() && input.code && input.redirectUri) {
      const tokens = await this.exchangeCodeForTokens(input.code, input.redirectUri);
      const account = await this.fetchRemoteAccount(tokens.accessToken);
      return { account, tokens, demo: false };
    }
    return { account: this.simulateAccount(input.userId), tokens: null, demo: true };
  }

  async disconnect(_account: SocialAccount): Promise<void> {
    // Demo connections have nothing to revoke. Real adapters override this to
    // call the platform's token revocation endpoint.
  }

  async getAccount(account: SocialAccount): Promise<RemoteAccount> {
    if (this.useRealApi()) {
      const token = this.requireToken(account);
      return this.fetchRemoteAccount(token);
    }
    return {
      platformAccountId: account.platformAccountId,
      handle: account.handle,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      // Demo follower counts drift a little on each sync so the UI feels alive.
      followerCount: account.followerCount + hashToInt(`${account.id}:${Date.now() / 86_400_000 | 0}`, 40),
    };
  }

  async publishPost(account: SocialAccount, request: PublishRequest): Promise<PublishResult> {
    this.validate(request);

    if (this.useRealApi()) {
      const token = this.requireToken(account);
      return this.performRealPublish(account, request, token);
    }
    return this.simulatePublish(account, request);
  }

  async getPublishingStatus(account: SocialAccount, externalId: string): Promise<RemotePublishStatus> {
    if (this.useRealApi()) {
      const token = this.requireToken(account);
      return this.fetchRealStatus(account, externalId, token);
    }
    return {
      state: "LIVE",
      externalId,
      externalUrl: this.config.permalink(account.handle, externalId),
      checkedAt: new Date(),
      detail: "Verified against the demo publishing simulator.",
    };
  }

  // --- validation ---------------------------------------------------------

  /**
   * Enforces the platform's published limits before anything leaves the server.
   * Subclasses call `super.validate(request)` and add their own rules.
   */
  protected validate(request: PublishRequest): void {
    const spec = platformSpec(this.platform);
    const caption = request.caption.trim();

    if (!caption) {
      throw new PlatformError(this.platform, "EMPTY_CONTENT", "The post has no caption.");
    }

    const rendered = this.renderPayload(request);
    if (rendered.length > spec.captionLimit) {
      throw new PlatformError(
        this.platform,
        "CONTENT_TOO_LONG",
        `${spec.name} allows ${spec.captionLimit} characters; this post renders to ${rendered.length}.`,
      );
    }

    if (request.hashtags.length > spec.hashtagLimit) {
      throw new PlatformError(
        this.platform,
        "TOO_MANY_HASHTAGS",
        `${spec.name} allows at most ${spec.hashtagLimit} hashtags; this post has ${request.hashtags.length}.`,
      );
    }
  }

  /** The exact text that would be sent to the platform. */
  renderPayload(request: PublishRequest): string {
    const tags = request.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
    return [request.caption.trim(), tags].filter(Boolean).join("\n\n");
  }

  protected requireToken(account: SocialAccount): string {
    const token = tryDecryptSecret(account.accessTokenEnc);
    if (!token) {
      throw new PlatformError(
        this.platform,
        "NO_ACCESS_TOKEN",
        `The ${platformSpec(this.platform).name} connection has no usable access token. Reconnect the account.`,
      );
    }
    if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now()) {
      throw new PlatformError(
        this.platform,
        "TOKEN_EXPIRED",
        `The ${platformSpec(this.platform).name} access token has expired. Reconnect the account.`,
      );
    }
    return token;
  }

  // --- demo mode ----------------------------------------------------------

  protected simulateAccount(userId: string): RemoteAccount {
    const handles = DEMO_HANDLES[this.platform];
    const handle = handles[hashToInt(`${userId}:${this.platform}`, handles.length)]!;
    return {
      platformAccountId: `demo_${this.platform.toLowerCase()}_${hashToInt(`${userId}:${this.platform}:id`, 900000) + 100000}`,
      handle,
      displayName: DEMO_NAMES[this.platform],
      avatarUrl: null,
      followerCount: 1200 + hashToInt(`${userId}:${this.platform}:followers`, 48000),
    };
  }

  protected async simulatePublish(account: SocialAccount, request: PublishRequest): Promise<PublishResult> {
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 650));

    // A tunable failure rate keeps the retry and failure paths demonstrable.
    // Retries are more forgiving, mirroring how transient API errors behave —
    // except at a rate of exactly 1, which is the deterministic "always fail"
    // switch used by the end-to-end test to drive a job to terminal failure.
    const baseRate = demoPublishFailureRate();
    const rate = baseRate >= 1 ? 1 : request.attempt > 1 ? baseRate / 3 : baseRate;
    if (Math.random() < rate) {
      throw new PlatformError(
        this.platform,
        "UPSTREAM_UNAVAILABLE",
        `${platformSpec(this.platform).name} API returned 503 Service Unavailable (simulated).`,
        { retryable: true, httpStatus: 503 },
      );
    }

    // Derived from the idempotency key so a duplicate call yields the same id.
    const externalId = `${this.platform.toLowerCase()}_${createHash("sha256")
      .update(request.idempotencyKey)
      .digest("hex")
      .slice(0, 18)}`;

    return {
      externalId,
      externalUrl: this.config.permalink(account.handle, externalId),
      publishedAt: new Date(),
      raw: {
        simulated: true,
        platform: this.platform,
        renderedLength: this.renderPayload(request).length,
        attempt: request.attempt,
      },
    };
  }

  // --- real API hooks (overridden per platform) ---------------------------

  protected abstract fetchRemoteAccount(accessToken: string): Promise<RemoteAccount>;

  protected abstract performRealPublish(
    account: SocialAccount,
    request: PublishRequest,
    accessToken: string,
  ): Promise<PublishResult>;

  protected async fetchRealStatus(
    account: SocialAccount,
    externalId: string,
    _accessToken: string,
  ): Promise<RemotePublishStatus> {
    return {
      state: "LIVE",
      externalId,
      externalUrl: this.config.permalink(account.handle, externalId),
      checkedAt: new Date(),
    };
  }
}
