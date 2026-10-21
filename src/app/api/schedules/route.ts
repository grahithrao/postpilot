import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, withUser } from "@/lib/api/handler";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Calendar feed: everything with a date, in one shape. */
export const GET = withUser(async (user, request) => {
  try {
    const url = new URL(request.url);
    const { from, to } = querySchema.parse(Object.fromEntries(url.searchParams));

    const start = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const end = to ? new Date(to) : new Date(Date.now() + 60 * 86_400_000);

    const [schedules, published] = await Promise.all([
      prisma.schedule.findMany({
        where: { userId: user.id, scheduledFor: { gte: start, lte: end }, status: { not: "CANCELLED" } },
        include: {
          post: {
            select: {
              id: true, headline: true, caption: true, platform: true, status: true,
              qualityScore: true, hashtags: true,
            },
          },
          socialAccount: { select: { handle: true } },
        },
        orderBy: { scheduledFor: "asc" },
      }),
      prisma.post.findMany({
        where: {
          userId: user.id,
          status: "PUBLISHED",
          publishedAt: { gte: start, lte: end },
          schedules: { none: {} },
        },
        select: {
          id: true, headline: true, caption: true, platform: true, status: true,
          qualityScore: true, hashtags: true, publishedAt: true,
        },
      }),
    ]);

    const events = [
      ...schedules.map((s) => ({
        id: s.id,
        postId: s.postId,
        at: s.scheduledFor.toISOString(),
        scheduleStatus: s.status,
        handle: s.socialAccount?.handle ?? null,
        attempts: s.attempts,
        lastError: s.lastError,
        post: s.post,
      })),
      ...published.map((p) => ({
        id: `post_${p.id}`,
        postId: p.id,
        at: (p.publishedAt ?? new Date()).toISOString(),
        scheduleStatus: "COMPLETED" as const,
        handle: null,
        attempts: 1,
        lastError: null,
        post: p,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));

    return ok({ events, range: { start: start.toISOString(), end: end.toISOString() } });
  } catch (error) {
    return fail(error);
  }
});
