import { fail, ok, readJson, withUser } from "@/lib/api/handler";
import { updatePostSchema } from "@/lib/validation/schemas";
import { deletePost, getPost, updatePost } from "@/lib/services/posts";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    return ok(await getPost(id, user.id));
  } catch (error) {
    return fail(error);
  }
});

export const PATCH = withUser<Ctx>(async (user, request, { params }) => {
  try {
    const { id } = await params;
    const input = updatePostSchema.parse(await readJson(request));
    return ok(await updatePost(id, user.id, input));
  } catch (error) {
    return fail(error);
  }
});

export const DELETE = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    return ok(await deletePost(id, user.id));
  } catch (error) {
    return fail(error);
  }
});
