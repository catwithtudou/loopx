import type { DeliveryReviewSnapshot } from "./delivery-review.js";

export type GoalWorkMap = NonNullable<DeliveryReviewSnapshot["goal_map"]>;
export type GoalWorkMapNode = GoalWorkMap["nodes"][number];
export type GoalWorkMapEdge = GoalWorkMap["edges"][number];
export type GoalWorkMapFocus = "current" | "all";
export type GoalWorkMapTone = "decision" | "blocked" | "open" | "waiting" | "done" | "unknown";

/** Visual emphasis only. It never decides readiness, ownership or completion. */
export function goalWorkMapTone(node: GoalWorkMapNode): GoalWorkMapTone {
  if (node.kind === "gate" && node.state !== "done") return "decision";
  if (node.state === "ready") return "open";
  return node.state;
}

const toneRank: Record<GoalWorkMapTone, number> = { decision: 0, blocked: 1, open: 2, waiting: 3, unknown: 4, done: 5 };

export function goalWorkMapSummary(map: GoalWorkMap) {
  const work = map.nodes.filter(node => node.kind === "deliverable");
  const count = (state: GoalWorkMapNode["state"]) => work.filter(node => node.state === state).length;
  return {
    work: work.length, done: count("done"), blocked: count("blocked"), waiting: count("waiting"),
    decisions: map.nodes.filter(node => goalWorkMapTone(node) === "decision").length,
    watches: map.nodes.filter(node => node.kind === "monitor" && node.state !== "done").length,
  };
}

/**
 * Columns follow the projected prerequisite depth. "current" keeps unfinished
 * items plus their direct recorded prerequisites; it hides history, not facts.
 */
export function goalWorkMapLayout(map: GoalWorkMap, focus: GoalWorkMapFocus) {
  const unfinished = new Set(map.nodes.filter(node => node.state !== "done").map(node => node.node_id));
  const visible = new Set(focus === "all" ? map.nodes.map(node => node.node_id) : unfinished);
  if (focus === "current") for (const edge of map.edges) if (unfinished.has(edge.from_node_id)) visible.add(edge.to_node_id);
  const edges = map.edges.filter(edge => visible.has(edge.from_node_id) && visible.has(edge.to_node_id));
  const linked = new Set(edges.flatMap(edge => [edge.from_node_id, edge.to_node_id]));
  const order = new Map(map.nodes.map((node, index) => [node.node_id, index]));
  const byTone = (a: GoalWorkMapNode, b: GoalWorkMapNode) =>
    toneRank[goalWorkMapTone(a)] - toneRank[goalWorkMapTone(b)] || order.get(a.node_id)! - order.get(b.node_id)!;
  const shown = map.nodes.filter(node => visible.has(node.node_id));
  const placed = shown.filter(node => linked.has(node.node_id));
  const depths = [...new Set(placed.map(node => node.depth))].sort((a, b) => a - b);
  const row = new Map<string, number>();
  const columns = depths.map(depth => {
    // Order by the mean row of placed prerequisites to keep curves short.
    const center = (node: GoalWorkMapNode) => {
      const rows = edges.filter(edge => edge.from_node_id === node.node_id && row.has(edge.to_node_id)).map(edge => row.get(edge.to_node_id)!);
      return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : Number.POSITIVE_INFINITY;
    };
    const column = placed.filter(node => node.depth === depth)
      .map(node => ({ node, center: center(node) }))
      .sort((a, b) => a.center - b.center || byTone(a.node, b.node)).map(entry => entry.node);
    column.forEach((node, index) => row.set(node.node_id, index));
    return column;
  });
  return { columns, edges, unlinked: shown.filter(node => !linked.has(node.node_id)).sort(byTone), hiddenCount: map.nodes.length - shown.length };
}

/** Every recorded prerequisite above and dependent below one item. */
export function goalWorkMapLineage(edges: readonly GoalWorkMapEdge[], nodeId: string | null) {
  const nodes = new Set<string>(nodeId ? [nodeId] : []);
  const related = new Set<string>();
  for (const [from, to] of [["from_node_id", "to_node_id"], ["to_node_id", "from_node_id"]] as const) {
    const queue = nodeId ? [nodeId] : [];
    const seen = new Set(queue);
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of edges) {
        if (edge[from] !== current) continue;
        related.add(edge.edge_id);
        nodes.add(edge[to]);
        if (!seen.has(edge[to])) { seen.add(edge[to]); queue.push(edge[to]); }
      }
    }
  }
  return { nodes, edges: related };
}

export function goalWorkMapIncomplete(map: GoalWorkMap) {
  const limits = map.limits;
  return !limits.topology_complete || limits.cycle_edge_count > 0;
}
