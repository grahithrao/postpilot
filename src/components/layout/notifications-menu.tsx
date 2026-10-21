"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import type { Notification } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const TYPE_DOT: Record<string, string> = {
  APPROVAL_REQUESTED: "bg-amber-500",
  POST_APPROVED: "bg-emerald-500",
  POST_REJECTED: "bg-rose-500",
  POST_PUBLISHED: "bg-teal-500",
  POST_FAILED: "bg-red-500",
  AUTOMATION_RUN: "bg-violet-500",
  SYSTEM: "bg-sky-500",
};

export function NotificationsMenu({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Notification[] | null>(null);
  const [unread, setUnread] = React.useState(initialUnread);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ items: Notification[]; unread: number }>("/api/notifications");
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? null);
    await api("/api/notifications", { method: "PATCH", json: { all: true } }).catch(() => {});
    router.refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-88 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs">
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-88">
          {loading && !items ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="mt-1 size-2 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : !items?.length ? (
            <EmptyState
              icon={Bell}
              title="Nothing yet"
              description="Approvals, publishes and failures will show up here."
              className="py-10"
            />
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const body = (
                  <div className={cn("flex gap-3 px-4 py-3", !n.read && "bg-primary/[0.04]")}>
                    <span
                      className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", TYPE_DOT[n.type] ?? "bg-muted-foreground")}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{n.title}</p>
                      {n.body && <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px]">{n.body}</p>}
                      <p className="text-muted-foreground/70 mt-1 text-[10px]">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="hover:bg-accent/50 block transition-colors">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
