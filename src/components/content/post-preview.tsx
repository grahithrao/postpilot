"use client";

import * as React from "react";
import { format } from "date-fns";
import type { Platform } from "@prisma/client";
import { Bookmark, Heart, ImageIcon, MessageCircle, MoreHorizontal, Repeat2, Send, Share2, ThumbsUp } from "lucide-react";
import { PlatformIcon } from "@/components/shared/platform-badge";
import { platformSpec } from "@/lib/constants/platforms";
import { cn, initials } from "@/lib/utils";

export interface PreviewContent {
  headline?: string | null;
  caption: string;
  hashtags: string[];
  cta?: string | null;
  imagePrompt?: string | null;
}

export interface PreviewAccount {
  handle: string;
  displayName: string;
  followerCount?: number;
}

/**
 * A platform-accurate preview of the post.
 *
 * Content is rendered as text nodes (never `dangerouslySetInnerHTML`), so
 * nothing a model or a user writes can inject markup here.
 */
export function PostPreview({
  platform,
  content,
  account,
  scheduledFor,
  className,
}: {
  platform: Platform;
  content: PreviewContent;
  account?: PreviewAccount | null;
  scheduledFor?: Date | null;
  className?: string;
}) {
  const spec = platformSpec(platform);
  const handle = account?.handle ?? "your-account";
  const name = account?.displayName ?? "Your brand";
  const tags = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`));

  const body = (
    <>
      {content.headline && spec.supportsHeadline && (
        <p className="mb-1.5 text-sm font-semibold">{content.headline}</p>
      )}
      <p className="post-body text-[13px] leading-relaxed">{content.caption}</p>
      {tags.length > 0 && (
        <p className="mt-2 text-[13px] leading-relaxed text-sky-600 dark:text-sky-400">{tags.join(" ")}</p>
      )}
    </>
  );

  const mediaPlaceholder = content.imagePrompt ? (
    <div className={cn("bg-muted relative flex items-center justify-center border-y", platform === "INSTAGRAM" ? "aspect-square" : "aspect-[1.91/1]")}>
      <div className="max-w-[85%] text-center">
        <ImageIcon className="text-muted-foreground/60 mx-auto size-6" />
        <p className="text-muted-foreground/80 mt-2 text-[10px] leading-relaxed">
          Image prompt ready — generate the visual in your image tool of choice
        </p>
      </div>
    </div>
  ) : null;

  return (
    <div className={cn("bg-card overflow-hidden rounded-xl border shadow-xs", className)}>
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <PlatformIcon platform={platform} className="text-muted-foreground size-3.5" />
        <span className="text-muted-foreground text-[11px] font-medium">{spec.name} preview</span>
        {scheduledFor && (
          <span className="text-muted-foreground/70 ml-auto text-[11px]">{format(scheduledFor, "EEE d MMM, HH:mm")}</span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
              spec.dot,
            )}
          >
            {initials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{name}</p>
            <p className="text-muted-foreground truncate text-[11px]">
              {platform === "LINKEDIN"
                ? `${(account?.followerCount ?? 0).toLocaleString()} followers · Just now`
                : platform === "X"
                  ? `@${handle} · now`
                  : `${spec.handlePrefix}${handle}`}
            </p>
          </div>
          <MoreHorizontal className="text-muted-foreground size-4 shrink-0" />
        </div>

        {platform === "INSTAGRAM" ? null : <div className="mt-3">{body}</div>}
      </div>

      {mediaPlaceholder}

      {platform === "INSTAGRAM" && <div className="px-4 pt-3">{body}</div>}

      {content.cta && (
        <p className="text-muted-foreground px-4 pt-2 text-[11px]">
          <span className="font-medium">CTA:</span> {content.cta}
        </p>
      )}

      <div className="text-muted-foreground mt-3 flex items-center gap-5 border-t px-4 py-2.5">
        {platform === "LINKEDIN" && (
          <>
            <Action icon={ThumbsUp} label="Like" />
            <Action icon={MessageCircle} label="Comment" />
            <Action icon={Repeat2} label="Repost" />
            <Action icon={Send} label="Send" />
          </>
        )}
        {platform === "X" && (
          <>
            <Action icon={MessageCircle} label="Reply" />
            <Action icon={Repeat2} label="Repost" />
            <Action icon={Heart} label="Like" />
            <Action icon={Share2} label="Share" />
          </>
        )}
        {platform === "INSTAGRAM" && (
          <>
            <Action icon={Heart} label="Like" />
            <Action icon={MessageCircle} label="Comment" />
            <Action icon={Send} label="Share" />
            <Action icon={Bookmark} label="Save" className="ml-auto" />
          </>
        )}
        {platform === "FACEBOOK" && (
          <>
            <Action icon={ThumbsUp} label="Like" />
            <Action icon={MessageCircle} label="Comment" />
            <Action icon={Share2} label="Share" />
          </>
        )}
      </div>
    </div>
  );
}

function Action({
  icon: Icon,
  label,
  className,
}: {
  icon: typeof Heart;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1.5 text-[11px]", className)}>
      <Icon className="size-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

/** Live character/hashtag budget for the target platform. */
export function PlatformBudget({
  platform,
  content,
  className,
}: {
  platform: Platform;
  content: PreviewContent;
  className?: string;
}) {
  const spec = platformSpec(platform);
  const tagLength = content.hashtags.reduce((n, t) => n + t.length + 2, 0);
  const total = content.caption.length + tagLength;
  const pct = Math.min(100, (total / spec.captionLimit) * 100);
  const over = total > spec.captionLimit;
  const tagsOver = content.hashtags.length > spec.hashtagLimit;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Characters</span>
        <span className={cn("font-medium tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
          {total.toLocaleString()} / {spec.captionLimit.toLocaleString()}
        </span>
      </div>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-[width]", over ? "bg-destructive" : pct > 85 ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Hashtags</span>
        <span className={cn("font-medium tabular-nums", tagsOver ? "text-destructive" : "text-muted-foreground")}>
          {content.hashtags.length} / {spec.hashtagLimit} · best {spec.idealHashtagRange[0]}-{spec.idealHashtagRange[1]}
        </span>
      </div>
    </div>
  );
}
