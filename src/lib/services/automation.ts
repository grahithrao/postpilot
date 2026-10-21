import {
  ActivityType,
  AutomationRunStatus,
  NotificationType,
  PostStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { platformSpec } from "@/lib/constants/platforms";
import { startContentRun } from "@/lib/agent/runner";
import { logActivity, notify } from "./activity";
import { computeNextRun, describeSchedule } from "./automation-schedule";

export { computeNextRun, describeSchedule };

/**
 * Runs one automation.
 *
 * It generates content through the same LangGraph agent a human uses, and then
 * stops. `requiresApproval` is not a setting the runner consults — the agent
 * itself pauses at the approval interrupt, so there is no code path in which an
 * automation can publish unattended.
 */
export async function runAutomation(automationId: string) {
  const automation = await prisma.automation.findUnique({ where: { id: automationId } });
  if (!automation) throw notFound("Automation not found.");

  const run = await prisma.automationRun.create({
    data: { automationId, status: AutomationRunStatus.RUNNING },
  });

  try {
    const summary = await startContentRun({
      userId: automation.userId,
      brief: {
        topic: automation.topic,
        product: null,
        audience: automation.audience,
        platform: automation.platform,
        contentType: automation.contentType,
        tone: automation.tone,
        length: "MEDIUM",
        language: "English",
        ctaRequest: null,
        keywords: automation.keywords,
        hashtags: [],
        notes: `Generated automatically by the "${automation.name}" automation.`,
      },
    });

    // Automations put their output straight into the approval queue — a human
    // still has to act on it before anything can be scheduled or published.
    await prisma.post.update({
      where: { id: summary.postId },
      data: { status: PostStatus.PENDING_APPROVAL, automationId: automation.id },
    });

    const nextRunAt = computeNextRun(automation);
    await prisma.$transaction([
      prisma.automation.update({
        where: { id: automationId },
        data: { lastRunAt: new Date(), nextRunAt, runCount: { increment: 1 } },
      }),
      prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: AutomationRunStatus.SUCCEEDED,
          postId: summary.postId,
          message: `Generated a draft (quality ${summary.qualityReport?.score ?? "n/a"}) and sent it to the approval queue.`,
          finishedAt: new Date(),
        },
      }),
    ]);

    await logActivity({
      userId: automation.userId,
      postId: summary.postId,
      type: ActivityType.AUTOMATION_RUN,
      message: `"${automation.name}" generated a ${platformSpec(automation.platform).name} draft and queued it for approval.`,
      metadata: { automationId, threadId: summary.threadId },
    });
    await notify({
      userId: automation.userId,
      type: NotificationType.APPROVAL_REQUESTED,
      title: `"${automation.name}" needs your approval`,
      body: "An automated draft is waiting in the approval queue.",
      link: "/approvals",
    });

    return { ok: true, postId: summary.postId, runId: run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation failed.";
    await prisma.$transaction([
      prisma.automationRun.update({
        where: { id: run.id },
        data: { status: AutomationRunStatus.FAILED, message, finishedAt: new Date() },
      }),
      prisma.automation.update({
        where: { id: automationId },
        data: { lastRunAt: new Date(), nextRunAt: computeNextRun(automation) },
      }),
    ]);
    await notify({
      userId: automation.userId,
      type: NotificationType.AUTOMATION_RUN,
      title: `"${automation.name}" failed`,
      body: message,
      link: "/settings",
    });
    return { ok: false, error: message, runId: run.id };
  }
}

/** Fires every enabled automation whose next run time has passed. */
export async function runDueAutomations(limit = 3) {
  const due = await prisma.automation.findMany({
    where: { enabled: true, nextRunAt: { lte: new Date() } },
    orderBy: { nextRunAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results = [];
  for (const automation of due) {
    results.push(await runAutomation(automation.id));
  }
  return results;
}

export async function assertAutomationOwner(automationId: string, userId: string) {
  const automation = await prisma.automation.findUnique({ where: { id: automationId } });
  if (!automation) throw notFound("Automation not found.");
  if (automation.userId !== userId) throw forbidden("You do not own this automation.");
  return automation;
}
