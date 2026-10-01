import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Circle, CircleCheck, CircleDashed, ExternalLink, Eye, Hand, OctagonAlert, ZoomIn, ZoomOut } from "lucide-react";
import { goalWorkMapLayout, goalWorkMapLineage, goalWorkMapIncomplete, goalWorkMapSummary, goalWorkMapTone,
  type GoalWorkMap, type GoalWorkMapEdge, type GoalWorkMapFocus, type GoalWorkMapNode, type GoalWorkMapTone } from "../../data/goal-work-map";
import type { deliveryReviewCopy } from "./delivery-review-copy";
import "./goal-work-map.css";

type Copy = (typeof deliveryReviewCopy)["en"]["workMap"];
const CARD_W = 176, CARD_H = 88, COLUMN = 212, ROW = 102, PAD = 20;
const relationRank: Record<GoalWorkMapEdge["relation"], number> = { depends_on: 0, supersedes: 1, continues: 2 };
const toneIcon: Record<GoalWorkMapTone, typeof Circle> = {
  decision: Hand, blocked: OctagonAlert, open: Circle, waiting: CircleDashed, done: CircleCheck, unknown: Circle,
};

function NodeCard({ node, copy, selected, dimmed, style, onSelect }: {
  node: GoalWorkMapNode; copy: Copy; selected: boolean; dimmed: boolean; style?: CSSProperties; onSelect: (id: string) => void;
}) {
  const tone = goalWorkMapTone(node);
  const Icon = node.kind === "monitor" && tone !== "done" ? Eye : toneIcon[tone];
  const owner = node.owner_agent;
  return <button type="button" className="work-map-node" data-tone={tone} data-kind={node.kind} data-dimmed={dimmed || undefined}
    aria-pressed={selected} style={style} title={node.title} onClick={() => onSelect(node.node_id)}>
    <span className="work-map-node-meta"><Icon aria-hidden="true" size={13} />{copy.kind[node.kind]}<em>{copy.tone[tone]}</em></span>
    <strong>{node.title}</strong>
    <small>{owner ? <><i aria-hidden="true">{owner.slice(0, 1).toUpperCase()}</i>{owner}</> : null}{node.task_domain ? <span>{node.task_domain}</span> : null}</small>
  </button>;
}

export function GoalWorkMapView({ map, copy, selectedId, onSelect, onOpen, canOpen }: {
  map: GoalWorkMap; copy: Copy; selectedId: string | null; onSelect: (id: string | null) => void;
  onOpen: (node: GoalWorkMapNode) => void; canOpen: (node: GoalWorkMapNode) => boolean;
}) {
  const marker = useId().replace(/:/g, "");
  const [focus, setFocus] = useState<GoalWorkMapFocus>("current");
  const [scale, setScale] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(0);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 720px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const layout = useMemo(() => goalWorkMapLayout(map, focus), [map, focus]);
  const summary = goalWorkMapSummary(map);
  const nodeById = new Map(map.nodes.map(node => [node.node_id, node]));
  const position = new Map(layout.columns.flatMap((column, x) => column.map((node, y) => [node.node_id, { x: PAD + x * COLUMN, y: PAD + y * ROW }] as const)));
  const width = PAD * 2 + Math.max(0, layout.columns.length * COLUMN - (COLUMN - CARD_W));
  const height = PAD * 2 + Math.max(1, ...layout.columns.map(column => column.length)) * ROW - (ROW - CARD_H);
  const fit = available ? Math.min(1, available / width) : 1;
  // Fit when the whole map stays legible; otherwise keep full size and scroll.
  const zoom = scale ?? (fit >= 0.86 ? fit : 1);
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const lineage = goalWorkMapLineage(layout.edges, selected && position.has(selected.node_id) ? selected.node_id : null);
  const strokes = useMemo(() => {
    const pairs = new Map<string, GoalWorkMapEdge[]>();
    for (const edge of layout.edges) pairs.set(`${edge.from_node_id}\0${edge.to_node_id}`, [...pairs.get(`${edge.from_node_id}\0${edge.to_node_id}`) ?? [], edge]);
    return [...pairs.values()].map(group => group.sort((a, b) => relationRank[a.relation] - relationRank[b.relation]));
  }, [layout.edges]);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setAvailable(element.clientWidth));
    observer.observe(element);
    setAvailable(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setScale(null), [focus]);
  useEffect(() => {
    if (selectedId) window.requestAnimationFrame(() => inspectorRef.current?.scrollIntoView({ block: "nearest" }));
  }, [selectedId]);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    if (!element || event.pointerType !== "mouse" || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
    element.setPointerCapture(event.pointerId);
  };
  const pan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = scrollRef.current, origin = drag.current;
    if (!element || !origin) return;
    element.scrollLeft = origin.left - (event.clientX - origin.x);
    element.scrollTop = origin.top - (event.clientY - origin.y);
  };
  const before = selected ? map.edges.filter(edge => edge.from_node_id === selected.node_id) : [];
  const after = selected ? map.edges.filter(edge => edge.to_node_id === selected.node_id) : [];
  const relationList = (edges: GoalWorkMapEdge[], end: "from_node_id" | "to_node_id", empty: string) => edges.length
    ? <ul>{edges.map(edge => { const target = nodeById.get(edge[end])!; return <li key={edge.edge_id}>
      <button type="button" onClick={() => onSelect(target.node_id)}><em data-relation={edge.relation}>{copy.relation[edge.relation]}</em><span>{target.title}</span><small>{copy.tone[goalWorkMapTone(target)]}</small></button>
    </li>; })}</ul>
    : <p>{empty}</p>;
  const limits = map.limits;
  return <section className="work-map" aria-label={copy.title}>
    <header className="work-map-toolbar">
      <div>
        <h3>{copy.title}</h3>
        <p className="work-map-summary">
          <strong>{summary.done}/{summary.work}</strong> {copy.tasksDone}
          {summary.decisions ? <span data-tone="decision">{summary.decisions} {copy.decisions}</span> : null}
          {summary.blocked ? <span data-tone="blocked">{summary.blocked} {copy.blocked}</span> : null}
          {summary.waiting ? <span>{summary.waiting} {copy.waiting}</span> : null}
          {summary.watches ? <span>{summary.watches} {copy.watches}</span> : null}
        </p>
      </div>
      <div className="work-map-controls">
        <div role="group" aria-label={copy.focus}>
          {(["current", "all"] as const).map(value => <button key={value} type="button" aria-pressed={focus === value} onClick={() => setFocus(value)}>{copy[value]}</button>)}
        </div>
        <div role="group" aria-label={copy.zoom} hidden={compact}>
          <button type="button" aria-label={copy.zoomOut} title={copy.zoomOut} disabled={zoom <= 0.5} onClick={() => setScale(Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10))}><ZoomOut size={15} /></button>
          <button type="button" aria-pressed={Math.abs(zoom - fit) < 0.01} onClick={() => setScale(fit)}>{copy.fit}</button>
          <button type="button" aria-label={copy.zoomIn} title={copy.zoomIn} disabled={zoom >= 1.25} onClick={() => setScale(Math.min(1.25, Math.round((zoom + 0.1) * 10) / 10))}><ZoomIn size={15} /></button>
        </div>
      </div>
    </header>
    {goalWorkMapIncomplete(map) ? <details className="work-map-notice"><summary>{copy.incomplete}</summary><dl>
      <div><dt>{copy.omitted}</dt><dd>{limits.omitted_node_count}</dd></div>
      <div><dt>{copy.missingEnds}</dt><dd>{limits.missing_endpoint_count}</dd></div>
      <div><dt>{copy.truncated}</dt><dd>{limits.source_truncated ? "✓" : "–"}</dd></div>
      <div><dt>{copy.cycles}</dt><dd>{limits.cycle_edge_count}</dd></div>
    </dl></details> : null}
    {!map.nodes.length ? <p className="work-map-empty" role="status">{copy.empty}</p> : <>
      {compact ? <ol className="work-map-list">{layout.columns.flat().map(node => {
        const needs = layout.edges.filter(edge => edge.from_node_id === node.node_id).map(edge => nodeById.get(edge.to_node_id)!.title);
        return <li key={node.node_id}><NodeCard node={node} copy={copy} selected={node.node_id === selectedId} dimmed={false} onSelect={onSelect} />
          {needs.length ? <p><span>{copy.before}</span> {[...new Set(needs)].join(" · ")}</p> : null}</li>;
      })}</ol> : null}
      <div className="work-map-scroll" hidden={compact} ref={scrollRef} role="region" aria-label={copy.canvas} tabIndex={0}
        onPointerDown={startPan} onPointerMove={pan} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {layout.columns.length ? <div className="work-map-stage" style={{ width: width * zoom, height: height * zoom }}>
          <div className="work-map-canvas" style={{ width, height, transform: `scale(${zoom})` }}>
            <svg aria-hidden="true" width={width} height={height}>
              <defs>{["base", "hot"].map(kind => <marker key={kind} id={`${marker}-${kind}`} className={`work-map-arrow is-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" /></marker>)}</defs>
              {strokes.map(group => {
                const edge = group[0];
                const from = position.get(edge.to_node_id)!, to = position.get(edge.from_node_id)!;
                const sx = from.x + CARD_W, sy = from.y + CARD_H / 2, ex = to.x, ey = to.y + CARD_H / 2;
                const bend = Math.max(28, (ex - sx) / 2);
                const d = ex > sx ? `M ${sx} ${sy} C ${sx + bend} ${sy}, ${ex - bend} ${ey}, ${ex} ${ey}`
                  : `M ${from.x + CARD_W / 2} ${from.y + CARD_H} C ${from.x + CARD_W / 2} ${from.y + CARD_H + 48}, ${to.x + CARD_W / 2} ${to.y + CARD_H + 48}, ${to.x + CARD_W / 2} ${to.y + CARD_H}`;
                const related = group.some(item => lineage.edges.has(item.edge_id));
                return <path key={edge.edge_id} d={d} data-relation={edge.relation} data-related={related || undefined}
                  data-dimmed={(selected && !related) || undefined} markerEnd={`url(#${marker}-${related ? "hot" : "base"})`} />;
              })}
            </svg>
            {layout.columns.flat().map(node => <NodeCard key={node.node_id} node={node} copy={copy} selected={node.node_id === selectedId}
              dimmed={Boolean(selected) && !lineage.nodes.has(node.node_id)} style={{ left: position.get(node.node_id)!.x, top: position.get(node.node_id)!.y }} onSelect={onSelect} />)}
          </div>
        </div> : null}
      </div>
      <section className="work-map-inspector" ref={inspectorRef} aria-label={copy.selected}>
        {!selected ? <p>{copy.select}</p> : <>
          <header>
            <span data-tone={goalWorkMapTone(selected)}>{copy.kind[selected.kind]} · {copy.tone[goalWorkMapTone(selected)]}</span>
            <h4>{selected.title}</h4>
            {selected.owner_agent || selected.task_domain ? <p>{[selected.owner_agent, selected.task_domain].filter(Boolean).join(" · ")}</p> : null}
          </header>
          <div className="work-map-relations">
            <div><h5>{copy.before}</h5>{relationList(before, "to_node_id", copy.nothingBefore)}</div>
            <div><h5>{copy.after}</h5>{relationList(after, "from_node_id", copy.nothingAfter)}</div>
          </div>
          {canOpen(selected) ? <button type="button" className="work-map-open" onClick={() => onOpen(selected)}><ExternalLink size={15} />{copy.open}</button> : <p>{copy.noSource}</p>}
        </>}
      </section>
      <footer className="work-map-footer">
        <span className="work-map-legend" aria-label={copy.legend}>
          {(["depends_on", "continues"] as const).map(relation => <span key={relation}><svg aria-hidden="true" width="28" height="8"><path d="M 1 4 L 27 4" data-relation={relation} /></svg>{copy.relation[relation]}</span>)}
        </span>
        {layout.hiddenCount ? <button type="button" className="work-map-hidden" onClick={() => setFocus("all")}>{layout.hiddenCount} {copy.hidden}</button> : null}
        <p>{copy.boundary}</p>
      </footer>
      {layout.unlinked.length ? <section className="work-map-unlinked" aria-label={copy.unlinked}>
        <h4>{copy.unlinked}</h4>
        <div>{layout.unlinked.map(node => <NodeCard key={node.node_id} node={node} copy={copy} selected={node.node_id === selectedId} dimmed={false} onSelect={onSelect} />)}</div>
      </section> : null}
    </>}
  </section>;
}
