import { fail, ok, withUser } from "@/lib/api/handler";
import { submitForApproval } from "@/lib/services/approvals";

type Ctx = { params: Promise<{ id: string }> };

/** Moves a draft into the human approval queue. */
export const POST = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    return ok(await submitForApproval(id, user.id));
  } catch (error) {
    return fail(error);
  }
});
