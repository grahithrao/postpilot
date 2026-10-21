"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_STYLE, ChartFrame, ChartTooltip } from "./chart-kit";
import { formatNumber } from "@/lib/utils";

export interface BreakdownRow {
  label: string;
  value: number;
  /** Optional second measure shown in the tooltip and table only. */
  secondaryLabel?: string;
  secondaryValue?: number;
}

/**
 * Magnitude across a handful of named categories.
 *
 * One measure, one hue: this compares sizes, not identities, so colouring each
 * bar differently would encode nothing. Values are labelled directly, which is
 * also what the palette's relief rule asks for.
 */
export function BreakdownChart({
  data,
  title,
  description,
  valueLabel,
  height = 200,
}: {
  data: BreakdownRow[];
  title: string;
  description?: string;
  valueLabel: string;
  height?: number;
}) {
  const hasData = data.some((d) => d.value > 0);
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <ChartFrame
      title={title}
      description={description}
      rows={data.map((d) => ({
        label: d.label,
        value: d.value,
        ...(d.secondaryValue !== undefined ? { secondary: d.secondaryValue } : {}),
      }))}
      columns={[
        { key: "label", label: "Category" },
        { key: "value", label: valueLabel },
        ...(data[0]?.secondaryLabel ? [{ key: "secondary", label: data[0].secondaryLabel }] : []),
      ]}
    >
      {!hasData ? (
        <p className="text-muted-foreground px-3 py-16 text-center text-xs">No data in this window yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 46, left: 6, bottom: 4 }}
          >
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" hide domain={[0, max * 1.12]} />
            <YAxis
              type="category"
              dataKey="label"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={92}
            />
            <Tooltip
              cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.07 }}
              content={<ChartTooltip />}
            />
            <Bar dataKey="value" name={valueLabel} radius={[0, 4, 4, 0]} maxBarSize={20}>
              {data.map((row) => (
                <Cell key={row.label} fill="var(--chart-1)" />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                offset={8}
                className="fill-muted-foreground"
                style={{ fontSize: 11 }}
                formatter={(v: unknown) => (typeof v === "number" ? formatNumber(v) : String(v ?? ""))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
