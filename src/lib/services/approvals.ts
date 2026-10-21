import { ActivityType, ApprovalDecision, NotificationType, PostStatus, type Approval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidden, invalidState, notFound } from "@/lib/errors";
import { logActivity, notify } from "./activity";
import { assertTransition } from "./post-status";

export interface ApprovalDecisionInput {
  postId: string;
  reviewerId: string;
  decision: ApprovalDecision;
  feedback?: string | null;
}

const NEXT_STATUS: Record<ApprovalDecision, PostStatus> = {
  APPROVED: PostStatus.APPROVED,
  REJECTED: PostStatus.REJECTED,
  CHANGES_REQUESTED: PostStatus.DRAFT,
  REGENERATION_REQUESTED: PostStatus.DRAFT,
};

const ACTIVITY: Record<ApprovalDecision, ActivityType> = {
  APPROVED: ActivityType.POST_APPROVED,
  REJECTED: ActivityType.POST_REJECTED,
  CHANGES_REQUESTED: ActivityType.POST_CHANGES_REQUESTED,
  REGENERATION_REQUESTED: ActivityType.POST_CHANGES_REQUESTED,
};

const DECISION_LABEL: Record<ApprovalDecision, string> = {
  APPROVED: "approved",
  REJECTED: "rejected",
  CHANGES_REQUESTED: "sent back with changes requested",
  REGENERATION_REQUESTED: "sent back for regeneration",
};

/**
 * Records a human decision on a post.
 *
 * This is the only function in the codebase that writes an Approval row, and
 * therefore the only thing that can unlock scheduling and publishing. Both the
 * LangGraph `human_approval` node and the REST endpoint call through here, so
 * there is exactly one implementation of the rule.
 */
export async function applyApprovalDecision(input: ApprovalDecisionInput): Promise<{
  approval: Approval;
  status: PostStatus;
}> {
  const post = await prisma.post.findUnique({ where: { id: input.postId } });
  if (!post) throw notFound("Post not found.");
  if (post.userId !== input.reviewerId) {
    // In a multi-seat deployment this widens to a workspace membership check;
    // the point is that approval is always attributable to a real person.
    throw forbidden("You can only review posts in your own workspace.");
  }
  if (post.status === PostStatus.PUBLISHED) {
    throw invalidState("This post has already been published.");
  }
  if (post.status === PostStatus.PUBLISHING) {
    throw invalidState("This post is mid-publish and can no longer be reviewed.");
  }

  const nextStatus = NEXT_STATUS[input.decision];
  assertTransition(post.status, nextStatus);

  const [approval] = await prisma.$transaction([
    prisma.approval.create({
      data: {
        postId: post.id,
        reviewerId: input.reviewerId,
        decision: input.decision,
        feedback: input.feedback?.trim() || null,
        qualityScoreAtDecision: post.qualityScore,
        postVersion: post.version,
      },
    }),
    prisma.post.update({
      where: { id: post.id },
      data: { status: nextStatus, failureReason: null },
    }),
  ]);

  await logActivity({
    userId: post.userId,
    postId: post.id,
    type: ACTIVITY[input.decision],
    message: `Post ${DECISION_LABEL[input.decision]}${input.feedback ? `: ${input.feedback}` : "."}`,
    metadata: { postVersion: post.version, decision: input.decision },
  });

  await notify({
    userId: post.userId,
    type: input.decision === ApprovalDecision.APPROVED ? NotificationType.POST_APPROVED : NotificationType.POST_REJECTED,
    title: `Post ${DECISION_LABEL[input.decision]}`,
    body: input.feedback ?? (input.decision === ApprovalDecision.APPROVED ? "Ready to schedule." : undefined),
    link: `/content/${post.id}`,
  });

  return { approval, status: nextStatus };
}

/** Moves a draft into the approval queue. */
export async function submitForApproval(postId: string, userId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post not found.");
  if (post.userId !== userId) throw forbidden("You do not own this post.");
  if (!post.caption.trim()) throw invalidState("Generate or write content before sending it for approval.");

  assertTransition(post.status, PostStatus.PENDING_APPROVAL);
  const updated = await prisma.post.update({
    where: { id: postId },
    data: { status: PostStatus.PENDING_APPROVAL },
  });

  await logActivity({
    userId,
    postId,
    type: ActivityType.POST_SUBMITTED,
    message: `Sent to the approval queue at v${post.version}.`,
  });
  await notify({
    userId,
    type: NotificationType.APPROVAL_REQUESTED,
    title: "A post is waiting for your approval",
    body: post.headline ?? post.caption.slice(0, 120),
    link: `/approvals`,
  });

  return updated;
}

/** Whether the current version of a post carries a live human approval. */
export async function approvalGate(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      version: true,
      status: true,
      approvals: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!post) return { approved: false, reason: "Post not found." };

  const latest = post.approvals[0];
  if (!latest) return { approved: false, reason: "No human has reviewed this post yet." };
  if (latest.decision !== ApprovalDecision.APPROVED) {
    return { approved: false, reason: `The most recent decision was ${DECISION_LABEL[latest.decision]}.` };
  }
  if (latest.postVersion !== post.version) {
    return {
      approved: false,
      reason: `Approved at v${latest.postVersion} but the post is now v${post.version}. It needs re-approval.`,
    };
  }
  return { approved: true, reason: `Approved at v${latest.postVersion}.` };
}

export { ApprovalDecision };
