import { fail, ok, withUser } from "@/lib/api/handler";
import { publishNow } from "@/lib/services/scheduling";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Publish immediately.
 *
 * Goes through exactly the same schedule-then-publish path as a timed post, so
 * the approval gate, the publishing log and the duplicate protection all apply.
 * An unapproved post gets a 403 with the standard message.
 */
export const POST = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    const outcome = await publishNow(id, user.id);
    return ok(outcome, outcome.status === "PUBLISHED" ? 200 : 202);
  } catch (error) {
    return fail(error);
  }
});
