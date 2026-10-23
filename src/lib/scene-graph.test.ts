import assert from "node:assert/strict";
import { test } from "node:test";
import type { Hotspot, Scene } from "@/types/tour";
import { GRAPH_LINK_DISTANCE, buildSceneGraph, layoutSceneGraph } from "./scene-graph";

const nav = (targetSceneId: string | null, tooltip = ""): Hotspot => ({
  id: `hs_${Math.random()}`,
  type: "nav",
  pitch: 0,
  yaw: 0,
  tooltip,
  targetSceneId,
});

const scene = (id: string, hotspots: Hotspot[] = []): Scene => ({
  id,
  name: id.toUpperCase(),
  panoramaUrl: "",
  defaultZoom: 50,
  defaultYaw: 0,
  defaultPitch: 0,
  hotspots,
  measurements: [],
  floorplanPosition: null,
});

test("links in both directions become one edge", () => {
  const g = buildSceneGraph(
    [scene("b", [nav("a", "to A")]), scene("a", [nav("b", "to B"), nav("b", "to B again")])],
    "a",
  );
  assert.equal(g.edges.length, 1);
  assert.deepEqual(g.edges[0], {
    a: "a",
    b: "b",
    forward: ["to B", "to B again"],
    backward: ["to A"],
  });
});

test("reachability follows link direction from the initial scene", () => {
  const g = buildSceneGraph(
    [scene("a", [nav("b")]), scene("b"), scene("c", [nav("a")]), scene("d")],
    "a",
  );
  const reachable = Object.fromEntries(g.nodes.map((n) => [n.id, n.reachable]));
  assert.deepEqual(reachable, { a: true, b: true, c: false, d: false });
});

test("without an initial scene the first scene is the start", () => {
  const g = buildSceneGraph([scene("x", [nav("y")]), scene("y")], null);
  assert.ok(g.nodes.every((n) => n.reachable));
});

test("missing, deleted and info targets", () => {
  const info: Hotspot = { ...nav(null), type: "info" };
  const g = buildSceneGraph([scene("a", [nav(null), nav("gone"), info, nav("a")])], "a");
  assert.equal(g.edges.length, 0);
  assert.equal(g.nodes[0]!.brokenLinks, 2);
  // A self-link is neither broken nor a way out.
  assert.equal(g.nodes[0]!.outDegree, 0);
});

test("layout is deterministic and keeps fixed nodes", () => {
  const ids = ["a", "b", "c", "d"];
  const edges = [
    { a: "a", b: "b" },
    { a: "b", b: "c" },
  ];
  const fixed = { d: { x: 1000, y: -500 } };
  const p1 = layoutSceneGraph(ids, edges, { fixed });
  const p2 = layoutSceneGraph(ids, edges, { fixed });
  assert.deepEqual(p1, p2);
  assert.deepEqual(p1["d"], fixed.d);
  for (const id of ids) assert.ok(Number.isFinite(p1[id]!.x) && Number.isFinite(p1[id]!.y));
});

test("linked nodes end up closer than unlinked ones", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const pos = layoutSceneGraph(ids, [
    { a: "a", b: "b" },
    { a: "b", b: "c" },
    { a: "c", b: "d" },
    { a: "d", b: "e" },
  ]);
  const dist = (u: string, v: string) => Math.hypot(pos[u]!.x - pos[v]!.x, pos[u]!.y - pos[v]!.y);
  assert.ok(dist("a", "b") < dist("a", "e"));
  // No two nodes collapse onto each other.
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      assert.ok(dist(ids[i]!, ids[j]!) > GRAPH_LINK_DISTANCE / 4);
});
