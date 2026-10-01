import assert from "node:assert/strict";
import { deliveryReviewMarkdown, parseDeliveryReview } from "../node_modules/.cache/delivery-review/data/delivery-review.js";
import { goalWorkMapIncomplete, goalWorkMapLayout, goalWorkMapLineage, goalWorkMapSummary, goalWorkMapTone } from "../node_modules/.cache/delivery-review/data/goal-work-map.js";
import { deliveryReviewCopy } from "../node_modules/.cache/delivery-review/features/personal-workspace/delivery-review-copy.js";

const node = (id, kind, state, depth) => ({ node_id: id, kind, title: `Title ${id}`, state, depth, refs: { todo_ids: [`todo_${id}`] } });
const edge = (from, to, relation = "depends_on", enforcement = "typed_lifecycle") =>
  ({ edge_id: `${from}_${to}_${relation}`, from_node_id: from, to_node_id: to, relation, enforcement, reason: "Recorded relation" });
// A decision gates two blocked tasks; finished history feeds open work through
// two relations between one pair; a watch has no recorded link.
const map = {
  schema_version: "goal_task_map_v0", mode: "read_only", goal_id: "map-demo",
  limits: { node_limit: 120, emitted_node_count: 7, omitted_node_count: 0, source_truncated: false, missing_endpoint_count: 0, cycle_edge_count: 0, topology_complete: true },
  nodes: [node("gate", "gate", "open", 0), node("reserve", "deliverable", "blocked", 1), node("deposit", "deliverable", "blocked", 2),
    node("scope", "deliverable", "done", 0), node("venues", "deliverable", "done", 1), node("budget", "deliverable", "open", 2),
    node("watch", "monitor", "open", 0)],
  edges: [edge("reserve", "gate"), edge("deposit", "reserve"), edge("venues", "scope", "continues", "lineage_only"),
    edge("budget", "venues", "continues", "lineage_only"), edge("budget", "venues", "depends_on", "typed_condition")],
};
const snapshot = { ok: true, goal_id: "map-demo", observed_at: "2026-09-01T00:00:00Z", graph: null, goal_map: map, acceptance: null };
const parsed = parseDeliveryReview(snapshot, "map-demo").goal_map;
const ids = nodes => nodes.map(item => item.node_id);

assert.deepEqual(goalWorkMapSummary(parsed), { work: 5, done: 2, blocked: 2, waiting: 0, decisions: 1, watches: 1 });
assert.equal(goalWorkMapTone(node("x", "gate", "done", 0)), "done", "A decided gate no longer asks for a decision");
assert.equal(goalWorkMapTone(node("x", "deliverable", "ready", 0)), "open");

const current = goalWorkMapLayout(parsed, "current");
assert.deepEqual(current.columns.map(ids), [["gate"], ["reserve", "venues"], ["deposit", "budget"]], "Rows follow placed prerequisites");
assert.equal(current.hiddenCount, 1, "Older history beyond direct prerequisites is hidden, not dropped");
assert.deepEqual(ids(current.unlinked), ["watch"]);
assert.equal(current.edges.length, 4, "Parallel relations between one pair survive layout");
const all = goalWorkMapLayout(parsed, "all");
assert.deepEqual(all.columns.map(ids), [["gate", "scope"], ["reserve", "venues"], ["deposit", "budget"]], "Decisions lead finished work at equal depth");
assert.equal(all.hiddenCount, 0);
const gap = goalWorkMapLayout({ ...parsed, nodes: [node("a", "deliverable", "done", 0), node("b", "deliverable", "done", 1), node("c", "deliverable", "open", 2)],
  edges: [edge("b", "a"), edge("c", "b")] }, "current");
assert.deepEqual(gap.columns.map(ids), [["b"], ["c"]], "Hidden depths leave no empty columns");

const lineage = goalWorkMapLineage(parsed.edges, "reserve");
assert.deepEqual([...lineage.nodes].sort(), ["deposit", "gate", "reserve"], "Lineage follows only recorded links");
assert.equal(lineage.edges.size, 2);
assert.equal(goalWorkMapLineage(parsed.edges, "budget").edges.size, 3, "Transitive prerequisites are traced");
assert.equal(goalWorkMapLineage(parsed.edges, null).nodes.size, 0);

assert.equal(goalWorkMapIncomplete(parsed), false);
assert.equal(goalWorkMapIncomplete({ ...parsed, limits: { ...parsed.limits, topology_complete: false } }), true);
assert.equal(goalWorkMapIncomplete({ ...parsed, limits: { ...parsed.limits, cycle_edge_count: 1 } }), true, "A cycle is never drawn as a complete order");

for (const mutation of [
  { ...map, goal_id: "other-goal" },
  { ...map, nodes: [...map.nodes, map.nodes[0]] },
  { ...map, edges: [...map.edges, map.edges[0]] },
  { ...map, edges: [{ ...map.edges[0], to_node_id: "missing" }] },
  { ...map, edges: [{ ...map.edges[0], relation: "blocks" }] },
  { ...map, nodes: [{ ...map.nodes[0], kind: "evidence" }] },
  { ...map, mode: "writable" },
]) assert.throws(() => parseDeliveryReview({ ...snapshot, goal_map: mutation }, "map-demo"));

for (const copy of Object.values(deliveryReviewCopy)) {
  const markdown = deliveryReviewMarkdown(parseDeliveryReview(snapshot, "map-demo"), copy);
  assert.ok(markdown.includes(`## ${copy.workMap.title}`) && markdown.includes(copy.workMap.boundary));
  assert.ok(markdown.includes('"topology_complete": true'), "Exports keep coverage limits next to the map");
  assert.ok(markdown.includes(`Title budget → ${copy.workMap.relation.depends_on} → Title venues`)
    && markdown.includes(`Title budget → ${copy.workMap.relation.continues} → Title venues`));
  assert.ok(!deliveryReviewMarkdown(parseDeliveryReview({ ...snapshot, goal_map: null }, "map-demo"), copy).includes(`## ${copy.workMap.title}`));
}
console.log("goal work map: summary, focus layout, lineage, coverage, export and negative contracts passed");
