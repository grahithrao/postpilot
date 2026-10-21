"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Eye,
  History,
  PenLine,
  Save,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Workflow,
  XCircle,
} from "lucide-react";
import type { PostDetail as PostDetailData } from "@/lib/services/posts";
import type { QualityReport } from "@/lib/ai/types";
import type { RuntimeFlags } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { PostPreview, PlatformBudget } from "@/components/content/post-preview";
import { QualityReportPanel } from "@/components/content/quality-report-panel";
import { AgentTrace } from "@/components/content/agent-trace";
import { PostActions } from "@/components/content/post-actions";
import { ApprovalTrail, PublishingLogList, RevisionHistory, ScheduleList } from "@/components/content/history-panels";
import { ReviewDialog } from "@/components/approvals/review-dialog";
import { api, ApiError } from "@/lib/api/client";
import { CONTENT_TYPE_LABEL, TONE_LABEL } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

interface Props {
  post: PostDetailData;
  gate: { approved: boolean; reason: string };
  trace: Array<{
    id: string;
    threadId: string;
    status: string;
    currentNode: string | null;
    nodeHistory: string[];
    error: string | null;
    startedAt: Date;
  }>;
  accounts: Array<{ id: string; platform: string; handle: string; displayName: string; followerCount: number }>;
  flags: RuntimeFlags;
  reviewerName: string;
}

export function PostDetail({ post, gate, trace, accounts, flags, reviewerName }: Props) {
  const router = useRouter();
  const [draft, setDraft] = React.useState({
    headline: post.headline ?? "",
    caption: post.caption,
    hashtags: post.hashtags.join(" "),
    cta: post.cta ?? "",
    imagePrompt: post.imagePrompt ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);

  const editable = post.status !== "PUBLISHED" && post.status !== "PUBLISHING";
  const dirty =
    draft.headline !== (post.headline ?? "") ||
    draft.caption !== post.caption ||
    draft.hashtags !== post.hashtags.join(" ") ||
    draft.cta !== (post.cta ?? "") ||
    draft.imagePrompt !== (post.imagePrompt ?? "");

  const account = accounts.find((a) => a.platform === post.platform) ?? null;
  const scheduleAccounts = accounts.map((a) => ({ id: a.id, platform: a.platform as never, handle: a.handle }));
  const activeSchedule = post.schedules.find((s) => ["PENDING", "QUEUED", "PUBLISHING"].includes(s.status));

  const previewContent = {
    headline: draft.headline || null,
    caption: draft.caption,
    hashtags: draft.hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
    cta: draft.cta || null,
    imagePrompt: draft.imagePrompt || null,
  };

  async function save() {
    setSaving(true);
    try {
      await api(`/api/posts/${post.id}`, {
        method: "PATCH",
        json: {
          headline: draft.headline || null,
          caption: draft.caption,
          hashtags: previewContent.hashtags,
          cta: draft.cta || null,
          imagePrompt: draft.imagePrompt || null,
          changeSummary: "Edited from the post detail view.",
        },
      });
      toast.success("Saved", {
        description: gate.approved
          ? "This edit revoked the previous approval — the post is back in draft and needs re-approval."
          : undefined,
      });
      router.refresh();
    } catch (error) {
      toast.error("Could not save", { description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1.5">
            <Link href="/content">
              <ArrowLeft className="size-3.5" /> Content library
            </Link>
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">{post.headline || post.topic}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={post.status} />
            <PlatformBadge platform={post.platform} />
            <span className="text-muted-foreground text-[11px]">
              v{post.version} · {CONTENT_TYPE_LABEL[post.contentType]} · {TONE_LABEL[post.tone]}
            </span>
            {post.automation && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                <Workflow className="size-3" /> {post.automation.name}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {post.status === "PENDING_APPROVAL" && (
            <Button onClick={() => setReviewOpen(true)}>
              <ShieldCheck className="size-4" /> Review
            </Button>
          )}
          {post.publishedUrl && (
            <Button asChild variant="outline">
              <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" /> View live
              </a>
            </Button>
          )}
          <PostActions
            post={{
              id: post.id,
              status: post.status,
              platform: post.platform,
              publishedUrl: post.publishedUrl,
              suggestedTime: post.suggestedTime?.toISOString() ?? null,
              scheduledFor: activeSchedule?.scheduledFor.toISOString() ?? null,
            }}
            accounts={scheduleAccounts}
            variant="inline"
          />
        </div>
      </div>

      {/* The approval gate, stated for this specific post. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3",
          gate.approved
            ? "border-emerald-500/25 bg-emerald-500/[0.07]"
            : "border-amber-500/25 bg-amber-500/[0.07]",
        )}
      >
        {gate.approved ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        )}
        <p className="min-w-0 flex-1 text-xs">
          <span className="font-medium">
            {gate.approved ? "Cleared to publish." : "Publishing is blocked."}
          </span>{" "}
          <span className="text-muted-foreground">{gate.reason}</span>
        </p>
      </div>

      {post.failureReason && post.status === "FAILED" && (
        <div className="border-destructive/25 bg-destructive/5 flex items-start gap-3 rounded-xl border px-4 py-3">
          <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium">Last publishing attempt failed</p>
            <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">{post.failureReason}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Content</CardTitle>
                <CardDescription>
                  {editable
                    ? "Editing an approved post revokes its approval and cancels any schedule."
                    : "Published content is read-only."}
                </CardDescription>
              </div>
              {editable && dirty && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        headline: post.headline ?? "",
                        caption: post.caption,
                        hashtags: post.hashtags.join(" "),
                        cta: post.cta ?? "",
                        imagePrompt: post.imagePrompt ?? "",
                      })
                    }
                  >
                    <Undo2 className="size-3.5" /> Revert
                  </Button>
                  <Button size="sm" loading={saving} onClick={save}>
                    <Save className="size-3.5" /> Save changes
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="preview">
                <TabsList>
                  <TabsTrigger value="preview">
                    <Eye /> Preview
                  </TabsTrigger>
                  <TabsTrigger value="edit" disabled={!editable}>
                    <PenLine /> Edit
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History /> History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="preview">
                  <PostPreview
                    platform={post.platform}
                    content={previewContent}
                    account={account}
                    scheduledFor={activeSchedule?.scheduledFor ?? post.publishedAt ?? post.suggestedTime}
                  />
                </TabsContent>

                <TabsContent value="edit" className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="headline">Headline</Label>
                    <Input
                      id="headline"
                      value={draft.headline}
                      onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="caption">Caption</Label>
                    <Textarea
                      id="caption"
                      rows={14}
                      value={draft.caption}
                      onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hashtags">Hashtags</Label>
                    <Input
                      id="hashtags"
                      value={draft.hashtags}
                      onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="cta">Call to action</Label>
                      <Input id="cta" value={draft.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="image">Image prompt</Label>
                      <Input
                        id="image"
                        value={draft.imagePrompt}
                        onChange={(e) => setDraft({ ...draft, imagePrompt: e.target.value })}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history">
                  <RevisionHistory revisions={post.revisions} currentVersion={post.version} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Approval trail</CardTitle>
                  <CardDescription>Every human decision, against a specific version</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <ApprovalTrail approvals={post.approvals} currentVersion={post.version} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Publishing log</CardTitle>
                  <CardDescription>Attempts, retries and blocks</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <PublishingLogList logs={post.publishingLogs} />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Platform fit</CardTitle>
            </CardHeader>
            <CardContent>
              <PlatformBudget platform={post.platform} content={previewContent} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Quality gate</CardTitle>
                <CardDescription>
                  {post.aiModel ? `Generated by ${post.aiProvider === "mock" ? "the demo model" : post.aiModel}` : "Written by hand"}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <QualityReportPanel report={post.qualityReport as QualityReport | null} />
            </CardContent>
          </Card>

          {trace.length > 0 && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Agent workflow</CardTitle>
                  <CardDescription>
                    {trace[0]!.status.replace("_", " ").toLowerCase()} · started{" "}
                    {format(new Date(trace[0]!.startedAt), "d MMM, HH:mm")}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <AgentTrace
                  nodeHistory={trace[0]!.nodeHistory}
                  paused={trace[0]!.status === "AWAITING_APPROVAL"}
                  compact
                />
                {trace[0]!.error && (
                  <p className="text-destructive mt-3 text-[11px] leading-relaxed">{trace[0]!.error}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Schedules</CardTitle>
                <CardDescription>Including cancelled and failed runs</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ScheduleList schedules={post.schedules} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brief</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[11px]">
              {[
                ["Topic", post.topic],
                ["Product", post.product],
                ["Audience", post.audience],
                ["Language", post.language],
                ["Keywords", post.keywords.join(", ")],
                ["Requested CTA", post.ctaRequest],
                ["Notes", post.notes],
              ]
                .filter(([, value]) => Boolean(value))
                .map(([label, value]) => (
                  <div key={label as string} className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{label}</span>
                    <span className="min-w-0 flex-1 leading-relaxed">{value}</span>
                  </div>
                ))}
              <p className="text-muted-foreground/70 border-t pt-2 text-[10px]">
                {flags.demoMode ? "Demo Mode: publishing is simulated." : "Live mode."} Created{" "}
                {format(new Date(post.createdAt), "d MMM yyyy, HH:mm")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        post={{
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
        }}
        accounts={scheduleAccounts}
        reviewerName={reviewerName}
      />
    </div>
  );
}
