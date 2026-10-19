# Floor plans

A floor plan is an image of one storey of the place you are showing: ground floor, basement, first floor and so on. You can add one plan per storey, put each scene on its plan, and say which way the panorama looks. The tour then shows a **minimap** in a corner of the viewer: the plan of the current floor, a dot for every scene, and a cone that turns as the visitor looks around. A click on a dot opens that scene.

## Adding floor plans

In the editor, open the **Plans** tab in the left sidebar and click **Add floor plan**. PNG, JPG, WebP and SVG images are accepted. PDF is not: export the page as an image first.

Each plan in the list has:

- a **name**, taken from the file name, which you can change;
- a **level**: basement, ground floor, raised ground floor, first floor and so on. The level only decides the order of the plans: in the list, in the floor selector of the minimap and in the exported tours. A new plan gets the level above the highest one so far;
- **Replace image**, to load a new image while keeping the scenes placed on it;
- **Delete floor plan**. The app asks first and says how many scenes are on that plan: they stay in the tour but are no longer on any plan.

## Putting a scene on a plan

1. Select the scene.
2. In the **Plans** tab, under **Current scene**, choose its floor. The scene is placed in the middle of the plan and the minimap opens large over the viewer.
3. Click **Place here**, then click the point of the plan where the panorama was taken. You can also drag the scene's dot, in the small minimap too.

To take a scene off its plan, choose **No floor plan** or click **Remove from floor plan**. A scene on no plan has no minimap: in the editor and in the exported tours the minimap and its **Floor plan** button only appear in scenes placed on a plan.

The minimap shows the floor of the scene you are on. If the project has more than one plan, a selector in the minimap header shows the others.

## Setting the view direction

The cone around the scene's dot shows where the panorama is looking. To align it with the plan there are two ways, in **Edit** mode:

- **Point at a landmark** (enlarged minimap). Turn the panorama so that something you can recognise on the plan, such as a door or a window, is in the centre of the view. Click **Point at a landmark**, then click that same door or window on the plan. The cone now points at it, and it follows the view from then on.
- **Drag the handle** (small or enlarged minimap). Drag the white dot at the tip of the cone until the cone points where the panorama is looking. Use it to fine-tune.

The direction shown next to the buttons (for example `94°`) is the plan direction of the centre of the panorama: 0° is up, 90° is right.

**Esc** cancels **Place here** and **Point at a landmark**.

## The minimap in the editor

- Click the expand button in the minimap header to enlarge it. When it is enlarged, you can zoom with the mouse wheel and drag the plan to move it.
- In **Edit** mode the scene's dot and the cone's handle can be dragged at either size; **Place here** and **Point at a landmark** need the enlarged minimap.
- In **Preview** the minimap stays small and only navigates.
- The **Floor plan** button, bottom right next to the zoom bar, shows or hides the minimap. It appears in scenes placed on a plan. Like the **Measurements** button, it only changes what you see while you work.

## In the exported tours

Both 3D exports, Web 3D and Standalone, show the minimap with a **Floor plan** button at top right to show or hide it. The plan images are written to a `floorplans/` folder next to `index.html`.

In the **Plans** tab:

- **Show the floor plan in the exported tour** decides whether the minimap is visible when the tour opens. Visitors can still use the button.
- **Floor plan position** picks the corner of the viewer: top left, top right, bottom left (the default) or bottom right.
- **Offset X** and **Offset Y**, in px or %, set the distance from the two edges of that corner, as for theme elements. The default is 20 px.

Corner and offset apply to the editor and to both exported tours. Whatever the offset, the minimap never goes over the viewer's own controls: in the editor the Edit/Preview switch, **Set current view as default** and the zoom bar; in the exported tours the title, the logo, the buttons at top right and, on phones, the scene list.

In the exported tours the minimap:

- shows the floor of the current scene, and a floor selector when there is more than one plan;
- has an expand button to make it larger;
- opens a scene when you click its dot;
- is smaller on phones.

A plan whose image cannot be read at export time is left out, and its scenes are exported as not placed.

### Overlapping with the theme

A theme overlay anchored to the same corner as the minimap can overlap it. If that happens, change the minimap's corner or offset, or move the overlay. An automatic check is planned, see [the plan](future-plans/02-planimetrie.md).

## Data format

Floor plans arrived with project format version 3:

```json
{
  "schemaVersion": 3,
  "showFloorplan": true,
  "floorplanCorner": "bottom-left",
  "floorplanOffset": { "x": 20, "y": 20, "unit": "px" },
  "floorplans": [
    { "id": "floorplan_…", "name": "Ground floor", "imageUrl": "asset:floorplan-img_….png", "level": 0 }
  ],
  "scenes": [
    {
      "id": "scene_…",
      "floorplanPosition": { "floorplanId": "floorplan_…", "x": 0.25, "y": 0.6, "heading": 94 }
    }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `floorplans[].imageUrl` | The image, stored with the project like the theme images (`asset:` reference). |
| `floorplans[].level` | Storey, used for ordering: -2, -1, -0.5 (lower ground), 0 (ground), 0.5 (raised), 1, 2… |
| `scenes[].floorplanPosition` | `null` when the scene is not on a plan. `x` and `y` go from 0 to 1 across the image's width and height, so they do not depend on its resolution. |
| `…heading` | Plan direction, in degrees (0 = up, clockwise), of the panorama's yaw 0. The cone points at `heading + yaw`. |
| `showFloorplan` | Whether the minimap is visible when an exported tour opens. |
| `floorplanCorner` | `top-left`, `top-right`, `bottom-left` or `bottom-right`. |
| `floorplanOffset` | Distance from the corner's edges: `x` from the left or right edge, `y` from the top or bottom edge, in `px` or `%`. |

Projects saved by earlier versions open normally: plans get level 0, scenes are not placed, the minimap is shown, bottom left, 20 px from the edges. A `floorplanPosition` pointing to a plan that does not exist is dropped when the project is opened.

The `.ltproj` package carries the plan images. The JSON export only refers to them, as for panoramas and theme images.

## For developers

- Direction math: `src/lib/floorplan-geometry.ts` (`coneDirection`, `headingFromArc`, `headingFromLandmark`, `conePath`). Tests: `src/lib/floorplan-geometry.test.ts`. The landmark angle is computed in image pixels, not in 0..1 fractions, so it is right on non-square plans.
- Editor: `src/components/studio/FloorplanMinimap.tsx` (minimap, placing, handle, landmark), `src/components/studio/FloorplansPanel.tsx` (sidebar tab). `PanoCanvas.tsx` reports yaw and horizontal FOV through `onViewChange`, once per frame at most. State and callbacks live in `src/routes/editor.$id.tsx`.
- Exports: `src/lib/floorplan/minimap.js` and `minimap.css` are one vanilla minimap shared by both viewers, inlined in `index.html`. It carries a copy of the cone math: **keep it in sync** with `floorplan-geometry.ts`. `src/lib/floorplan/export.ts` writes the images and filters placements. Web 3D: `src/lib/export.ts`. Standalone: `src/lib/cubemap/build-html.ts` (tour format version 2) and `src/lib/cubemap/viewer/viewer.js`, which feeds the minimap from its render loop and converts its vertical FOV to a horizontal one for the cone.
- The `?raw` imports of the minimap files are in `src/lib/floorplan/assets.ts`, apart from `export.ts`, so the Node tests can import `export.ts`.
- Tests: `src/lib/floorplan/export.test.ts`, the floor plan tests in `src/lib/export.test.ts`, `src/lib/cubemap/export.test.ts` and `src/lib/project-schema.test.ts`, and an end-to-end test in `src/lib/cubemap/e2e.test.ts` that opens a standalone export in headless Chrome, checks the cone direction and clicks a dot.
