import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PostStatus } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { ApprovalsBoard } from "./approvals-board";

export const metadata: Metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [pending, recentDecisions, accounts] = await Promise.all([
    prisma.post.findMany({
      where: { userId: user.id, status: PostStatus.PENDING_APPROVAL },
      orderBy: { createdAt: "asc" },
      include: {
        automation: { select: { name: true } },
        socialAccount: { select: { handle: true } },
        _count: { select: { revisions: true } },
      },
    }),
    prisma.approval.findMany({
      where: { reviewerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        reviewer: { select: { name: true, email: true } },
        post: { select: { id: true, headline: true, topic: true, platform: true, status: true, version: true } },
      },
    }),
    prisma.socialAccount.findMany({
      where: { userId: user.id, status: "CONNECTED" },
      select: { id: true, platform: true, handle: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval queue"
        description="The agent stops here. Nothing below this point runs without a decision from you."
      />
      <ApprovalsBoard
        pending={pending}
        recentDecisions={recentDecisions}
        accounts={accounts}
        reviewerName={user.name ?? user.email ?? "You"}
      />
    </div>
  );
}
