"use client";

import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_STYLE, ChartFrame, ChartTooltip, SERIES_COLORS } from "./chart-kit";
import { formatNumber } from "@/lib/utils";

export interface EngagementPoint {
  date: string;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
}

const SERIES = [
  { key: "likes", label: "Likes", color: SERIES_COLORS[0] },
  { key: "comments", label: "Comments", color: SERIES_COLORS[1] },
  { key: "shares", label: "Shares", color: SERIES_COLORS[2] },
];

function labelFor(value: string | number) {
  try {
    return format(parseISO(String(value)), "d MMM yyyy");
  } catch {
    return String(value);
  }
}

export function EngagementChart({
  data,
  title = "Engagement over time",
  description,
  action,
  className,
}: {
  data: EngagementPoint[];
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const hasData = data.some((d) => d.likes + d.comments + d.shares > 0);

  return (
    <ChartFrame
      title={title}
      description={description}
      series={SERIES}
      action={action}
      className={className}
      rows={data.map((d) => ({ date: labelFor(d.date), likes: d.likes, comments: d.comments, shares: d.shares }))}
      columns={[
        { key: "date", label: "Date" },
        { key: "likes", label: "Likes" },
        { key: "comments", label: "Comments" },
        { key: "shares", label: "Shares" },
      ]}
    >
      {!hasData ? (
        <p className="text-muted-foreground px-3 py-16 text-center text-xs">
          No engagement recorded yet. Publish a post to start collecting metrics.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={data} margin={{ top: 6, right: 14, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(v: string) => {
                try {
                  return format(parseISO(v), "d MMM");
                } catch {
                  return v;
                }
              }}
            />
            <YAxis
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
              content={<ChartTooltip labelFormatter={labelFor} />}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
