import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { ActivityType, SocialAccountStatus, type Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { forbidden, invalidState, notFound } from "@/lib/errors";
import { encryptSecret } from "@/lib/security/crypto";
import { platformSpec } from "@/lib/constants/platforms";
import { getAdapter, integrationCapabilities } from "@/lib/social";
import { logActivity } from "./activity";

/**
 * OAuth `state` is an HMAC-signed, time-limited token rather than a random
 * value in a session, so the callback can be verified statelessly and CSRF on
 * the connect flow is not possible.
 */
export function signOAuthState(userId: string, platform: Platform): string {
  const nonce = randomBytes(12).toString("base64url");
  const issuedAt = Date.now().toString(36);
  const payload = `${userId}.${platform}.${issuedAt}.${nonce}`;
  const signature = createHmac("sha256", env().AUTH_SECRET).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export function verifyOAuthState(state: string): { userId: string; platform: Platform } {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw invalidState("Malformed OAuth state.");

  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = createHmac("sha256", env().AUTH_SECRET).update(payload).digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw invalidState("The OAuth state signature is invalid.");
  }

  const [userId, platform, issuedAt] = payload.split(".");
  if (!userId || !platform) throw invalidState("Malformed OAuth state.");
  if (Date.now() - parseInt(issuedAt ?? "0", 36) > 10 * 60_000) {
    throw invalidState("This connection link has expired. Start the connection again.");
  }
  return { userId, platform: platform as Platform };
}

export function oauthRedirectUri(platform: Platform) {
  return `${env().OAUTH_REDIRECT_BASE_URL.replace(/\/+$/, "")}/api/integrations/${platform.toLowerCase()}/callback`;
}

export async function listIntegrations(userId: string) {
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { posts: true } } },
  });

  const capabilities = integrationCapabilities();

  return capabilities.map((capability) => {
    const account = accounts.find((a) => a.platform === capability.platform) ?? null;
    const spec = platformSpec(capability.platform);
    return {
      platform: capability.platform,
      name: spec.name,
      accent: spec.accent,
      dot: spec.dot,
      handlePrefix: spec.handlePrefix,
      oauthConfigured: capability.oauthConfigured,
      mode: capability.mode,
      connected: account?.status === SocialAccountStatus.CONNECTED,
      account: account
        ? {
            id: account.id,
            handle: account.handle,
            displayName: account.displayName,
            status: account.status,
            isDemo: account.isDemo,
            followerCount: account.followerCount,
            lastSyncedAt: account.lastSyncedAt,
            scopes: account.scopes,
            postCount: account._count.posts,
            hasToken: Boolean(account.accessTokenEnc),
            tokenExpiresAt: account.tokenExpiresAt,
          }
        : null,
    };
  });
}

export type IntegrationSummary = Awaited<ReturnType<typeof listIntegrations>>[number];

/**
 * Completes a connection.
 *
 * With OAuth credentials and DEMO_MODE off this is called from the callback
 * route with a real authorisation code. Otherwise it provisions the simulated
 * account that DEMO MODE uses, clearly flagged with `isDemo`.
 */
export async function connectAccount(input: {
  userId: string;
  platform: Platform;
  code?: string;
}) {
  const adapter = getAdapter(input.platform);
  const result = await adapter.connect({
    userId: input.userId,
    code: input.code,
    redirectUri: oauthRedirectUri(input.platform),
  });

  const account = await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformAccountId: {
        userId: input.userId,
        platform: input.platform,
        platformAccountId: result.account.platformAccountId,
      },
    },
    create: {
      userId: input.userId,
      platform: input.platform,
      platformAccountId: result.account.platformAccountId,
      handle: result.account.handle,
      displayName: result.account.displayName,
      avatarUrl: result.account.avatarUrl,
      followerCount: result.account.followerCount,
      status: SocialAccountStatus.CONNECTED,
      isDemo: result.demo,
      // Tokens are encrypted with AES-256-GCM before they touch the database
      // and are never returned to the client.
      accessTokenEnc: result.tokens ? encryptSecret(result.tokens.accessToken) : null,
      refreshTokenEnc: result.tokens?.refreshToken ? encryptSecret(result.tokens.refreshToken) : null,
      tokenExpiresAt: result.tokens?.expiresAt ?? null,
      scopes: result.tokens?.scopes ?? [],
      lastSyncedAt: new Date(),
    },
    update: {
      handle: result.account.handle,
      displayName: result.account.displayName,
      avatarUrl: result.account.avatarUrl,
      followerCount: result.account.followerCount,
      status: SocialAccountStatus.CONNECTED,
      isDemo: result.demo,
      ...(result.tokens
        ? {
            accessTokenEnc: encryptSecret(result.tokens.accessToken),
            refreshTokenEnc: result.tokens.refreshToken ? encryptSecret(result.tokens.refreshToken) : null,
            tokenExpiresAt: result.tokens.expiresAt ?? null,
            scopes: result.tokens.scopes,
          }
        : {}),
      lastSyncedAt: new Date(),
    },
  });

  await logActivity({
    userId: input.userId,
    type: ActivityType.ACCOUNT_CONNECTED,
    message: `Connected ${platformSpec(input.platform).name} as ${platformSpec(input.platform).handlePrefix}${account.handle}${result.demo ? " (demo)" : ""}.`,
    metadata: { platform: input.platform, demo: result.demo },
  });

  return account;
}

export async function disconnectAccount(accountId: string, userId: string) {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (!account) throw notFound("Account not found.");
  if (account.userId !== userId) throw forbidden("You do not own this account.");

  const pending = await prisma.schedule.count({
    where: { socialAccountId: accountId, status: { in: ["PENDING", "QUEUED", "PUBLISHING"] } },
  });
  if (pending > 0) {
    throw invalidState(
      `${pending} scheduled post${pending === 1 ? "" : "s"} still target this account. Cancel or reschedule them first.`,
    );
  }

  await getAdapter(account.platform).disconnect(account);

  // The row is kept so published posts retain their attribution, but every
  // credential is destroyed.
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      status: SocialAccountStatus.DISCONNECTED,
      accessTokenEnc: null,
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      scopes: [],
    },
  });

  await logActivity({
    userId,
    type: ActivityType.ACCOUNT_DISCONNECTED,
    message: `Disconnected ${platformSpec(account.platform).name}. Stored tokens were destroyed.`,
  });

  return { ok: true };
}

export async function syncAccount(accountId: string, userId: string) {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (!account) throw notFound("Account not found.");
  if (account.userId !== userId) throw forbidden("You do not own this account.");
  if (account.status !== SocialAccountStatus.CONNECTED) {
    throw invalidState("Reconnect this account before syncing it.");
  }

  const remote = await getAdapter(account.platform).getAccount(account);
  const updated = await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      handle: remote.handle,
      displayName: remote.displayName,
      followerCount: remote.followerCount,
      lastSyncedAt: new Date(),
    },
  });

  await logActivity({
    userId,
    type: ActivityType.ACCOUNT_SYNCED,
    message: `Synced ${platformSpec(account.platform).name}: ${remote.followerCount.toLocaleString()} followers.`,
  });

  return updated;
}
