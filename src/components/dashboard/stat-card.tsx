import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  href?: string;
  hint?: string;
  tone?: "default" | "sky" | "warning" | "success" | "danger";
}) {
  const toneClass = {
    default: "text-sky-700 bg-sky-50 border border-sky-100 dark:text-sky-300 dark:bg-sky-950/50 dark:border-sky-900/50",
    sky: "text-sky-700 bg-sky-100/80 border border-sky-200 dark:text-sky-300 dark:bg-sky-900/50 dark:border-sky-800",
    warning: "text-amber-700 bg-amber-50 border border-amber-200/80 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/50",
    success: "text-emerald-700 bg-emerald-50 border border-emerald-200/80 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900/50",
    danger: "text-red-700 bg-red-50 border border-red-200/80 dark:text-red-400 dark:bg-red-950/40 dark:border-red-900/50",
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex size-9 items-center justify-center rounded-lg shadow-2xs", toneClass)}>
          <Icon className="size-4" />
        </span>
        {href && (
          <ArrowUpRight className="text-muted-foreground/40 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-sky-600" />
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{value}</p>
      <p className="text-slate-600 dark:text-slate-400 mt-0.5 text-xs font-medium">{label}</p>
      {hint && <p className="text-muted-foreground mt-1.5 text-[11px]">{hint}</p>}
    </>
  );

  if (!href) {
    return <div className="bg-card rounded-xl border border-sky-100/90 dark:border-sky-950/70 p-4 shadow-xs">{body}</div>;
  }

  return (
    <Link
      href={href}
      className="group bg-card hover:border-sky-300 dark:hover:border-sky-700 rounded-xl border border-sky-100/90 dark:border-sky-950/70 p-4 shadow-xs hover:shadow-md hover:shadow-sky-500/5 transition-all duration-200"
    >
      {body}
    </Link>
  );
}
