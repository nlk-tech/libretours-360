/**
 * Floor plan data shared by the two exported viewers (Web 3D and standalone
 * cubemap): the images are written next to index.html, in `floorplans/`, and
 * the viewers get relative paths. Pure: the image source and the destination
 * are passed in, so it runs in Node tests.
 */
import type { Floorplan, FloorplanCorner, Scene, ScenePlacement } from "@/types/tour";
import type { ExportSink } from "../export-sink";

/** What createFloorplanMinimap (minimap.js) receives for each floor, sorted by level. */
export interface ExportedFloorplan {
  id: string;
  name: string;
  level: number;
  /** Relative URL of the image, e.g. "./floorplans/ground-floor-1.png". */
  image: string;
}

/** The minimap script and stylesheet, inlined in both viewers. */
export interface MinimapAssets {
  js: string;
  css: string;
}

export interface FloorplanExportSettings {
  showFloorplan: boolean;
  floorplanCorner: FloorplanCorner;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Path inside the export folder: unique (by position) and file-name safe. */
export function floorplanImagePath(floorplan: Floorplan, index: number, mimeType: string): string {
  const ext = EXTENSIONS[mimeType.split(";")[0]!.trim()] ?? "png";
  return `floorplans/${slug(floorplan.name) || "floor"}-${index + 1}.${ext}`;
}

/**
 * Writes the image of every floor plan and returns the floors the viewers can
 * show, sorted by level. A floor whose image is missing is left out (with a
 * warning): the tour still works, without that plan.
 */
export async function writeFloorplanImages(
  floorplans: Floorplan[],
  sink: ExportSink,
  getImage: (ref: string) => Promise<Blob | null>,
): Promise<ExportedFloorplan[]> {
  const out: ExportedFloorplan[] = [];
  const sorted = [...floorplans].sort((a, b) => a.level - b.level);
  for (const [index, f] of sorted.entries()) {
    let blob: Blob | null = null;
    try {
      blob = f.imageUrl ? await getImage(f.imageUrl) : null;
    } catch (e) {
      console.warn(`[export] Could not read floor plan "${f.name}":`, e);
    }
    if (!blob) {
      console.warn(`[export] Floor plan "${f.name}" has no image, left out of the tour`);
      continue;
    }
    const path = floorplanImagePath(f, index, blob.type);
    await sink.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    out.push({ id: f.id, name: f.name, level: f.level, image: `./${path}` });
  }
  return out;
}

/** The scene's placement, or null if it points at a floor that was not exported. */
export function exportedPlacement(
  scene: Pick<Scene, "floorplanPosition">,
  floorplans: ExportedFloorplan[],
): ScenePlacement | null {
  const p = scene.floorplanPosition;
  return p && floorplans.some((f) => f.id === p.floorplanId) ? p : null;
}
