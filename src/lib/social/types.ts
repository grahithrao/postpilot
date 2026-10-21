import type { Platform, SocialAccount } from "@prisma/client";

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes: string[];
}

export interface RemoteAccount {
  platformAccountId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  followerCount: number;
}

export interface ConnectResult {
  account: RemoteAccount;
  tokens: OAuthTokenSet | null;
  /** True when the connection was simulated rather than granted by the platform. */
  demo: boolean;
}

export interface PublishRequest {
  postId: string;
  headline?: string | null;
  caption: string;
  hashtags: string[];
  cta?: string | null;
  imagePrompt?: string | null;
  mediaUrl?: string | null;
  /**
   * Stable per-schedule key. Adapters pass it to the platform where supported
   * and use it to derive a deterministic external id in demo mode, so a retry
   * of the same job can never create a second post.
   */
  idempotencyKey: string;
  attempt: number;
}

export interface PublishResult {
  externalId: string;
  externalUrl: string;
  publishedAt: Date;
  raw: Record<string, unknown>;
}

export type RemotePublishState = "PENDING" | "LIVE" | "FAILED" | "DELETED";

export interface RemotePublishStatus {
  state: RemotePublishState;
  externalId: string;
  externalUrl?: string;
  checkedAt: Date;
  detail?: string;
}

export class PlatformError extends Error {
  readonly platform: Platform;
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(
    platform: Platform,
    code: string,
    message: string,
    options: { retryable?: boolean; httpStatus?: number } = {},
  ) {
    super(message);
    this.name = "PlatformError";
    this.platform = platform;
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus;
  }
}

/**
 * The contract every platform integration implements.
 *
 * Nothing above this layer knows whether a post went to a real API or to the
 * demo simulator, which is what keeps DEMO MODE honest: the same code path,
 * the same validation, the same error taxonomy.
 */
export interface SocialPlatformAdapter {
  readonly platform: Platform;
  /** True when real OAuth client credentials are configured for this platform. */
  isConfigured(): boolean;
  /** Step 1 of OAuth: where to send the user's browser. */
  getAuthorizationUrl(state: string, redirectUri: string): string;
  /** Step 2 of OAuth: swap the callback code for tokens. */
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokenSet>;
  /** Completes a connection — real when configured, simulated otherwise. */
  connect(input: { userId: string; code?: string; redirectUri?: string }): Promise<ConnectResult>;
  /** Revokes the grant where the platform supports it. Always safe to call. */
  disconnect(account: SocialAccount): Promise<void>;
  /** Refreshes the cached profile for the connected account. */
  getAccount(account: SocialAccount): Promise<RemoteAccount>;
  /** The exact text that would be sent to the platform. Used for previews and logs. */
  renderPayload(request: PublishRequest): string;
  /** Validates and publishes. Throws PlatformError on failure. */
  publishPost(account: SocialAccount, request: PublishRequest): Promise<PublishResult>;
  /** Confirms a post is actually live after publishing. */
  getPublishingStatus(account: SocialAccount, externalId: string): Promise<RemotePublishStatus>;
}
