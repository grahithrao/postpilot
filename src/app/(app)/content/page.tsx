import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Sparkles } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listPosts } from "@/lib/services/posts";
import { contentQuerySchema } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PostCard } from "@/components/content/post-card";
import { ContentFilters } from "./content-filters";
import { Pagination } from "./pagination";

export const metadata: Metadata = { title: "Content" };
export const dynamic = "force-dynamic";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  // Bad query strings fall back to defaults rather than throwing at the user.
  const query = contentQuerySchema.safeParse(flat).data ?? contentQuerySchema.parse({});

  const [{ items, total, page, pageCount }, accounts] = await Promise.all([
    listPosts(user.id, query),
    prisma.socialAccount.findMany({
      where: { userId: user.id, status: "CONNECTED" },
      select: { id: true, platform: true, handle: true },
    }),
  ]);

  const filtered = Boolean(query.q || (query.status && query.status !== "ALL") || (query.platform && query.platform !== "ALL"));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content library"
        description="Every post, its full revision history and every decision made about it."
        actions={
          <Button asChild>
            <Link href="/create">
              <Sparkles className="size-4" /> Create post
            </Link>
          </Button>
        }
      />

      {/* Content Library & Versioning Guidance */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-100/90 bg-sky-50/70 p-4 text-xs text-slate-700 shadow-2xs dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-slate-300">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950">
          <FileText className="size-3.5" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">Content Library & Version Trail</p>
          <p className="leading-relaxed text-slate-600 dark:text-slate-400">
            Every draft, revision, and approval is logged with full transparency. You can filter by status or platform. Note that editing an approved post creates a new version (e.g. v2) and automatically revokes sign-off so it can be re-verified.
          </p>
        </div>
      </div>

      <ContentFilters total={total} />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title={filtered ? "No posts match those filters" : "No content yet"}
            description={
              filtered
                ? "Try widening the status or platform filter, or clear the search."
                : "Generate your first post with the AI agent. It will be scored and queued for your approval."
            }
            action={
              filtered ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/content">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link href="/create">Generate a post</Link>
                </Button>
              )
            }
            className="py-16"
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((post) => (
              <PostCard key={post.id} post={post} accounts={accounts} />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={query.pageSize} />
        </>
      )}
    </div>
  );
}
