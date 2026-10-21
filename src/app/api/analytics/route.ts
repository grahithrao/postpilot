import { z } from "zod";
import { fail, ok, withUser } from "@/lib/api/handler";
import { getAnalyticsOverview } from "@/lib/services/analytics";

const querySchema = z.object({ days: z.coerce.number().int().min(7).max(180).default(30) });

export const GET = withUser(async (user, request) => {
  try {
    const url = new URL(request.url);
    const { days } = querySchema.parse(Object.fromEntries(url.searchParams));
    return ok(await getAnalyticsOverview(user.id, days));
  } catch (error) {
    return fail(error);
  }
});
