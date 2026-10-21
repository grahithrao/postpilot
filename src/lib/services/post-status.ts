import { PostStatus } from "@prisma/client";
import { invalidState } from "@/lib/errors";

/**
 * The post lifecycle, expressed as an explicit transition table.
 *
 * Every status change in the application goes through `assertTransition`, which
 * is what makes the human-approval gate structural rather than a UI convention:
 * there is no edge from DRAFT or PENDING_APPROVAL to SCHEDULED, so content can
 * only reach the scheduler by way of APPROVED.
 */
const TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  DRAFT: [PostStatus.PENDING_APPROVAL, PostStatus.DRAFT, PostStatus.ARCHIVED],
  PENDING_APPROVAL: [
    PostStatus.APPROVED,
    PostStatus.REJECTED,
    PostStatus.DRAFT, // changes requested / regeneration sends it back to the author
    PostStatus.PENDING_APPROVAL,
    PostStatus.ARCHIVED,
  ],
  APPROVED: [
    PostStatus.SCHEDULED,
    PostStatus.PUBLISHING, // "publish now" still requires this APPROVED precondition
    PostStatus.DRAFT, // an edit after approval invalidates the approval
    PostStatus.ARCHIVED,
  ],
  REJECTED: [PostStatus.DRAFT, PostStatus.ARCHIVED],
  SCHEDULED: [PostStatus.PUBLISHING, PostStatus.APPROVED, PostStatus.FAILED, PostStatus.ARCHIVED],
  PUBLISHING: [PostStatus.PUBLISHED, PostStatus.FAILED, PostStatus.SCHEDULED],
  PUBLISHED: [PostStatus.ARCHIVED],
  FAILED: [PostStatus.SCHEDULED, PostStatus.APPROVED, PostStatus.ARCHIVED],
  ARCHIVED: [PostStatus.DRAFT],
};

/**
 * Statuses in which a human's sign-off is still live.
 *
 * FAILED belongs here: a post only reaches it because a platform API errored,
 * not because anything about the content changed. The reviewer approved this
 * exact version, so retrying must not demand a second approval — and if the
 * author edits the copy to fix it, `updatePost` bumps the version and drops the
 * post back to DRAFT, which invalidates the approval anyway.
 */
export const APPROVED_STATES: PostStatus[] = [
  PostStatus.APPROVED,
  PostStatus.SCHEDULED,
  PostStatus.PUBLISHING,
  PostStatus.PUBLISHED,
  PostStatus.FAILED,
];

/** Statuses that may never reach a platform API. */
export const BLOCKED_FROM_PUBLISHING: PostStatus[] = [
  PostStatus.DRAFT,
  PostStatus.PENDING_APPROVAL,
  PostStatus.REJECTED,
  PostStatus.ARCHIVED,
];

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: PostStatus, to: PostStatus): void {
  if (!canTransition(from, to)) {
    throw invalidState(`Cannot move a post from ${from} to ${to}.`);
  }
}

export function isApproved(status: PostStatus): boolean {
  return APPROVED_STATES.includes(status);
}

/** A post can be edited freely until it is locked by the publishing pipeline. */
export function isEditable(status: PostStatus): boolean {
  return status !== PostStatus.PUBLISHING && status !== PostStatus.PUBLISHED;
}

export function isSchedulable(status: PostStatus): boolean {
  return status === PostStatus.APPROVED || status === PostStatus.SCHEDULED || status === PostStatus.FAILED;
}
