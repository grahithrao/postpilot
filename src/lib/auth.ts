import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { unauthenticated } from "@/lib/errors";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: string; timezone: string } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Credentials sign-in requires JWT sessions; the adapter is still wired up so
  // adding a real OAuth provider later is a one-line change.
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          timezone: user.timezone,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? "ADMIN";
        token.timezone = (user as { timezone?: string }).timezone ?? "UTC";
      }
      if (trigger === "update" && token.uid) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { name: true, timezone: true, role: true, image: true },
        });
        if (fresh) {
          token.name = fresh.name;
          token.timezone = fresh.timezone;
          token.role = fresh.role;
          token.picture = fresh.image;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? token.sub ?? "";
        session.user.role = (token.role as string) ?? "ADMIN";
        session.user.timezone = (token.timezone as string) ?? "UTC";
      }
      return session;
    },
  },
});

/** The signed-in user, or null. Use in Server Components. */
export async function currentUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}

/** The signed-in user, or a 401-shaped AppError. Use in API routes. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
