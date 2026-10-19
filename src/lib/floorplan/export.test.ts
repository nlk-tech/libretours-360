import assert from "node:assert/strict";
import { test } from "node:test";
import type { Floorplan } from "@/types/tour";
import { exportedPlacement, floorplanImagePath, writeFloorplanImages } from "./export";

const fp = (id: string, name: string, level: number, imageUrl = `asset:${id}.png`): Floorplan => ({
  id,
  name,
  level,
  imageUrl,
});

test("floorplanImagePath: slug, position and extension from the image type", () => {
  assert.equal(
    floorplanImagePath(fp("a", "Piano Terra", 0), 0, "image/png"),
    "floorplans/piano-terra-1.png",
  );
  assert.equal(floorplanImagePath(fp("a", "", 0), 2, "image/svg+xml"), "floorplans/floor-3.svg");
  assert.equal(floorplanImagePath(fp("a", "X", 0), 0, "image/jpeg"), "floorplans/x-1.jpg");
  assert.equal(floorplanImagePath(fp("a", "X", 0), 0, ""), "floorplans/x-1.png");
});

test("writeFloorplanImages writes every image, sorted by level, and skips missing ones", async () => {
  const files = new Map<string, Uint8Array | string>();
  const images: Record<string, Blob> = {
    "asset:first.png": new Blob([new Uint8Array([1, 2])], { type: "image/png" }),
    "asset:ground.svg": new Blob(["<svg/>"], { type: "image/svg+xml" }),
  };
  const out = await writeFloorplanImages(
    [
      fp("first", "First", 1, "asset:first.png"),
      fp("ground", "Ground", 0, "asset:ground.svg"),
      fp("gone", "Basement", -1, "asset:gone.png"),
      fp("empty", "Attic", 5, ""),
    ],
    { writeFile: async (path, data) => void files.set(path, data) },
    async (ref) => images[ref] ?? null,
  );
  assert.deepEqual(out, [
    { id: "ground", name: "Ground", level: 0, image: "./floorplans/ground-2.svg" },
    { id: "first", name: "First", level: 1, image: "./floorplans/first-3.png" },
  ]);
  assert.deepEqual([...files.keys()].sort(), ["floorplans/first-3.png", "floorplans/ground-2.svg"]);
  assert.deepEqual([...(files.get("floorplans/first-3.png") as Uint8Array)], [1, 2]);
});

test("writeFloorplanImages: a failing read leaves that floor out instead of failing the export", async () => {
  const out = await writeFloorplanImages(
    [fp("a", "A", 0)],
    { writeFile: async () => {} },
    async () => {
      throw new Error("disk error");
    },
  );
  assert.deepEqual(out, []);
});

test("exportedPlacement keeps placements on exported floors only", () => {
  const placement = { floorplanId: "a", x: 0.1, y: 0.2, heading: 30 };
  const floors = [{ id: "a", name: "A", level: 0, image: "./floorplans/a-1.png" }];
  assert.deepEqual(exportedPlacement({ floorplanPosition: placement }, floors), placement);
  assert.equal(exportedPlacement({ floorplanPosition: placement }, []), null);
  assert.equal(exportedPlacement({ floorplanPosition: null }, floors), null);
});
