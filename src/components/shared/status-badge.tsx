import type { PostStatus } from "@prisma/client";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  Send,
  Archive,
  XCircle,
} from "lucide-react";
import { POST_STATUS_LABEL, POST_STATUS_STYLE } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

const ICONS: Record<PostStatus, typeof Clock> = {
  DRAFT: CircleDashed,
  PENDING_APPROVAL: Clock,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
  SCHEDULED: CalendarClock,
  PUBLISHING: Loader2,
  PUBLISHED: Send,
  FAILED: AlertTriangle,
  ARCHIVED: Archive,
};

export function StatusBadge({
  status,
  className,
  showIcon = true,
}: {
  status: PostStatus;
  className?: string;
  showIcon?: boolean;
}) {
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] leading-5 font-medium whitespace-nowrap",
        POST_STATUS_STYLE[status],
        className,
      )}
    >
      {showIcon && <Icon className={cn("size-3", status === "PUBLISHING" && "animate-spin")} />}
      {POST_STATUS_LABEL[status]}
    </span>
  );
}
