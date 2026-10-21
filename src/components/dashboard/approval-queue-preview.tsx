import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { Platform } from "@prisma/client";
import { ShieldCheck, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformIcon } from "@/components/shared/platform-badge";
import { QualityScore } from "@/components/shared/quality-score";
import { truncate } from "@/lib/utils";

export interface ApprovalPreviewItem {
  id: string;
  headline: string | null;
  caption: string;
  platform: Platform;
  qualityScore: number | null;
  createdAt: Date;
  automation: { name: string } | null;
}

export function ApprovalQueuePreview({ items }: { items: ApprovalPreviewItem[] }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Approval queue is clear"
        description="Everything the agent has produced has been reviewed. Nothing is waiting on you."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/create">Generate something new</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="divide-y">
      {items.map((post) => (
        <li key={post.id}>
          <Link href={`/approvals#${post.id}`} className="hover:bg-accent/40 flex items-start gap-3 px-5 py-3 transition-colors">
            <QualityScore score={post.qualityScore} size={34} showLabel={false} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">
                {post.headline || truncate(post.caption.split("\n")[0] ?? "", 70)}
              </p>
              <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <PlatformIcon platform={post.platform} className="size-3" />
                <span>waiting {formatDistanceToNow(new Date(post.createdAt))}</span>
                {post.automation && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Workflow className="size-3" />
                      {post.automation.name}
                    </span>
                  </>
                )}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
