import { prisma } from "@/lib/db";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { automationSchema } from "@/lib/validation/schemas";
import { assertAutomationOwner, computeNextRun } from "@/lib/services/automation";
import { logActivity, ActivityType } from "@/lib/services/activity";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (user, request, { params }) => {
  try {
    const { id } = await params;
    await assertAutomationOwner(id, user.id);

    const input = automationSchema.partial().parse(await readJson(request));
    const merged = await prisma.automation.findUniqueOrThrow({ where: { id } });

    const next = {
      frequency: input.frequency ?? merged.frequency,
      dayOfWeek: input.dayOfWeek ?? merged.dayOfWeek,
      dayOfMonth: input.dayOfMonth ?? merged.dayOfMonth,
      hour: input.hour ?? merged.hour,
      minute: input.minute ?? merged.minute,
    };
    const enabled = input.enabled ?? merged.enabled;

    const automation = await prisma.automation.update({
      where: { id },
      data: {
        ...input,
        description: input.description === "" ? null : input.description,
        audience: input.audience === "" ? null : input.audience,
        // Never writable: automations always require human approval.
        requiresApproval: true,
        nextRunAt: enabled ? computeNextRun(next) : null,
      },
    });

    await logActivity({
      userId: user.id,
      type: ActivityType.AUTOMATION_UPDATED,
      message: `Updated the "${automation.name}" automation${enabled ? "" : " (paused)"}.`,
    });

    return ok(automation);
  } catch (error) {
    return fail(error);
  }
});

export const DELETE = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    const automation = await assertAutomationOwner(id, user.id);
    await prisma.automation.delete({ where: { id } });
    await logActivity({
      userId: user.id,
      type: ActivityType.AUTOMATION_DELETED,
      message: `Deleted the "${automation.name}" automation.`,
    });
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
});
