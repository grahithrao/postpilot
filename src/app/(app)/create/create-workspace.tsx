"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Platform } from "@prisma/client";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  ImageIcon,
  PenLine,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { PostPreview, PlatformBudget } from "@/components/content/post-preview";
import { QualityReportPanel } from "@/components/content/quality-report-panel";
import { AgentTrace } from "@/components/content/agent-trace";
import { DemoBadge } from "@/components/shared/demo-badge";
import { BriefForm, EMPTY_BRIEF, type BriefState } from "./brief-form";
import { api, ApiError } from "@/lib/api/client";
import { TONE_LABEL } from "@/lib/constants/labels";
import type { GeneratedContent, QualityReport } from "@/lib/ai/types";
import type { RuntimeFlags } from "@/lib/env";
import { Tone } from "@prisma/client";

interface AccountOption {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string;
  followerCount: number;
  isDemo: boolean;
}

interface AgentResult {
  threadId: string;
  postId: string;
  status: "awaiting_approval" | "completed" | "failed";
  content: GeneratedContent | null;
  qualityReport: QualityReport | null;
  suggestedTime: string | null;
  nodeHistory: string[];
  approved: boolean;
  provider: string;
  model: string;
  awaitingHumanApproval: boolean;
}

type RefineAction = "improve" | "shorten" | "expand" | "rewrite" | "regenerate";

const REFINEMENTS: Array<{ action: RefineAction; label: string; hint: string }> = [
  { action: "improve", label: "Improve", hint: "Sharpen the hook and cut filler" },
  { action: "shorten", label: "Shorten", hint: "Trim to about 60% of the length" },
  { action: "expand", label: "Expand", hint: "Add one more substantive idea" },
  { action: "rewrite", label: "Rewrite", hint: "New structure, new opening" },
  { action: "regenerate", label: "Regenerate", hint: "Start over from the brief" },
];

export function CreateWorkspace({ accounts, flags }: { accounts: AccountOption[]; flags: RuntimeFlags }) {
  const router = useRouter();
  const [brief, setBrief] = React.useState<BriefState>(EMPTY_BRIEF);
  const [result, setResult] = React.useState<AgentResult | null>(null);
  const [draft, setDraft] = React.useState<GeneratedContent | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [briefOpen, setBriefOpen] = React.useState(true);
  const [toneTarget, setToneTarget] = React.useState<Tone>(Tone.FRIENDLY);

  const account = accounts.find((a) => a.platform === brief.platform) ?? null;
  const connectedPlatforms = accounts.map((a) => a.platform);

  async function generate() {
    setGenerating(true);
    setResult(null);
    setDraft(null);
    setSubmitted(false);
    setDirty(false);
    try {
      const data = await api<AgentResult>("/api/generate", {
        method: "POST",
        json: {
          ...brief,
          product: brief.product || undefined,
          audience: brief.audience || undefined,
          ctaRequest: brief.ctaRequest || undefined,
          notes: brief.notes || undefined,
          socialAccountId: account?.id,
        },
      });
      setResult(data);
      setDraft(data.content);
      setBriefOpen(false);
      toast.success("Draft ready for your review", {
        description: "The agent stopped at the approval gate. Nothing is scheduled or published.",
      });
      router.refresh();
    } catch (error) {
      toast.error("Generation failed", {
        description: error instanceof ApiError ? error.message : "Something went wrong.",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function refine(action: RefineAction, tone?: Tone) {
    if (!result) return;
    setBusy(action);
    try {
      const post = await api<{ headline: string | null; caption: string; hashtags: string[]; cta: string | null; imagePrompt: string | null; qualityScore: number | null; qualityReport: QualityReport | null }>(
        `/api/posts/${result.postId}/refine`,
        { method: "POST", json: { action: tone ? "tone" : action, tone, instruction: "" } },
      );
      setDraft({
        headline: post.headline,
        caption: post.caption,
        hashtags: post.hashtags,
        cta: post.cta ?? "",
        imagePrompt: post.imagePrompt ?? "",
        timingRationale: draft?.timingRationale ?? "",
      });
      setResult((prev) => (prev ? { ...prev, qualityReport: post.qualityReport } : prev));
      setDirty(false);
      toast.success(tone ? `Tone changed to ${TONE_LABEL[tone].toLowerCase()}` : `Applied "${action}"`);
    } catch (error) {
      toast.error("The AI editor could not apply that", {
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveEdits() {
    if (!result || !draft) return;
    setBusy("save");
    try {
      const post = await api<{ qualityScore: number | null; qualityReport: QualityReport | null }>(
        `/api/posts/${result.postId}`,
        {
          method: "PATCH",
          json: {
            headline: draft.headline,
            caption: draft.caption,
            hashtags: draft.hashtags,
            cta: draft.cta,
            imagePrompt: draft.imagePrompt,
            changeSummary: "Edited in the generator before submitting for approval.",
          },
        },
      );
      setResult((prev) => (prev ? { ...prev, qualityReport: post.qualityReport } : prev));
      setDirty(false);
      toast.success("Draft saved");
      router.refresh();
    } catch (error) {
      toast.error("Could not save", { description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function sendForApproval() {
    if (!result) return;
    setBusy("submit");
    try {
      if (dirty) await saveEdits();
      await api(`/api/posts/${result.postId}/submit`, { method: "POST" });
      setSubmitted(true);
      toast.success("Sent for approval", {
        description: "It is now in the approval queue. Only a human decision can move it forward.",
        action: { label: "Open queue", onClick: () => router.push("/approvals") },
      });
      router.refresh();
    } catch (error) {
      toast.error("Could not send for approval", {
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  function updateDraft(patch: Partial<GeneratedContent>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create a post"
        description="The agent writes, validates, optimises and scores the draft — then stops and waits for your approval."
        actions={<DemoBadge flags={flags} />}
      />

      {/* Helpful Creation Explainer Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-100/90 bg-sky-50/70 p-4 text-xs text-slate-700 shadow-2xs dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-slate-300">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950">
          <Sparkles className="size-3.5" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">How AI Generation & Approval works</p>
          <p className="leading-relaxed text-slate-600 dark:text-slate-400">
            Fill in the brief on the left. The agent writes tailored copy for your platform, enforces character limits, and calculates an AI Quality Score. After generation, you can refine it with 1-click tools or send it to the <strong>Human Approval Queue</strong>. It cannot be scheduled or published without approval.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Brief */}
        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader>
            <div>
              <CardTitle>Content brief</CardTitle>
              <CardDescription>What the agent should write, and for whom</CardDescription>
            </div>
            {result && (
              <Button variant="ghost" size="icon-sm" onClick={() => setBriefOpen((v) => !v)} aria-label="Toggle brief">
                {briefOpen ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
              </Button>
            )}
          </CardHeader>
          <CardContent className={briefOpen ? "" : "hidden"}>
            <BriefForm
              value={brief}
              onChange={setBrief}
              onSubmit={generate}
              loading={generating}
              connectedPlatforms={connectedPlatforms}
            />
          </CardContent>
          {!briefOpen && (
            <CardContent>
              <p className="text-muted-foreground text-xs">{brief.topic}</p>
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setBriefOpen(true)}>
                Edit brief
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Result */}
        <div className="space-y-4">
          {generating ? (
            <GeneratingState />
          ) : !result || !draft ? (
            <Card className="p-8 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 shadow-xs dark:bg-sky-950 dark:text-sky-400">
                <Sparkles className="size-7" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
                Workspace ready to draft
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Fill in the brief on the left and click <strong>Generate with AI Agent</strong>. The agent will compose copy, select hashtags, suggest a CTA, write an image prompt, and score its work.
              </p>

              {/* Informative Step Highlights */}
              <div className="mt-8 grid gap-3 sm:grid-cols-3 text-left">
                <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3.5 dark:border-sky-950 dark:bg-sky-950/20">
                  <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">Step 1 · AI Draft</span>
                  <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">Platform-Tailored Copy</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Character limits, hashtags, and tone matched to LinkedIn, X, IG, or FB.</p>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3.5 dark:border-sky-950 dark:bg-sky-950/20">
                  <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">Step 2 · Quality Score</span>
                  <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">Automated Scoring</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Hook power, clarity, platform fit, and safety checks graded 0-100.</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Step 3 · Human Gate</span>
                  <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">Approval Required</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Strictly halts here until a person verifies and approves the content.</p>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {/* The gate, stated up front. */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3">
                <ShieldCheck className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="min-w-0 flex-1 text-xs">
                  <span className="font-medium">
                    {submitted ? "Waiting in the approval queue." : "Paused at the human approval gate."}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {submitted
                      ? "A reviewer must approve it before it can be scheduled or published."
                      : "Nothing is scheduled or published. Review the draft, then send it for approval."}
                  </span>
                </p>
                {submitted ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/approvals">
                      Open approval queue <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" loading={busy === "submit"} onClick={sendForApproval}>
                    <ShieldCheck className="size-3.5" /> Send for approval
                  </Button>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Generated content</CardTitle>
                      <CardDescription>
                        {result.provider === "mock" ? "Demo model" : result.model} · v
                        {result.nodeHistory.filter((n) => n === "generate_content").length} generation
                        {result.nodeHistory.filter((n) => n === "generate_content").length === 1 ? "" : "s"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {dirty && (
                        <Button size="sm" variant="outline" loading={busy === "save"} onClick={saveEdits}>
                          <Save className="size-3.5" /> Save
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/content/${result.postId}`}>Open full record</Link>
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <Tabs defaultValue="preview">
                      <TabsList>
                        <TabsTrigger value="preview">
                          <Eye /> Preview
                        </TabsTrigger>
                        <TabsTrigger value="edit">
                          <PenLine /> Edit
                        </TabsTrigger>
                        <TabsTrigger value="image">
                          <ImageIcon /> Image prompt
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="preview">
                        <PostPreview
                          platform={brief.platform}
                          content={draft}
                          account={account}
                          scheduledFor={result.suggestedTime ? new Date(result.suggestedTime) : null}
                        />
                        {draft.timingRationale && (
                          <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
                            <span className="font-medium">Suggested time:</span> {draft.timingRationale}
                          </p>
                        )}
                      </TabsContent>

                      <TabsContent value="edit" className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="headline">Headline</Label>
                          <Input
                            id="headline"
                            value={draft.headline ?? ""}
                            onChange={(e) => updateDraft({ headline: e.target.value })}
                            placeholder="Optional headline"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="caption">Caption</Label>
                          <Textarea
                            id="caption"
                            rows={12}
                            value={draft.caption}
                            onChange={(e) => updateDraft({ caption: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="hashtags">Hashtags</Label>
                          <Input
                            id="hashtags"
                            value={draft.hashtags.join(" ")}
                            onChange={(e) =>
                              updateDraft({
                                hashtags: e.target.value
                                  .split(/[\s,]+/)
                                  .map((t) => t.replace(/^#/, ""))
                                  .filter(Boolean),
                              })
                            }
                            placeholder="Separate with spaces"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="cta">Call to action</Label>
                          <Input id="cta" value={draft.cta} onChange={(e) => updateDraft({ cta: e.target.value })} />
                        </div>
                      </TabsContent>

                      <TabsContent value="image" className="space-y-3">
                        <Textarea
                          rows={5}
                          value={draft.imagePrompt}
                          onChange={(e) => updateDraft({ imagePrompt: e.target.value })}
                          placeholder="Prompt for the accompanying visual"
                        />
                        <p className="text-muted-foreground text-[11px] leading-relaxed">
                          PostPilot writes the prompt but does not render images. Paste it into your image tool, then
                          attach the result to the post.
                        </p>
                      </TabsContent>
                    </Tabs>
                  </CardContent>

                  <div className="border-t px-5 py-3">
                    <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-widest uppercase">
                      Ask the AI editor
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {REFINEMENTS.map((item) => (
                        <Button
                          key={item.action}
                          size="sm"
                          variant="outline"
                          title={item.hint}
                          loading={busy === item.action}
                          disabled={Boolean(busy)}
                          onClick={() => refine(item.action)}
                        >
                          {item.action === "regenerate" ? <RefreshCw className="size-3.5" /> : <Wand2 className="size-3.5" />}
                          {item.label}
                        </Button>
                      ))}
                      <div className="flex items-center gap-1.5">
                        <Select value={toneTarget} onValueChange={(v) => setToneTarget(v as Tone)}>
                          <SelectTrigger size="sm" className="w-36">
                            <SelectValue>{TONE_LABEL[toneTarget]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(Tone).map((tone) => (
                              <SelectItem key={tone} value={tone}>
                                {TONE_LABEL[tone]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy === "tone"}
                          disabled={Boolean(busy)}
                          onClick={() => refine("improve", toneTarget)}
                        >
                          Change tone
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Platform fit</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PlatformBudget platform={brief.platform} content={draft} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Quality gate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <QualityReportPanel report={result.qualityReport} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div>
                        <CardTitle>Agent workflow</CardTitle>
                        <CardDescription>LangGraph run {result.threadId.slice(0, 12)}…</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <AgentTrace nodeHistory={result.nodeHistory} paused={result.awaitingHumanApproval} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GeneratingState() {
  const steps = [
    "Parsing the brief",
    "Writing the first draft",
    "Checking platform limits",
    "Optimising for the platform",
    "Scoring the result",
  ];
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 900);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card>
        <CardHeader>
          <div className="w-full">
            <CardTitle>Running the agent</CardTitle>
            <CardDescription>{steps[step]}…</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((label, index) => (
            <div key={label} className="flex items-center gap-2.5">
              <span
                className={
                  index <= step
                    ? "bg-primary/12 text-primary flex size-6 items-center justify-center rounded-full"
                    : "bg-muted text-muted-foreground/50 flex size-6 items-center justify-center rounded-full"
                }
              >
                <Check className="size-3" />
              </span>
              <span className={index <= step ? "text-[11px] font-medium" : "text-muted-foreground text-[11px]"}>
                {label}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
