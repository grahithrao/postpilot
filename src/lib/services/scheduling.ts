import {
  ActivityType,
  NotificationType,
  PostStatus,
  ScheduleStatus,
  type Schedule,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, approvalRequired, forbidden, invalidState, notFound } from "@/lib/errors";
import { platformSpec } from "@/lib/constants/platforms";
import { logActivity, notify } from "./activity";
import { assertTransition, isApproved } from "./post-status";
import { executeScheduledPublish, type PublishOutcome } from "./publishing";

/** How far ahead of the clock a job is allowed to fire. */
const DUE_WINDOW_MS = 15_000;

/**
 * One post version publishes at most once.
 *
 * The idempotency key is derived from the post and its version rather than
 * randomly generated, so re-scheduling a post reuses the same row and a second
 * schedule for the same approved content is impossible by construction.
 */
function idempotencyKeyFor(postId: string, version: number) {
  return `post:${postId}:v${version}`;
}

export interface ScheduleInput {
  postId: string;
  userId: string;
  scheduledFor: Date;
  timezone?: string;
  socialAccountId?: string | null;
}

/**
 * Schedules an approved post.
 *
 * Refuses anything that has not been through human approval — this is the
 * second place (after the publishing guard) where the rule is enforced, so a
 * bug in one cannot open a hole in the other.
 */
export async function schedulePost(input: ScheduleInput): Promise<Schedule> {
  const post = await prisma.post.findUnique({
    where: { id: input.postId },
    include: { approvals: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!post) throw notFound("Post not found.");
  if (post.userId !== input.userId) throw forbidden("You do not own this post.");

  if (!isApproved(post.status)) {
    throw approvalRequired(`Only approved content can be scheduled. This post is in ${post.status}.`);
  }
  const decision = post.approvals[0];
  if (!decision || decision.decision !== "APPROVED" || decision.postVersion !== post.version) {
    throw approvalRequired("This version of the post has not been approved by a human reviewer.");
  }

  if (post.status === PostStatus.PUBLISHED) {
    throw new AppError("CONFLICT", "This post has already been published.");
  }

  const now = Date.now();
  if (input.scheduledFor.getTime() < now - 60_000) {
    throw invalidState("The scheduled time is in the past.");
  }
  if (input.scheduledFor.getTime() > now + 365 * 24 * 3600_000) {
    throw invalidState("Posts can only be scheduled up to 12 months ahead.");
  }

  const accountId = input.socialAccountId ?? post.socialAccountId;
  const account = accountId
    ? await prisma.socialAccount.findFirst({ where: { id: accountId, userId: input.userId } })
    : await prisma.socialAccount.findFirst({
        where: { userId: input.userId, platform: post.platform, status: "CONNECTED" },
        orderBy: { createdAt: "asc" },
      });

  if (!account) {
    throw invalidState(
      `Connect a ${platformSpec(post.platform).name} account on the Integrations page before scheduling.`,
    );
  }
  if (account.platform !== post.platform) {
    throw invalidState(`The selected account is a ${platformSpec(account.platform).name} account.`);
  }
  if (account.status !== "CONNECTED") {
    throw invalidState(`The ${platformSpec(account.platform).name} account is not connected.`);
  }

  const key = idempotencyKeyFor(post.id, post.version);
  const existing = await prisma.schedule.findUnique({ where: { idempotencyKey: key } });

  if (existing?.status === ScheduleStatus.COMPLETED) {
    throw new AppError("CONFLICT", "This version of the post has already been published.");
  }
  if (existing?.status === ScheduleStatus.PUBLISHING) {
    throw new AppError("CONFLICT", "This post is being published right now.");
  }

  const schedule = existing
    ? await prisma.schedule.update({
        where: { id: existing.id },
        data: {
          scheduledFor: input.scheduledFor,
          timezone: input.timezone ?? "UTC",
          socialAccountId: account.id,
          status: ScheduleStatus.PENDING,
          attempts: 0,
          lastError: null,
          nextAttemptAt: null,
          cancelledAt: null,
          leaseId: null,
        },
      })
    : await prisma.schedule.create({
        data: {
          postId: post.id,
          userId: input.userId,
          socialAccountId: account.id,
          scheduledFor: input.scheduledFor,
          timezone: input.timezone ?? "UTC",
          idempotencyKey: key,
        },
      });

  assertTransition(post.status, PostStatus.SCHEDULED);
  await prisma.post.update({
    where: { id: post.id },
    data: { status: PostStatus.SCHEDULED, socialAccountId: account.id, failureReason: null },
  });

  await logActivity({
    userId: input.userId,
    postId: post.id,
    type: existing ? ActivityType.POST_RESCHEDULED : ActivityType.POST_SCHEDULED,
    message: `${existing ? "Rescheduled" : "Scheduled"} for ${input.scheduledFor.toISOString()} on ${platformSpec(post.platform).name}.`,
    metadata: { scheduleId: schedule.id, scheduledFor: input.scheduledFor.toISOString() },
  });

  return schedule;
}

export async function cancelSchedule(scheduleId: string, userId: string) {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId }, include: { post: true } });
  if (!schedule) throw notFound("Schedule not found.");
  if (schedule.userId !== userId) throw forbidden("You do not own this schedule.");
  if (schedule.status === ScheduleStatus.COMPLETED) {
    throw new AppError("CONFLICT", "This post has already been published and cannot be unscheduled.");
  }
  if (schedule.status === ScheduleStatus.PUBLISHING) {
    throw new AppError("CONFLICT", "This post is mid-publish and cannot be cancelled.");
  }

  await prisma.$transaction([
    prisma.schedule.update({
      where: { id: scheduleId },
      data: { status: ScheduleStatus.CANCELLED, cancelledAt: new Date(), nextAttemptAt: null, leaseId: null },
    }),
    prisma.post.update({
      where: { id: schedule.postId },
      data: { status: PostStatus.APPROVED, failureReason: null },
    }),
  ]);

  await logActivity({
    userId,
    postId: schedule.postId,
    type: ActivityType.POST_SCHEDULE_CANCELLED,
    message: "Schedule cancelled. The post is approved and can be rescheduled.",
  });

  return { ok: true };
}

/** Schedules that are due to run right now, oldest first. */
export async function findDueSchedules(limit = 10) {
  const now = new Date(Date.now() + DUE_WINDOW_MS);
  return prisma.schedule.findMany({
    where: {
      status: ScheduleStatus.PENDING,
      scheduledFor: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { scheduledFor: "asc" },
    take: limit,
    select: { id: true, postId: true, scheduledFor: true },
  });
}

export interface SchedulerTickResult {
  ranAt: string;
  processed: number;
  published: number;
  failed: number;
  blocked: number;
  skipped: number;
  automationsRun: number;
  outcomes: PublishOutcome[];
}

/**
 * One pass of the scheduler.
 *
 * Called by the in-process loop in development and by POST /api/cron/tick in
 * production (Vercel Cron, GitHub Actions, or any external scheduler).
 */
export async function runSchedulerTick(options: { limit?: number; runAutomations?: boolean } = {}): Promise<SchedulerTickResult> {
  const due = await findDueSchedules(options.limit ?? 10);
  const outcomes: PublishOutcome[] = [];

  for (const job of due) {
    try {
      outcomes.push(await executeScheduledPublish(job.id));
    } catch (error) {
      outcomes.push({
        status: "FAILED",
        postId: job.postId,
        scheduleId: job.id,
        message: error instanceof Error ? error.message : "Scheduler error",
      });
    }
  }

  let automationsRun = 0;
  if (options.runAutomations !== false) {
    // Imported lazily: automations depend on the agent, which depends on the
    // provider registry, and this keeps the scheduler's import graph shallow.
    const { runDueAutomations } = await import("./automation");
    automationsRun = (await runDueAutomations()).length;
  }

  return {
    ranAt: new Date().toISOString(),
    processed: outcomes.length,
    published: outcomes.filter((o) => o.status === "PUBLISHED").length,
    failed: outcomes.filter((o) => o.status === "FAILED").length,
    blocked: outcomes.filter((o) => o.status === "BLOCKED").length,
    skipped: outcomes.filter((o) => o.status === "SKIPPED").length,
    automationsRun,
    outcomes,
  };
}

/**
 * Publishes an approved post immediately by creating a schedule for "now" and
 * running it. Going through the same code path means the approval gate, the
 * logs and the idempotency protection all apply to manual publishes too.
 */
export async function publishNow(postId: string, userId: string): Promise<PublishOutcome> {
  const schedule = await schedulePost({
    postId,
    userId,
    scheduledFor: new Date(Date.now() + 1000),
    timezone: "UTC",
  });
  await notify({
    userId,
    type: NotificationType.SYSTEM,
    title: "Publishing now",
    body: "Your approved post has been queued for immediate publishing.",
    link: `/content/${postId}`,
  });
  return executeScheduledPublish(schedule.id);
}
