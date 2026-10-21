import { fail, ok, withUser } from "@/lib/api/handler";
import { duplicatePost } from "@/lib/services/posts";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    return ok(await duplicatePost(id, user.id), 201);
  } catch (error) {
    return fail(error);
  }
});
