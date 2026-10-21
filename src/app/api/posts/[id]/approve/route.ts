import { ApprovalDecision } from "@prisma/client";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { approvalSchema, scheduleSchema } from "@/lib/validation/schemas";
import { resolveApproval } from "@/lib/agent/runner";
import { refinePost } from "@/lib/services/posts";
import { schedulePost } from "@/lib/services/scheduling";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = approvalSchema.extend({
  /** Approve and schedule in one action. */
  schedule: scheduleSchema.optional(),
  /** Ask the agent to regenerate immediately after a REGENERATION_REQUESTED decision. */
  regenerate: z.boolean().optional(),
});

/**
 * Records a human decision.
 *
 * This is the endpoint that resumes the paused LangGraph run. Approving here is
 * the only way a post can ever reach the scheduler or the publisher.
 */
export const POST = withUser<Ctx>(async (user, request, { params }) => {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await readJson(request));

    const result = await resolveApproval({
      postId: id,
      reviewerId: user.id,
      decision: body.decision,
      feedback: body.feedback || null,
      scheduledFor: body.schedule?.scheduledFor ?? null,
    });

    // Approve-and-schedule in one action.
    //
    // When the decision resumed a live agent run, the graph's own schedule node
    // has already created the row (and may have published it, if the reviewer
    // asked for a slot that is already due). Only schedule here when it did not,
    // which is the case for manually written and seeded posts.
    let scheduleId: string | null = result.summary?.scheduleId ?? null;
    if (body.decision === ApprovalDecision.APPROVED && body.schedule && !scheduleId) {
      const schedule = await schedulePost({
        postId: id,
        userId: user.id,
        scheduledFor: body.schedule.scheduledFor,
        timezone: body.schedule.timezone,
        socialAccountId: body.schedule.socialAccountId ?? null,
      });
      scheduleId = schedule.id;
    }

    if (body.decision === ApprovalDecision.REGENERATION_REQUESTED && body.regenerate) {
      await refinePost(id, user.id, { action: "regenerate", instruction: body.feedback || undefined });
    }

    return ok({
      status: result.status,
      viaAgent: result.viaAgent,
      scheduleId,
      agent: result.summary ?? null,
    });
  } catch (error) {
    return fail(error);
  }
});
