import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";

export const GET = withUser(async (user) => {
  try {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.notification.count({ where: { userId: user.id, read: false } }),
    ]);
    return ok({ items, unread });
  } catch (error) {
    return fail(error);
  }
});

const patchSchema = z.object({ id: z.string().cuid().optional(), all: z.boolean().optional() });

/** Marks one notification, or all of them, as read. */
export const PATCH = withUser(async (user, request) => {
  try {
    const { id, all } = patchSchema.parse(await readJson(request));
    const result = await prisma.notification.updateMany({
      where: { userId: user.id, ...(all ? {} : { id }) },
      data: { read: true },
    });
    return ok({ updated: result.count });
  } catch (error) {
    return fail(error);
  }
});
