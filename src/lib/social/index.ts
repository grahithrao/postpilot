import type { Platform } from "@prisma/client";
import { env } from "@/lib/env";
import { FacebookAdapter } from "./adapters/facebook";
import { InstagramAdapter } from "./adapters/instagram";
import { LinkedInAdapter } from "./adapters/linkedin";
import { XAdapter } from "./adapters/x";
import type { SocialPlatformAdapter } from "./types";

let registry: Record<Platform, SocialPlatformAdapter> | null = null;

/** The adapter registry. One instance per platform, built lazily. */
export function adapters(): Record<Platform, SocialPlatformAdapter> {
  registry ??= {
    LINKEDIN: new LinkedInAdapter(),
    X: new XAdapter(),
    INSTAGRAM: new InstagramAdapter(),
    FACEBOOK: new FacebookAdapter(),
  };
  return registry;
}

export function getAdapter(platform: Platform): SocialPlatformAdapter {
  return adapters()[platform];
}

/** Per-platform integration status for the /integrations page. */
export function integrationCapabilities() {
  const demo = env().DEMO_MODE;
  return Object.values(adapters()).map((adapter) => ({
    platform: adapter.platform,
    oauthConfigured: adapter.isConfigured(),
    mode: demo || !adapter.isConfigured() ? ("demo" as const) : ("live" as const),
  }));
}

export * from "./types";
