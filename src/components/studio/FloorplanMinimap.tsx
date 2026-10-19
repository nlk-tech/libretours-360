import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Compass, Crosshair, Maximize2, Minimize2, MapPin } from "lucide-react";
import type {
  Floorplan,
  FloorplanCorner,
  FloorplanOffset,
  Scene,
  ScenePlacement,
} from "@/types/tour";
import {
  coneDirection,
  conePath,
  headingFromArc,
  headingFromLandmark,
  planAngle,
  polar,
} from "@/lib/floorplan-geometry";
import { cn } from "@/lib/utils";

/** Long side of the collapsed minimap, in screen px. */
const SMALL_SIZE = 220;
/** Pixels of pointer movement before a press on the plan becomes a pan. */
const DRAG_THRESHOLD = 3;

type Tool = "none" | "place" | "landmark";

interface Props {
  /** Already sorted by level. */
  floorplans: Floorplan[];
  /** Displayable image URL per floor plan id ("" while loading or missing). */
  floorplanUrls: Record<string, string>;
  scenes: Scene[];
  activeSceneId: string | null;
  /** Current view of the active scene, degrees. */
  yaw: number;
  fov: number;
  corner: FloorplanCorner;
  /** Distance from the corner's edges when collapsed (project setting). */
  offset: FloorplanOffset;
  /** Minimum distance from the top/bottom edge, to stay clear of the viewer's own controls. */
  clearTop: number;
  clearBottom: number;
  editable: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onNavigate: (sceneId: string) => void;
  onPlaceScene: (sceneId: string, placement: ScenePlacement) => void;
}

interface Size {
  w: number;
  h: number;
}

/** Largest size with the image's aspect ratio that fits in `box`. */
function fit(natural: Size, box: Size): Size {
  const k = Math.min(box.w / natural.w, box.h / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

/**
 * The floor plan overlay of the editor viewer: the active scene's floor, the
 * scene pins and a view cone that follows the panorama. Collapsed it only
 * navigates; expanded (and in edit mode) it places the active scene and sets
 * its heading. The exported viewers have their own vanilla version in
 * src/lib/floorplan/minimap.js.
 */
export function FloorplanMinimap({
  floorplans,
  floorplanUrls,
  scenes,
  activeSceneId,
  yaw,
  fov,
  corner,
  offset,
  clearTop,
  clearBottom,
  editable,
  expanded,
  onExpandedChange,
  onNavigate,
  onPlaceScene,
}: Props) {
  const { t } = useTranslation();
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const activeFloorId = activeScene?.floorplanPosition?.floorplanId ?? null;

  // The floor on display follows the active scene; the selector can show another one.
  const [floorId, setFloorId] = useState<string | null>(activeFloorId ?? floorplans[0]?.id ?? null);
  useEffect(() => {
    if (activeFloorId) setFloorId(activeFloorId);
  }, [activeFloorId, activeSceneId]);
  useEffect(() => {
    if (!floorplans.some((f) => f.id === floorId)) setFloorId(floorplans[0]?.id ?? null);
  }, [floorplans, floorId]);
  const floor = floorplans.find((f) => f.id === floorId) ?? null;
  const url = floor ? (floorplanUrls[floor.id] ?? "") : "";

  const [natural, setNatural] = useState<Size>({ w: 1000, h: 1000 });
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size>({ w: SMALL_SIZE, h: SMALL_SIZE });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  // Pan and zoom, expanded only.
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  useEffect(() => setView({ scale: 1, tx: 0, ty: 0 }), [expanded, floorId]);

  const [tool, setTool] = useState<Tool>("none");
  useEffect(() => setTool("none"), [expanded, activeSceneId, editable]);
  useEffect(() => {
    if (tool === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTool("none");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool]);

  // Live values while dragging the active pin or the heading handle.
  const [draft, setDraft] = useState<ScenePlacement | null>(null);
  const planRef = useRef<HTMLDivElement>(null);

  const fitted = fit(natural, box);
  // Plan units (natural image px) per screen px: keeps pins the same size at any zoom.
  const unit = natural.w / (fitted.w * view.scale);
  // The pin and the heading handle can be dragged at any size; the tools need room.
  const canDrag = editable;
  const canEdit = editable && expanded;

  const placement: ScenePlacement | null =
    draft ??
    (activeScene?.floorplanPosition?.floorplanId === floorId
      ? activeScene!.floorplanPosition
      : null);

  const pins = useMemo(
    () =>
      scenes.filter((s) => s.id !== activeSceneId && s.floorplanPosition?.floorplanId === floorId),
    [scenes, activeSceneId, floorId],
  );

  /** Pointer position as 0..1 fractions of the plan image. */
  const toPlan = (clientX: number, clientY: number) => {
    const rect = planRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  /** Runs `move` on every pointermove until the button is released, then `end`. */
  const trackPointer = (move: (e: PointerEvent) => void, end: (e: PointerEvent) => void) => {
    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onUp);
      end(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onUp);
  };

  const commit = (p: ScenePlacement) => {
    if (activeSceneId) onPlaceScene(activeSceneId, p);
  };

  // Press on the plan background: a click places or calibrates (with a tool
  // on); a drag pans when expanded.
  const onPlanPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !floor) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const startView = view;
    let dragged = false;
    trackPointer(
      (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragged = true;
        if (expanded) setView({ ...startView, tx: startView.tx + dx, ty: startView.ty + dy });
      },
      (ev) => {
        if (dragged || !canEdit || !activeScene) return;
        const at = toPlan(ev.clientX, ev.clientY);
        if (tool === "place") {
          commit({
            floorplanId: floor.id,
            x: at.x,
            y: at.y,
            heading: activeScene.floorplanPosition?.heading ?? 0,
          });
          setTool("none");
        } else if (tool === "landmark" && placement) {
          commit({
            ...placement,
            heading: headingFromLandmark(placement, at, yaw, natural.w, natural.h),
          });
          setTool("none");
        }
      },
    );
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!expanded) return;
    const rect = boxRef.current!.getBoundingClientRect();
    // Zoom around the cursor: the plan point under it stays put.
    const ox = e.clientX - rect.left - (box.w - fitted.w) / 2;
    const oy = e.clientY - rect.top - (box.h - fitted.h) / 2;
    setView((v) => {
      const scale = Math.min(8, Math.max(1, v.scale * Math.exp(-e.deltaY * 0.0015)));
      const k = scale / v.scale;
      return { scale, tx: ox - (ox - v.tx) * k, ty: oy - (oy - v.ty) * k };
    });
  };

  const onActivePinDown = (e: React.PointerEvent) => {
    if (!canDrag || !placement || tool !== "none") return;
    e.stopPropagation();
    e.preventDefault();
    let last = placement;
    trackPointer(
      (ev) => {
        last = { ...placement, ...toPlan(ev.clientX, ev.clientY) };
        setDraft(last);
      },
      () => {
        setDraft(null);
        commit(last);
      },
    );
  };

  const onHandleDown = (e: React.PointerEvent) => {
    if (!canDrag || !placement) return;
    e.stopPropagation();
    e.preventDefault();
    let last = placement;
    trackPointer(
      (ev) => {
        const angle = planAngle(placement, toPlan(ev.clientX, ev.clientY), natural.w, natural.h);
        last = { ...placement, heading: headingFromArc(angle, yaw) };
        setDraft(last);
      },
      () => {
        setDraft(null);
        commit(last);
      },
    );
  };

  if (!floor) return null;

  const side = corner.endsWith("left") ? "left" : "right";
  const unitOf = (v: number) => `${v}${offset.unit}`;
  const positionStyle: CSSProperties = {
    [side]: unitOf(offset.x),
    ...(corner.startsWith("top")
      ? { top: `max(${unitOf(offset.y)}, ${clearTop}px)` }
      : { bottom: `max(${unitOf(offset.y)}, ${clearBottom}px)` }),
  };

  const cx = placement ? placement.x * natural.w : 0;
  const cy = placement ? placement.y * natural.h : 0;
  const coneR = (expanded ? 70 : 34) * unit;
  const dir = placement ? coneDirection(placement.heading, yaw) : 0;
  const [hx, hy] = placement ? polar(cx, cy, coneR, dir) : [0, 0];

  const hint =
    tool === "place"
      ? t("editor.viewer.floorplan.placeHint")
      : tool === "landmark"
        ? t("editor.viewer.floorplan.landmarkHint")
        : canEdit && activeScene && !activeScene.floorplanPosition
          ? t("editor.viewer.floorplan.notPlacedHint")
          : null;

  return (
    <div
      data-testid="floorplan-minimap"
      className="absolute z-[15] flex flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/85 shadow-xl backdrop-blur-md"
      style={
        expanded
          ? // Clear of the Edit/Preview switch and the hints above, the control bars below.
            { [side]: 16, top: 64, bottom: 64, width: "min(70%, calc(100% - 32px))" }
          : positionStyle
      }
    >
      <div className="flex items-center gap-1.5 border-b border-slate-700/60 px-2 py-1 text-[11px] text-slate-200">
        {floorplans.length > 1 ? (
          <select
            value={floor.id}
            onChange={(e) => setFloorId(e.target.value)}
            className="min-w-0 flex-1 truncate rounded bg-transparent py-0.5 text-[11px] text-slate-100 outline-none"
            aria-label={t("editor.viewer.floorplan.floor")}
          >
            {floorplans.map((f) => (
              <option key={f.id} value={f.id} className="bg-slate-900">
                {f.name || t("editor.sidebar.floorplans.untitled")}
              </option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate">
            {floor.name || t("editor.sidebar.floorplans.untitled")}
          </span>
        )}
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          title={
            expanded ? t("editor.viewer.floorplan.collapse") : t("editor.viewer.floorplan.expand")
          }
          className="rounded p-0.5 text-slate-400 hover:text-white"
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div
        ref={boxRef}
        className={cn("relative overflow-hidden", expanded ? "min-h-0 flex-1" : "")}
        style={
          expanded
            ? undefined
            : { width: SMALL_SIZE, height: fit(natural, { w: SMALL_SIZE, h: SMALL_SIZE }).h }
        }
        onWheel={onWheel}
      >
        <div
          ref={planRef}
          className={cn(
            "absolute touch-none select-none",
            tool !== "none" ? "cursor-crosshair" : expanded ? "cursor-grab" : "",
          )}
          style={{
            left: (box.w - fitted.w) / 2,
            top: (box.h - fitted.h) / 2,
            width: fitted.w,
            height: fitted.h,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: "0 0",
          }}
          onPointerDown={onPlanPointerDown}
        >
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setNatural({ w: img.naturalWidth, h: img.naturalHeight });
                }
              }}
            />
          )}
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox={`0 0 ${natural.w} ${natural.h}`}
          >
            {pins.map((s) => (
              <circle
                key={s.id}
                data-scene-id={s.id}
                cx={s.floorplanPosition!.x * natural.w}
                cy={s.floorplanPosition!.y * natural.h}
                r={6 * unit}
                fill="#0f172a"
                stroke="#e2e8f0"
                strokeWidth={2 * unit}
                className={tool === "none" ? "cursor-pointer" : ""}
                onPointerDown={(e) => {
                  if (tool === "none") e.stopPropagation();
                }}
                onClick={() => tool === "none" && onNavigate(s.id)}
              >
                <title>{s.name}</title>
              </circle>
            ))}
            {placement && (
              <g>
                <path
                  d={conePath(cx, cy, coneR, dir, fov)}
                  fill="rgba(34, 211, 238, 0.35)"
                  stroke="rgba(34, 211, 238, 0.9)"
                  strokeWidth={1.5 * unit}
                  pointerEvents="none"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={7 * unit}
                  fill="#22d3ee"
                  stroke="#0f172a"
                  strokeWidth={2 * unit}
                  className={canDrag && tool === "none" ? "cursor-move" : ""}
                  onPointerDown={onActivePinDown}
                >
                  <title>{activeScene?.name}</title>
                </circle>
                {canDrag && (
                  <circle
                    data-testid="floorplan-heading-handle"
                    cx={hx}
                    cy={hy}
                    r={6 * unit}
                    fill="#f8fafc"
                    stroke="#0891b2"
                    strokeWidth={2 * unit}
                    className="cursor-grab"
                    onPointerDown={onHandleDown}
                  >
                    <title>{t("editor.viewer.floorplan.dragArc")}</title>
                  </circle>
                )}
              </g>
            )}
          </svg>
        </div>
        {!url && (
          <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] text-slate-400">
            {t("editor.viewer.floorplan.noImage")}
          </div>
        )}
      </div>

      {canEdit && activeScene && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-700/60 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setTool((v) => (v === "place" ? "none" : "place"))}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
              tool === "place"
                ? "bg-cyan-400 text-slate-950"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700",
            )}
          >
            <MapPin className="h-3 w-3" />
            {t("editor.viewer.floorplan.placeHere")}
          </button>
          <button
            type="button"
            disabled={!placement}
            onClick={() => setTool((v) => (v === "landmark" ? "none" : "landmark"))}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium disabled:opacity-40",
              tool === "landmark"
                ? "bg-cyan-400 text-slate-950"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700",
            )}
          >
            <Crosshair className="h-3 w-3" />
            {t("editor.viewer.floorplan.pointAtLandmark")}
          </button>
          {placement && (
            <span className="ml-auto flex items-center gap-1 text-[11px] tabular-nums text-slate-400">
              <Compass className="h-3 w-3" />
              {Math.round(placement.heading)}°
            </span>
          )}
          {hint && <p className="w-full text-[11px] leading-snug text-slate-400">{hint}</p>}
        </div>
      )}
    </div>
  );
}
