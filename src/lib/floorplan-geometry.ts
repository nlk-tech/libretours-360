/**
 * Floor plan direction math (see docs/floorplans.md).
 *
 * Angles on the plan are in degrees, 0 = up, clockwise, like a compass.
 * A scene's `heading` is the plan angle that panorama yaw 0 looks at, so the
 * view cone points at `heading + yaw` (panorama yaw grows to the right, which
 * is clockwise seen from above).
 *
 * The exported viewers cannot import this module: src/lib/floorplan/minimap.js
 * carries a plain-JS copy of `normalizeDeg`, `coneDirection` and `conePath`.
 * Keep them in sync.
 */

/** Wraps any angle into 0..360. */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d === 0 ? 0 : d; // also turns -0 into 0
}

/** Plan direction of the current view. */
export function coneDirection(heading: number, yaw: number): number {
  return normalizeDeg(heading + yaw);
}

/** Heading that makes the cone point at `arcDeg` while the view is at `yaw`. */
export function headingFromArc(arcDeg: number, yaw: number): number {
  return normalizeDeg(arcDeg - yaw);
}

/**
 * Plan angle of the vector from `from` to `to`, in pixels of the image.
 * The points are 0..1 fractions of width/height, so they are scaled back by
 * the image size first: on a non-square plan the same fraction is a
 * different distance along x and y.
 */
export function planAngle(
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
  height: number,
): number {
  const dx = (to.x - from.x) * width;
  const dy = (to.y - from.y) * height;
  // Screen y grows downwards: "up" is -dy. atan2(dx, -dy) is 0 up, 90 right.
  return normalizeDeg((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/**
 * Landmark calibration: the panorama is oriented at `yaw` with a landmark in
 * the centre, and the user clicks that landmark on the plan at `target`.
 */
export function headingFromLandmark(
  pin: { x: number; y: number },
  target: { x: number; y: number },
  yaw: number,
  width: number,
  height: number,
): number {
  return headingFromArc(planAngle(pin, target, width, height), yaw);
}

/** Point at distance `r` from (cx, cy) in plan direction `deg`, in SVG coordinates. */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

/** SVG path of a circular sector centred on `dirDeg`, `fovDeg` wide. */
export function conePath(
  cx: number,
  cy: number,
  r: number,
  dirDeg: number,
  fovDeg: number,
): string {
  const half = Math.min(Math.max(fovDeg, 1), 359) / 2;
  const [x1, y1] = polar(cx, cy, r, dirDeg - half);
  const [x2, y2] = polar(cx, cy, r, dirDeg + half);
  const large = half * 2 > 180 ? 1 : 0;
  const f = (n: number) => Number(n.toFixed(2));
  return `M${f(cx)} ${f(cy)}L${f(x1)} ${f(y1)}A${f(r)} ${f(r)} 0 ${large} 1 ${f(x2)} ${f(y2)}Z`;
}
