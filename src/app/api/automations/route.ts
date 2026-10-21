import { prisma } from "@/lib/db";
import { invalidState, notFound } from "@/lib/errors";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { automationSchema } from "@/lib/validation/schemas";
import { computeNextRun } from "@/lib/services/automation";
import { logActivity, ActivityType } from "@/lib/services/activity";

export const GET = withUser(async (user) => {
  try {
    const automations = await prisma.automation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        socialAccount: { select: { handle: true, platform: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 3 },
        _count: { select: { posts: true } },
      },
    });
    return ok(automations);
  } catch (error) {
    return fail(error);
  }
});

export const POST = withUser(async (user, request) => {
  try {
    const input = automationSchema.parse(await readJson(request));

    if (input.socialAccountId) {
      const account = await prisma.socialAccount.findFirst({
        where: { id: input.socialAccountId, userId: user.id },
      });
      if (!account) throw notFound("Social account not found.");
      if (account.platform !== input.platform) {
        throw invalidState("The selected account is for a different platform.");
      }
    }

    const automation = await prisma.automation.create({
      data: {
        userId: user.id,
        name: input.name,
        description: input.description || null,
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek,
        dayOfMonth: input.dayOfMonth,
        hour: input.hour,
        minute: input.minute,
        timezone: input.timezone,
        platform: input.platform,
        socialAccountId: input.socialAccountId ?? null,
        topic: input.topic,
        audience: input.audience || null,
        tone: input.tone,
        contentType: input.contentType,
        keywords: input.keywords,
        // Not configurable by design: an automation may generate, never publish.
        requiresApproval: true,
        enabled: input.enabled,
        nextRunAt: input.enabled ? computeNextRun(input) : null,
      },
    });

    await logActivity({
      userId: user.id,
      type: ActivityType.AUTOMATION_CREATED,
      message: `Created the "${automation.name}" automation.`,
    });

    return ok(automation, 201);
  } catch (error) {
    return fail(error);
  }
});
