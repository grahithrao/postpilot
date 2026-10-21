"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_STYLE, ChartFrame, ChartTooltip, SERIES_COLORS } from "./chart-kit";

export interface ActivityPoint {
  date: string;
  published: number;
  scheduled: number;
}

const SERIES = [
  { key: "published", label: "Published", color: SERIES_COLORS[0] },
  { key: "scheduled", label: "Scheduled", color: SERIES_COLORS[1] },
];

function labelFor(value: string | number) {
  try {
    return format(parseISO(String(value)), "d MMM yyyy");
  } catch {
    return String(value);
  }
}

export function ActivityChart({
  data,
  title = "Publishing activity",
  description,
}: {
  data: ActivityPoint[];
  title?: string;
  description?: string;
}) {
  const hasData = data.some((d) => d.published + d.scheduled > 0);

  return (
    <ChartFrame
      title={title}
      description={description}
      series={SERIES}
      rows={data.map((d) => ({ date: labelFor(d.date), published: d.published, scheduled: d.scheduled }))}
      columns={[
        { key: "date", label: "Date" },
        { key: "published", label: "Published" },
        { key: "scheduled", label: "Scheduled" },
      ]}
    >
      {!hasData ? (
        <p className="text-muted-foreground px-3 py-16 text-center text-xs">
          Nothing published or scheduled in this window yet.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 6, right: 14, left: -20, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={20}
              tickFormatter={(v: string) => {
                try {
                  return format(parseISO(v), "d MMM");
                } catch {
                  return v;
                }
              }}
            />
            <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.07 }}
              content={<ChartTooltip labelFormatter={labelFor} />}
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
