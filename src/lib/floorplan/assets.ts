/**
 * The minimap script and stylesheet as text, for inlining in the exported
 * viewers. Kept apart from export.ts because `?raw` imports only work under
 * Vite: the Node tests read the files with readFileSync instead.
 */
import minimapCss from "./minimap.css?raw";
import minimapJs from "./minimap.js?raw";
import type { MinimapAssets } from "./export";

export const minimapAssets: MinimapAssets = { js: minimapJs, css: minimapCss };
