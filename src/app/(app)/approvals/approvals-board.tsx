"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { Platform, PostStatus } from "@prisma/client";
import { CheckCheck, Clock, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { QualityScore } from "@/components/shared/quality-score";
import { PostPreview } from "@/components/content/post-preview";
import { ApprovalTrail, type ApprovalItem } from "@/components/content/history-panels";
import { ReviewDialog, type ReviewPost } from "@/components/approvals/review-dialog";
import type { ScheduleAccount } from "@/components/content/schedule-dialog";
import type { QualityReport } from "@/lib/ai/types";
import { CONTENT_TYPE_LABEL } from "@/lib/constants/labels";
import { cn, truncate } from "@/lib/utils";

interface PendingPost {
  id: string;
  topic: string;
  headline: string | null;
  caption: string;
  hashtags: string[];
  cta: string | null;
  imagePrompt: string | null;
  platform: Platform;
  status: PostStatus;
  contentType: keyof typeof CONTENT_TYPE_LABEL;
  qualityScore: number | null;
  qualityReport: unknown;
  suggestedTime: Date | null;
  version: number;
  createdAt: Date;
  automation: { name: string } | null;
  socialAccount: { handle: string } | null;
  _count: { revisions: number };
}

type DecisionRow = ApprovalItem & {
  post: { id: string; headline: string | null; topic: string; platform: Platform; status: PostStatus; version: number };
};

export function ApprovalsBoard({
  pending,
  recentDecisions,
  accounts,
  reviewerName,
}: {
  pending: PendingPost[];
  recentDecisions: DecisionRow[];
  accounts: ScheduleAccount[];
  reviewerName: string;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(pending[0]?.id ?? null);
  const [reviewing, setReviewing] = React.useState<ReviewPost | null>(null);

  // Deep links from notifications land on #<postId>.
  React.useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && pending.some((p) => p.id === hash)) setSelectedId(hash);
  }, [pending]);

  const selected = pending.find((p) => p.id === selectedId) ?? pending[0] ?? null;

  function openReview(post: PendingPost) {
    setReviewing({
      id: post.id,
      headline: post.headline,
      caption: post.caption,
      hashtags: post.hashtags,
      cta: post.cta,
      imagePrompt: post.imagePrompt,
      platform: post.platform,
      qualityScore: post.qualityScore,
      qualityReport: post.qualityReport as QualityReport | null,
      suggestedTime: post.suggestedTime?.toISOString() ?? null,
      version: post.version,
    });
  }

  if (!pending.length) {
    return (
      <div className="space-y-4">
        <Card>
          <EmptyState
            icon={CheckCheck}
            title="Nothing is waiting on you"
            description="Every draft the agent has produced has been reviewed. New generations and automation runs will appear here."
            action={
              <Button asChild size="sm">
                <Link href="/create">
                  <Sparkles className="size-3.5" /> Generate a post
                </Link>
              </Button>
            }
            className="py-16"
          />
        </Card>

        {recentDecisions.length > 0 && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recent decisions</CardTitle>
                <CardDescription>Your review history</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DecisionList decisions={recentDecisions} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Human Approval Explainer */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-sky-100/90 bg-sky-50/70 p-4 text-xs text-slate-700 shadow-2xs dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-slate-300">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950">
          <ShieldCheck className="size-3.5" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">Human Approval Gate (Version-Locked)</p>
          <p className="leading-relaxed text-slate-600 dark:text-slate-400">
            PostPilot's core safety rule: <strong>The AI can never publish unapproved content</strong>. Review the generated copy, check its AI Quality Score, and click <strong>Review</strong> to approve, schedule, request changes, or reject. Sign-off is strictly bound to this exact version.
          </p>
        </div>
      </div>

      <Tabs defaultValue="queue">
        <TabsList className="bg-sky-50/70 border border-sky-100 dark:bg-slate-900 dark:border-sky-950">
          <TabsTrigger value="queue">
            <Clock /> Queue ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <ShieldCheck /> Decision history
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            {/* Queue */}
            <div className="space-y-2">
              {pending.map((post) => {
                const active = selected?.id === post.id;
                return (
                  <button
                    key={post.id}
                    type="button"
                    id={post.id}
                    onClick={() => setSelectedId(post.id)}
                    className={cn(
                      "bg-card w-full rounded-xl border p-3.5 text-left shadow-xs transition-all duration-150 cursor-pointer",
                      active
                        ? "border-sky-500 bg-sky-50/50 dark:bg-sky-950/40 dark:border-sky-500 ring-2 ring-sky-500/20 shadow-xs"
                        : "border-sky-100/90 dark:border-sky-950/70 hover:border-sky-200 dark:hover:border-sky-800",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <QualityScore score={post.qualityScore} size={34} showLabel={false} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {post.headline || truncate(post.caption.split("\n")[0] ?? post.topic, 60)}
                        </p>
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px] leading-relaxed">
                          {truncate(post.caption.replace(/\n+/g, " "), 110)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <PlatformBadge platform={post.platform} showLabel={false} />
                          <span className="text-muted-foreground text-[10px]">
                            v{post.version} · waiting {formatDistanceToNow(new Date(post.createdAt))}
                          </span>
                          {post.automation && (
                            <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
                              <Workflow className="size-2.5" /> auto
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail */}
            {selected && (
              <Card className="h-fit">
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{selected.headline || selected.topic}</CardTitle>
                    <CardDescription>
                      {CONTENT_TYPE_LABEL[selected.contentType]} · v{selected.version} · {selected._count.revisions}{" "}
                      revision{selected._count.revisions === 1 ? "" : "s"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/content/${selected.id}`}>Full record</Link>
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-500 hover:to-sky-600 text-white shadow-sm shadow-sky-600/25 font-semibold gap-1.5 cursor-pointer"
                      onClick={() => openReview(selected)}
                    >
                      <ShieldCheck className="size-3.5" /> Review Post
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                  <PostPreview
                    platform={selected.platform}
                    content={selected}
                    account={selected.socialAccount ? { handle: selected.socialAccount.handle, displayName: "Your brand" } : null}
                    scheduledFor={selected.suggestedTime}
                  />
                  <div>
                    <QualityScore score={selected.qualityScore} size={48} />
                    <dl className="mt-4 space-y-2 text-[11px]">
                      <div>
                        <dt className="text-muted-foreground">Author</dt>
                        <dd>{selected.automation ? `${selected.automation.name} (automation)` : "You"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Created</dt>
                        <dd>{formatDistanceToNow(new Date(selected.createdAt), { addSuffix: true })}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="mt-0.5">
                          <StatusBadge status={selected.status} />
                        </dd>
                      </div>
                    </dl>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Decision history</CardTitle>
                <CardDescription>Every approval and rejection you have recorded</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DecisionList decisions={recentDecisions} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {reviewing && (
        <ReviewDialog
          open={Boolean(reviewing)}
          onOpenChange={(open) => !open && setReviewing(null)}
          post={reviewing}
          accounts={accounts}
          reviewerName={reviewerName}
          onDecided={() => {
            const remaining = pending.filter((p) => p.id !== reviewing.id);
            setSelectedId(remaining[0]?.id ?? null);
          }}
        />
      )}
    </>
  );
}

function DecisionList({ decisions }: { decisions: DecisionRow[] }) {
  if (!decisions.length) {
    return <EmptyState icon={ShieldCheck} title="No decisions yet" description="Your review history will appear here." />;
  }

  return (
    <div className="space-y-4">
      {decisions.map((decision) => (
        <div key={decision.id} className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
          <Link
            href={`/content/${decision.post.id}`}
            className="hover:text-primary min-w-0 flex-1 text-xs font-medium transition-colors"
          >
            {decision.post.headline || decision.post.topic}
          </Link>
          <div className="shrink-0 sm:w-72">
            <ApprovalTrail approvals={[decision]} currentVersion={decision.post.version} />
          </div>
        </div>
      ))}
    </div>
  );
}
