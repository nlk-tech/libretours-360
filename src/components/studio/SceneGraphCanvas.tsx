import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Maximize, Shuffle } from "lucide-react";
import type { Scene } from "@/types/tour";
import { cn } from "@/lib/utils";
import {
  buildSceneGraph,
  layoutSceneGraph,
  type GraphPoint,
  type SceneGraphEdge,
} from "@/lib/scene-graph";

interface Props {
  scenes: Scene[];
  sceneUrls: Record<string, string>;
  initialSceneId: string | null;
  activeSceneId: string | null;
  /** Node positions, in layout units; kept by the editor so they survive closing the graph. */
  positions: Record<string, GraphPoint>;
  onPositionsChange: (positions: Record<string, GraphPoint>) => void;
  onSelectScene: (sceneId: string) => void;
  onOpenScene: (sceneId: string) => void;
}

// Node card, in layout units, centred on the node position.
const NODE_W = 150;
const THUMB_H = 76;
const LABEL_H = 26;
const NODE_H = THUMB_H + LABEL_H;
const MAX_LABEL_CHARS = 20;
// Pointer travel (px) below which a press on a node is a click, not a drag.
const CLICK_SLOP = 4;
// Two clicks on the same node within this many ms open it.
const DOUBLE_CLICK_MS = 400;
const MIN_SCALE = 0.15;
const MAX_SCALE = 3;

interface View {
  x: number;
  y: number;
  scale: number;
}

type Drag =
  | { kind: "pan"; startX: number; startY: number; view: View }
  | {
      kind: "node";
      id: string;
      startX: number;
      startY: number;
      origin: GraphPoint;
      moved: boolean;
    };

/** Where the segment from the centre of a node towards (dx, dy) leaves its card. */
function exitPoint(c: GraphPoint, dx: number, dy: number, pad = 6): GraphPoint {
  const hw = NODE_W / 2 + pad;
  const hh = NODE_H / 2 + pad;
  const t = Math.min(
    dx === 0 ? Infinity : hw / Math.abs(dx),
    dy === 0 ? Infinity : hh / Math.abs(dy),
  );
  return { x: c.x + dx * t, y: c.y + dy * t };
}

const truncate = (s: string) =>
  s.length > MAX_LABEL_CHARS ? `${s.slice(0, MAX_LABEL_CHARS - 1)}…` : s;

export function SceneGraphCanvas({
  scenes,
  sceneUrls,
  initialSceneId,
  activeSceneId,
  positions,
  onPositionsChange,
  onSelectScene,
  onOpenScene,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Position of the node being dragged, committed to `positions` on release.
  const [dragPos, setDragPos] = useState<GraphPoint | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Double clicks are detected by hand: with the pointer captured by the
  // container, the browser's dblclick would not reliably reach the node.
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  const graph = useMemo(() => buildSceneGraph(scenes, initialSceneId), [scenes, initialSceneId]);
  const startId =
    initialSceneId && scenes.some((s) => s.id === initialSceneId) ? initialSceneId : scenes[0]?.id;

  // Lay out scenes that have no position yet, leaving the others where they are.
  useEffect(() => {
    const ids = graph.nodes.map((n) => n.id);
    if (ids.every((id) => positions[id])) return;
    const fixed = Object.fromEntries(
      ids.filter((id) => positions[id]).map((id) => [id, positions[id]!]),
    );
    onPositionsChange(layoutSceneGraph(ids, graph.edges, { fixed }));
  }, [graph, positions, onPositionsChange]);

  const pos = (id: string): GraphPoint | undefined =>
    drag?.kind === "node" && drag.id === id && dragPos ? dragPos : positions[id];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitView = (): View | null => {
    const pts = graph.nodes.map((n) => positions[n.id]).filter((p): p is GraphPoint => !!p);
    if (pts.length === 0 || size.width === 0 || size.height === 0) return null;
    const minX = Math.min(...pts.map((p) => p.x)) - NODE_W / 2;
    const maxX = Math.max(...pts.map((p) => p.x)) + NODE_W / 2;
    const minY = Math.min(...pts.map((p) => p.y)) - NODE_H / 2;
    const maxY = Math.max(...pts.map((p) => p.y)) + NODE_H / 2;
    const margin = 48;
    const scale = Math.min(
      1.2,
      Math.max(
        MIN_SCALE,
        Math.min(
          (size.width - 2 * margin) / (maxX - minX),
          (size.height - 2 * margin) / (maxY - minY),
        ),
      ),
    );
    return {
      scale,
      x: size.width / 2 - ((minX + maxX) / 2) * scale,
      y: size.height / 2 - ((minY + maxY) / 2) * scale,
    };
  };

  // Fit once, as soon as both the container size and the layout are known.
  useEffect(() => {
    if (view) return;
    const fitted = fitView();
    if (fitted) setView(fitted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, positions, view]);

  // Zoom around the cursor. A native listener: React's wheel listener is
  // passive, so it could not stop the page from scrolling/zooming.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        if (!v) return v;
        const scale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, v.scale * Math.exp(-e.deltaY * 0.0015)),
        );
        const k = scale / v.scale;
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag || !view) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.kind === "pan") {
      setView({ ...drag.view, x: drag.view.x + dx, y: drag.view.y + dy });
      return;
    }
    if (!drag.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });
    setDragPos({ x: drag.origin.x + dx / view.scale, y: drag.origin.y + dy / view.scale });
  };

  const handlePointerUp = () => {
    if (drag?.kind === "node") {
      if (drag.moved && dragPos) onPositionsChange({ ...positions, [drag.id]: dragPos });
      else {
        const now = performance.now();
        const last = lastClickRef.current;
        if (last?.id === drag.id && now - last.time < DOUBLE_CLICK_MS) {
          lastClickRef.current = null;
          onOpenScene(drag.id);
        } else {
          lastClickRef.current = { id: drag.id, time: now };
          onSelectScene(drag.id);
        }
      }
    }
    setDrag(null);
    setDragPos(null);
  };

  const relayout = () => {
    const next = layoutSceneGraph(
      graph.nodes.map((n) => n.id),
      graph.edges,
    );
    onPositionsChange(next);
    setView(null);
  };

  const edgeTitle = (edge: SceneGraphEdge) => {
    const name = (id: string) => scenes.find((s) => s.id === id)?.name ?? "";
    const lines: string[] = [];
    const describe = (from: string, to: string, tooltips: string[]) => {
      if (tooltips.length === 0) return;
      lines.push(`${name(from)} → ${name(to)}`);
      for (const tip of tooltips) if (tip) lines.push(`  • ${tip}`);
    };
    describe(edge.a, edge.b, edge.forward);
    describe(edge.b, edge.a, edge.backward);
    return lines.join("\n");
  };

  const unreachable = graph.nodes.filter((n) => !n.reachable).length;
  const deadEnds = graph.nodes.filter((n) => n.outDegree === 0 && scenes.length > 1).length;
  const broken = graph.nodes.reduce((sum, n) => sum + n.brokenLinks, 0);
  const oneWay = graph.edges.filter(
    (e) => e.forward.length === 0 || e.backward.length === 0,
  ).length;

  return (
    <div className="absolute inset-0 bg-background">
      <div
        ref={containerRef}
        className={cn(
          "absolute inset-0 touch-none select-none overflow-hidden",
          drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={(e) => {
          if (e.button !== 0 || !view) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ kind: "pan", startX: e.clientX, startY: e.clientY, view });
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          setDrag(null);
          setDragPos(null);
        }}
      >
        {scenes.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {t("editor.graph.empty")}
          </p>
        ) : (
          view && (
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                {(["link", "oneway", "hover"] as const).map((kind) => (
                  <marker
                    key={kind}
                    id={`scene-graph-arrow-${kind}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M0,0 L10,5 L0,10 z"
                      className={cn(
                        kind === "link" && "fill-muted-foreground",
                        kind === "oneway" && "fill-amber-400",
                        kind === "hover" && "fill-primary",
                      )}
                    />
                  </marker>
                ))}
                <clipPath id="scene-graph-thumb" clipPathUnits="userSpaceOnUse">
                  <path
                    d={`M${-NODE_W / 2 + 8},${-NODE_H / 2} h${NODE_W - 16} a8,8 0 0 1 8,8 v${THUMB_H - 8} h${-NODE_W} v${-(THUMB_H - 8)} a8,8 0 0 1 8,-8 z`}
                  />
                </clipPath>
              </defs>

              <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
                {graph.edges.map((edge) => {
                  const pa = pos(edge.a);
                  const pb = pos(edge.b);
                  if (!pa || !pb) return null;
                  const dx = pb.x - pa.x;
                  const dy = pb.y - pa.y;
                  if (dx === 0 && dy === 0) return null;
                  const from = exitPoint(pa, dx, dy);
                  const to = exitPoint(pb, -dx, -dy);
                  const oneWayEdge = edge.forward.length === 0 || edge.backward.length === 0;
                  const hovered = hoverId === edge.a || hoverId === edge.b;
                  const kind = hovered ? "hover" : oneWayEdge ? "oneway" : "link";
                  const marker = `url(#scene-graph-arrow-${kind})`;
                  return (
                    <g key={`${edge.a}\n${edge.b}`}>
                      <title>{edgeTitle(edge)}</title>
                      {/* Wide invisible stroke: an easier target for the tooltip. */}
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="transparent"
                        strokeWidth={14}
                      />
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        strokeWidth={hovered ? 2.5 : 1.75}
                        strokeDasharray={oneWayEdge ? "6 5" : undefined}
                        markerEnd={edge.forward.length > 0 ? marker : undefined}
                        markerStart={edge.backward.length > 0 ? marker : undefined}
                        className={cn(
                          kind === "link" && "stroke-muted-foreground",
                          kind === "oneway" && "stroke-amber-400",
                          kind === "hover" && "stroke-primary",
                        )}
                      />
                    </g>
                  );
                })}

                {graph.nodes.map((node) => {
                  const p = pos(node.id);
                  if (!p) return null;
                  const url = sceneUrls[node.id];
                  const isActive = node.id === activeSceneId;
                  const isStart = node.id === startId;
                  const deadEnd = node.outDegree === 0 && scenes.length > 1;
                  const problems = [
                    !node.reachable && t("editor.graph.nodeUnreachable"),
                    deadEnd && t("editor.graph.nodeDeadEnd"),
                    node.brokenLinks > 0 &&
                      t("editor.graph.nodeBroken", { count: node.brokenLinks }),
                  ].filter(Boolean);
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${p.x},${p.y})`}
                      className={cn(
                        "cursor-pointer",
                        drag?.kind === "node" &&
                          drag.id === node.id &&
                          drag.moved &&
                          "cursor-grabbing",
                      )}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        containerRef.current?.setPointerCapture(e.pointerId);
                        setDrag({
                          kind: "node",
                          id: node.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          origin: positions[node.id]!,
                          moved: false,
                        });
                      }}
                      onPointerEnter={() => setHoverId(node.id)}
                      onPointerLeave={() => setHoverId((h) => (h === node.id ? null : h))}
                    >
                      <title>
                        {[node.name, ...problems, t("editor.graph.openHint")].join("\n")}
                      </title>
                      <rect
                        x={-NODE_W / 2}
                        y={-NODE_H / 2}
                        width={NODE_W}
                        height={NODE_H}
                        rx={8}
                        strokeWidth={isActive ? 3 : 1.5}
                        className={cn(
                          "fill-card",
                          isActive
                            ? "stroke-primary"
                            : !node.reachable || node.brokenLinks > 0
                              ? "stroke-destructive"
                              : deadEnd
                                ? "stroke-amber-400"
                                : "stroke-border",
                        )}
                      />
                      {url ? (
                        <image
                          href={url}
                          x={-NODE_W / 2}
                          y={-NODE_H / 2}
                          width={NODE_W}
                          height={THUMB_H}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath="url(#scene-graph-thumb)"
                          className={cn(!node.reachable && "opacity-40")}
                        />
                      ) : (
                        <rect
                          x={-NODE_W / 2}
                          y={-NODE_H / 2}
                          width={NODE_W}
                          height={THUMB_H}
                          clipPath="url(#scene-graph-thumb)"
                          className="fill-muted"
                        />
                      )}
                      <text
                        x={0}
                        y={NODE_H / 2 - LABEL_H / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="fill-foreground text-[12px] font-medium"
                      >
                        {truncate(node.name)}
                      </text>
                      {isStart && (
                        <g transform={`translate(${-NODE_W / 2 + 8},${-NODE_H / 2 + 8})`}>
                          <rect width={58} height={18} rx={9} className="fill-emerald-500" />
                          <text
                            x={29}
                            y={9}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="fill-white text-[10px] font-semibold"
                          >
                            {t("editor.graph.start")}
                          </text>
                        </g>
                      )}
                      {problems.length > 0 && (
                        <g transform={`translate(${NODE_W / 2 - 4},${-NODE_H / 2 + 4})`}>
                          <circle
                            r={10}
                            className={cn(
                              !node.reachable || node.brokenLinks > 0
                                ? "fill-destructive"
                                : "fill-amber-400",
                            )}
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="fill-white text-[13px] font-bold"
                          >
                            !
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )
        )}

        <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1 rounded-lg border border-slate-700/50 bg-slate-900/80 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
          <span className="flex items-center gap-2">
            <svg width="28" height="6">
              <line
                x1="0"
                y1="3"
                x2="28"
                y2="3"
                strokeWidth="2"
                className="stroke-muted-foreground"
              />
            </svg>
            {t("editor.graph.legendBoth")}
          </span>
          <span className="flex items-center gap-2">
            <svg width="28" height="6">
              <line
                x1="0"
                y1="3"
                x2="28"
                y2="3"
                strokeWidth="2"
                strokeDasharray="5 4"
                className="stroke-amber-400"
              />
            </svg>
            {t("editor.graph.legendOneWay")}
          </span>
          <span>{t("editor.graph.hint")}</span>
        </div>
      </div>

      {/* Floating panels, outside the pan/zoom surface. Top right stays free
          for the editor's Edit / Preview / Graph switch. */}
      <div className="absolute left-4 top-4 flex max-w-[calc(100%-24rem)] flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border border-slate-700/50 bg-slate-900/80 px-3 py-2 text-xs backdrop-blur-md">
        <span className="font-semibold text-white">{t("editor.graph.title")}</span>
        <span className="text-slate-400">
          {t("editor.graph.summary", { scenes: graph.nodes.length, links: graph.edges.length })}
        </span>
        {unreachable > 0 && (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
            {t("editor.graph.unreachable", { count: unreachable })}
          </span>
        )}
        {deadEnds > 0 && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-300">
            {t("editor.graph.deadEnds", { count: deadEnds })}
          </span>
        )}
        {oneWay > 0 && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-300">
            {t("editor.graph.oneWay", { count: oneWay })}
          </span>
        )}
        {broken > 0 && (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
            {t("editor.graph.broken", { count: broken })}
          </span>
        )}
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full border border-slate-700/50 bg-slate-900/80 p-1 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setView(fitView())}
          title={t("editor.graph.fit")}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-white"
        >
          <Maximize className="h-3.5 w-3.5" /> {t("editor.graph.fit")}
        </button>
        <button
          type="button"
          onClick={relayout}
          title={t("editor.graph.relayoutHint")}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-white"
        >
          <Shuffle className="h-3.5 w-3.5" /> {t("editor.graph.relayout")}
        </button>
      </div>
    </div>
  );
}
