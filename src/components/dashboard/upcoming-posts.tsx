import Link from "next/link";
import { format, isToday, isTomorrow } from "date-fns";
import type { Platform, PostStatus } from "@prisma/client";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/shared/platform-badge";
import { truncate } from "@/lib/utils";

export interface UpcomingItem {
  id: string;
  scheduledFor: Date;
  socialAccount: { handle: string } | null;
  post: {
    id: string;
    headline: string | null;
    caption: string;
    platform: Platform;
    status: PostStatus;
    qualityScore: number | null;
  };
}

function whenLabel(date: Date) {
  if (isToday(date)) return `Today, ${format(date, "HH:mm")}`;
  if (isTomorrow(date)) return `Tomorrow, ${format(date, "HH:mm")}`;
  return format(date, "EEE d MMM, HH:mm");
}

export function UpcomingPosts({ items }: { items: UpcomingItem[] }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing scheduled"
        description="Approved posts can be scheduled from the content library or the calendar."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/content?status=APPROVED">See approved posts</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/content/${item.post.id}`}
            className="hover:bg-accent/40 flex items-start gap-3 px-5 py-3 transition-colors"
          >
            <span className="bg-muted mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
              <PlatformIcon platform={item.post.platform} className="text-muted-foreground size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">
                {item.post.headline || truncate(item.post.caption.split("\n")[0] ?? "", 70)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {whenLabel(new Date(item.scheduledFor))}
                {item.socialAccount && ` · @${item.socialAccount.handle}`}
              </p>
            </div>
            {item.post.qualityScore != null && (
              <span className="text-muted-foreground shrink-0 text-[11px] font-medium tabular-nums">
                {Math.round(item.post.qualityScore)}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
