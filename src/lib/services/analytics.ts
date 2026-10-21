import { PostStatus, ScheduleStatus, type Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { PLATFORM_LIST } from "@/lib/constants/platforms";
import { generateDemoMetrics } from "@/lib/analytics/demo-metrics";

export interface DashboardStats {
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  scheduled: number;
  published: number;
  failed: number;
  rejected: number;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const grouped = await prisma.post.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });

  const by = (status: PostStatus) => grouped.find((g) => g.status === status)?._count._all ?? 0;

  return {
    total: grouped.reduce((n, g) => n + g._count._all, 0),
    draft: by(PostStatus.DRAFT),
    pendingApproval: by(PostStatus.PENDING_APPROVAL),
    approved: by(PostStatus.APPROVED),
    scheduled: by(PostStatus.SCHEDULED),
    published: by(PostStatus.PUBLISHED),
    failed: by(PostStatus.FAILED),
    rejected: by(PostStatus.REJECTED),
  };
}

/**
 * Ensures every published post has a metrics snapshot.
 *
 * In DEMO MODE this synthesises the numbers; with real credentials this is
 * where each adapter's insights endpoint would be polled instead.
 */
export async function syncAnalytics(userId: string) {
  const published = await prisma.post.findMany({
    where: { userId, status: PostStatus.PUBLISHED, publishedAt: { not: null } },
    select: {
      id: true,
      platform: true,
      publishedAt: true,
      qualityScore: true,
      hashtags: true,
      imagePrompt: true,
      mediaUrl: true,
      socialAccount: { select: { followerCount: true } },
      analytics: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
  });

  const stale = Date.now() - 6 * 3600_000;
  const toWrite = published.filter((p) => {
    const latest = p.analytics[0];
    return !latest || latest.capturedAt.getTime() < stale;
  });

  if (!toWrite.length || !isDemoMode()) return { created: 0 };

  await prisma.analyticsSnapshot.createMany({
    data: toWrite.map((post) => ({
      postId: post.id,
      platform: post.platform,
      ...generateDemoMetrics({
        postId: post.id,
        platform: post.platform,
        followerCount: post.socialAccount?.followerCount ?? 2400,
        qualityScore: post.qualityScore,
        publishedAt: post.publishedAt!,
        hashtagCount: post.hashtags.length,
        hasMedia: Boolean(post.mediaUrl || post.imagePrompt),
      }),
    })),
  });

  return { created: toWrite.length };
}

export interface AnalyticsOverview {
  totals: {
    published: number;
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    engagementRate: number;
    clickThroughRate: number;
  };
  engagementOverTime: Array<{ date: string; likes: number; comments: number; shares: number; reach: number }>;
  publishingFrequency: Array<{ date: string; published: number; scheduled: number }>;
  byPlatform: Array<{ platform: Platform; name: string; posts: number; engagements: number; engagementRate: number; reach: number }>;
  topPosts: Array<{
    id: string;
    headline: string | null;
    caption: string;
    platform: Platform;
    publishedAt: Date | null;
    qualityScore: number | null;
    engagements: number;
    reach: number;
    engagementRate: number;
  }>;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getAnalyticsOverview(userId: string, days = 30): Promise<AnalyticsOverview> {
  await syncAnalytics(userId);

  const since = new Date(Date.now() - days * 86_400_000);

  const posts = await prisma.post.findMany({
    where: { userId, status: PostStatus.PUBLISHED, publishedAt: { gte: since } },
    select: {
      id: true,
      headline: true,
      caption: true,
      platform: true,
      publishedAt: true,
      qualityScore: true,
      analytics: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
    orderBy: { publishedAt: "desc" },
  });

  const rows = posts.map((post) => {
    const metrics = post.analytics[0];
    const engagements = (metrics?.likes ?? 0) + (metrics?.comments ?? 0) + (metrics?.shares ?? 0) + (metrics?.saves ?? 0);
    return { post, metrics, engagements };
  });

  const totals = rows.reduce(
    (acc, { metrics, engagements }) => ({
      published: acc.published + 1,
      impressions: acc.impressions + (metrics?.impressions ?? 0),
      reach: acc.reach + (metrics?.reach ?? 0),
      likes: acc.likes + (metrics?.likes ?? 0),
      comments: acc.comments + (metrics?.comments ?? 0),
      shares: acc.shares + (metrics?.shares ?? 0),
      clicks: acc.clicks + (metrics?.clicks ?? 0),
      engagements: acc.engagements + engagements,
    }),
    { published: 0, impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0, engagements: 0 },
  );

  // --- daily series --------------------------------------------------------
  const engagementByDay = new Map<string, { likes: number; comments: number; shares: number; reach: number }>();
  const publishedByDay = new Map<string, number>();
  for (const { post, metrics } of rows) {
    if (!post.publishedAt) continue;
    const key = dayKey(post.publishedAt);
    const bucket = engagementByDay.get(key) ?? { likes: 0, comments: 0, shares: 0, reach: 0 };
    bucket.likes += metrics?.likes ?? 0;
    bucket.comments += metrics?.comments ?? 0;
    bucket.shares += metrics?.shares ?? 0;
    bucket.reach += metrics?.reach ?? 0;
    engagementByDay.set(key, bucket);
    publishedByDay.set(key, (publishedByDay.get(key) ?? 0) + 1);
  }

  const scheduled = await prisma.schedule.findMany({
    where: { userId, scheduledFor: { gte: since }, status: { not: ScheduleStatus.CANCELLED } },
    select: { scheduledFor: true },
  });
  const scheduledByDay = new Map<string, number>();
  for (const s of scheduled) {
    const key = dayKey(s.scheduledFor);
    scheduledByDay.set(key, (scheduledByDay.get(key) ?? 0) + 1);
  }

  const series: AnalyticsOverview["engagementOverTime"] = [];
  const frequency: AnalyticsOverview["publishingFrequency"] = [];
  // Weekly buckets read better beyond a month of history.
  const step = days > 45 ? 7 : 1;
  for (let offset = days - 1; offset >= 0; offset -= step) {
    const date = new Date(Date.now() - offset * 86_400_000);
    const key = dayKey(date);
    let likes = 0, comments = 0, shares = 0, reach = 0, published = 0, sched = 0;
    for (let i = 0; i < step; i++) {
      const k = dayKey(new Date(date.getTime() + i * 86_400_000));
      const e = engagementByDay.get(k);
      likes += e?.likes ?? 0;
      comments += e?.comments ?? 0;
      shares += e?.shares ?? 0;
      reach += e?.reach ?? 0;
      published += publishedByDay.get(k) ?? 0;
      sched += scheduledByDay.get(k) ?? 0;
    }
    series.push({ date: key, likes, comments, shares, reach });
    frequency.push({ date: key, published, scheduled: sched });
  }

  // --- per platform --------------------------------------------------------
  const byPlatform = PLATFORM_LIST.map((spec) => {
    const platformRows = rows.filter((r) => r.post.platform === spec.id);
    const reach = platformRows.reduce((n, r) => n + (r.metrics?.reach ?? 0), 0);
    const engagements = platformRows.reduce((n, r) => n + r.engagements, 0);
    return {
      platform: spec.id,
      name: spec.name,
      posts: platformRows.length,
      engagements,
      reach,
      engagementRate: reach ? Number(((engagements / reach) * 100).toFixed(2)) : 0,
    };
  });

  const topPosts = [...rows]
    .sort((a, b) => b.engagements - a.engagements)
    .slice(0, 6)
    .map(({ post, metrics, engagements }) => ({
      id: post.id,
      headline: post.headline,
      caption: post.caption,
      platform: post.platform,
      publishedAt: post.publishedAt,
      qualityScore: post.qualityScore,
      engagements,
      reach: metrics?.reach ?? 0,
      engagementRate: metrics?.engagementRate ?? 0,
    }));

  return {
    totals: {
      published: totals.published,
      impressions: totals.impressions,
      reach: totals.reach,
      likes: totals.likes,
      comments: totals.comments,
      shares: totals.shares,
      clicks: totals.clicks,
      engagementRate: totals.reach ? Number(((totals.engagements / totals.reach) * 100).toFixed(2)) : 0,
      clickThroughRate: totals.impressions ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0,
    },
    engagementOverTime: series,
    publishingFrequency: frequency,
    byPlatform,
    topPosts,
  };
}
