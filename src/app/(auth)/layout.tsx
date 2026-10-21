import { redirect } from "next/navigation";
import { PlaneTakeoff, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { publicRuntimeFlags } from "@/lib/env";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  const flags = publicRuntimeFlags();

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 bg-white dark:bg-slate-950">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>

      {/* Marketing panel — Light blue & white theme */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-l border-sky-100/90 dark:border-sky-950 bg-gradient-to-br from-sky-50/80 via-white to-sky-100/50 dark:from-slate-950 dark:via-slate-900 dark:to-sky-950/30 p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-sky-200/40 dark:bg-sky-500/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-24 size-96 rounded-full bg-sky-300/30 dark:bg-sky-700/10 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-sm shadow-sky-500/30">
            <PlaneTakeoff className="size-4.5" />
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">PostPilot</span>
            <span className="rounded-full bg-sky-100 px-1.5 py-0.2 text-[9px] font-semibold tracking-wide text-sky-700 uppercase dark:bg-sky-900/60 dark:text-sky-300">
              Agent
            </span>
          </div>
        </div>

        <div className="relative max-w-md">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/80 dark:bg-slate-900/80 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300 shadow-2xs backdrop-blur-xs mb-4">
            <ShieldCheck className="size-3.5" />
            <span>Human-in-the-Loop AI Architecture</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance leading-snug">
            Autonomous social drafting that always halts for human approval.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            PostPilot drafts copy, evaluates quality scores, and optimizes per-platform — then pauses. Scheduling and publishing only unlock once a human gives explicit approval on that exact version.
          </p>

          <div className="mt-8 space-y-3">
            {[
              {
                icon: Workflow,
                title: "Durable Approval Interrupt",
                desc: "State machine halts at the review node. No unapproved draft can reach dispatch.",
              },
              {
                icon: Sparkles,
                title: "AI Quality Grading",
                desc: "Hooks, character limits, tone, and readability are scored before you review.",
              },
              {
                icon: ShieldCheck,
                title: "Strict Version Binding",
                desc: "Editing approved content instantly revokes sign-off to ensure complete integrity.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-xl border border-sky-150/70 bg-white/80 dark:bg-slate-900/80 p-3 shadow-2xs backdrop-blur-xs"
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  <item.icon className="size-3.5" />
                </span>
                <div className="text-xs">
                  <p className="font-semibold text-slate-900 dark:text-white">{item.title}</p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-500 dark:text-slate-400">
          {flags.demoMode
            ? "Running in Demo Mode — Social publishing and insights are simulated safely offline."
            : `Live mode — Generating with ${flags.aiModel}.`}
        </p>
      </div>
    </div>
  );
}
