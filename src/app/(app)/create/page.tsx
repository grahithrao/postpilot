import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publicRuntimeFlags } from "@/lib/env";
import { CreateWorkspace } from "./create-workspace";

export const metadata: Metadata = { title: "Create" };
export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: user.id, status: "CONNECTED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, platform: true, handle: true, displayName: true, followerCount: true, isDemo: true },
  });

  return <CreateWorkspace accounts={accounts} flags={publicRuntimeFlags()} />;
}
