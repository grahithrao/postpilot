import { AppError } from "@/lib/errors";
import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { refineActionSchema } from "@/lib/validation/schemas";
import { refinePost } from "@/lib/services/posts";

type Ctx = { params: Promise<{ id: string }> };

/** Improve / shorten / expand / rewrite / change tone / regenerate. */
export const POST = withUser<Ctx>(async (user, request, { params }) => {
  try {
    const limit = rateLimit(`refine:${user.id}`, 30, 60_000);
    if (!limit.ok) throw new AppError("RATE_LIMITED", "Too many AI edits in a row. Give it a moment.");

    const { id } = await params;
    const action = refineActionSchema.parse(await readJson(request));
    return ok(await refinePost(id, user.id, action));
  } catch (error) {
    return fail(error);
  }
});
