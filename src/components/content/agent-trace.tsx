import {
  Check,
  CircleDashed,
  Loader2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { GRAPH_NODES } from "@/lib/agent/graph-nodes";
import { cn } from "@/lib/utils";

type NodeState = "done" | "current" | "pending";

const KIND_LABEL: Record<string, string> = {
  ai: "AI",
  rules: "Rules",
  human: "Human",
  system: "System",
};

/**
 * The LangGraph workflow, drawn.
 *
 * The point of the visual is the gate: everything left of "Human approval" the
 * agent does alone, everything right of it requires a recorded human decision.
 */
export function AgentTrace({
  nodeHistory,
  paused,
  className,
  compact = false,
}: {
  nodeHistory: string[];
  paused: boolean;
  className?: string;
  compact?: boolean;
}) {
  const visited = new Set(nodeHistory);

  return (
    <ol className={cn("space-y-0", className)}>
      {GRAPH_NODES.map((node, index) => {
        const isHumanGate = node.id === "human_approval";
        const done = visited.has(node.id);
        const current = isHumanGate && paused;
        const state: NodeState = current ? "current" : done ? "done" : "pending";
        const isLast = index === GRAPH_NODES.length - 1;

        const Icon: LucideIcon = current ? ShieldCheck : done ? Check : CircleDashed;

        return (
          <li key={node.id} className={cn("relative flex gap-3", isLast ? "" : compact ? "pb-2.5" : "pb-3.5")}>
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-6 left-[11px] w-px",
                  compact ? "h-[calc(100%-1.25rem)]" : "h-[calc(100%-1.25rem)]",
                  done && !current ? "bg-primary/35" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative flex size-6 shrink-0 items-center justify-center rounded-full border",
                state === "current" && "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
                state === "done" && "border-primary/30 bg-primary/12 text-primary",
                state === "pending" && "bg-muted text-muted-foreground/60 border-transparent",
              )}
            >
              {state === "current" && !paused ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Icon className="size-3" />
              )}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p
                  className={cn(
                    "text-[11px] font-medium",
                    state === "pending" && "text-muted-foreground/70",
                    state === "current" && "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {node.label}
                </p>
                <span
                  className={cn(
                    "rounded px-1 py-px text-[9px] font-semibold tracking-wide uppercase",
                    node.kind === "human"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {KIND_LABEL[node.kind]}
                </span>
              </div>
              {isHumanGate && !compact && (
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                  {paused
                    ? "The workflow is paused here. Its state is checkpointed in Postgres until a person approves or rejects."
                    : "A recorded human decision is required before anything below can run."}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
