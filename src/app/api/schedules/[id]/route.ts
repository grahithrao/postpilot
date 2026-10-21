import { prisma } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { scheduleSchema } from "@/lib/validation/schemas";
import { cancelSchedule, schedulePost } from "@/lib/services/scheduling";

type Ctx = { params: Promise<{ id: string }> };

/** Reschedule. The approval gate is re-checked by `schedulePost`. */
export const PATCH = withUser<Ctx>(async (user, request, { params }) => {
  try {
    const { id } = await params;
    const existing = await prisma.schedule.findUnique({ where: { id } });
    if (!existing) throw notFound("Schedule not found.");
    if (existing.userId !== user.id) throw forbidden("You do not own this schedule.");

    const input = scheduleSchema.parse(await readJson(request));
    const schedule = await schedulePost({
      postId: existing.postId,
      userId: user.id,
      scheduledFor: input.scheduledFor,
      timezone: input.timezone,
      socialAccountId: input.socialAccountId ?? existing.socialAccountId,
    });
    return ok(schedule);
  } catch (error) {
    return fail(error);
  }
});

export const DELETE = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    return ok(await cancelSchedule(id, user.id));
  } catch (error) {
    return fail(error);
  }
});
