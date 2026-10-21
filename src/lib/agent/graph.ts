import { END, START, StateGraph } from "@langchain/langgraph";
import { AgentState } from "./state";
import {
  generateContent,
  humanApproval,
  optimizeForPlatform,
  parseRequest,
  publishNode,
  qualityCheck,
  routeAfterApproval,
  routeAfterQuality,
  routeAfterSchedule,
  routeAfterValidation,
  scheduleNode,
  validateContentNode,
  verifyResult,
} from "./nodes";
import { getCheckpointer } from "./prisma-checkpointer";

/**
 * The PostPilot content agent.
 *
 *   START
 *     -> parse_request
 *     -> generate_content
 *     -> validate_content  --(hard violations)--> generate_content
 *     -> optimize_for_platform
 *     -> quality_check     --(below the bar)----> generate_content
 *     -> human_approval    [INTERRUPT: waits for a person]
 *          |- rejected / changes requested -> END
 *          '- approved -> schedule
 *                           |- future slot -> END (handed to the scheduler)
 *                           '- due now     -> publish -> verify_result -> END
 *
 * The interrupt is the point of the whole design: everything to its left is
 * autonomous, everything to its right requires a recorded human decision.
 */
function buildGraph() {
  return new StateGraph(AgentState)
    .addNode("parse_request", parseRequest)
    .addNode("generate_content", generateContent)
    .addNode("validate_content", validateContentNode)
    .addNode("optimize_for_platform", optimizeForPlatform)
    .addNode("quality_check", qualityCheck)
    .addNode("human_approval", humanApproval)
    .addNode("schedule", scheduleNode)
    .addNode("publish", publishNode)
    .addNode("verify_result", verifyResult)

    .addEdge(START, "parse_request")
    .addEdge("parse_request", "generate_content")
    .addEdge("generate_content", "validate_content")
    .addConditionalEdges("validate_content", routeAfterValidation, [
      "generate_content",
      "optimize_for_platform",
    ])
    .addEdge("optimize_for_platform", "quality_check")
    .addConditionalEdges("quality_check", routeAfterQuality, ["generate_content", "human_approval"])
    .addConditionalEdges("human_approval", routeAfterApproval, { schedule: "schedule", __end__: END })
    .addConditionalEdges("schedule", routeAfterSchedule, { publish: "publish", __end__: END })
    .addEdge("publish", "verify_result")
    .addEdge("verify_result", END)
    .compile({ checkpointer: getCheckpointer() });
}

type CompiledAgent = ReturnType<typeof buildGraph>;

let compiled: CompiledAgent | null = null;

/** The compiled graph, built once per process. */
export function contentAgent(): CompiledAgent {
  compiled ??= buildGraph();
  return compiled;
}

export { GRAPH_NODES } from "./graph-nodes";
