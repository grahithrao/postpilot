import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { registerSchema } from "@/lib/validation/schemas";
import { fail, ok, readJson } from "@/lib/api/handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { connectAccount } from "@/lib/services/integrations";
import { PLATFORM_LIST } from "@/lib/constants/platforms";
import { isDemoMode } from "@/lib/env";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const limit = rateLimit(`register:${ip}`, 5, 10 * 60_000);
    if (!limit.ok) throw new AppError("RATE_LIMITED", "Too many sign-up attempts. Try again in a few minutes.");

    const input = registerSchema.parse(await readJson(request));
    const email = input.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new AppError("CONFLICT", "An account with that email already exists.");

    const user = await prisma.user.create({
      data: {
        email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        role: "ADMIN",
      },
      select: { id: true, email: true, name: true },
    });

    // A brand new workspace with no connected accounts cannot demonstrate the
    // workflow, so Demo Mode provisions the four simulated profiles up front.
    if (isDemoMode()) {
      for (const spec of PLATFORM_LIST) {
        await connectAccount({ userId: user.id, platform: spec.id }).catch(() => null);
      }
    }

    return ok(user, 201);
  } catch (error) {
    return fail(error);
  }
}
