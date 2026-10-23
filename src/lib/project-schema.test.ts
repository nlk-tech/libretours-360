import assert from "node:assert/strict";
import { test } from "node:test";
import { CURRENT_SCHEMA_VERSION } from "@/types/tour";
import { ProjectValidationError } from "./storage-errors";
import {
  parseThemeExportFile,
  parseThemeLibrary,
  THEME_EXPORT_FORMAT_VERSION,
  validateOrMigrateProject,
} from "./project-schema";

function baseProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "p1",
    name: "Test tour",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    initialSceneId: null,
    scenes: [],
    floorplans: [],
    ...overrides,
  };
}

function rejects(data: unknown): string[] {
  try {
    validateOrMigrateProject(data);
  } catch (e) {
    assert.ok(e instanceof ProjectValidationError, "should throw ProjectValidationError");
    return e.issues;
  }
  throw new Error("expected validateOrMigrateProject to throw");
}

// ─── Theme defaults & backward compatibility ───────────────────────────────

test("fills in theme defaults, including an empty overlays array, when theme is omitted", () => {
  const project = validateOrMigrateProject(baseProject());
  assert.deepEqual(project.theme, {
    showNavbar: true,
    showTitleOverlay: true,
    logoUrl: "",
    logoHeight: 32,
    overlays: [],
  });
});

test("accepts a theme saved by an earlier version (no 'overlays' or 'logoHeight' field)", () => {
  const project = validateOrMigrateProject(
    baseProject({ theme: { showNavbar: false, showTitleOverlay: true, logoUrl: "" } }),
  );
  assert.equal(project.theme.showNavbar, false);
  assert.deepEqual(project.theme.overlays, []);
  assert.equal(project.theme.logoHeight, 32);
});

test("keeps logoHeight as saved, clamping an out-of-range one instead of rejecting the project", () => {
  const height = (logoHeight: number) =>
    validateOrMigrateProject(baseProject({ theme: { logoHeight } })).theme.logoHeight;
  assert.equal(height(80), 80);
  assert.equal(height(2), 16);
  assert.equal(height(5000), 160);
});

test("keeps logoBackground as saved, and leaves it unset in older projects", () => {
  const background = (theme: Record<string, unknown>) =>
    validateOrMigrateProject(baseProject({ theme })).theme.logoBackground;
  assert.equal(background({ logoBackground: "transparent" }), "transparent");
  assert.equal(background({ logoBackground: "#336699" }), "#336699");
  assert.equal(background({}), undefined);
});

test("accepts a local 'asset:' logo reference", () => {
  const project = validateOrMigrateProject(
    baseProject({ theme: { logoUrl: "asset:logo_ab12cd.png" } }),
  );
  assert.equal(project.theme.logoUrl, "asset:logo_ab12cd.png");
});

test("rejects a logoUrl with an unsafe 'asset:' reference (path traversal)", () => {
  const issues = rejects(baseProject({ theme: { logoUrl: "asset:../../etc/passwd" } }));
  assert.ok(issues.some((i) => i.includes("theme.logoUrl") && i.includes("invalid 'asset:'")));
});

// ─── Overlay elements ───────────────────────────────────────────────────────

test("accepts an overlay element and fills in its defaults", () => {
  const project = validateOrMigrateProject(
    baseProject({
      theme: {
        overlays: [{ id: "o1", type: "logo", position: "top-left", content: "asset:logo.png" }],
      },
    }),
  );
  assert.deepEqual(project.theme.overlays, [
    {
      id: "o1",
      type: "logo",
      position: "top-left",
      offsetX: 0,
      offsetY: 0,
      offsetUnit: "px",
      style: {},
      content: "asset:logo.png",
    },
  ]);
});

test("accepts a text overlay with {{variable}} content and a custom style", () => {
  const project = validateOrMigrateProject(
    baseProject({
      theme: {
        overlays: [
          {
            id: "o1",
            type: "text",
            position: "bottom-center",
            offsetX: 10,
            offsetY: -5,
            offsetUnit: "%",
            style: { opacity: 0.8, fontSize: 14, color: "#ffffff", borderRadius: 6 },
            content: "{{scene.title}}",
          },
        ],
      },
    }),
  );
  const overlay = project.theme.overlays[0]!;
  assert.equal(overlay.content, "{{scene.title}}");
  assert.equal(overlay.offsetUnit, "%");
  assert.deepEqual(overlay.style, {
    opacity: 0.8,
    fontSize: 14,
    color: "#ffffff",
    borderRadius: 6,
  });
});

test("rejects an unsafe 'asset:' reference in a logo/image overlay's content", () => {
  const issues = rejects(
    baseProject({
      theme: {
        overlays: [
          { id: "o1", type: "image", position: "top-right", content: "asset:../../evil.png" },
        ],
      },
    }),
  );
  assert.ok(issues.some((i) => i.includes("invalid 'asset:'")));
});

test("does not asset-validate a text overlay's content, even if it looks like a path", () => {
  const project = validateOrMigrateProject(
    baseProject({
      theme: {
        overlays: [
          { id: "o1", type: "text", position: "top-right", content: "asset:../not-a-real-ref" },
        ],
      },
    }),
  );
  assert.equal(project.theme.overlays[0]!.content, "asset:../not-a-real-ref");
});

test("rejects duplicate overlay ids", () => {
  const issues = rejects(
    baseProject({
      theme: {
        overlays: [
          { id: "dup", type: "text", position: "top-left", content: "a" },
          { id: "dup", type: "text", position: "bottom-left", content: "b" },
        ],
      },
    }),
  );
  assert.ok(issues.some((i) => i.includes('duplicate overlay id "dup"')));
});

test("rejects an invalid overlay type, position or offset unit", () => {
  const badType = rejects(
    baseProject({
      theme: { overlays: [{ id: "o1", type: "video", position: "top-left", content: "" }] },
    }),
  );
  assert.ok(badType.some((i) => i.startsWith("theme.overlays[0].type")));

  const badPosition = rejects(
    baseProject({
      theme: { overlays: [{ id: "o1", type: "text", position: "center", content: "" }] },
    }),
  );
  assert.ok(badPosition.some((i) => i.startsWith("theme.overlays[0].position")));

  const badUnit = rejects(
    baseProject({
      theme: {
        overlays: [
          {
            id: "o1",
            type: "text",
            position: "top-left",
            offsetUnit: "em",
            content: "",
          },
        ],
      },
    }),
  );
  assert.ok(badUnit.some((i) => i.startsWith("theme.overlays[0].offsetUnit")));
});

// ─── Theme preset library (theme-store.ts) ─────────────────────────────────

function baseTheme(overrides: Record<string, unknown> = {}) {
  return { showNavbar: true, showTitleOverlay: true, logoUrl: "", overlays: [], ...overrides };
}

function basePreset(overrides: Record<string, unknown> = {}) {
  return {
    id: "theme_1",
    name: "My preset",
    theme: baseTheme(),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("parseThemeLibrary accepts an empty/missing library and returns its presets", () => {
  assert.deepEqual(parseThemeLibrary("{}"), []);
  assert.deepEqual(parseThemeLibrary('{"presets": []}'), []);
});

test("parseThemeLibrary accepts a preset with an inline data: URL logo and overlay image", () => {
  const [preset] = parseThemeLibrary(
    JSON.stringify({
      presets: [
        basePreset({
          theme: baseTheme({
            logoUrl: "data:image/png;base64,AAA=",
            overlays: [
              {
                id: "o1",
                type: "image",
                position: "top-left",
                content: "data:image/png;base64,BBB=",
              },
            ],
          }),
        }),
      ],
    }),
  );
  assert.equal(preset!.theme.logoUrl, "data:image/png;base64,AAA=");
  assert.equal(preset!.theme.overlays[0]!.content, "data:image/png;base64,BBB=");
});

test("parseThemeLibrary rejects a preset missing a name or id", () => {
  assert.throws(
    () => parseThemeLibrary(JSON.stringify({ presets: [basePreset({ name: "" })] })),
    ProjectValidationError,
  );
  assert.throws(
    () => parseThemeLibrary(JSON.stringify({ presets: [basePreset({ id: "" })] })),
    ProjectValidationError,
  );
});

test("parseThemeLibrary rejects malformed JSON", () => {
  assert.throws(() => parseThemeLibrary("not json"), ProjectValidationError);
});

test("parseThemeExportFile round-trips a valid .lt-theme file", () => {
  const file = parseThemeExportFile(
    JSON.stringify({
      formatVersion: THEME_EXPORT_FORMAT_VERSION,
      name: "Corporate",
      exportedAt: "2026-01-01T00:00:00.000Z",
      theme: baseTheme({ logoUrl: "data:image/png;base64,AAA=" }),
    }),
  );
  assert.equal(file.name, "Corporate");
  assert.equal(file.theme.logoUrl, "data:image/png;base64,AAA=");
});

test("parseThemeExportFile rejects a newer/unknown formatVersion", () => {
  assert.throws(
    () =>
      parseThemeExportFile(
        JSON.stringify({
          formatVersion: THEME_EXPORT_FORMAT_VERSION + 1,
          name: "Corporate",
          exportedAt: "2026-01-01T00:00:00.000Z",
          theme: baseTheme(),
        }),
      ),
    ProjectValidationError,
  );
});

test("parseThemeExportFile still validates 'asset:' references (a portable file should never carry one)", () => {
  assert.throws(
    () =>
      parseThemeExportFile(
        JSON.stringify({
          formatVersion: THEME_EXPORT_FORMAT_VERSION,
          name: "Bad",
          exportedAt: "2026-01-01T00:00:00.000Z",
          theme: baseTheme({ logoUrl: "asset:../../etc/passwd" }),
        }),
      ),
    ProjectValidationError,
  );
});

// ─── Measurements (schema v2) ──────────────────────────────────────────────

test("migrates a v1 project: scenes gain empty measurements, showMeasurements defaults to true", () => {
  const project = validateOrMigrateProject(
    baseProject({
      schemaVersion: 1,
      scenes: [{ id: "s1", name: "S", panoramaUrl: "https://example.com/a.jpg" }],
    }),
  );
  assert.equal(project.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(project.scenes[0]?.measurements, []);
  assert.equal(project.showMeasurements, true);
});

test("keeps measurements and showMeasurements as saved", () => {
  const measurement = {
    id: "ms_1",
    a: { yaw: 10, pitch: -5 },
    b: { yaw: 170, pitch: 20 },
    label: "3,45 m",
  };
  const project = validateOrMigrateProject(
    baseProject({
      showMeasurements: false,
      scenes: [
        {
          id: "s1",
          name: "S",
          panoramaUrl: "https://example.com/a.jpg",
          measurements: [measurement],
        },
      ],
    }),
  );
  assert.equal(project.showMeasurements, false);
  assert.deepEqual(project.scenes[0]?.measurements, [measurement]);
});

test("rejects malformed and duplicate measurements", () => {
  const scene = (measurements: unknown[]) =>
    baseProject({
      scenes: [{ id: "s1", name: "S", panoramaUrl: "https://example.com/a.jpg", measurements }],
    });
  const m = { id: "ms_1", a: { yaw: 0, pitch: 0 }, b: { yaw: 1, pitch: 1 }, label: "" };
  assert.ok(rejects(scene([{ ...m, a: { yaw: "x", pitch: 0 } }])).length > 0);
  assert.ok(rejects(scene([m, m])).some((i) => i.includes("duplicate measurement id")));
});

test("refuses a project from a newer format version", () => {
  assert.throws(
    () => validateOrMigrateProject(baseProject({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })),
    ProjectValidationError,
  );
});

// ─── Floor plans (schema v3) ───────────────────────────────────────────────

test("migrates a v2 project: floor plans gain level 0, scenes are not placed, minimap defaults", () => {
  const project = validateOrMigrateProject(
    baseProject({
      schemaVersion: 2,
      floorplans: [{ id: "fp1", name: "Ground", imageUrl: "asset:ground.png" }],
      scenes: [{ id: "s1", name: "S", panoramaUrl: "https://example.com/a.jpg" }],
    }),
  );
  assert.equal(project.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(project.floorplans[0]?.level, 0);
  assert.equal(project.scenes[0]?.floorplanPosition, null);
  assert.equal(project.showFloorplan, true);
  assert.equal(project.floorplanCorner, "bottom-left");
  assert.deepEqual(project.floorplanOffset, { x: 20, y: 20, unit: "px" });
});

// ─── Unified navigation hotspots (schema v4) ───────────────────────────────

test("migrates a v3 project: door and arrow hotspots become nav, info stays", () => {
  const hotspot = (id: string, type: string) => ({ id, type, pitch: 0, yaw: 0, tooltip: "" });
  const project = validateOrMigrateProject(
    baseProject({
      schemaVersion: 3,
      scenes: [
        {
          id: "s1",
          name: "S",
          panoramaUrl: "https://example.com/a.jpg",
          hotspots: [hotspot("h1", "door"), hotspot("h2", "arrow"), hotspot("h3", "info")],
        },
      ],
    }),
  );
  assert.equal(project.schemaVersion, 4);
  assert.deepEqual(
    project.scenes[0]?.hotspots.map((h) => h.type),
    ["nav", "nav", "info"],
  );
});

test("rejects door/arrow hotspot types in a current-version project", () => {
  const scene = (type: string) => ({
    scenes: [
      {
        id: "s1",
        name: "S",
        panoramaUrl: "https://example.com/a.jpg",
        hotspots: [{ id: "h1", type, pitch: 0, yaw: 0, tooltip: "" }],
      },
    ],
  });
  assert.ok(rejects(baseProject(scene("door"))).length > 0);
  assert.ok(rejects(baseProject(scene("arrow"))).length > 0);
});

test("keeps floor plans, placements and minimap settings as saved", () => {
  const placement = { floorplanId: "fp1", x: 0.25, y: 0.75, heading: 270 };
  const project = validateOrMigrateProject(
    baseProject({
      showFloorplan: false,
      floorplanCorner: "top-right",
      floorplans: [{ id: "fp1", name: "Raised", imageUrl: "asset:r.png", level: 0.5 }],
      scenes: [
        {
          id: "s1",
          name: "S",
          panoramaUrl: "https://example.com/a.jpg",
          floorplanPosition: placement,
        },
      ],
    }),
  );
  assert.equal(project.showFloorplan, false);
  assert.equal(project.floorplanCorner, "top-right");
  assert.equal(project.floorplans[0]?.level, 0.5);
  assert.deepEqual(project.scenes[0]?.floorplanPosition, placement);
});

test("drops a placement on a floor plan that does not exist", () => {
  const project = validateOrMigrateProject(
    baseProject({
      scenes: [
        {
          id: "s1",
          name: "S",
          panoramaUrl: "https://example.com/a.jpg",
          floorplanPosition: { floorplanId: "gone", x: 0.5, y: 0.5, heading: 0 },
        },
      ],
    }),
  );
  assert.equal(project.scenes[0]?.floorplanPosition, null);
});

test("rejects bad floor plans: unsafe image ref, duplicate id, position off the image, bad corner", () => {
  const fp = { id: "fp1", name: "F", imageUrl: "asset:f.png", level: 0 };
  assert.ok(rejects(baseProject({ floorplans: [{ ...fp, imageUrl: "asset:../x.png" }] })).length);
  assert.ok(
    rejects(baseProject({ floorplans: [fp, fp] })).some((i) =>
      i.includes("duplicate floorplan id"),
    ),
  );
  assert.ok(
    rejects(
      baseProject({
        floorplans: [fp],
        scenes: [
          {
            id: "s1",
            name: "S",
            panoramaUrl: "https://example.com/a.jpg",
            floorplanPosition: { floorplanId: "fp1", x: 1.5, y: 0.5, heading: 0 },
          },
        ],
      }),
    ).length,
  );
  assert.ok(rejects(baseProject({ floorplanCorner: "top-center" })).length);
  assert.ok(rejects(baseProject({ floorplanOffset: { x: 10, y: 10, unit: "em" } })).length);
});
