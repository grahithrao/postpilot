"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addDays, format, setHours, setMinutes, startOfHour } from "date-fns";
import { ApprovalDecision, type Platform } from "@prisma/client";
import { toast } from "sonner";
import { CalendarClock, Check, RefreshCw, ShieldAlert, ThumbsDown, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PostPreview } from "@/components/content/post-preview";
import { QualityReportPanel } from "@/components/content/quality-report-panel";
import { platformSpec } from "@/lib/constants/platforms";
import { api, ApiError } from "@/lib/api/client";
import type { QualityReport } from "@/lib/ai/types";
import type { ScheduleAccount } from "@/components/content/schedule-dialog";

export interface ReviewPost {
  id: string;
  headline: string | null;
  caption: string;
  hashtags: string[];
  cta: string | null;
  imagePrompt: string | null;
  platform: Platform;
  qualityScore: number | null;
  qualityReport: QualityReport | null;
  suggestedTime: string | null;
  version: number;
}

function defaultSlot(platform: Platform, suggested?: string | null) {
  if (suggested) {
    const parsed = new Date(suggested);
    if (parsed.getTime() > Date.now() + 60_000) return parsed;
  }
  const spec = platformSpec(platform);
  for (let day = 0; day < 7; day++) {
    for (const hour of spec.bestHours) {
      const slot = setMinutes(setHours(startOfHour(addDays(new Date(), day)), hour), 0);
      if (slot.getTime() > Date.now() + 30 * 60_000) return slot;
    }
  }
  return addDays(new Date(), 1);
}

/**
 * The human-in-the-loop decision surface.
 *
 * Submitting here is what resumes the paused LangGraph run. Approving is the
 * only path that unlocks scheduling; rejecting closes the post permanently
 * unless it is edited and re-submitted.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  post,
  accounts,
  reviewerName,
  onDecided,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: ReviewPost;
  accounts: ScheduleAccount[];
  reviewerName: string;
  onDecided?: () => void;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = React.useState("");
  const [scheduleNow, setScheduleNow] = React.useState(true);
  const [when, setWhen] = React.useState(() =>
    format(defaultSlot(post.platform, post.suggestedTime), "yyyy-MM-dd'T'HH:mm"),
  );
  const [busy, setBusy] = React.useState<ApprovalDecision | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const hasAccount = accounts.some((a) => a.platform === post.platform);

  React.useEffect(() => {
    if (open) {
      setFeedback("");
      setError(null);
      setScheduleNow(hasAccount);
      setWhen(format(defaultSlot(post.platform, post.suggestedTime), "yyyy-MM-dd'T'HH:mm"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post.id]);

  async function decide(decision: ApprovalDecision) {
    if (decision !== ApprovalDecision.APPROVED && !feedback.trim()) {
      setError("Leave a note so the author knows what to change.");
      return;
    }

    setBusy(decision);
    setError(null);
    try {
      const shouldSchedule = decision === ApprovalDecision.APPROVED && scheduleNow && hasAccount;
      await api(`/api/posts/${post.id}/approve`, {
        method: "POST",
        json: {
          decision,
          feedback: feedback.trim() || undefined,
          ...(shouldSchedule
            ? {
                schedule: {
                  scheduledFor: new Date(when).toISOString(),
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
              }
            : {}),
          regenerate: decision === ApprovalDecision.REGENERATION_REQUESTED,
        },
      });

      const messages: Record<ApprovalDecision, string> = {
        APPROVED: shouldSchedule
          ? `Approved and scheduled for ${format(new Date(when), "EEE d MMM, HH:mm")}`
          : "Approved — ready to schedule",
        REJECTED: "Rejected. This post can no longer be published.",
        CHANGES_REQUESTED: "Sent back to the author with your notes",
        REGENERATION_REQUESTED: "Sent back and regenerated from the brief",
      };
      toast.success(messages[decision]);
      onOpenChange(false);
      onDecided?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the decision.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Review before publishing</DialogTitle>
          <DialogDescription>
            You are reviewing v{post.version}. Your decision is recorded against this exact version — a later edit
            invalidates it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <PostPreview
              platform={post.platform}
              content={post}
              account={accounts.find((a) => a.platform === post.platform) ? { handle: accounts.find((a) => a.platform === post.platform)!.handle, displayName: "Your brand" } : null}
            />

            <div className="space-y-1.5">
              <Label htmlFor="feedback">
                Feedback {"("}required when rejecting or requesting changes{")"}
              </Label>
              <Textarea
                id="feedback"
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What works, what needs to change, and why."
              />
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium">Schedule on approval</p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    {hasAccount
                      ? "Approve and put it straight in the calendar."
                      : `No ${platformSpec(post.platform).name} account is connected, so this post cannot be scheduled yet.`}
                  </p>
                </div>
                <Switch checked={scheduleNow && hasAccount} onCheckedChange={setScheduleNow} disabled={!hasAccount} />
              </div>
              {scheduleNow && hasAccount && (
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="when">Publish at</Label>
                  <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                </div>
              )}
            </div>

            {error && (
              <p className="text-destructive flex items-start gap-2 text-xs" role="alert">
                <ShieldAlert className="mt-px size-3.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button loading={busy === ApprovalDecision.APPROVED} disabled={Boolean(busy)} onClick={() => decide(ApprovalDecision.APPROVED)}>
                <Check className="size-4" />
                {scheduleNow && hasAccount ? "Approve & schedule" : "Approve"}
              </Button>
              <Button
                variant="outline"
                loading={busy === ApprovalDecision.CHANGES_REQUESTED}
                disabled={Boolean(busy)}
                onClick={() => decide(ApprovalDecision.CHANGES_REQUESTED)}
              >
                <ThumbsDown className="size-4" /> Request changes
              </Button>
              <Button
                variant="outline"
                loading={busy === ApprovalDecision.REGENERATION_REQUESTED}
                disabled={Boolean(busy)}
                onClick={() => decide(ApprovalDecision.REGENERATION_REQUESTED)}
              >
                <RefreshCw className="size-4" /> Regenerate
              </Button>
              <Button
                variant="destructive"
                loading={busy === ApprovalDecision.REJECTED}
                disabled={Boolean(busy)}
                onClick={() => decide(ApprovalDecision.REJECTED)}
              >
                <X className="size-4" /> Reject
              </Button>
            </div>

            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Signed in as {reviewerName}. Approving records an immutable decision row; rejecting blocks this post from
              ever reaching a platform.
            </p>
          </div>

          <div className="space-y-3 md:border-l md:pl-5">
            <QualityReportPanel report={post.qualityReport} />
            {post.suggestedTime && (
              <p className="text-muted-foreground flex items-start gap-1.5 border-t pt-3 text-[11px] leading-relaxed">
                <CalendarClock className="mt-px size-3 shrink-0" />
                The agent suggests {format(new Date(post.suggestedTime), "EEE d MMM, HH:mm")}.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
