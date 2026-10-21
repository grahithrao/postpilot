import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [accounts, approvedCount] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { userId: user.id, status: "CONNECTED" },
      select: { id: true, platform: true, handle: true },
    }),
    prisma.post.count({ where: { userId: user.id, status: "APPROVED" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Approved posts scheduled for their time slots, and everything already published."
      />

      {/* Calendar Safety & Scheduling Explainer */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-100/90 bg-sky-50/70 p-4 text-xs text-slate-700 shadow-2xs dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-slate-300">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950">
          <CalendarClock className="size-3.5" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">Calendar Rule: Approval unlocks Scheduling</p>
          <p className="leading-relaxed text-slate-600 dark:text-slate-400">
            Only content with a recorded <strong>Human Approval</strong> can be scheduled. Unapproved drafts never appear here, preventing accidental publication. Scheduled posts publish automatically through the background queue.
          </p>
        </div>
      </div>

      <CalendarView accounts={accounts} approvedCount={approvedCount} />
    </div>
  );
}
