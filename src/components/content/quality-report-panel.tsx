import { AlertTriangle, CheckCircle2, Info, Lightbulb, ShieldAlert, TriangleAlert } from "lucide-react";
import type { QualityReport } from "@/lib/ai/types";
import { QualityScore } from "@/components/shared/quality-score";
import { cn } from "@/lib/utils";

const CHECK_ICON = {
  pass: CheckCircle2,
  warn: TriangleAlert,
  fail: AlertTriangle,
} as const;

const CHECK_TONE = {
  pass: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-rose-600 dark:text-rose-400",
} as const;

/** The agent's quality gate, rendered for a human reviewer. */
export function QualityReportPanel({ report, className }: { report: QualityReport | null; className?: string }) {
  if (!report) {
    return (
      <div className={cn("text-muted-foreground px-5 py-8 text-center text-xs", className)}>
        No quality report yet. Run the agent to score this draft.
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <QualityScore score={report.score} size={52} />
        <div className="text-right">
          <p
            className={cn(
              "text-xs font-medium",
              report.verdict === "pass"
                ? "text-emerald-600 dark:text-emerald-400"
                : report.verdict === "revise"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400",
            )}
          >
            {report.verdict === "pass" ? "Passed the gate" : report.verdict === "revise" ? "Needs revision" : "Blocked"}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">Scored by {report.scoredBy}</p>
        </div>
      </div>

      {report.hardViolations.length > 0 && (
        <div className="border-destructive/25 bg-destructive/5 rounded-lg border p-3">
          <p className="text-destructive flex items-center gap-1.5 text-[11px] font-semibold">
            <ShieldAlert className="size-3.5" /> Blocking issues
          </p>
          <ul className="text-destructive/90 mt-1.5 space-y-1 text-[11px]">
            {report.hardViolations.map((violation) => (
              <li key={violation}>{violation}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-widest uppercase">
          Automated checks
        </p>
        <ul className="space-y-1.5">
          {report.checks.map((check) => {
            const Icon = CHECK_ICON[check.status];
            return (
              <li key={check.id} className="flex gap-2">
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", CHECK_TONE[check.status])} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium">{check.label}</p>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">{check.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {report.strengths.length > 0 && (
        <Section icon={CheckCircle2} title="Strengths" items={report.strengths} tone="text-emerald-600 dark:text-emerald-400" />
      )}
      {report.risks.length > 0 && (
        <Section icon={Info} title="Risks" items={report.risks} tone="text-amber-600 dark:text-amber-400" />
      )}
      {report.suggestions.length > 0 && (
        <Section icon={Lightbulb} title="Suggestions" items={report.suggestions} tone="text-primary" />
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: typeof Info;
  title: string;
  items: string[];
  tone: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase">
        <Icon className={cn("size-3", tone)} /> {title}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="text-muted-foreground text-[11px] leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
