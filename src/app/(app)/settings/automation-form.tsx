"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AutomationFrequency, ContentType, Platform, Tone } from "@prisma/client";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTENT_TYPE_LABEL, DAYS_OF_WEEK, FREQUENCY_LABEL, TONE_LABEL } from "@/lib/constants/labels";
import { PLATFORM_LIST } from "@/lib/constants/platforms";
import { api, ApiError } from "@/lib/api/client";

export interface AutomationFormValue {
  id?: string;
  name: string;
  description: string;
  frequency: AutomationFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  platform: Platform;
  socialAccountId: string | null;
  topic: string;
  audience: string;
  tone: Tone;
  contentType: ContentType;
  keywords: string[];
  enabled: boolean;
}

export const EMPTY_AUTOMATION: AutomationFormValue = {
  name: "",
  description: "",
  frequency: AutomationFrequency.WEEKLY,
  dayOfWeek: 1,
  dayOfMonth: 1,
  hour: 9,
  minute: 0,
  platform: Platform.LINKEDIN,
  socialAccountId: null,
  topic: "",
  audience: "",
  tone: Tone.PROFESSIONAL,
  contentType: ContentType.EDUCATIONAL,
  keywords: [],
  enabled: true,
};

export function AutomationForm({
  open,
  onOpenChange,
  initial,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AutomationFormValue;
  accounts: Array<{ id: string; platform: string; handle: string }>;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValue(initial);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial.id]);

  const set = <K extends keyof AutomationFormValue>(key: K, next: AutomationFormValue[K]) =>
    setValue((prev) => ({ ...prev, [key]: next }));

  const matchingAccounts = accounts.filter((a) => a.platform === value.platform);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...value,
        description: value.description || undefined,
        audience: value.audience || undefined,
        socialAccountId: value.socialAccountId ?? undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      if (value.id) {
        await api(`/api/automations/${value.id}`, { method: "PATCH", json: payload });
        toast.success("Automation updated");
      } else {
        await api("/api/automations", { method: "POST", json: payload });
        toast.success("Automation created", { description: "It will generate drafts and send them to the approval queue." });
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the automation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{value.id ? "Edit automation" : "New automation"}</DialogTitle>
          <DialogDescription>
            Automations generate content on a schedule. They always stop at the approval queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={value.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Monday thought leadership"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={value.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What this automation is for"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select
                value={value.platform}
                onValueChange={(v) => {
                  set("platform", v as Platform);
                  set("socialAccountId", null);
                }}
              >
                <SelectTrigger>
                  <SelectValue>{PLATFORM_LIST.find((s) => s.id === value.platform)?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_LIST.map((spec) => (
                    <SelectItem key={spec.id} value={spec.id}>
                      {spec.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select
                value={value.socialAccountId ?? "none"}
                onValueChange={(v) => set("socialAccountId", v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any connected account">
                    {value.socialAccountId
                      ? `@${matchingAccounts.find((a) => a.id === value.socialAccountId)?.handle ?? ""}`
                      : "Any connected account"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any connected account</SelectItem>
                  {matchingAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      @{account.handle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic prompt</Label>
            <Textarea
              id="topic"
              rows={2}
              value={value.topic}
              onChange={(e) => set("topic", e.target.value)}
              placeholder="an operational insight our team learned this week"
            />
            <p className="text-muted-foreground text-[11px]">
              Written as a standing instruction — the agent produces a fresh angle on it every run.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="audience">Audience</Label>
              <Input
                id="audience"
                value={value.audience}
                onChange={(e) => set("audience", e.target.value)}
                placeholder="operations leaders"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                value={value.keywords.join(", ")}
                onChange={(e) =>
                  set("keywords", e.target.value.split(",").map((k) => k.trim()).filter(Boolean))
                }
                placeholder="Comma separated"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Content type</Label>
              <Select value={value.contentType} onValueChange={(v) => set("contentType", v as ContentType)}>
                <SelectTrigger>
                  <SelectValue>{CONTENT_TYPE_LABEL[value.contentType]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ContentType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {CONTENT_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Select value={value.tone} onValueChange={(v) => set("tone", v as Tone)}>
                <SelectTrigger>
                  <SelectValue>{TONE_LABEL[value.tone]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Tone).map((tone) => (
                    <SelectItem key={tone} value={tone}>
                      {TONE_LABEL[tone]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={value.frequency} onValueChange={(v) => set("frequency", v as AutomationFrequency)}>
                <SelectTrigger>
                  <SelectValue>{FREQUENCY_LABEL[value.frequency]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.values(AutomationFrequency).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(value.frequency === "WEEKLY" || value.frequency === "BIWEEKLY") && (
              <div className="space-y-1.5">
                <Label>Day</Label>
                <Select value={String(value.dayOfWeek)} onValueChange={(v) => set("dayOfWeek", Number(v))}>
                  <SelectTrigger>
                    <SelectValue>{DAYS_OF_WEEK[value.dayOfWeek]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day, index) => (
                      <SelectItem key={day} value={String(index)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {value.frequency === "MONTHLY" && (
              <div className="space-y-1.5">
                <Label htmlFor="dom">Day of month</Label>
                <Input
                  id="dom"
                  type="number"
                  min={1}
                  max={28}
                  value={value.dayOfMonth}
                  onChange={(e) => set("dayOfMonth", Number(e.target.value))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="hour">Time</Label>
              <Input
                id="hour"
                type="time"
                value={`${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":");
                  set("hour", Number(h ?? 9));
                  set("minute", Number(m ?? 0));
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-xs font-medium">Enabled</p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">Paused automations keep their settings.</p>
            </div>
            <Switch checked={value.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[11px] leading-relaxed">
              <span className="font-medium">Approval cannot be turned off.</span>{" "}
              <span className="text-muted-foreground">
                Automations run the same agent you do, and it pauses at the same interrupt. Generated drafts land in the
                approval queue — never on a platform.
              </span>
            </p>
          </div>

          {error && (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={value.name.trim().length < 2 || value.topic.trim().length < 3}>
            {value.id ? "Save changes" : "Create automation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
