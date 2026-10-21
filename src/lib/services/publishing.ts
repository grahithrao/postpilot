import {
  ActivityType,
  ApprovalDecision,
  NotificationType,
  PostStatus,
  PublishLogStatus,
  ScheduleStatus,
  type Platform,
  type Prisma,
  type SocialAccount,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, APPROVAL_REQUIRED_MESSAGE, approvalRequired, forbidden, invalidState, notFound } from "@/lib/errors";
import { PLATFORMS, platformSpec } from "@/lib/constants/platforms";
import { getAdapter, PlatformError } from "@/lib/social";
import { logActivity, notify } from "./activity";
import { isApproved } from "./post-status";

/** Backoff between publish attempts. Index is the attempt that just failed. */
const RETRY_BACKOFF_MS = [2 * 60_000, 10 * 60_000, 30 * 60_000];

export interface PublishOutcome {
  status: "PUBLISHED" | "FAILED" | "BLOCKED" | "SKIPPED";
  postId: string;
  scheduleId?: string;
  message: string;
  externalId?: string;
  externalUrl?: string;
  willRetryAt?: Date | null;
}

type PostWithRelations = Prisma.PostGetPayload<{
  include: { socialAccount: true; approvals: { orderBy: { createdAt: "desc" } } };
}>;

/**
 * The single gate every publishing path goes through.
 *
 * This is the product's core rule expressed as code. If any check fails the
 * post never reaches an adapter, and the reason is written to the publishing
 * log so the block is auditable rather than invisible.
 *
 * Checks, in order:
 *   1. the post exists
 *   2. the requesting user owns it
 *   3. a human explicitly approved *this version* of it
 *   4. a social account is connected for the target platform
 *   5. the schedule (when there is one) is in a publishable state
 *   6. the platform is supported by a registered adapter
 */
export async function assertPublishable(input: {
  postId: string;
  userId: string;
  scheduleId?: string | null;
}): Promise<{ post: PostWithRelations; account: SocialAccount }> {
  // 1. Post exists
  const post = await prisma.post.findUnique({
    where: { id: input.postId },
    include: { socialAccount: true, approvals: { orderBy: { createdAt: "desc" } } },
  });
  if (!post) throw notFound("The post no longer exists.");

  // 2. Ownership
  if (post.userId !== input.userId) {
    throw forbidden("You do not own this post.");
  }

  // 3. Human approval — the non-negotiable one.
  if (post.status === PostStatus.REJECTED) {
    throw approvalRequired("This post was rejected by a reviewer and cannot be published.");
  }
  if (!isApproved(post.status)) {
    throw approvalRequired(`The post is in ${post.status} and has not been approved by a human reviewer.`);
  }
  const latestDecision = post.approvals[0];
  if (!latestDecision || latestDecision.decision !== ApprovalDecision.APPROVED) {
    throw approvalRequired("No approval record exists for this post.");
  }
  if (latestDecision.postVersion !== post.version) {
    throw approvalRequired(
      `The post was edited after approval (approved v${latestDecision.postVersion}, current v${post.version}). It must be re-approved.`,
    );
  }

  // 6. Platform supported (checked before the account so the error is clearer)
  if (!(post.platform in PLATFORMS)) {
    throw invalidState(`No adapter is registered for platform ${post.platform}.`);
  }

  // 4. Connected account
  const account =
    post.socialAccount ??
    (await prisma.socialAccount.findFirst({
      where: { userId: post.userId, platform: post.platform, status: "CONNECTED" },
      orderBy: { createdAt: "asc" },
    }));

  if (!account) {
    throw invalidState(
      `No ${platformSpec(post.platform).name} account is connected. Connect one on the Integrations page before publishing.`,
    );
  }
  if (account.status !== "CONNECTED") {
    throw invalidState(
      `The ${platformSpec(post.platform).name} account is ${account.status.toLowerCase().replace("_", " ")}. Reconnect it before publishing.`,
    );
  }

  // 5. Schedule state
  if (input.scheduleId) {
    const schedule = await prisma.schedule.findUnique({ where: { id: input.scheduleId } });
    if (!schedule) throw notFound("The schedule no longer exists.");
    if (schedule.postId !== post.id) throw invalidState("The schedule does not belong to this post.");
    if (schedule.status === ScheduleStatus.CANCELLED) throw invalidState("This schedule was cancelled.");
    if (schedule.status === ScheduleStatus.COMPLETED) {
      throw new AppError("CONFLICT", "This scheduled post has already been published.");
    }
  }

  // Idempotency: a post that already carries an external id is done.
  if (post.status === PostStatus.PUBLISHED && post.externalId) {
    throw new AppError("CONFLICT", "This post has already been published.");
  }

  return { post, account };
}

async function logPublish(entry: {
  postId: string;
  scheduleId?: string | null;
  platform: Platform;
  status: PublishLogStatus;
  attempt: number;
  message: string;
  errorCode?: string;
  externalId?: string;
  externalUrl?: string;
  latencyMs?: number;
  request?: Prisma.InputJsonValue;
  response?: Prisma.InputJsonValue;
}) {
  await prisma.publishingLog.create({
    data: {
      postId: entry.postId,
      scheduleId: entry.scheduleId ?? null,
      platform: entry.platform,
      status: entry.status,
      attempt: entry.attempt,
      message: entry.message,
      errorCode: entry.errorCode,
      externalId: entry.externalId,
      externalUrl: entry.externalUrl,
      latencyMs: entry.latencyMs,
      request: entry.request,
      response: entry.response,
    },
  });
}

/**
 * Records a blocked publish attempt. Called whenever the guard rejects a
 * request so that "nothing happened" is never the only trace.
 */
export async function recordBlockedAttempt(input: {
  postId: string;
  userId: string;
  platform: Platform;
  scheduleId?: string | null;
  reason: string;
}) {
  await logPublish({
    postId: input.postId,
    scheduleId: input.scheduleId,
    platform: input.platform,
    status: PublishLogStatus.BLOCKED,
    attempt: 0,
    message: input.reason,
    errorCode: "APPROVAL_REQUIRED",
  });
  await logActivity({
    userId: input.userId,
    postId: input.postId,
    type: ActivityType.PUBLISH_BLOCKED,
    message: input.reason,
  });
}

/**
 * Executes one publish attempt for a scheduled post.
 *
 * Concurrency safety: the schedule row is claimed with a conditional update, so
 * only one worker can ever move a given schedule into PUBLISHING. A second
 * caller gets SKIPPED rather than a duplicate post.
 */
export async function executeScheduledPublish(scheduleId: string): Promise<PublishOutcome> {
  const leaseId = crypto.randomUUID();

  // --- claim the job atomically -------------------------------------------
  const claimed = await prisma.schedule.updateMany({
    where: {
      id: scheduleId,
      status: { in: [ScheduleStatus.PENDING, ScheduleStatus.QUEUED, ScheduleStatus.FAILED] },
    },
    data: {
      status: ScheduleStatus.PUBLISHING,
      leaseId,
      leasedAt: new Date(),
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });

  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw notFound("Schedule not found.");

  if (claimed.count === 0) {
    await logPublish({
      postId: schedule.postId,
      scheduleId,
      platform: (await prisma.post.findUniqueOrThrow({ where: { id: schedule.postId }, select: { platform: true } }))
        .platform,
      status: PublishLogStatus.SKIPPED_DUPLICATE,
      attempt: schedule.attempts,
      message: `Publish skipped: the schedule is already ${schedule.status}. Duplicate publishing prevented.`,
      errorCode: "DUPLICATE",
    });
    return {
      status: "SKIPPED",
      postId: schedule.postId,
      scheduleId,
      message: `Already ${schedule.status.toLowerCase()} — duplicate publish prevented.`,
    };
  }

  // `attempts` was already incremented by the claim above, so it *is* the
  // number of this attempt: 1 on the first try, 3 on the last of three.
  const attempt = schedule.attempts;

  // --- run the approval gate ----------------------------------------------
  let post: PostWithRelations;
  let account: SocialAccount;
  try {
    const gate = await assertPublishable({ postId: schedule.postId, userId: schedule.userId, scheduleId });
    post = gate.post;
    account = gate.account;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publishing blocked.";
    const isApprovalIssue = error instanceof AppError && error.code === "APPROVAL_REQUIRED";

    await prisma.$transaction([
      prisma.schedule.update({
        where: { id: scheduleId },
        data: { status: ScheduleStatus.FAILED, lastError: message, leaseId: null, nextAttemptAt: null },
      }),
      prisma.post.update({
        where: { id: schedule.postId },
        data: { failureReason: message, ...(isApprovalIssue ? {} : { status: PostStatus.FAILED }) },
      }),
    ]);

    const platform = (
      await prisma.post.findUniqueOrThrow({ where: { id: schedule.postId }, select: { platform: true } })
    ).platform;

    await logPublish({
      postId: schedule.postId,
      scheduleId,
      platform,
      status: PublishLogStatus.BLOCKED,
      attempt,
      message,
      errorCode: error instanceof AppError ? error.code : "GUARD_FAILED",
    });
    await logActivity({
      userId: schedule.userId,
      postId: schedule.postId,
      type: ActivityType.PUBLISH_BLOCKED,
      message,
    });
    await notify({
      userId: schedule.userId,
      type: NotificationType.POST_FAILED,
      title: isApprovalIssue ? APPROVAL_REQUIRED_MESSAGE : "Scheduled post could not be published",
      body: message,
      link: `/content/${schedule.postId}`,
    });

    return { status: "BLOCKED", postId: schedule.postId, scheduleId, message };
  }

  // --- publish -------------------------------------------------------------
  await prisma.post.update({
    where: { id: post.id },
    data: { status: PostStatus.PUBLISHING, publishAttempts: { increment: 1 }, failureReason: null },
  });
  await logActivity({
    userId: post.userId,
    postId: post.id,
    type: ActivityType.POST_PUBLISHING,
    message: `Publishing to ${platformSpec(post.platform).name} (attempt ${attempt}).`,
  });

  const adapter = getAdapter(post.platform);
  const request = {
    postId: post.id,
    headline: post.headline,
    caption: post.caption,
    hashtags: post.hashtags,
    cta: post.cta,
    imagePrompt: post.imagePrompt,
    mediaUrl: post.mediaUrl,
    idempotencyKey: schedule.idempotencyKey,
    attempt,
  };

  const startedAt = Date.now();
  await logPublish({
    postId: post.id,
    scheduleId,
    platform: post.platform,
    status: PublishLogStatus.ATTEMPT,
    attempt,
    message: `Dispatching to the ${platformSpec(post.platform).name} adapter.`,
    request: { idempotencyKey: schedule.idempotencyKey, renderedLength: adapter.renderPayload(request).length },
  });

  try {
    const result = await adapter.publishPost(account, request);
    const latencyMs = Date.now() - startedAt;

    // --- verification: confirm the post is actually live -------------------
    const status = await adapter.getPublishingStatus(account, result.externalId).catch(() => null);
    const verified = !status || status.state === "LIVE";

    await prisma.$transaction([
      prisma.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.PUBLISHED,
          publishedAt: result.publishedAt,
          publishedUrl: result.externalUrl,
          externalId: result.externalId,
          failureReason: null,
          socialAccountId: account.id,
        },
      }),
      prisma.schedule.update({
        where: { id: scheduleId },
        data: {
          status: ScheduleStatus.COMPLETED,
          completedAt: new Date(),
          leaseId: null,
          lastError: null,
          nextAttemptAt: null,
        },
      }),
      prisma.socialAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } }),
    ]);

    await logPublish({
      postId: post.id,
      scheduleId,
      platform: post.platform,
      status: PublishLogStatus.SUCCESS,
      attempt,
      message: verified
        ? `Published to ${platformSpec(post.platform).name} and verified live.`
        : `Published to ${platformSpec(post.platform).name}; verification returned ${status?.state}.`,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
      latencyMs,
      response: result.raw as Prisma.InputJsonValue,
    });
    await logActivity({
      userId: post.userId,
      postId: post.id,
      type: ActivityType.POST_PUBLISHED,
      message: `Published to ${platformSpec(post.platform).name} as @${account.handle}.`,
      metadata: { externalId: result.externalId, externalUrl: result.externalUrl },
    });
    await notify({
      userId: post.userId,
      type: NotificationType.POST_PUBLISHED,
      title: `Published to ${platformSpec(post.platform).name}`,
      body: post.headline ?? post.caption.slice(0, 120),
      link: `/content/${post.id}`,
    });

    return {
      status: "PUBLISHED",
      postId: post.id,
      scheduleId,
      message: `Published to ${platformSpec(post.platform).name}.`,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const platformError = error instanceof PlatformError ? error : null;
    const message = error instanceof Error ? error.message : "Unknown publishing error.";
    const retryable = platformError?.retryable ?? false;
    const canRetry = retryable && attempt < schedule.maxAttempts;
    const nextAttemptAt = canRetry
      ? new Date(Date.now() + (RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS.at(-1)!))
      : null;

    await prisma.$transaction([
      prisma.schedule.update({
        where: { id: scheduleId },
        data: {
          status: canRetry ? ScheduleStatus.PENDING : ScheduleStatus.FAILED,
          lastError: message,
          nextAttemptAt,
          leaseId: null,
        },
      }),
      prisma.post.update({
        where: { id: post.id },
        data: {
          status: canRetry ? PostStatus.SCHEDULED : PostStatus.FAILED,
          failureReason: message,
        },
      }),
    ]);

    await logPublish({
      postId: post.id,
      scheduleId,
      platform: post.platform,
      status: canRetry ? PublishLogStatus.RETRY_SCHEDULED : PublishLogStatus.FAILURE,
      attempt,
      message: canRetry
        ? `${message} Retrying at ${nextAttemptAt!.toISOString()} (attempt ${attempt + 1} of ${schedule.maxAttempts}).`
        : message,
      errorCode: platformError?.code ?? "PUBLISH_FAILED",
      latencyMs,
    });
    await logActivity({
      userId: post.userId,
      postId: post.id,
      type: ActivityType.POST_FAILED,
      message: canRetry ? `Publish attempt ${attempt} failed; a retry is queued.` : `Publishing failed: ${message}`,
    });

    if (!canRetry) {
      await notify({
        userId: post.userId,
        type: NotificationType.POST_FAILED,
        title: `Publishing to ${platformSpec(post.platform).name} failed`,
        body: message,
        link: `/content/${post.id}`,
      });
    }

    return {
      status: "FAILED",
      postId: post.id,
      scheduleId,
      message,
      willRetryAt: nextAttemptAt,
    };
  }
}
