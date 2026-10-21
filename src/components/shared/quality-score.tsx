import { cn } from "@/lib/utils";

function band(score: number) {
  if (score >= 85) return { label: "Excellent", ring: "text-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 70) return { label: "Good", ring: "text-sky-500", text: "text-sky-600 dark:text-sky-400" };
  if (score >= 60) return { label: "Passable", ring: "text-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { label: "Needs work", ring: "text-rose-500", text: "text-rose-600 dark:text-rose-400" };
}

/** Circular gauge for the AI quality score. */
export function QualityScore({
  score,
  size = 44,
  showLabel = true,
  className,
}: {
  score: number | null | undefined;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  if (score == null) {
    return <span className={cn("text-muted-foreground text-xs", className)}>Not scored</span>;
  }

  const value = Math.max(0, Math.min(100, score));
  const { label, ring, text } = band(value);
  const stroke = size > 40 ? 3.5 : 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            className={cn("stroke-current transition-[stroke-dashoffset] duration-700", ring)}
          />
        </svg>
        <span
          className={cn("absolute inset-0 flex items-center justify-center font-semibold tabular-nums", text)}
          style={{ fontSize: size > 40 ? 13 : 11 }}
        >
          {Math.round(value)}
        </span>
      </div>
      {showLabel && (
        <div className="min-w-0">
          <p className={cn("text-xs font-medium", text)}>{label}</p>
          <p className="text-muted-foreground text-[11px]">AI quality score</p>
        </div>
      )}
    </div>
  );
}
