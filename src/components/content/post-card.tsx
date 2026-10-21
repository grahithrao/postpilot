import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import type { Platform, PostStatus } from "@prisma/client";
import { CalendarClock, GitBranch, MessageSquare } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { QualityScore } from "@/components/shared/quality-score";
import { PostActions } from "./post-actions";
import type { ScheduleAccount } from "./schedule-dialog";
import { CONTENT_TYPE_LABEL } from "@/lib/constants/labels";
import { truncate } from "@/lib/utils";

export interface PostCardData {
  id: string;
  topic: string;
  headline: string | null;
  caption: string;
  hashtags: string[];
  platform: Platform;
  status: PostStatus;
  contentType: keyof typeof CONTENT_TYPE_LABEL;
  qualityScore: number | null;
  createdAt: Date;
  publishedAt: Date | null;
  publishedUrl: string | null;
  suggestedTime: Date | null;
  failureReason: string | null;
  socialAccount: { handle: string } | null;
  schedules: Array<{ scheduledFor: Date }>;
  _count: { revisions: number; approvals: number };
}

export function PostCard({ post, accounts }: { post: PostCardData; accounts: ScheduleAccount[] }) {
  const nextSlot = post.schedules[0]?.scheduledFor ?? null;

  return (
    <article className="bg-card hover:border-ring/30 group flex flex-col rounded-xl border shadow-xs transition-colors">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <PlatformBadge platform={post.platform} />
          <StatusBadge status={post.status} />
        </div>
        <PostActions
          post={{
            id: post.id,
            status: post.status,
            platform: post.platform,
            publishedUrl: post.publishedUrl,
            suggestedTime: post.suggestedTime?.toISOString() ?? null,
            scheduledFor: nextSlot?.toISOString() ?? null,
          }}
          accounts={accounts}
        />
      </div>

      <Link href={`/content/${post.id}`} className="flex flex-1 flex-col px-4 pt-3">
        {post.headline && <p className="text-sm font-semibold tracking-tight">{truncate(post.headline, 80)}</p>}
        <p className="text-muted-foreground mt-1 line-clamp-3 text-xs leading-relaxed">
          {truncate(post.caption.replace(/\n+/g, " "), 190)}
        </p>
        {post.hashtags.length > 0 && (
          <p className="mt-2 truncate text-[11px] text-sky-600 dark:text-sky-400">
            {post.hashtags.slice(0, 4).map((t) => `#${t}`).join(" ")}
            {post.hashtags.length > 4 && ` +${post.hashtags.length - 4}`}
          </p>
        )}
      </Link>

      {post.failureReason && post.status === "FAILED" && (
        <p className="text-destructive mx-4 mt-3 rounded-md bg-red-500/[0.07] px-2.5 py-1.5 text-[11px] leading-relaxed">
          {truncate(post.failureReason, 130)}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3 border-t px-4 py-2.5">
        <QualityScore score={post.qualityScore} size={30} showLabel={false} />
        <div className="text-muted-foreground min-w-0 flex-1 text-[11px]">
          <p className="truncate">{CONTENT_TYPE_LABEL[post.contentType]}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {post.publishedAt ? (
              <span>published {formatDistanceToNow(new Date(post.publishedAt), { addSuffix: true })}</span>
            ) : nextSlot ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3" />
                {format(new Date(nextSlot), "d MMM, HH:mm")}
              </span>
            ) : (
              <span>created {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
            )}
          </p>
        </div>
        <div className="text-muted-foreground/70 flex shrink-0 items-center gap-2.5 text-[11px]">
          <span className="inline-flex items-center gap-1" title={`${post._count.revisions} revisions`}>
            <GitBranch className="size-3" />
            {post._count.revisions}
          </span>
          <span className="inline-flex items-center gap-1" title={`${post._count.approvals} review decisions`}>
            <MessageSquare className="size-3" />
            {post._count.approvals}
          </span>
        </div>
      </div>
    </article>
  );
}
