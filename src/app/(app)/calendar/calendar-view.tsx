"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { Platform, PostStatus, ScheduleStatus } from "@prisma/client";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { PlatformIcon } from "@/components/shared/platform-badge";
import { PostPreview } from "@/components/content/post-preview";
import { ScheduleDialog, type ScheduleAccount } from "@/components/content/schedule-dialog";
import { platformSpec } from "@/lib/constants/platforms";
import { api, ApiError } from "@/lib/api/client";
import { cn, truncate } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  postId: string;
  at: string;
  scheduleStatus: ScheduleStatus;
  handle: string | null;
  attempts: number;
  lastError: string | null;
  post: {
    id: string;
    headline: string | null;
    caption: string;
    platform: Platform;
    status: PostStatus;
    qualityScore: number | null;
    hashtags: string[];
  };
}

type ViewMode = "month" | "week" | "day";

const STATUS_DOT: Record<PostStatus, string> = {
  DRAFT: "bg-muted-foreground",
  PENDING_APPROVAL: "bg-amber-500",
  APPROVED: "bg-emerald-500",
  REJECTED: "bg-rose-500",
  SCHEDULED: "bg-violet-500",
  PUBLISHING: "bg-sky-500",
  PUBLISHED: "bg-teal-500",
  FAILED: "bg-red-500",
  ARCHIVED: "bg-muted-foreground",
};

export function CalendarView({ accounts, approvedCount }: { accounts: ScheduleAccount[]; approvedCount: number }) {
  const router = useRouter();
  const [view, setView] = React.useState<ViewMode>("month");
  const [cursor, setCursor] = React.useState(() => new Date());
  const [events, setEvents] = React.useState<CalendarEvent[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<CalendarEvent | null>(null);
  const [rescheduling, setRescheduling] = React.useState<CalendarEvent | null>(null);
  const [busy, setBusy] = React.useState(false);

  const range = React.useMemo(() => {
    if (view === "day") return { start: startOfDay(cursor), end: endOfDay(cursor) };
    if (view === "week") return { start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) };
    return {
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
    };
  }, [view, cursor]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ events: CalendarEvent[] }>(
        `/api/schedules?from=${range.start.toISOString()}&to=${range.end.toISOString()}`,
      );
      setEvents(data.events);
    } catch {
      setEvents([]);
      toast.error("Could not load the calendar");
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const days = React.useMemo(() => eachDayOfInterval({ start: range.start, end: range.end }), [range]);
  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events ?? []) {
      const key = format(new Date(event.at), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);

  function shift(direction: -1 | 1) {
    setCursor((current) =>
      view === "month" ? addMonths(current, direction) : view === "week" ? addWeeks(current, direction) : addDays(current, direction),
    );
  }

  async function cancelSchedule(event: CalendarEvent) {
    setBusy(true);
    try {
      await api(`/api/schedules/${event.id}`, { method: "DELETE" });
      toast.success("Schedule cancelled", { description: "The post stays approved and can be rescheduled." });
      setSelected(null);
      await load();
      router.refresh();
    } catch (error) {
      toast.error("Could not cancel", { description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  const title =
    view === "month" ? format(cursor, "MMMM yyyy") : view === "week" ? `Week of ${format(range.start, "d MMM yyyy")}` : format(cursor, "EEEE d MMMM yyyy");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <p className="ml-2 text-sm font-semibold tracking-tight">{title}</p>
          {loading && <Loader2 className="text-muted-foreground ml-1 size-3.5 animate-spin" />}
        </div>

        <div className="flex items-center gap-3">
          {approvedCount > 0 && (
            <Link href="/content?status=APPROVED" className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-4">
              {approvedCount} approved post{approvedCount === 1 ? "" : "s"} not yet scheduled
            </Link>
          )}
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <Card className="overflow-hidden">
        {view === "day" ? (
          <DayAgenda
            events={byDay.get(format(cursor, "yyyy-MM-dd")) ?? []}
            onSelect={setSelected}
            loading={events === null}
          />
        ) : (
          <>
            <div className="bg-muted/40 grid grid-cols-7 border-b">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                <div key={label} className="text-muted-foreground px-2 py-2 text-center text-[11px] font-medium">
                  {label}
                </div>
              ))}
            </div>
            <div className={cn("grid grid-cols-7", view === "week" && "min-h-[420px]")}>
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayEvents = byDay.get(key) ?? [];
                const outside = view === "month" && !isSameMonth(day, cursor);
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-24 border-r border-b p-1.5 last:border-r-0 sm:min-h-28",
                      outside && "bg-muted/25",
                      view === "week" && "min-h-[420px]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setCursor(day);
                        setView("day");
                      }}
                      className={cn(
                        "mb-1 flex size-6 items-center justify-center rounded-md text-[11px] font-medium tabular-nums transition-colors",
                        isToday(day) ? "bg-primary text-primary-foreground" : outside ? "text-muted-foreground/50" : "hover:bg-accent",
                      )}
                    >
                      {format(day, "d")}
                    </button>
                    <div className="space-y-1">
                      {events === null &&
                        Array.from({ length: (day.getDate() % 3 === 0 ? 2 : day.getDate() % 4 === 0 ? 1 : 0) }).map(
                          (_, i) => <Skeleton key={i} className="h-8 w-full rounded-md" />,
                        )}
                      {dayEvents.slice(0, view === "week" ? 8 : 3).map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => setSelected(event)}
                          className="hover:bg-accent bg-card w-full rounded-md border px-1.5 py-1 text-left transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[event.post.status])} />
                            <PlatformIcon platform={event.post.platform} className="text-muted-foreground size-2.5 shrink-0" />
                            <span className="text-muted-foreground truncate text-[10px] tabular-nums">
                              {format(new Date(event.at), "HH:mm")}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] leading-tight">
                            {truncate(event.post.headline || event.post.caption.split("\n")[0] || "", 40)}
                          </span>
                        </button>
                      ))}
                      {dayEvents.length > (view === "week" ? 8 : 3) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCursor(day);
                            setView("day");
                          }}
                          className="text-muted-foreground hover:text-foreground w-full px-1.5 text-left text-[10px]"
                        >
                          +{dayEvents.length - (view === "week" ? 8 : 3)} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(["SCHEDULED", "PUBLISHED", "PUBLISHING", "FAILED"] as PostStatus[]).map((status) => (
          <span key={status} className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
            <StatusBadge status={status} showIcon={false} className="border-0 bg-transparent px-0" />
          </span>
        ))}
      </div>

      {/* Event detail */}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.post.headline || "Scheduled post"}</DialogTitle>
                <DialogDescription>
                  {platformSpec(selected.post.platform).name} ·{" "}
                  {format(new Date(selected.at), "EEEE d MMMM yyyy, HH:mm")}
                  {selected.handle && ` · @${selected.handle}`}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selected.post.status} />
                {selected.attempts > 0 && (
                  <span className="text-muted-foreground text-[11px]">{selected.attempts} publish attempt(s)</span>
                )}
              </div>

              {selected.lastError && (
                <p className="text-destructive flex items-start gap-2 rounded-lg bg-red-500/[0.07] px-3 py-2 text-[11px] leading-relaxed">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {selected.lastError}
                </p>
              )}

              <PostPreview
                platform={selected.post.platform}
                content={{ caption: selected.post.caption, hashtags: selected.post.hashtags, headline: selected.post.headline }}
                account={selected.handle ? { handle: selected.handle, displayName: "Your brand" } : null}
              />

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/content/${selected.postId}`}>
                    <ExternalLink className="size-3.5" /> Open post
                  </Link>
                </Button>
                {["PENDING", "QUEUED", "FAILED"].includes(selected.scheduleStatus) && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setRescheduling(selected)}>
                      <CalendarClock className="size-3.5" /> Reschedule
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy} onClick={() => cancelSchedule(selected)}>
                      <CalendarX className="size-3.5" /> Cancel schedule
                    </Button>
                  </>
                )}
                {selected.post.status === "PUBLISHED" && (
                  <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
                    <Send className="size-3.5" /> Published
                  </span>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {rescheduling && (
        <ScheduleDialog
          postId={rescheduling.postId}
          platform={rescheduling.post.platform}
          currentScheduledFor={rescheduling.at}
          accounts={accounts}
          open={Boolean(rescheduling)}
          onOpenChange={(open) => !open && setRescheduling(null)}
          onScheduled={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function DayAgenda({
  events,
  onSelect,
  loading,
}: {
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3 p-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!events.length) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing on this day"
        description="Approved posts can be scheduled from the content library."
        className="py-16"
      />
    );
  }

  return (
    <ul className="divide-y">
      {events.map((event) => (
        <li key={event.id}>
          <button
            type="button"
            onClick={() => onSelect(event)}
            className="hover:bg-accent/40 flex w-full items-start gap-3 px-5 py-3 text-left transition-colors"
          >
            <span className="text-muted-foreground w-12 shrink-0 pt-0.5 text-xs tabular-nums">
              {format(new Date(event.at), "HH:mm")}
            </span>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", STATUS_DOT[event.post.status])} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {event.post.headline || truncate(event.post.caption.split("\n")[0] ?? "", 70)}
              </span>
              <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
                <PlatformIcon platform={event.post.platform} className="size-3" />
                {platformSpec(event.post.platform).name}
                {event.handle && ` · @${event.handle}`}
              </span>
            </span>
            <StatusBadge status={event.post.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
