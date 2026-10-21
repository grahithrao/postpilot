import { PostStatus, ScheduleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAnalyticsOverview, getDashboardStats } from "./analytics";

/**
 * Everything the dashboard needs, gathered in one place.
 *
 * The page is a Server Component, so this runs on the server and the client
 * receives rendered markup rather than a waterfall of fetches.
 */
export async function getDashboardData(userId: string) {
  const [stats, analytics, recentActivity, upcoming, approvalQueue, accounts, recentLogs, automations] =
    await Promise.all([
      getDashboardStats(userId),
      getAnalyticsOverview(userId, 30),
      prisma.activityLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { post: { select: { id: true, platform: true, headline: true, topic: true } } },
      }),
      prisma.schedule.findMany({
        where: {
          userId,
          status: { in: [ScheduleStatus.PENDING, ScheduleStatus.QUEUED] },
          scheduledFor: { gte: new Date() },
        },
        orderBy: { scheduledFor: "asc" },
        take: 5,
        include: {
          post: { select: { id: true, headline: true, caption: true, platform: true, status: true, qualityScore: true } },
          socialAccount: { select: { handle: true } },
        },
      }),
      prisma.post.findMany({
        where: { userId, status: PostStatus.PENDING_APPROVAL },
        orderBy: { createdAt: "asc" },
        take: 4,
        select: {
          id: true,
          headline: true,
          caption: true,
          platform: true,
          qualityScore: true,
          createdAt: true,
          automation: { select: { name: true } },
        },
      }),
      prisma.socialAccount.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          platform: true,
          handle: true,
          displayName: true,
          status: true,
          isDemo: true,
          followerCount: true,
          lastSyncedAt: true,
        },
      }),
      prisma.publishingLog.findMany({
        where: { post: { userId } },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { post: { select: { id: true, headline: true, topic: true } } },
      }),
      prisma.automation.count({ where: { userId, enabled: true } }),
    ]);

  return { stats, analytics, recentActivity, upcoming, approvalQueue, accounts, recentLogs, automations };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
