import { prisma } from "@/lib/db";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { settingsSchema } from "@/lib/validation/schemas";

export const PATCH = withUser(async (user, request) => {
  try {
    const input = settingsSchema.parse(await readJson(request));
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
      select: { id: true, name: true, email: true, timezone: true, role: true },
    });
    return ok(updated);
  } catch (error) {
    return fail(error);
  }
});
