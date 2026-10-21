import { redirect } from "next/navigation";
import { PostStatus } from "@prisma/client";
import { ShieldCheck } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publicRuntimeFlags } from "@/lib/env";
import { SidebarBrand, SidebarNav } from "@/components/layout/app-sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { DemoBadge } from "@/components/shared/demo-badge";
import { startInProcessScheduler } from "@/lib/services/scheduler-loop";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Idempotent: starts the local scheduler once per server process.
  startInProcessScheduler();

  const user = await currentUser();
  if (!user) redirect("/login");

  const [pendingApprovals, scheduled, unread] = await Promise.all([
    prisma.post.count({ where: { userId: user.id, status: PostStatus.PENDING_APPROVAL } }),
    prisma.post.count({ where: { userId: user.id, status: PostStatus.SCHEDULED } }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  const counts = { pendingApprovals, scheduled };
  const flags = publicRuntimeFlags();

  return (
    <div className="flex min-h-dvh">
      {/* Persistent sidebar, desktop only. The outer element stretches to the
          full page height so the panel and its border do not stop halfway down
          a long page; the inner one is what actually sticks. */}
      <div className="bg-white dark:bg-slate-950 border-r border-sky-100/90 dark:border-sky-950/60 hidden w-64 shrink-0 shadow-[1px_0_12px_rgba(2,132,199,0.03)] lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto py-5">
          <SidebarBrand />
          <SidebarNav counts={counts} className="px-2" />
          <div className="mt-auto px-3 pb-8">
            <div className="bg-gradient-to-b from-sky-50/90 to-white dark:from-sky-950/40 dark:to-slate-900 border border-sky-100 dark:border-sky-900/50 rounded-xl p-3.5 shadow-xs">
              <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300">
                <span className="flex size-5 items-center justify-center rounded-md bg-sky-200/60 dark:bg-sky-800/60 text-sky-700 dark:text-sky-200">
                  <ShieldCheck className="size-3.5" />
                </span>
                <p className="text-xs font-semibold">Human Approval Gate</p>
              </div>
              <p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
                Autonomous generation with mandatory sign-off. The agent cannot publish without your explicit consent.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-white/85 dark:bg-slate-950/85 supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-slate-950/70 sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-sky-100/90 dark:border-sky-950/60 px-4 backdrop-blur-md sm:px-6">
          <MobileNav counts={counts} />
          <div className="flex flex-1 items-center gap-3">
            <CommandPalette />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <DemoBadge flags={flags} className="hidden sm:inline-flex" />
            <NotificationsMenu initialUnread={unread} />
            <ThemeToggle />
            <UserMenu
              user={{
                id: user.id,
                name: user.name ?? null,
                email: user.email ?? null,
                image: user.image ?? null,
                role: user.role,
              }}
            />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
