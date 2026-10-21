import { format, formatDistanceToNow } from "date-fns";
import type { ApprovalDecision, Platform, PublishLogStatus, RevisionSource, ScheduleStatus } from "@prisma/client";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CircleDashed,
  GitCommitHorizontal,
  RotateCw,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  APPROVAL_DECISION_LABEL,
  PUBLISH_LOG_LABEL,
  REVISION_SOURCE_LABEL,
  SCHEDULE_STATUS_LABEL,
} from "@/lib/constants/labels";
import { cn, truncate } from "@/lib/utils";

// --- revisions --------------------------------------------------------------

export interface RevisionItem {
  id: string;
  version: number;
  source: RevisionSource;
  changeSummary: string | null;
  caption: string;
  qualityScore: number | null;
  createdAt: Date;
  author: { name: string | null } | null;
}

export function RevisionHistory({ revisions, currentVersion }: { revisions: RevisionItem[]; currentVersion: number }) {
  if (!revisions.length) {
    return <EmptyState icon={GitCommitHorizontal} title="No revisions" description="Nothing has changed yet." />;
  }

  return (
    <ol className="space-y-0">
      {revisions.map((revision, index) => {
        const human = revision.source === "HUMAN_EDIT";
        const isCurrent = revision.version === currentVersion && index === 0;
        return (
          <li key={revision.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index !== revisions.length - 1 && (
              <span className="bg-border absolute top-7 left-[13px] h-[calc(100%-1rem)] w-px" aria-hidden />
            )}
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full",
                human ? "bg-sky-500/12 text-sky-600 dark:text-sky-400" : "bg-primary/12 text-primary",
              )}
            >
              {human ? <User className="size-3.5" /> : <Sparkles className="size-3.5" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium">
                  v{revision.version} · {REVISION_SOURCE_LABEL[revision.source]}
                </p>
                {isCurrent && <Badge variant="default">current</Badge>}
                {revision.qualityScore != null && (
                  <span className="text-muted-foreground text-[11px] tabular-nums">
                    score {Math.round(revision.qualityScore)}
                  </span>
                )}
              </div>
              {revision.changeSummary && (
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">{revision.changeSummary}</p>
              )}
              <p className="text-muted-foreground/70 mt-1 text-[10px]">
                {revision.author?.name ? `${revision.author.name} · ` : ""}
                {formatDistanceToNow(new Date(revision.createdAt), { addSuffix: true })}
              </p>
              <p className="text-muted-foreground/60 mt-1.5 line-clamp-2 text-[11px] leading-relaxed">
                {truncate(revision.caption.replace(/\n+/g, " "), 150)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// --- approvals --------------------------------------------------------------

export interface ApprovalItem {
  id: string;
  decision: ApprovalDecision;
  feedback: string | null;
  postVersion: number;
  qualityScoreAtDecision: number | null;
  createdAt: Date;
  reviewer: { name: string | null; email: string };
}

const DECISION_ICON = {
  APPROVED: Check,
  REJECTED: X,
  CHANGES_REQUESTED: RotateCw,
  REGENERATION_REQUESTED: Sparkles,
} as const;

const DECISION_TONE = {
  APPROVED: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  REJECTED: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  CHANGES_REQUESTED: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  REGENERATION_REQUESTED: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
} as const;

/** The audit trail. Every decision, who made it and against which version. */
export function ApprovalTrail({ approvals, currentVersion }: { approvals: ApprovalItem[]; currentVersion: number }) {
  if (!approvals.length) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No decisions yet"
        description="Nothing can be scheduled or published until a person records a decision here."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {approvals.map((approval) => {
        const Icon = DECISION_ICON[approval.decision];
        const stale = approval.decision === "APPROVED" && approval.postVersion !== currentVersion;
        return (
          <li key={approval.id} className="flex gap-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full",
                DECISION_TONE[approval.decision],
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium">{APPROVAL_DECISION_LABEL[approval.decision]}</p>
                <span className="text-muted-foreground text-[11px]">at v{approval.postVersion}</span>
                {stale && <Badge variant="warning">superseded by an edit</Badge>}
              </div>
              {approval.feedback && (
                <p className="text-muted-foreground mt-1 rounded-md border-l-2 border-border pl-2.5 text-[11px] leading-relaxed">
                  {approval.feedback}
                </p>
              )}
              <p className="text-muted-foreground/70 mt-1 text-[10px]">
                {approval.reviewer.name ?? approval.reviewer.email} ·{" "}
                {format(new Date(approval.createdAt), "d MMM yyyy, HH:mm")}
                {approval.qualityScoreAtDecision != null && ` · score ${Math.round(approval.qualityScoreAtDecision)}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// --- publishing -------------------------------------------------------------

export interface PublishLogItem {
  id: string;
  status: PublishLogStatus;
  attempt: number;
  message: string;
  errorCode: string | null;
  externalUrl: string | null;
  latencyMs: number | null;
  createdAt: Date;
  platform: Platform;
}

const LOG_TONE: Record<PublishLogStatus, string> = {
  ATTEMPT: "text-muted-foreground",
  SUCCESS: "text-emerald-600 dark:text-emerald-400",
  FAILURE: "text-rose-600 dark:text-rose-400",
  RETRY_SCHEDULED: "text-amber-600 dark:text-amber-400",
  BLOCKED: "text-amber-600 dark:text-amber-400",
  SKIPPED_DUPLICATE: "text-muted-foreground",
};

const LOG_ICON: Record<PublishLogStatus, typeof Check> = {
  ATTEMPT: CircleDashed,
  SUCCESS: Check,
  FAILURE: AlertTriangle,
  RETRY_SCHEDULED: RotateCw,
  BLOCKED: ShieldAlert,
  SKIPPED_DUPLICATE: CircleDashed,
};

export function PublishingLogList({ logs }: { logs: PublishLogItem[] }) {
  if (!logs.length) {
    return (
      <EmptyState icon={CalendarClock} title="No publishing attempts" description="This post has not been sent to a platform yet." />
    );
  }

  return (
    <ol className="space-y-2.5">
      {logs.map((log) => {
        const Icon = LOG_ICON[log.status];
        return (
          <li key={log.id} className="flex gap-2.5">
            <Icon className={cn("mt-0.5 size-3.5 shrink-0", LOG_TONE[log.status])} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                {PUBLISH_LOG_LABEL[log.status]}
                <span className="text-muted-foreground font-normal">attempt {log.attempt}</span>
                {log.latencyMs != null && (
                  <span className="text-muted-foreground/70 font-normal tabular-nums">{log.latencyMs}ms</span>
                )}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">{log.message}</p>
              <p className="text-muted-foreground/70 mt-0.5 text-[10px]">
                {format(new Date(log.createdAt), "d MMM yyyy, HH:mm:ss")}
                {log.errorCode && ` · ${log.errorCode}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// --- schedules --------------------------------------------------------------

export interface ScheduleItem {
  id: string;
  scheduledFor: Date;
  status: ScheduleStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  completedAt: Date | null;
  idempotencyKey: string;
  socialAccount: { handle: string } | null;
}

const SCHEDULE_TONE: Record<ScheduleStatus, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  PENDING: "default",
  QUEUED: "default",
  PUBLISHING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "secondary",
};

export function ScheduleList({ schedules }: { schedules: ScheduleItem[] }) {
  if (!schedules.length) {
    return <EmptyState icon={CalendarClock} title="Never scheduled" description="This post has no schedule history." />;
  }

  return (
    <ul className="space-y-2.5">
      {schedules.map((schedule) => (
        <li key={schedule.id} className="rounded-lg border px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium">{format(new Date(schedule.scheduledFor), "EEE d MMM yyyy, HH:mm")}</p>
            <Badge variant={SCHEDULE_TONE[schedule.status]}>{SCHEDULE_STATUS_LABEL[schedule.status]}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {schedule.socialAccount ? `@${schedule.socialAccount.handle} · ` : ""}
            attempt {schedule.attempts} of {schedule.maxAttempts}
            {schedule.nextAttemptAt && ` · retry ${format(new Date(schedule.nextAttemptAt), "d MMM HH:mm")}`}
          </p>
          {schedule.lastError && (
            <p className="text-destructive mt-1 text-[11px] leading-relaxed">{schedule.lastError}</p>
          )}
          <p className="text-muted-foreground/60 mt-1 font-mono text-[10px]" title="Guarantees this version publishes at most once">
            {schedule.idempotencyKey}
          </p>
        </li>
      ))}
    </ul>
  );
}
