import { AppError } from "@/lib/errors";
import { fail, ok, withUser } from "@/lib/api/handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { assertAutomationOwner, runAutomation } from "@/lib/services/automation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Runs an automation on demand.
 *
 * It generates a draft and puts it in the approval queue — the same as its
 * scheduled behaviour. There is no code path here that publishes.
 */
export const POST = withUser<Ctx>(async (user, _request, { params }) => {
  try {
    const { id } = await params;
    await assertAutomationOwner(id, user.id);

    const limit = rateLimit(`automation-run:${user.id}`, 6, 60_000);
    if (!limit.ok) throw new AppError("RATE_LIMITED", "Slow down — automations can only be run a few times a minute.");

    const result = await runAutomation(id);
    if (!result.ok) throw new AppError("PROVIDER_ERROR", result.error ?? "The automation failed.");
    return ok(result);
  } catch (error) {
    return fail(error);
  }
});
