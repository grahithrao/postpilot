"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format, formatDistanceToNow } from "date-fns";
import type { Automation, AutomationRun, Platform } from "@prisma/client";
import { toast } from "sonner";
import {
  Bot,
  Cpu,
  Pause,
  Pencil,
  Play,
  Plus,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Workflow,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { AgentTrace } from "@/components/content/agent-trace";
import { AutomationForm, EMPTY_AUTOMATION, type AutomationFormValue } from "./automation-form";
import { api, ApiError } from "@/lib/api/client";
import { CONTENT_TYPE_LABEL, TONE_LABEL } from "@/lib/constants/labels";
import { describeSchedule } from "@/lib/services/automation-schedule";
import type { RuntimeFlags } from "@/lib/env";

type AutomationRow = Automation & {
  socialAccount: { handle: string } | null;
  runs: AutomationRun[];
  _count: { posts: number };
};

interface Props {
  profile: { id: string; name: string | null; email: string; timezone: string; role: string; createdAt: Date };
  automations: AutomationRow[];
  accounts: Array<{ id: string; platform: Platform; handle: string }>;
  flags: RuntimeFlags;
  runtime: {
    schedulerEnabled: boolean;
    schedulerIntervalMs: number;
    demoFailureRate: number;
    platforms: Array<{ platform: Platform; oauthConfigured: boolean; mode: "demo" | "live" }>;
  };
}

export function SettingsTabs({ profile, automations, accounts, flags, runtime }: Props) {
  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">
          <User /> Profile
        </TabsTrigger>
        <TabsTrigger value="automations">
          <Workflow /> Automations ({automations.length})
        </TabsTrigger>
        <TabsTrigger value="runtime">
          <Server /> Runtime
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <ProfilePanel profile={profile} />
      </TabsContent>

      <TabsContent value="automations">
        <AutomationsPanel automations={automations} accounts={accounts} />
      </TabsContent>

      <TabsContent value="runtime">
        <RuntimePanel flags={flags} runtime={runtime} />
      </TabsContent>
    </Tabs>
  );
}

// --- profile ----------------------------------------------------------------

function ProfilePanel({ profile }: { profile: Props["profile"] }) {
  const router = useRouter();
  const { update } = useSession();
  const [name, setName] = React.useState(profile.name ?? "");
  const [timezone, setTimezone] = React.useState(profile.timezone);
  const [saving, setSaving] = React.useState(false);

  const dirty = name !== (profile.name ?? "") || timezone !== profile.timezone;

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", { method: "PATCH", json: { name, timezone } });
      await update();
      toast.success("Profile saved");
      router.refresh();
    } catch (error) {
      toast.error("Could not save", { description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>Used for approval attribution across the audit trail</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile.email} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/London"
            />
            <p className="text-muted-foreground text-[11px]">
              Your browser reports {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} loading={saving} disabled={!dirty}>
              Save profile
            </Button>
            <Badge variant="secondary">{profile.role.toLowerCase()}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>How the agent works</CardTitle>
            <CardDescription>The workflow behind every post</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <AgentTrace nodeHistory={[]} paused={false} />
          <p className="text-muted-foreground mt-3 border-t pt-3 text-[11px] leading-relaxed">
            The agent is a LangGraph state machine with a Postgres checkpointer. It runs autonomously up to the human
            approval node, where it calls <code className="font-mono text-[10px]">interrupt()</code> — the run is
            persisted and stops. Only a recorded decision resumes it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// --- automations ------------------------------------------------------------

function AutomationsPanel({
  automations,
  accounts,
}: {
  automations: AutomationRow[];
  accounts: Props["accounts"];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AutomationFormValue>(EMPTY_AUTOMATION);
  const [deleting, setDeleting] = React.useState<AutomationRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function act(id: string, label: string, fn: () => Promise<unknown>, message: string) {
    setBusy(id);
    try {
      await fn();
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(`Could not ${label}`, { description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-xs leading-relaxed">
          Automations run the content agent on a schedule and drop the result into the approval queue. They generate;
          they never publish.
        </p>
        <Button
          onClick={() => {
            setEditing(EMPTY_AUTOMATION);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" /> New automation
        </Button>
      </div>

      {automations.length === 0 ? (
        <Card>
          <EmptyState
            icon={Workflow}
            title="No automations yet"
            description="Set one up to generate a weekly LinkedIn post, a midweek product highlight or a monthly recap — each one queued for your approval."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditing(EMPTY_AUTOMATION);
                  setFormOpen(true);
                }}
              >
                Create your first automation
              </Button>
            }
            className="py-14"
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {automations.map((automation) => {
            const lastRun = automation.runs[0];
            return (
              <Card key={automation.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      {automation.name}
                      <Badge variant={automation.enabled ? "success" : "secondary"}>
                        {automation.enabled ? "Active" : "Paused"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{automation.description ?? describeSchedule(automation)}</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={automation.enabled}
                      disabled={busy === automation.id}
                      onCheckedChange={(enabled) =>
                        act(
                          automation.id,
                          "update the automation",
                          () => api(`/api/automations/${automation.id}`, { method: "PATCH", json: { enabled } }),
                          enabled ? "Automation resumed" : "Automation paused",
                        )
                      }
                      aria-label={automation.enabled ? "Pause automation" : "Resume automation"}
                    />
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PlatformBadge platform={automation.platform} />
                    <Badge variant="secondary">{CONTENT_TYPE_LABEL[automation.contentType]}</Badge>
                    <Badge variant="secondary">{TONE_LABEL[automation.tone]}</Badge>
                    <Badge variant="outline">
                      <ShieldCheck className="size-3" /> approval required
                    </Badge>
                  </div>

                  <p className="text-muted-foreground text-[11px] leading-relaxed">“{automation.topic}”</p>

                  <dl className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <dt className="text-muted-foreground">Schedule</dt>
                      <dd>{describeSchedule(automation)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Next run</dt>
                      <dd>
                        {automation.enabled && automation.nextRunAt
                          ? format(new Date(automation.nextRunAt), "d MMM, HH:mm")
                          : "paused"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Runs</dt>
                      <dd>
                        {automation.runCount} · {automation._count.posts} post
                        {automation._count.posts === 1 ? "" : "s"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last run</dt>
                      <dd>
                        {automation.lastRunAt
                          ? formatDistanceToNow(new Date(automation.lastRunAt), { addSuffix: true })
                          : "never"}
                      </dd>
                    </div>
                  </dl>

                  {lastRun?.message && (
                    <p className="text-muted-foreground bg-muted/60 rounded-md px-2.5 py-1.5 text-[11px] leading-relaxed">
                      {lastRun.message}
                    </p>
                  )}
                </CardContent>

                <div className="flex flex-wrap gap-2 border-t px-5 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === automation.id}
                    onClick={() =>
                      act(
                        automation.id,
                        "run the automation",
                        () => api(`/api/automations/${automation.id}/run`, { method: "POST" }),
                        "Generated a draft and sent it to the approval queue",
                      )
                    }
                  >
                    <Play className="size-3.5" /> Run now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing({
                        id: automation.id,
                        name: automation.name,
                        description: automation.description ?? "",
                        frequency: automation.frequency,
                        dayOfWeek: automation.dayOfWeek,
                        dayOfMonth: automation.dayOfMonth,
                        hour: automation.hour,
                        minute: automation.minute,
                        platform: automation.platform,
                        socialAccountId: automation.socialAccountId,
                        topic: automation.topic,
                        audience: automation.audience ?? "",
                        tone: automation.tone,
                        contentType: automation.contentType,
                        keywords: automation.keywords,
                        enabled: automation.enabled,
                      });
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive ml-auto"
                    onClick={() => setDeleting(automation)}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AutomationForm open={formOpen} onOpenChange={setFormOpen} initial={editing} accounts={accounts} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Posts it already created are kept; they simply lose the link back to this automation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleting &&
                act(
                  deleting.id,
                  "delete the automation",
                  async () => {
                    await api(`/api/automations/${deleting.id}`, { method: "DELETE" });
                    setDeleting(null);
                  },
                  "Automation deleted",
                )
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// --- runtime ----------------------------------------------------------------

function RuntimePanel({ flags, runtime }: { flags: RuntimeFlags; runtime: Props["runtime"] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>AI provider</CardTitle>
            <CardDescription>Where generated content comes from</CardDescription>
          </div>
          <Sparkles className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Provider" value={flags.aiProvider} />
          <Row label="Model" value={flags.aiModel} />
          <Row
            label="Mode"
            value={
              flags.usingMockAi ? (
                <Badge variant="warning">deterministic mock</Badge>
              ) : (
                <Badge variant="success">live model</Badge>
              )
            }
          />
          <p className="text-muted-foreground border-t pt-3 text-[11px] leading-relaxed">
            {flags.usingMockAi
              ? "No provider key is configured, so PostPilot uses its built-in compositional model. Set AI_PROVIDER and the matching API key to switch to a real LLM — nothing else in the app changes."
              : "Requests go to the configured provider. API keys are read on the server only and never sent to the browser."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Publishing</CardTitle>
            <CardDescription>How posts reach a platform</CardDescription>
          </div>
          <Zap className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Row
            label="Demo Mode"
            value={flags.demoMode ? <Badge variant="warning">on</Badge> : <Badge variant="success">off</Badge>}
          />
          {flags.demoMode && (
            <Row label="Simulated failure rate" value={`${Math.round(runtime.demoFailureRate * 100)}%`} />
          )}
          <div className="space-y-1.5 border-t pt-3">
            {runtime.platforms.map((platform) => (
              <div key={platform.platform} className="flex items-center justify-between text-[11px]">
                <PlatformBadge platform={platform.platform} />
                <span className="text-muted-foreground">
                  {platform.oauthConfigured ? "OAuth configured" : "no credentials"} · {platform.mode}
                </span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground border-t pt-3 text-[11px] leading-relaxed">
            {flags.demoMode
              ? "Publishing is simulated. Content is still validated against each platform's real character and hashtag limits, and a share of attempts fail on purpose so the retry and failure paths are demonstrable."
              : "Publishing calls the real platform APIs with your stored credentials."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Scheduler</CardTitle>
            <CardDescription>What moves scheduled posts to published</CardDescription>
          </div>
          <Cpu className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Row
            label="In-process loop"
            value={
              runtime.schedulerEnabled ? (
                <Badge variant="success">
                  <Play className="size-3" /> running
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <Pause className="size-3" /> off
                </Badge>
              )
            }
          />
          <Row label="Tick interval" value={`${runtime.schedulerIntervalMs / 1000}s`} />
          <p className="text-muted-foreground border-t pt-3 text-[11px] leading-relaxed">
            In production, point a real cron at{" "}
            <code className="font-mono text-[10px]">POST /api/cron/tick</code> with the{" "}
            <code className="font-mono text-[10px]">CRON_SECRET</code> bearer token and set{" "}
            <code className="font-mono text-[10px]">ENABLE_IN_PROCESS_SCHEDULER=false</code>. A standalone worker is also
            available with <code className="font-mono text-[10px]">npm run worker</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>The approval rule</CardTitle>
            <CardDescription>Enforced in four independent places</CardDescription>
          </div>
          <Bot className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          <ol className="space-y-2.5 text-[11px] leading-relaxed">
            {[
              ["The status machine", "There is no transition from DRAFT or PENDING_APPROVAL to SCHEDULED, so content cannot reach the scheduler without passing through APPROVED."],
              ["The agent graph", "The human_approval node calls interrupt(). Nothing downstream of it executes until a real decision resumes the run."],
              ["The scheduling service", "schedulePost refuses any post whose latest approval is missing, negative, or recorded against an older version."],
              ["The publishing engine", "assertPublishable re-checks ownership, approval, version match, account state and schedule validity immediately before dispatch, and logs a BLOCKED entry when it refuses."],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-2.5">
                <span className="bg-primary/12 text-primary flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                  {index + 1}
                </span>
                <span>
                  <span className="font-medium">{title}.</span>{" "}
                  <span className="text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
