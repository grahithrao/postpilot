import { prisma } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { scheduleSchema } from "@/lib/validation/schemas";
import { cancelSchedule, schedulePost } from "@/lib/services/scheduling";

type Ctx = { params: Promise<{ id: string }> };

/** Schedules an approved post. Rejects anything that has not been approved. */
export const POST = withUser<Ctx>(async (user, request, { params }) => {
  try {
    const { id } = await params;
    const input = scheduleSchema.parse(await readJson(request));
    const schedule = await schedulePost({
      postId: id,
      userId: user.id,
      scheduledFor: input.scheduledFor,
      timezone: input.timezone,
      socialAccountId: input.socialAccountId ?? null,
    });
    return ok(schedule, 201);
  } catch (error) {
    return fail(error);
  }
});

/** Cancels the post's active schedule and returns it to the approved pool. */
export const DELETE = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
    if (!post) throw notFound("Post not found.");
    if (post.userId !== user.id) throw forbidden("You do not own this post.");

    const active = await prisma.schedule.findFirst({
      where: { postId: id, status: { in: ["PENDING", "QUEUED", "FAILED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!active) throw notFound("This post has no active schedule.");

    return ok(await cancelSchedule(active.id, user.id));
  } catch (error) {
    return fail(error);
  }
});
