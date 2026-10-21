/**
 * A static, dependency-free description of the agent's workflow.
 *
 * Kept apart from `graph.ts` on purpose: the UI renders this list, and importing
 * it from the compiled graph would pull LangGraph, Prisma and the whole service
 * layer into the browser bundle.
 */
export const GRAPH_NODES = [
  { id: "parse_request", label: "Parse request", kind: "system" },
  { id: "generate_content", label: "Generate content", kind: "ai" },
  { id: "validate_content", label: "Validate content", kind: "rules" },
  { id: "optimize_for_platform", label: "Platform optimisation", kind: "rules" },
  { id: "quality_check", label: "Quality check", kind: "ai" },
  { id: "human_approval", label: "Human approval", kind: "human" },
  { id: "schedule", label: "Schedule", kind: "system" },
  { id: "publish", label: "Publish", kind: "system" },
  { id: "verify_result", label: "Verify result", kind: "system" },
] as const;

export type GraphNodeId = (typeof GRAPH_NODES)[number]["id"];
