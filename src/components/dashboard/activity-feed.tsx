import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { ActivityType, Platform } from "@prisma/client";
import {
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FileEdit,
  Link2,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Workflow,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformIcon } from "@/components/shared/platform-badge";
import { cn } from "@/lib/utils";

const ICONS: Partial<Record<ActivityType, LucideIcon>> = {
  POST_CREATED: FileEdit,
  POST_GENERATED: Sparkles,
  POST_EDITED: FileEdit,
  POST_SUBMITTED: ShieldAlert,
  POST_APPROVED: CheckCircle2,
  POST_REJECTED: XCircle,
  POST_CHANGES_REQUESTED: FileEdit,
  POST_REGENERATED: Sparkles,
  POST_SCHEDULED: CalendarClock,
  POST_RESCHEDULED: CalendarClock,
  POST_SCHEDULE_CANCELLED: CalendarClock,
  POST_PUBLISHING: Send,
  POST_PUBLISHED: Send,
  POST_FAILED: XCircle,
  POST_DELETED: Trash2,
  PUBLISH_BLOCKED: ShieldAlert,
  ACCOUNT_CONNECTED: Link2,
  ACCOUNT_DISCONNECTED: Link2,
  ACCOUNT_SYNCED: Link2,
  AUTOMATION_CREATED: Workflow,
  AUTOMATION_UPDATED: Workflow,
  AUTOMATION_RUN: Workflow,
  AUTOMATION_DELETED: Workflow,
  USER_LOGIN: CircleDot,
};

const TONES: Partial<Record<ActivityType, string>> = {
  POST_APPROVED: "text-emerald-600 dark:text-emerald-400",
  POST_PUBLISHED: "text-teal-600 dark:text-teal-400",
  POST_REJECTED: "text-rose-600 dark:text-rose-400",
  POST_FAILED: "text-red-600 dark:text-red-400",
  PUBLISH_BLOCKED: "text-amber-600 dark:text-amber-400",
  POST_GENERATED: "text-primary",
  AUTOMATION_RUN: "text-violet-600 dark:text-violet-400",
};

export interface ActivityItem {
  id: string;
  type: ActivityType;
  message: string;
  createdAt: Date;
  post: { id: string; platform: Platform; headline: string | null; topic: string } | null;
}

export function ActivityFeed({ items, emptyHint }: { items: ActivityItem[]; emptyHint?: string }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={CircleDot}
        title="No activity yet"
        description={emptyHint ?? "Generate your first post and the audit trail will start filling in."}
      />
    );
  }

  return (
    <ol className="relative space-y-0">
      {items.map((item, index) => {
        const Icon = ICONS[item.type] ?? CircleDot;
        const isLast = index === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast && <span className="bg-border absolute top-7 left-[13px] h-[calc(100%-1rem)] w-px" aria-hidden />}
            <span className="bg-muted relative flex size-7 shrink-0 items-center justify-center rounded-full">
              <Icon className={cn("size-3.5", TONES[item.type] ?? "text-muted-foreground")} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-xs leading-relaxed">{item.message}</p>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                {item.post && (
                  <>
                    <span aria-hidden>·</span>
                    <Link
                      href={`/content/${item.post.id}`}
                      className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
                    >
                      <PlatformIcon platform={item.post.platform} className="size-3" />
                      <span className="max-w-44 truncate">{item.post.headline || item.post.topic}</span>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
