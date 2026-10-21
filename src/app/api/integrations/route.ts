import { fail, ok, withUser } from "@/lib/api/handler";
import { listIntegrations } from "@/lib/services/integrations";

export const GET = withUser(async (user) => {
  try {
    return ok(await listIntegrations(user.id));
  } catch (error) {
    return fail(error);
  }
});
