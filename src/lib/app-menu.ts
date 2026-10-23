/**
 * macOS menu bar.
 *
 * When the app sets no menu, Tauri gives macOS a default one, in English
 * whatever the UI language. This replaces it with the same structure built
 * from the frontend, so it follows the UI language (rebuilt on every change)
 * and can carry app commands, such as View > Edit / Preview / Scene graph.
 *
 * Windows and Linux get no menu bar from Tauri, and none is added here.
 */
import type { CheckMenuItem } from "@tauri-apps/api/menu";
import type { ViewMode } from "@/components/studio/ViewModeSwitch";
import { isTauri } from "./environment";
import i18n from "./i18n";

interface ViewMenuState {
  /** The current view: checked, and disabled since choosing it again does nothing. */
  active: ViewMode | null;
  enabled: Record<ViewMode, boolean>;
  onSelect: ((mode: ViewMode) => void) | null;
}

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "editor", label: "menu.view.editor" },
  { mode: "preview", label: "menu.view.preview" },
  { mode: "graph", label: "menu.view.sceneGraph" },
];

const NO_VIEW: ViewMenuState = {
  active: null,
  enabled: { editor: false, preview: false, graph: false },
  onSelect: null,
};
let view: ViewMenuState = NO_VIEW;
let viewItems: Partial<Record<ViewMode, CheckMenuItem>> = {};
// Builds run one after the other, so a quick language change cannot leave an
// older menu installed over a newer one.
let queue: Promise<void> = Promise.resolve();
let installed = false;

/** The product name (tauri.conf.json), not translated. */
const APP_NAME = "LibreTours 360";

const isMac = () =>
  typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);

async function buildMenu(): Promise<void> {
  const { Menu, Submenu, PredefinedMenuItem, CheckMenuItem } = await import("@tauri-apps/api/menu");
  const t = i18n.t.bind(i18n);
  const name = APP_NAME;
  const separator = () => PredefinedMenuItem.new({ item: "Separator" });

  const items: Partial<Record<ViewMode, CheckMenuItem>> = {};
  for (const { mode, label } of VIEW_MODES) {
    items[mode] = await CheckMenuItem.new({
      id: `view.${mode}`,
      text: t(label),
      enabled: view.enabled[mode] && view.active !== mode,
      checked: view.active === mode,
      action: () => {
        if (view.active !== mode) view.onSelect?.(mode);
        // macOS toggles the check mark on click: put it back as the state says.
        enqueue(syncViewItems);
      },
    });
  }

  const windowMenu = await Submenu.new({
    text: t("menu.window.title"),
    items: [
      await PredefinedMenuItem.new({ item: "Minimize", text: t("menu.window.minimize") }),
      await PredefinedMenuItem.new({ item: "Maximize", text: t("menu.window.zoom") }),
      await separator(),
      await PredefinedMenuItem.new({
        item: "BringAllToFront",
        text: t("menu.window.bringAllToFront"),
      }),
    ],
  });
  const helpMenu = await Submenu.new({ text: t("menu.help.title"), items: [] });

  const menu = await Menu.new({
    items: [
      await Submenu.new({
        text: name,
        items: [
          await PredefinedMenuItem.new({
            item: { About: null },
            text: t("menu.app.about", { name }),
          }),
          await separator(),
          await PredefinedMenuItem.new({ item: "Services", text: t("menu.app.services") }),
          await separator(),
          await PredefinedMenuItem.new({ item: "Hide", text: t("menu.app.hide", { name }) }),
          await PredefinedMenuItem.new({ item: "HideOthers", text: t("menu.app.hideOthers") }),
          await PredefinedMenuItem.new({ item: "ShowAll", text: t("menu.app.showAll") }),
          await separator(),
          await PredefinedMenuItem.new({ item: "Quit", text: t("menu.app.quit", { name }) }),
        ],
      }),
      await Submenu.new({
        text: t("menu.file.title"),
        items: [
          await PredefinedMenuItem.new({ item: "CloseWindow", text: t("menu.file.closeWindow") }),
        ],
      }),
      // Also what makes Cmd+C/V/X/A/Z work in text fields on macOS.
      await Submenu.new({
        text: t("menu.edit.title"),
        items: [
          await PredefinedMenuItem.new({ item: "Undo", text: t("menu.edit.undo") }),
          await PredefinedMenuItem.new({ item: "Redo", text: t("menu.edit.redo") }),
          await separator(),
          await PredefinedMenuItem.new({ item: "Cut", text: t("menu.edit.cut") }),
          await PredefinedMenuItem.new({ item: "Copy", text: t("menu.edit.copy") }),
          await PredefinedMenuItem.new({ item: "Paste", text: t("menu.edit.paste") }),
          await PredefinedMenuItem.new({ item: "SelectAll", text: t("menu.edit.selectAll") }),
        ],
      }),
      await Submenu.new({
        text: t("menu.view.title"),
        items: [
          ...VIEW_MODES.map(({ mode }) => items[mode]!),
          await separator(),
          await PredefinedMenuItem.new({ item: "Fullscreen", text: t("menu.view.fullscreen") }),
        ],
      }),
      windowMenu,
      helpMenu,
    ],
  });

  await menu.setAsAppMenu();
  await windowMenu.setAsWindowsMenuForNSApp();
  await helpMenu.setAsHelpMenuForNSApp();
  viewItems = items;
  // The state may have changed while the menu was being built.
  await syncViewItems();
}

async function syncViewItems(): Promise<void> {
  for (const { mode } of VIEW_MODES) {
    const item = viewItems[mode];
    if (!item) continue;
    await item.setEnabled(view.enabled[mode] && view.active !== mode);
    await item.setChecked(view.active === mode);
  }
}

function enqueue(task: () => Promise<void>): void {
  queue = queue.then(task).catch((e) => console.error("App menu:", e));
}

/** Installs the localized menu bar (macOS desktop app only; no-op elsewhere). */
export function installAppMenu(): void {
  if (installed || !isTauri() || !isMac()) return;
  installed = true;
  enqueue(buildMenu);
  i18n.on("languageChanged", () => enqueue(buildMenu));
}

/**
 * View > Edit / Preview / Scene graph follow the editor's view switch;
 * choosing one calls `onSelect`. Pass null when the editor goes away.
 */
export function setViewMenuState(state: ViewMenuState | null): void {
  view = state ?? NO_VIEW;
  if (installed) enqueue(syncViewItems);
}
