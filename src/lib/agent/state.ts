import { Annotation } from "@langchain/langgraph";
import type { ContentBrief, GeneratedContent, QualityReport } from "@/lib/ai/types";

export type AgentNodeName =
  | "parse_request"
  | "generate_content"
  | "validate_content"
  | "optimize_for_platform"
  | "quality_check"
  | "human_approval"
  | "schedule"
  | "publish"
  | "verify_result";

export interface AgentRevision {
  version: number;
  source: string;
  content: GeneratedContent;
  at: string;
}

export interface AgentErrorEntry {
  node: AgentNodeName | "graph";
  message: string;
  at: string;
  retryable: boolean;
}

export interface HumanDecision {
  decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "REGENERATION_REQUESTED";
  reviewerId: string;
  feedback?: string;
  at: string;
}

export interface PublishOutcome {
  status: "PUBLISHED" | "FAILED" | "BLOCKED";
  externalId?: string;
  externalUrl?: string;
  message: string;
  at: string;
}

/**
 * The agent's state channel definitions.
 *
 * Everything the workflow knows lives here and is checkpointed to Postgres
 * after every node, which is what allows the run to be suspended at the human
 * approval interrupt and resumed hours later in a different process.
 */
export const AgentState = Annotation.Root({
  // --- who and what -------------------------------------------------------
  userId: Annotation<string>(),
  postId: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  brief: Annotation<ContentBrief>(),

  // --- content ------------------------------------------------------------
  content: Annotation<GeneratedContent | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  revisions: Annotation<AgentRevision[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  qualityReport: Annotation<QualityReport | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  suggestedTime: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // --- human in the loop --------------------------------------------------
  approval: Annotation<HumanDecision | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  /**
   * The gate the whole product rests on. Only the approval node may set this
   * to true, and only in response to a real human decision.
   */
  approved: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),

  // --- downstream ---------------------------------------------------------
  scheduleId: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  scheduledFor: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  /** Set only by the approval node, from the reviewer's own request. */
  publishNow: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  publishResult: Annotation<PublishOutcome | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // --- observability ------------------------------------------------------
  nodeHistory: Annotation<AgentNodeName[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  errors: Annotation<AgentErrorEntry[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  /** How many times the quality gate has sent the draft back for a retry. */
  retryCount: Annotation<number>({
    reducer: (prev, next) => (next === 0 ? 0 : prev + next),
    default: () => 0,
  }),
  startedAt: Annotation<string>({
    reducer: (prev, next) => prev || next,
    default: () => new Date().toISOString(),
  }),
  updatedAt: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => new Date().toISOString(),
  }),
});

export type AgentStateType = typeof AgentState.State;
export type AgentStateUpdate = typeof AgentState.Update;
