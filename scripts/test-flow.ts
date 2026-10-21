/* eslint-disable no-console */
/**
 * End-to-end workflow test.
 *
 * Exercises the complete lifecycle against the real database, the real
 * LangGraph agent (with its Postgres checkpointer) and the real publishing
 * engine — no HTTP layer, no mocks beyond the ones the product ships with.
 *
 * Run with: npm run test:flow
 */
try {
  process.loadEnvFile?.(".env");
} catch {
  /* environment may already be populated */
}

import { ApprovalDecision, PostStatus, PublishLogStatus, ScheduleStatus } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { startContentRun, resolveApproval } from "../src/lib/agent/runner";
import { updatePost, refinePost } from "../src/lib/services/posts";
import { schedulePost, runSchedulerTick, publishNow } from "../src/lib/services/scheduling";
import { assertPublishable, executeScheduledPublish } from "../src/lib/services/publishing";
import { submitForApproval, approvalGate } from "../src/lib/services/approvals";
import { connectAccount, disconnectAccount } from "../src/lib/services/integrations";
import { getDashboardStats } from "../src/lib/services/analytics";
import { __setProviderForTesting } from "../src/lib/ai";
import { APPROVAL_REQUIRED_MESSAGE, isAppError } from "../src/lib/errors";
import type { ContentBrief } from "../src/lib/ai/types";
import bcrypt from "bcryptjs";

// --- tiny assertion harness -------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label + (detail ? ` -- ${detail}` : ""));
    console.log(`  ✗ ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

async function expectRejection(label: string, fn: () => Promise<unknown>, expected: string | RegExp) {
  try {
    await fn();
    check(label, false, "the call unexpectedly succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const matches = typeof expected === "string" ? message.includes(expected) : expected.test(message);
    check(label, matches, matches ? undefined : `got: ${message}`);
  }
}

// --- fixtures ---------------------------------------------------------------

const RUN_ID = Date.now().toString(36);

async function createTestUser(suffix: string, withAccounts = true) {
  const user = await prisma.user.create({
    data: {
      email: `flowtest+${RUN_ID}-${suffix}@postpilot.test`,
      name: `Flow Test ${suffix}`,
      passwordHash: await bcrypt.hash("flowtest1234", 4),
    },
  });
  if (withAccounts) {
    await connectAccount({ userId: user.id, platform: "LINKEDIN" });
    await connectAccount({ userId: user.id, platform: "X" });
  }
  return user;
}

const brief = (over: Partial<ContentBrief> = {}): ContentBrief => ({
  topic: "how small teams keep their reporting honest",
  product: "Northwind Pulse",
  audience: "operations leaders",
  platform: "LINKEDIN",
  contentType: "EDUCATIONAL",
  tone: "PROFESSIONAL",
  length: "MEDIUM",
  language: "English",
  ctaRequest: "Read the full guide",
  keywords: ["reporting", "operational visibility"],
  hashtags: [],
  notes: null,
  ...over,
});

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: "@postpilot.test" } },
    select: { id: true },
  });
  for (const user of users) {
    await prisma.agentCheckpointWrite.deleteMany({
      where: { threadId: { in: (await prisma.agentRun.findMany({ where: { userId: user.id }, select: { threadId: true } })).map((r) => r.threadId) } },
    });
    await prisma.agentCheckpoint.deleteMany({
      where: { threadId: { in: (await prisma.agentRun.findMany({ where: { userId: user.id }, select: { threadId: true } })).map((r) => r.threadId) } },
    });
  }
  await prisma.user.deleteMany({ where: { email: { contains: "@postpilot.test" } } });
}

// --- the scenarios ----------------------------------------------------------

async function happyPath() {
  section("1. The complete happy path");
  const user = await createTestUser("happy");

  // 1-4. Generate through the agent
  const run = await startContentRun({ userId: user.id, brief: brief() });
  check("agent produced a post", Boolean(run.postId));
  check("agent paused at human approval", run.status === "awaiting_approval", `status=${run.status}`);
  check("approval has NOT been granted", run.approved === false);
  check(
    "workflow ran every pre-approval node",
    ["parse_request", "generate_content", "validate_content", "optimize_for_platform", "quality_check"].every((n) =>
      run.nodeHistory.includes(n as never),
    ),
    run.nodeHistory.join(" -> "),
  );
  check("a quality score was produced", (run.qualityReport?.score ?? 0) > 0, `score=${run.qualityReport?.score}`);
  check("the deterministic checks ran", (run.qualityReport?.checks.length ?? 0) >= 8);
  check("a posting time was suggested", Boolean(run.suggestedTime));

  const postId = run.postId;

  // 5. Enters pending approval
  await submitForApproval(postId, user.id);
  let post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
  check("post is PENDING_APPROVAL", post.status === PostStatus.PENDING_APPROVAL, post.status);

  // Publishing must be impossible at this point.
  await expectRejection(
    "publishing a pending post is blocked",
    () => assertPublishable({ postId, userId: user.id }),
    APPROVAL_REQUIRED_MESSAGE,
  );

  // 6-7. Human edits it
  const beforeVersion = post.version;
  const edited = await updatePost(postId, user.id, {
    caption: `${post.caption}\n\nEdited by a human reviewer before approval.`,
    changeSummary: "Reviewer tightened the closing paragraph.",
  });
  check("the edit created a new version", edited.version === beforeVersion + 1, `${beforeVersion} -> ${edited.version}`);
  check("a HUMAN_EDIT revision was recorded", edited.revisions.some((r) => r.source === "HUMAN_EDIT"));

  // 8. Human approves
  const decision = await resolveApproval({
    postId,
    reviewerId: user.id,
    decision: ApprovalDecision.APPROVED,
    feedback: "Reads well. Approved for the Tuesday slot.",
  });
  check("approval resumed the LangGraph run", decision.viaAgent === true);
  check("post is APPROVED", decision.status === PostStatus.APPROVED, decision.status);
  check("the graph reached the approval node", (decision.summary?.nodeHistory ?? []).includes("human_approval" as never));

  const gate = await approvalGate(postId);
  check("the approval gate is open", gate.approved === true, gate.reason);

  // 9. Schedule it (5 seconds out, so the scheduler picks it up in this run)
  const schedule = await schedulePost({
    postId,
    userId: user.id,
    scheduledFor: new Date(Date.now() + 5_000),
    timezone: "UTC",
  });
  post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
  check("post is SCHEDULED", post.status === PostStatus.SCHEDULED, post.status);
  check("the idempotency key is bound to the version", schedule.idempotencyKey === `post:${postId}:v${post.version}`);

  // 10-13. The scheduler picks it up and the publishing engine runs
  process.env.DEMO_PUBLISH_FAILURE_RATE = "0";
  await new Promise((r) => setTimeout(r, 5_500));
  const tick = await runSchedulerTick({ limit: 5, runAutomations: false });
  check("the scheduler found the due job", tick.processed >= 1, `processed=${tick.processed}`);
  check("the post published", tick.published >= 1, JSON.stringify(tick.outcomes.map((o) => o.status)));

  post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
  check("post is PUBLISHED", post.status === PostStatus.PUBLISHED, post.status);
  check("an external id was stored", Boolean(post.externalId));
  check("a permalink was stored", Boolean(post.publishedUrl));
  check("publishedAt is set", Boolean(post.publishedAt));

  // 14. Publishing log
  const logs = await prisma.publishingLog.findMany({ where: { postId }, orderBy: { createdAt: "asc" } });
  check("an ATTEMPT log was written", logs.some((l) => l.status === PublishLogStatus.ATTEMPT));
  check("a SUCCESS log was written", logs.some((l) => l.status === PublishLogStatus.SUCCESS));

  const completed = await prisma.schedule.findUniqueOrThrow({ where: { id: schedule.id } });
  check("the schedule is COMPLETED", completed.status === ScheduleStatus.COMPLETED, completed.status);

  // 15. Dashboard statistics reflect it
  const stats = await getDashboardStats(user.id);
  check("dashboard counts the published post", stats.published === 1, JSON.stringify(stats));

  return { user, postId, scheduleId: schedule.id };
}

async function duplicatePublishing(ctx: { user: { id: string }; postId: string; scheduleId: string }) {
  section("2. Duplicate publishing attempt");

  const outcome = await executeScheduledPublish(ctx.scheduleId);
  check("a second publish of the same schedule is skipped", outcome.status === "SKIPPED", outcome.message);

  const dupLogs = await prisma.publishingLog.count({
    where: { scheduleId: ctx.scheduleId, status: PublishLogStatus.SKIPPED_DUPLICATE },
  });
  check("the duplicate attempt was logged", dupLogs >= 1);

  const successLogs = await prisma.publishingLog.count({
    where: { postId: ctx.postId, status: PublishLogStatus.SUCCESS },
  });
  check("still exactly one successful publish", successLogs === 1, `found ${successLogs}`);

  await expectRejection(
    "publishing an already-published post is refused",
    () => assertPublishable({ postId: ctx.postId, userId: ctx.user.id }),
    "already been published",
  );
}

async function rejectionPath() {
  section("3. Rejection blocks publishing");
  const user = await createTestUser("reject");

  const run = await startContentRun({ userId: user.id, brief: brief({ platform: "X", length: "SHORT" }) });
  await submitForApproval(run.postId, user.id);

  const decision = await resolveApproval({
    postId: run.postId,
    reviewerId: user.id,
    decision: ApprovalDecision.REJECTED,
    feedback: "The pricing claim is not approved by legal.",
  });
  check("post is REJECTED", decision.status === PostStatus.REJECTED, decision.status);

  await expectRejection(
    "a rejected post cannot be published",
    () => assertPublishable({ postId: run.postId, userId: user.id }),
    APPROVAL_REQUIRED_MESSAGE,
  );
  await expectRejection(
    "a rejected post cannot be scheduled",
    () => schedulePost({ postId: run.postId, userId: user.id, scheduledFor: new Date(Date.now() + 3600_000) }),
    APPROVAL_REQUIRED_MESSAGE,
  );

  const approval = await prisma.approval.findFirst({ where: { postId: run.postId } });
  check("the rejection is in the audit trail", approval?.decision === ApprovalDecision.REJECTED);
  check("the reviewer's feedback was stored", Boolean(approval?.feedback));
  return { user, postId: run.postId };
}

async function regeneration() {
  section("4. Regeneration after changes requested");
  const user = await createTestUser("regen");

  const run = await startContentRun({ userId: user.id, brief: brief({ contentType: "PROMOTIONAL" }) });
  await submitForApproval(run.postId, user.id);
  const before = await prisma.post.findUniqueOrThrow({ where: { id: run.postId } });

  const decision = await resolveApproval({
    postId: run.postId,
    reviewerId: user.id,
    decision: ApprovalDecision.REGENERATION_REQUESTED,
    feedback: "Try a different angle, this reads like the last one.",
  });
  check("post returned to DRAFT", decision.status === PostStatus.DRAFT, decision.status);

  const regenerated = await refinePost(run.postId, user.id, {
    action: "regenerate",
    instruction: "Try a different angle.",
  });
  check("regeneration bumped the version", regenerated.version === before.version + 1);
  check("the copy actually changed", regenerated.caption !== before.caption);
  check(
    "a regeneration revision was recorded",
    regenerated.revisions.some((r) => r.source === "AI_REGENERATED"),
  );

  await expectRejection(
    "a regenerated post still needs approval before publishing",
    () => assertPublishable({ postId: run.postId, userId: user.id }),
    APPROVAL_REQUIRED_MESSAGE,
  );
}

async function editAfterApprovalInvalidates() {
  section("5. Editing after approval revokes it");
  const user = await createTestUser("revoke");

  const run = await startContentRun({ userId: user.id, brief: brief() });
  await submitForApproval(run.postId, user.id);
  await resolveApproval({ postId: run.postId, reviewerId: user.id, decision: ApprovalDecision.APPROVED });
  await schedulePost({ postId: run.postId, userId: user.id, scheduledFor: new Date(Date.now() + 7 * 86_400_000) });

  const edited = await updatePost(run.postId, user.id, {
    caption: "A materially different caption written after the reviewer signed off.",
  });
  check("the post fell back to DRAFT", edited.status === PostStatus.DRAFT, edited.status);

  const gate = await approvalGate(run.postId);
  check("the approval gate closed", gate.approved === false, gate.reason);
  check("the reason names the version mismatch", /re-approval|edited/i.test(gate.reason));

  const schedules = await prisma.schedule.findMany({ where: { postId: run.postId } });
  check("the pending schedule was cancelled", schedules.every((s) => s.status === ScheduleStatus.CANCELLED));

  await expectRejection(
    "the stale approval cannot publish the new text",
    () => assertPublishable({ postId: run.postId, userId: user.id }),
    APPROVAL_REQUIRED_MESSAGE,
  );
}

async function missingSocialAccount() {
  section("6. Missing social account");
  const user = await createTestUser("noaccount", false);

  const run = await startContentRun({ userId: user.id, brief: brief() });
  await submitForApproval(run.postId, user.id);
  await resolveApproval({ postId: run.postId, reviewerId: user.id, decision: ApprovalDecision.APPROVED });

  await expectRejection(
    "scheduling without a connected account is refused",
    () => schedulePost({ postId: run.postId, userId: user.id, scheduledFor: new Date(Date.now() + 3600_000) }),
    "Connect a LinkedIn account",
  );

  // Connect, schedule, then disconnect and confirm the guard notices.
  await connectAccount({ userId: user.id, platform: "LINKEDIN" });
  await schedulePost({ postId: run.postId, userId: user.id, scheduledFor: new Date(Date.now() + 3600_000) });
  const account = await prisma.socialAccount.findFirstOrThrow({ where: { userId: user.id } });
  await expectRejection(
    "disconnecting an account with pending posts is refused",
    () => disconnectAccount(account.id, user.id),
    "scheduled post",
  );
}

async function invalidSchedule() {
  section("7. Invalid schedules");
  const user = await createTestUser("badschedule");

  const run = await startContentRun({ userId: user.id, brief: brief() });
  await submitForApproval(run.postId, user.id);
  await resolveApproval({ postId: run.postId, reviewerId: user.id, decision: ApprovalDecision.APPROVED });

  await expectRejection(
    "a past schedule is refused",
    () => schedulePost({ postId: run.postId, userId: user.id, scheduledFor: new Date(Date.now() - 3600_000) }),
    "in the past",
  );
  await expectRejection(
    "a schedule beyond 12 months is refused",
    () => schedulePost({ postId: run.postId, userId: user.id, scheduledFor: new Date(Date.now() + 400 * 86_400_000) }),
    "12 months",
  );
}

async function failedPublishingWithRetry() {
  section("8. Failed publishing and retry");
  const user = await createTestUser("failing");

  const run = await startContentRun({ userId: user.id, brief: brief() });
  await submitForApproval(run.postId, user.id);
  await resolveApproval({ postId: run.postId, reviewerId: user.id, decision: ApprovalDecision.APPROVED });
  const schedule = await schedulePost({
    postId: run.postId,
    userId: user.id,
    scheduledFor: new Date(Date.now() + 1000),
  });

  // Force every simulated publish to fail.
  process.env.DEMO_PUBLISH_FAILURE_RATE = "1";
  const first = await executeScheduledPublish(schedule.id);
  check("the publish failed", first.status === "FAILED", first.message);
  check("a retry was scheduled", Boolean(first.willRetryAt), "no retry time set");

  let post = await prisma.post.findUniqueOrThrow({ where: { id: run.postId } });
  check("the post stayed SCHEDULED while retries remain", post.status === PostStatus.SCHEDULED, post.status);

  await executeScheduledPublish(schedule.id);
  const third = await executeScheduledPublish(schedule.id);
  check("attempts stop at maxAttempts", third.status === "FAILED" && !third.willRetryAt, JSON.stringify(third));

  post = await prisma.post.findUniqueOrThrow({ where: { id: run.postId } });
  check("the post is FAILED after the last attempt", post.status === PostStatus.FAILED, post.status);
  check("a failure reason was stored", Boolean(post.failureReason));

  const logs = await prisma.publishingLog.findMany({ where: { postId: run.postId } });
  check("retries were logged", logs.filter((l) => l.status === PublishLogStatus.RETRY_SCHEDULED).length >= 2);
  check("a terminal failure was logged", logs.some((l) => l.status === PublishLogStatus.FAILURE));

  // Recovering: the platform comes back and the post publishes.
  process.env.DEMO_PUBLISH_FAILURE_RATE = "0";
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { attempts: 0, status: ScheduleStatus.PENDING, nextAttemptAt: null },
  });
  const recovered = await executeScheduledPublish(schedule.id);
  check("the post publishes once the platform recovers", recovered.status === "PUBLISHED", recovered.message);
}

async function platformValidationFailure() {
  section("9. Platform validation rejects impossible content");
  const user = await createTestUser("toolong");
  process.env.DEMO_PUBLISH_FAILURE_RATE = "0";

  const run = await startContentRun({ userId: user.id, brief: brief({ platform: "X", length: "SHORT" }) });
  await submitForApproval(run.postId, user.id);

  // Force an over-length X post past the editor, then approve it.
  await prisma.post.update({
    where: { id: run.postId },
    data: { caption: "A".repeat(400) },
  });
  await resolveApproval({ postId: run.postId, reviewerId: user.id, decision: ApprovalDecision.APPROVED });

  const schedule = await schedulePost({
    postId: run.postId,
    userId: user.id,
    scheduledFor: new Date(Date.now() + 1000),
  });
  const outcome = await executeScheduledPublish(schedule.id);
  check("the adapter refused the over-length post", outcome.status === "FAILED", outcome.message);
  check("the error names the character limit", /280|characters/.test(outcome.message), outcome.message);
  check("no retry for a non-retryable error", !outcome.willRetryAt);

  const post = await prisma.post.findUniqueOrThrow({ where: { id: run.postId } });
  check("the post is FAILED, not PUBLISHED", post.status === PostStatus.FAILED, post.status);
  check("nothing was marked as published", post.externalId === null);
}

async function providerFailure() {
  section("10. AI provider failure");
  const user = await createTestUser("provider");

  __setProviderForTesting({
    name: "mock",
    model: "always-fails",
    isMock: true,
    async generate() {
      throw new Error("Simulated upstream 503 from the model provider.");
    },
  });

  await expectRejection(
    "a provider outage surfaces as a clean error",
    () => startContentRun({ userId: user.id, brief: brief() }),
    "could not generate content",
  );

  __setProviderForTesting(null);
  const recovered = await startContentRun({ userId: user.id, brief: brief() });
  check("generation works again once the provider recovers", Boolean(recovered.content?.caption));
}

async function ownershipIsolation(rejected: { user: { id: string }; postId: string }) {
  section("11. Cross-user authorisation");
  const intruder = await createTestUser("intruder");

  await expectRejection(
    "another user cannot publish your post",
    () => assertPublishable({ postId: rejected.postId, userId: intruder.id }),
    "do not own",
  );
  await expectRejection(
    "another user cannot schedule your post",
    () => schedulePost({ postId: rejected.postId, userId: intruder.id, scheduledFor: new Date(Date.now() + 3600_000) }),
    "do not own",
  );
  await expectRejection(
    "another user cannot edit your post",
    () => updatePost(rejected.postId, intruder.id, { caption: "hijacked" }),
    "do not own",
  );
  await expectRejection(
    "another user cannot approve your post",
    () =>
      resolveApproval({ postId: rejected.postId, reviewerId: intruder.id, decision: ApprovalDecision.APPROVED }),
    /own workspace|do not own/,
  );
}

async function publishNowRequiresApproval() {
  section("12. Publish-now still requires approval");
  const user = await createTestUser("publishnow");
  process.env.DEMO_PUBLISH_FAILURE_RATE = "0";

  const run = await startContentRun({ userId: user.id, brief: brief() });
  await expectRejection(
    "publish-now on a draft is blocked",
    () => publishNow(run.postId, user.id),
    APPROVAL_REQUIRED_MESSAGE,
  );

  await submitForApproval(run.postId, user.id);
  await resolveApproval({ postId: run.postId, reviewerId: user.id, decision: ApprovalDecision.APPROVED });

  const outcome = await publishNow(run.postId, user.id);
  check("publish-now works once approved", outcome.status === "PUBLISHED", outcome.message);

  const post = await prisma.post.findUniqueOrThrow({ where: { id: run.postId } });
  check("the post is PUBLISHED", post.status === PostStatus.PUBLISHED);
}

// --- runner -----------------------------------------------------------------

async function main() {
  console.log("PostPilot end-to-end workflow test");
  console.log("==================================");

  await cleanup();
  const originalFailureRate = process.env.DEMO_PUBLISH_FAILURE_RATE;

  try {
    const happy = await happyPath();
    await duplicatePublishing(happy);
    const rejected = await rejectionPath();
    await regeneration();
    await editAfterApprovalInvalidates();
    await missingSocialAccount();
    await invalidSchedule();
    await failedPublishingWithRetry();
    await platformValidationFailure();
    await providerFailure();
    await ownershipIsolation(rejected);
    await publishNowRequiresApproval();
  } finally {
    process.env.DEMO_PUBLISH_FAILURE_RATE = originalFailureRate;
    await cleanup();
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("=".repeat(50));

  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("\nTest run crashed:", error);
  if (isAppError(error)) console.error("  code:", error.code);
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
