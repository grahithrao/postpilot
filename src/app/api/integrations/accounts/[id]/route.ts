import { fail, ok, withUser } from "@/lib/api/handler";
import { disconnectAccount, syncAccount } from "@/lib/services/integrations";

type Ctx = { params: Promise<{ id: string }> };

/** Refreshes the cached profile (followers, handle, display name). */
export const POST = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    const account = await syncAccount(id, user.id);
    return ok({
      id: account.id,
      handle: account.handle,
      displayName: account.displayName,
      followerCount: account.followerCount,
      lastSyncedAt: account.lastSyncedAt,
    });
  } catch (error) {
    return fail(error);
  }
});

/** Disconnects and destroys every stored credential for the account. */
export const DELETE = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    return ok(await disconnectAccount(id, user.id));
  } catch (error) {
    return fail(error);
  }
});
