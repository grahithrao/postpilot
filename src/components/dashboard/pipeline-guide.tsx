"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sparkles,
  ShieldCheck,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Info,
  HelpCircle,
  FileEdit,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "AI Generation",
    subtitle: "Drafts tailored copy",
    icon: Sparkles,
    description:
      "Provide a brief (topic, audience, tone). The AI generates platform-optimized copy, hashtags, CTAs, and suggested posting time.",
    link: "/create",
    actionText: "Draft post",
    tag: "Autonomous",
  },
  {
    step: "02",
    title: "Quality Scoring",
    subtitle: "Automated checks",
    icon: Sliders,
    description:
      "Every draft is analyzed against real platform character limits, hook strength, clarity, and safety policies with a score from 0-100.",
    link: "/create",
    actionText: "View criteria",
    tag: "Automated",
  },
  {
    step: "03",
    title: "Human Approval Gate",
    subtitle: "Mandatory stop",
    icon: ShieldCheck,
    description:
      "The AI pauses here. Nothing can be scheduled or published until a human explicitly reviews and signs off on this exact version.",
    link: "/approvals",
    actionText: "Review queue",
    tag: "Human Required",
    highlight: true,
  },
  {
    step: "04",
    title: "Schedule & Publish",
    subtitle: "Automated dispatch",
    icon: CalendarCheck2,
    description:
      "Approved posts are scheduled and dispatched to LinkedIn, X, Instagram, or Facebook with retry protection and idempotent delivery.",
    link: "/calendar",
    actionText: "View calendar",
    tag: "Autonomous",
  },
];

export function PipelineGuide() {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-sky-100 dark:border-sky-950/80 bg-gradient-to-br from-sky-50/70 via-white to-sky-50/40 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-sky-950/30 p-5 shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] transition-all">
      {/* Decorative light blue ambient background blur */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 size-56 rounded-full bg-sky-200/30 dark:bg-sky-500/10 blur-3xl"
      />

      {/* Header bar of the guide */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-sky-600 text-white shadow-xs shadow-sky-600/30 dark:bg-sky-500 dark:text-slate-950">
            <Info className="size-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                How PostPilot Works
              </h2>
              <span className="rounded-full bg-sky-100/90 dark:bg-sky-900/50 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:text-sky-300">
                Human-in-the-Loop Architecture
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              The AI is fully autonomous for drafting and scoring, but strictly blocked at Step 3 until you approve.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="h-8 gap-1.5 text-xs text-sky-700 hover:text-sky-800 hover:bg-sky-100/60 dark:text-sky-300"
          >
            {isOpen ? (
              <>
                <span>Hide workflow</span>
                <ChevronUp className="size-3.5" />
              </>
            ) : (
              <>
                <span>Explain workflow</span>
                <ChevronDown className="size-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Expandable Step-by-Step Cards */}
      {isOpen && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.step}
                className={cn(
                  "relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200",
                  step.highlight
                    ? "bg-white dark:bg-slate-900 border-sky-300/80 dark:border-sky-600 shadow-sm shadow-sky-500/10 ring-2 ring-sky-500/20"
                    : "bg-white/80 dark:bg-slate-900/70 border-sky-100 dark:border-sky-950/60 hover:border-sky-200 hover:bg-white",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 text-xs font-bold font-mono">
                      {step.step}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                        step.highlight
                          ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                          : "bg-sky-100/70 text-sky-700 border border-sky-200/50 dark:bg-sky-950 dark:text-sky-300",
                      )}
                    >
                      {step.tag}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Icon className={cn("size-4", step.highlight ? "text-sky-600 dark:text-sky-400" : "text-sky-500")} />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">{step.title}</h3>
                  </div>

                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    {step.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-sky-50 dark:border-slate-800 flex items-center justify-between">
                  <Link
                    href={step.link}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 group"
                  >
                    <span>{step.actionText}</span>
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  {step.highlight && (
                    <span className="flex size-2 rounded-full bg-amber-500 animate-pulse" title="Core safety check" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
