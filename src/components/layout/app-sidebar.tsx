"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlaneTakeoff } from "lucide-react";
import { NAV_SECTIONS } from "./nav-config";
import { cn } from "@/lib/utils";
import type { ShellCounts } from "./shell-types";

export function SidebarNav({
  counts,
  onNavigate,
  className,
}: {
  counts: ShellCounts;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-6", className)} aria-label="Main">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="text-muted-foreground/70 mb-1.5 px-3 text-[10px] font-semibold tracking-widest uppercase">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const badgeValue = item.badge ? counts[item.badge] : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                      active
                        ? "bg-sky-50 text-sky-700 font-semibold shadow-xs border border-sky-100/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50"
                        : "text-sidebar-foreground hover:bg-sky-50/60 hover:text-sky-700 dark:hover:bg-sky-950/20 dark:hover:text-sky-300",
                    )}
                  >
                    <item.icon className={cn("size-4 shrink-0 transition-colors", active ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground group-hover:text-sky-600")} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badgeValue > 0 && (
                      <span
                        className={cn(
                          "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums shadow-xs",
                          item.badge === "pendingApprovals"
                            ? "bg-amber-500/15 text-amber-700 border border-amber-500/30 dark:text-amber-400"
                            : "bg-sky-100/80 text-sky-700 border border-sky-200/60 dark:bg-sky-900/40 dark:text-sky-300",
                        )}
                      >
                        {badgeValue}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SidebarBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-3 group">
      <span className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-sm shadow-sky-500/30 ring-2 ring-white/80 dark:ring-slate-800 transition-transform group-hover:scale-105">
        <PlaneTakeoff className="size-4.5" />
      </span>
      <span className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">PostPilot</span>
          <span className="rounded-full bg-sky-100 px-1.5 py-0.2 text-[9px] font-semibold tracking-wide text-sky-700 uppercase dark:bg-sky-900/60 dark:text-sky-300">
            Agent
          </span>
        </div>
        <span className="text-muted-foreground text-[10px] font-medium mt-1">Human-approved AI</span>
      </span>
    </Link>
  );
}
