"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addDays, format, setHours, setMinutes, startOfHour } from "date-fns";
import type { Platform } from "@prisma/client";
import { toast } from "sonner";
import { CalendarClock, Clock, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { platformSpec } from "@/lib/constants/platforms";
import { api, ApiError } from "@/lib/api/client";

function toLocalInput(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** The next occurrence of one of the platform's better-performing hours. */
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

export interface ScheduleAccount {
  id: string;
  platform: Platform;
  handle: string;
}

/**
 * Schedules an approved post.
 *
 * The API refuses anything unapproved, so this dialog surfaces that refusal
 * rather than trying to predict it — the block always comes from the server.
 */
export function ScheduleDialog({
  postId,
  platform,
  suggestedTime,
  accounts,
  open,
  onOpenChange,
  onScheduled,
  currentScheduledFor,
}: {
  postId: string;
  platform: Platform;
  suggestedTime?: string | null;
  accounts: ScheduleAccount[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
  currentScheduledFor?: string | null;
}) {
  const router = useRouter();
  const matching = accounts.filter((a) => a.platform === platform);
  const [when, setWhen] = React.useState(() =>
    toLocalInput(currentScheduledFor ? new Date(currentScheduledFor) : defaultSlot(platform, suggestedTime)),
  );
  const [accountId, setAccountId] = React.useState(matching[0]?.id ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setWhen(toLocalInput(currentScheduledFor ? new Date(currentScheduledFor) : defaultSlot(platform, suggestedTime)));
      setAccountId(matching[0]?.id ?? "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/posts/${postId}/schedule`, {
        method: "POST",
        json: {
          scheduledFor: new Date(when).toISOString(),
          socialAccountId: accountId || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      toast.success("Scheduled", {
        description: `${platformSpec(platform).name} · ${format(new Date(when), "EEE d MMM, HH:mm")}`,
      });
      onOpenChange(false);
      onScheduled?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not schedule this post.");
    } finally {
      setSaving(false);
    }
  }

  const spec = platformSpec(platform);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentScheduledFor ? "Reschedule post" : "Schedule post"}</DialogTitle>
          <DialogDescription>
            Only approved content can be scheduled. The publishing engine re-checks the approval when the slot arrives.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="when">Date and time</Label>
            <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <Clock className="size-3" />
              {spec.name} performs best around{" "}
              {spec.bestHours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ")} local time.
            </p>
          </div>

          {matching.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Publish as</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an account">
                    {accountId
                      ? `${spec.handlePrefix}${matching.find((a) => a.id === accountId)?.handle ?? ""}`
                      : "Choose an account"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {matching.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {spec.handlePrefix}
                      {a.handle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-muted-foreground flex items-start gap-2 text-xs">
              <ShieldAlert className="text-destructive mt-px size-3.5 shrink-0" />
              No {spec.name} account is connected. Connect one on the Integrations page first.
            </p>
          )}

          {error && (
            <p className="text-destructive flex items-start gap-2 text-xs" role="alert">
              <ShieldAlert className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={matching.length === 0}>
            <CalendarClock className="size-4" />
            {currentScheduledFor ? "Reschedule" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
