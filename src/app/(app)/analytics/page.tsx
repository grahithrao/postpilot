import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { BarChart3, Eye, Heart, MessageCircle, MousePointerClick, Send, Share2, Users } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { publicRuntimeFlags } from "@/lib/env";
import { getAnalyticsOverview } from "@/lib/services/analytics";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { EngagementChart } from "@/components/charts/engagement-chart";
import { ActivityChart } from "@/components/charts/activity-chart";
import { BreakdownChart } from "@/components/charts/breakdown-chart";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { QualityScore } from "@/components/shared/quality-score";
import { DemoBadge } from "@/components/shared/demo-badge";
import { RangePicker } from "./range-picker";
import { formatNumber, formatPercent, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { days: rawDays } = await searchParams;
  const days = [7, 30, 90].includes(Number(rawDays)) ? Number(rawDays) : 30;

  const analytics = await getAnalyticsOverview(user.id, days);
  const flags = publicRuntimeFlags();
  const engagements = analytics.totals.likes + analytics.totals.comments + analytics.totals.shares;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`Performance of everything published in the last ${days} days.`}
        actions={
          <>
            <DemoBadge flags={flags} />
            <RangePicker days={days} />
          </>
        }
      />

      {/* Analytics Explainer Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-100/90 bg-sky-50/70 p-4 text-xs text-slate-700 shadow-2xs dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-slate-300">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950">
          <BarChart3 className="size-3.5" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">Multi-Platform Audience Analytics</p>
          <p className="leading-relaxed text-slate-600 dark:text-slate-400">
            Insights aggregated across LinkedIn, X, Instagram, and Facebook. Track reach, impressions, engagement rates, and top-performing copy. In Demo Mode, metrics are modelled realistically from reach, AI quality score, and time active.
          </p>
        </div>
      </div>

      {analytics.totals.published === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Nothing published in this window"
            description="Once approved posts go out, their reach and engagement will be tracked here."
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/calendar">Open the calendar</Link>
              </Button>
            }
            className="py-16"
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <StatCard label="Posts published" value={analytics.totals.published} icon={Send} />
            <StatCard label="Impressions" value={formatNumber(analytics.totals.impressions)} icon={Eye} />
            <StatCard label="Reach" value={formatNumber(analytics.totals.reach)} icon={Users} />
            <StatCard label="Likes" value={formatNumber(analytics.totals.likes)} icon={Heart} />
            <StatCard label="Comments" value={formatNumber(analytics.totals.comments)} icon={MessageCircle} />
            <StatCard label="Shares" value={formatNumber(analytics.totals.shares)} icon={Share2} />
            <StatCard
              label="Engagement rate"
              value={formatPercent(analytics.totals.engagementRate)}
              icon={Heart}
              tone="success"
              hint={`${formatNumber(engagements)} engagements`}
            />
            <StatCard
              label="Click-through rate"
              value={formatPercent(analytics.totals.clickThroughRate, 2)}
              icon={MousePointerClick}
              hint={`${formatNumber(analytics.totals.clicks)} clicks`}
            />
          </div>

          <EngagementChart
            data={analytics.engagementOverTime}
            title="Engagement over time"
            description={days > 45 ? "Weekly totals" : "Daily totals"}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownChart
              title="Posts by platform"
              description="How the volume is distributed"
              data={analytics.byPlatform.map((p) => ({
                label: p.name,
                value: p.posts,
                secondaryLabel: "Engagements",
                secondaryValue: p.engagements,
              }))}
              valueLabel="Posts"
            />

            <ActivityChart
              data={analytics.publishingFrequency}
              title="Publishing frequency"
              description="Published versus scheduled, by day"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownChart
              title="Reach by platform"
              description="Total people reached per network"
              data={analytics.byPlatform.map((p) => ({
                label: p.name,
                value: p.reach,
                secondaryLabel: "Engagement rate %",
                secondaryValue: p.engagementRate,
              }))}
              valueLabel="Reach"
            />

            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Content performance</CardTitle>
                  <CardDescription>Your best-performing posts in this window</CardDescription>
                </div>
              </CardHeader>
              <div className="border-t">
                {analytics.topPosts.length === 0 ? (
                  <EmptyState icon={BarChart3} title="No posts yet" description="Publish something to see it ranked here." />
                ) : (
                  <ul className="divide-y">
                    {analytics.topPosts.map((post) => (
                      <li key={post.id}>
                        <Link href={`/content/${post.id}`} className="hover:bg-accent/40 flex items-start gap-3 px-5 py-3 transition-colors">
                          <QualityScore score={post.qualityScore} size={32} showLabel={false} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {post.headline || truncate(post.caption.split("\n")[0] ?? "", 60)}
                            </p>
                            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                              <PlatformBadge platform={post.platform} showLabel={false} />
                              {post.publishedAt && <span>{format(new Date(post.publishedAt), "d MMM")}</span>}
                              <span>{formatNumber(post.reach)} reach</span>
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums">{formatNumber(post.engagements)}</p>
                            <p className="text-muted-foreground text-[10px]">{formatPercent(post.engagementRate)}</p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Per-platform detail</CardTitle>
                <CardDescription>The same numbers as a table</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 text-left font-medium">Platform</th>
                    <th className="px-3 py-2 text-right font-medium">Posts</th>
                    <th className="px-3 py-2 text-right font-medium">Reach</th>
                    <th className="px-3 py-2 text-right font-medium">Engagements</th>
                    <th className="py-2 pl-3 text-right font-medium">Engagement rate</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.byPlatform.map((row) => (
                    <tr key={row.platform} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <PlatformBadge platform={row.platform} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.posts}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.reach)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.engagements)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{formatPercent(row.engagementRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {flags.demoMode
              ? "Demo Mode: metrics are modelled from follower count, platform norms, the post's quality score and how long it has been live — they are consistent and comparable, but not real. With platform credentials configured, each adapter reads its own insights endpoint instead."
              : "Metrics come from each platform's insights API."}
          </p>
        </>
      )}
    </div>
  );
}
