import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env, publicRuntimeFlags } from "@/lib/env";
import { integrationCapabilities } from "@/lib/social";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsTabs } from "./settings-tabs";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const config = env();
  const [profile, automations, accounts] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, name: true, email: true, timezone: true, role: true, createdAt: true },
    }),
    prisma.automation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        socialAccount: { select: { handle: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
        _count: { select: { posts: true } },
      },
    }),
    prisma.socialAccount.findMany({
      where: { userId: user.id, status: "CONNECTED" },
      select: { id: true, platform: true, handle: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your profile, automated content workflows and how this instance is running." />
      <SettingsTabs
        profile={profile}
        automations={automations}
        accounts={accounts}
        flags={publicRuntimeFlags()}
        runtime={{
          schedulerEnabled: config.ENABLE_IN_PROCESS_SCHEDULER,
          schedulerIntervalMs: config.SCHEDULER_INTERVAL_MS,
          demoFailureRate: config.DEMO_PUBLISH_FAILURE_RATE,
          platforms: integrationCapabilities(),
        }}
      />
    </div>
  );
}
