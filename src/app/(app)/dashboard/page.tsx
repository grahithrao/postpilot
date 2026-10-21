import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Send,
  Sparkles,
  Workflow,
} from "lucide-react";
import { currentUser } from "@/lib/auth";
import { publicRuntimeFlags } from "@/lib/env";
import { getDashboardData } from "@/lib/services/dashboard";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { UpcomingPosts } from "@/components/dashboard/upcoming-posts";
import { ApprovalQueuePreview } from "@/components/dashboard/approval-queue-preview";
import { ConnectedAccounts } from "@/components/dashboard/connected-accounts";
import { EngagementChart } from "@/components/charts/engagement-chart";
import { ActivityChart } from "@/components/charts/activity-chart";
import { PipelineGuide } from "@/components/dashboard/pipeline-guide";
import { LifecyclePipelineBar } from "@/components/dashboard/lifecycle-pipeline-bar";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { stats, analytics, recentActivity, upcoming, approvalQueue, accounts, automations } =
    await getDashboardData(user.id);
  const flags = publicRuntimeFlags();

  const firstName = user.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good to see you, ${firstName}`}
        description={
          stats.pendingApproval > 0
            ? `${stats.pendingApproval} post${stats.pendingApproval === 1 ? "" : "s"} waiting for your approval before publishing is unlocked.`
            : "All posts have been reviewed. The pipeline is running smoothly."
        }
        actions={
          <>
            {stats.pendingApproval > 0 && (
              <Button asChild variant="outline" className="border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 hover:text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
                <Link href="/approvals">Review {stats.pendingApproval} Pending</Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/create">
                <Sparkles className="size-4" /> Create post
              </Link>
            </Button>
          </>
        }
      />

      {/* Interactive Workflow Guide: Explains how PostPilot works */}
      <PipelineGuide />

      {/* Connected publishing lifecycle stepper */}
      <LifecyclePipelineBar stats={stats} />

      {/* Performance */}
      <div className="grid gap-4 lg:grid-cols-3">
        <EngagementChart
          data={analytics.engagementOverTime}
          title="Content performance"
          description="Likes, comments and shares on posts published in the last 30 days"
          className="lg:col-span-2"
          action={
            <Link href="/analytics" className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-4">
              Full analytics
            </Link>
          }
        />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Last 30 days</CardTitle>
              <CardDescription>Across every connected platform</CardDescription>
            </div>
          </CardHeader>
          <div className="grid grid-cols-2 gap-px overflow-hidden border-t bg-border">
            {[
              { label: "Published", value: formatNumber(analytics.totals.published) },
              { label: "Reach", value: formatNumber(analytics.totals.reach) },
              { label: "Engagements", value: formatNumber(analytics.totals.likes + analytics.totals.comments + analytics.totals.shares) },
              { label: "Engagement rate", value: formatPercent(analytics.totals.engagementRate) },
              { label: "Clicks", value: formatNumber(analytics.totals.clicks) },
              { label: "Click-through rate", value: formatPercent(analytics.totals.clickThroughRate, 2) },
            ].map((metric) => (
              <div key={metric.label} className="bg-card px-5 py-3.5">
                <p className="text-lg font-semibold tracking-tight tabular-nums">{metric.value}</p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">{metric.label}</p>
              </div>
            ))}
          </div>
          <div className="text-muted-foreground border-t px-5 py-2.5 text-[11px]">
            {flags.demoMode
              ? "Demo Mode: metrics are modelled from reach, quality score and time live."
              : "Metrics are pulled from each platform's insights API."}
          </div>
        </Card>
      </div>

      {/* Queue and calendar */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Approval queue</CardTitle>
              <CardDescription>Nothing publishes until a person signs off here</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/approvals">Open queue</Link>
            </Button>
          </CardHeader>
          <div className="border-t">
            <ApprovalQueuePreview items={approvalQueue} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Upcoming posts</CardTitle>
              <CardDescription>Approved and waiting for their slot</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/calendar">Open calendar</Link>
            </Button>
          </CardHeader>
          <div className="border-t">
            <UpcomingPosts items={upcoming} />
          </div>
        </Card>
      </div>

      {/* Activity, publishing rhythm and accounts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Every generation, decision and publish, in order</CardDescription>
            </div>
          </CardHeader>
          <div className="px-5 pb-5">
            <ActivityFeed items={recentActivity} />
          </div>
        </Card>

        <div className="space-y-4">
          <ActivityChart
            data={analytics.publishingFrequency.slice(-14)}
            title="Publishing activity"
            description="Last 14 days"
          />

          <Card className="overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Connected accounts</CardTitle>
                <CardDescription>
                  {automations > 0
                    ? `${automations} automation${automations === 1 ? "" : "s"} running`
                    : "No automations running"}
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/integrations">Manage</Link>
              </Button>
            </CardHeader>
            <div className="border-t">
              <ConnectedAccounts accounts={accounts} />
            </div>
          </Card>
        </div>
      </div>

      {/* The product's core rule, stated plainly on the main screen. */}
      <div className="bg-sky-50/80 border-sky-200/80 dark:bg-sky-950/30 dark:border-sky-900/50 flex flex-wrap items-center gap-3 rounded-xl border px-5 py-3.5 shadow-xs">
        <span className="flex size-7 items-center justify-center rounded-lg bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950 shadow-xs">
          <CheckCircle2 className="size-4 shrink-0" />
        </span>
        <p className="text-xs">
          <span className="font-semibold text-slate-900 dark:text-white">Human approval is enforced at the database level, not just the UI.</span>{" "}
          <span className="text-slate-600 dark:text-slate-400">
            The publishing engine strictly requires an approval record for the exact version being published. Editing an approved post immediately revokes sign-off.
          </span>
        </p>
        <Button asChild variant="outline" size="sm" className="ml-auto border-sky-200 bg-white hover:bg-sky-50 text-sky-700 dark:bg-slate-900 dark:border-sky-900 dark:text-sky-300">
          <Link href="/settings">
            <Workflow className="size-3.5" /> How the agent works
          </Link>
        </Button>
      </div>
    </div>
  );
}
