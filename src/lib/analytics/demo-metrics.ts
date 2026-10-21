import { createHash } from "crypto";
import type { Platform } from "@prisma/client";

/**
 * Realistic engagement metrics for DEMO MODE.
 *
 * Real deployments read these numbers from each platform's insights endpoint.
 * Without credentials we synthesise them from properties that would genuinely
 * drive engagement — follower count, platform norms, quality score and how long
 * the post has been live — so the analytics page tells a coherent story rather
 * than showing noise.
 */

/** Typical engagement rate and reach multiplier per platform. */
const PLATFORM_BASELINE: Record<Platform, { engagementRate: number; reachRatio: number; ctr: number }> = {
  LINKEDIN: { engagementRate: 0.042, reachRatio: 0.38, ctr: 0.021 },
  X: { engagementRate: 0.021, reachRatio: 0.22, ctr: 0.013 },
  INSTAGRAM: { engagementRate: 0.061, reachRatio: 0.31, ctr: 0.008 },
  FACEBOOK: { engagementRate: 0.028, reachRatio: 0.17, ctr: 0.016 },
};

/** How engagement splits across interaction types, per platform. */
const INTERACTION_MIX: Record<Platform, { likes: number; comments: number; shares: number; saves: number }> = {
  LINKEDIN: { likes: 0.76, comments: 0.14, shares: 0.08, saves: 0.02 },
  X: { likes: 0.68, comments: 0.11, shares: 0.19, saves: 0.02 },
  INSTAGRAM: { likes: 0.79, comments: 0.09, shares: 0.04, saves: 0.08 },
  FACEBOOK: { likes: 0.72, comments: 0.16, shares: 0.1, saves: 0.02 },
};

function seeded(seed: string): number {
  return createHash("sha256").update(seed).digest().readUInt32BE(0) / 0xffffffff;
}

export interface DemoMetricsInput {
  postId: string;
  platform: Platform;
  followerCount: number;
  qualityScore: number | null;
  publishedAt: Date;
  hashtagCount: number;
  hasMedia: boolean;
}

export interface DemoMetrics {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  engagementRate: number;
  clickThroughRate: number;
}

export function generateDemoMetrics(input: DemoMetricsInput): DemoMetrics {
  const baseline = PLATFORM_BASELINE[input.platform];
  const mix = INTERACTION_MIX[input.platform];

  // Posts keep accruing impressions for roughly 72 hours, then plateau.
  const hoursLive = Math.max(0.5, (Date.now() - input.publishedAt.getTime()) / 3_600_000);
  const maturity = Math.min(1, Math.log10(1 + hoursLive) / Math.log10(73));

  // Quality genuinely moves the needle: a 90-scoring post outperforms a 55.
  const qualityFactor = 0.7 + ((input.qualityScore ?? 70) / 100) * 0.6;
  // A little hashtag lift on Instagram, none anywhere else.
  const hashtagFactor = input.platform === "INSTAGRAM" ? 1 + Math.min(input.hashtagCount, 15) * 0.012 : 1;
  const mediaFactor = input.hasMedia ? 1.18 : 1;
  const variance = 0.72 + seeded(`${input.postId}:variance`) * 0.62;

  const followers = Math.max(400, input.followerCount);
  const reach = Math.round(followers * baseline.reachRatio * maturity * qualityFactor * hashtagFactor * mediaFactor * variance);
  const impressions = Math.round(reach * (1.25 + seeded(`${input.postId}:imp`) * 0.55));

  const totalEngagements = Math.round(reach * baseline.engagementRate * qualityFactor * variance);
  const likes = Math.round(totalEngagements * mix.likes);
  const comments = Math.round(totalEngagements * mix.comments);
  const shares = Math.round(totalEngagements * mix.shares);
  const saves = Math.round(totalEngagements * mix.saves);
  const clicks = Math.round(impressions * baseline.ctr * qualityFactor * (0.8 + seeded(`${input.postId}:ctr`) * 0.5));

  return {
    impressions,
    reach,
    likes,
    comments,
    shares,
    saves,
    clicks,
    engagementRate: reach > 0 ? Number((((likes + comments + shares + saves) / reach) * 100).toFixed(2)) : 0,
    clickThroughRate: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
  };
}
