/**
 * Scene graph: scenes as nodes, navigation hotspots as directed links.
 *
 * Used by the editor's graph view to show how the tour is wired together and
 * to spot problems: scenes nobody can reach from the initial scene, scenes
 * with no way out, and navigation hotspots with no (or a deleted) target.
 */
import type { Scene } from "@/types/tour";

/** A link between two scenes, merged across directions: a <-> b is one edge. */
export interface SceneGraphEdge {
  /** The two scene ids, `a` < `b`, so a pair is stored once. */
  a: string;
  b: string;
  /** Tooltips of the nav hotspots going a -> b (empty when there is none). */
  forward: string[];
  /** Tooltips of the nav hotspots going b -> a. */
  backward: string[];
}

export interface SceneGraphNode {
  id: string;
  name: string;
  /** Reachable from the initial scene by following nav hotspots. */
  reachable: boolean;
  /** Number of distinct scenes this scene links to (self-links excluded). */
  outDegree: number;
  /** Nav hotspots with no target, or a target that no longer exists. */
  brokenLinks: number;
}

export interface SceneGraph {
  nodes: SceneGraphNode[];
  edges: SceneGraphEdge[];
}

export function buildSceneGraph(scenes: Scene[], initialSceneId: string | null): SceneGraph {
  const ids = new Set(scenes.map((s) => s.id));
  const edges = new Map<string, SceneGraphEdge>();
  const out = new Map<string, Set<string>>();
  const broken = new Map<string, number>();

  for (const scene of scenes) {
    const targets = new Set<string>();
    for (const hs of scene.hotspots) {
      if (hs.type !== "nav") continue;
      const target = hs.targetSceneId;
      if (!target || !ids.has(target)) {
        broken.set(scene.id, (broken.get(scene.id) ?? 0) + 1);
        continue;
      }
      if (target === scene.id) continue;
      targets.add(target);
      const [a, b] = scene.id < target ? [scene.id, target] : [target, scene.id];
      const key = `${a}\n${b}`;
      let edge = edges.get(key);
      if (!edge) {
        edge = { a, b, forward: [], backward: [] };
        edges.set(key, edge);
      }
      (scene.id === a ? edge.forward : edge.backward).push(hs.tooltip);
    }
    out.set(scene.id, targets);
  }

  // Breadth-first walk from the initial scene (the first scene when unset,
  // as the exported tour does).
  const start = initialSceneId && ids.has(initialSceneId) ? initialSceneId : scenes[0]?.id;
  const reachable = new Set<string>();
  if (start) {
    const queue = [start];
    reachable.add(start);
    while (queue.length > 0) {
      for (const next of out.get(queue.shift()!) ?? []) {
        if (reachable.has(next)) continue;
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  return {
    nodes: scenes.map((s) => ({
      id: s.id,
      name: s.name,
      reachable: reachable.has(s.id),
      outDegree: out.get(s.id)?.size ?? 0,
      brokenLinks: broken.get(s.id) ?? 0,
    })),
    edges: [...edges.values()],
  };
}

export interface GraphPoint {
  x: number;
  y: number;
}

/** Ideal distance between two linked nodes, in layout units. */
export const GRAPH_LINK_DISTANCE = 220;

/**
 * Force-directed layout (Fruchterman-Reingold): linked nodes attract, all
 * nodes repel. Deterministic: nodes without a position in `fixed` or
 * `initial` start on a circle in input order, so the same graph always gets
 * the same layout.
 *
 * `fixed` positions are kept as they are (nodes the user placed); `initial`
 * positions are only a starting point. Returns a position for every node.
 */
export function layoutSceneGraph(
  nodeIds: string[],
  edges: Pick<SceneGraphEdge, "a" | "b">[],
  options: {
    fixed?: Record<string, GraphPoint> | undefined;
    initial?: Record<string, GraphPoint> | undefined;
    iterations?: number | undefined;
  } = {},
): Record<string, GraphPoint> {
  const { fixed = {}, initial = {}, iterations = 300 } = options;
  const n = nodeIds.length;
  const k = GRAPH_LINK_DISTANCE;
  const radius = Math.max(k, (k * n) / (2 * Math.PI));
  const pos = nodeIds.map(
    (id, i): GraphPoint =>
      fixed[id] ??
      initial[id] ?? {
        x: radius * Math.cos((2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2),
        y: radius * Math.sin((2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2),
      },
  );
  const index = new Map(nodeIds.map((id, i) => [id, i]));
  const links = edges
    .map((e) => [index.get(e.a), index.get(e.b)] as const)
    .filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined);
  const movable = nodeIds.map((id) => !fixed[id]);

  // Max step per iteration, cooling linearly to (almost) nothing.
  const startTemp = k;
  for (let iter = 0; iter < iterations; iter++) {
    const temp = startTemp * (1 - iter / iterations) + 1;
    const disp = pos.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i]!.x - pos[j]!.x;
        let dy = pos[i]!.y - pos[j]!.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) {
          // Coincident nodes: push apart along a direction derived from the indices.
          dx = Math.cos(i + j);
          dy = Math.sin(i + j);
          d = 0.01;
        }
        const f = (k * k) / d;
        disp[i]!.x += (dx / d) * f;
        disp[i]!.y += (dy / d) * f;
        disp[j]!.x -= (dx / d) * f;
        disp[j]!.y -= (dy / d) * f;
      }
    }

    for (const [i, j] of links) {
      const dx = pos[i]!.x - pos[j]!.x;
      const dy = pos[i]!.y - pos[j]!.y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = (d * d) / k;
      disp[i]!.x -= (dx / d) * f;
      disp[i]!.y -= (dy / d) * f;
      disp[j]!.x += (dx / d) * f;
      disp[j]!.y += (dy / d) * f;
    }

    // Weak pull to the origin keeps disconnected pieces from drifting away.
    for (let i = 0; i < n; i++) {
      disp[i]!.x -= pos[i]!.x * 0.05;
      disp[i]!.y -= pos[i]!.y * 0.05;
    }

    for (let i = 0; i < n; i++) {
      if (!movable[i]) continue;
      const d = Math.hypot(disp[i]!.x, disp[i]!.y);
      if (d === 0) continue;
      const step = Math.min(d, temp);
      pos[i]!.x += (disp[i]!.x / d) * step;
      pos[i]!.y += (disp[i]!.y / d) * step;
    }
  }

  return Object.fromEntries(nodeIds.map((id, i) => [id, { x: pos[i]!.x, y: pos[i]!.y }]));
}
