import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPost } from "@/lib/services/posts";
import { approvalGate } from "@/lib/services/approvals";
import { getAgentTrace } from "@/lib/agent/runner";
import { isAppError } from "@/lib/errors";
import { publicRuntimeFlags } from "@/lib/env";
import { PostDetail } from "./post-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await currentUser();
  if (!user) return { title: "Post" };
  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, userId: user.id },
    select: { headline: true, topic: true },
  });
  return { title: post ? (post.headline ?? post.topic) : "Post" };
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  try {
    const [post, gate, trace, accounts] = await Promise.all([
      getPost(id, user.id),
      approvalGate(id),
      getAgentTrace(id),
      prisma.socialAccount.findMany({
        where: { userId: user.id, status: "CONNECTED" },
        select: { id: true, platform: true, handle: true, displayName: true, followerCount: true },
      }),
    ]);

    return (
      <PostDetail
        post={post}
        gate={gate}
        trace={trace}
        accounts={accounts}
        flags={publicRuntimeFlags()}
        reviewerName={user.name ?? user.email ?? "You"}
      />
    );
  } catch (error) {
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }
}
