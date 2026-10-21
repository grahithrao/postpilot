"use client";

import * as React from "react";
import { cn, formatNumber } from "@/lib/utils";

/** The fixed categorical slot order. Never cycled, never reassigned by rank. */
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"] as const;

export const AXIS_STYLE = {
  fontSize: 11,
  fill: "var(--muted-foreground)",
} as const;

export interface SeriesSpec {
  key: string;
  label: string;
  color: string;
}

/**
 * Shared chart frame: title, legend and an accessible table view.
 *
 * The table is not decoration — one of the categorical slots sits just under
 * 3:1 contrast on the light surface, so the palette's relief rule requires
 * either visible labels or a table. Every chart here ships both.
 */
export function ChartFrame({
  title,
  description,
  series,
  rows,
  columns,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  series?: SeriesSpec[];
  rows?: Array<Record<string, string | number>>;
  columns?: Array<{ key: string; label: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = React.useState(false);
  const canToggle = Boolean(rows?.length && columns?.length);

  return (
    <section className={cn("bg-card rounded-xl border shadow-xs", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {action}
          {canToggle && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-4 transition-colors"
            >
              {showTable ? "Show chart" : "Show table"}
            </button>
          )}
        </div>
      </header>

      {series && series.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pb-3">
          {series.map((s) => (
            <span key={s.key} className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <span className="size-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className="px-2 pb-4">
        {showTable && canToggle ? (
          <div className="max-h-72 overflow-auto px-3">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground sticky top-0 bg-card">
                <tr className="border-b">
                  {columns!.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-left font-medium first:pl-0">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows!.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {columns!.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 tabular-nums first:pl-0">
                        {typeof row[c.key] === "number" ? formatNumber(row[c.key] as number) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

interface TooltipPayloadEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

/** Recharts tooltip rendered with the app's own surface tokens. */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueSuffix = "",
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  valueSuffix?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover text-popover-foreground min-w-36 rounded-lg border px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium">{labelFormatter && label != null ? labelFormatter(label) : label}</p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((entry, i) => (
          <li key={i} className="flex items-center justify-between gap-4 text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: entry.color }} aria-hidden />
              {entry.name}
            </span>
            <span className="font-medium tabular-nums">
              {typeof entry.value === "number" ? formatNumber(entry.value) : entry.value}
              {valueSuffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
