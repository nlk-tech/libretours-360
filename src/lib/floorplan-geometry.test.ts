import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coneDirection,
  conePath,
  headingFromArc,
  headingFromLandmark,
  normalizeDeg,
  planAngle,
  polar,
} from "./floorplan-geometry";

const close = (actual: number, expected: number, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

test("normalizeDeg wraps into 0..360", () => {
  assert.equal(normalizeDeg(0), 0);
  assert.equal(normalizeDeg(-0), 0);
  assert.equal(normalizeDeg(360), 0);
  assert.equal(normalizeDeg(370), 10);
  assert.equal(normalizeDeg(-10), 350);
  assert.equal(normalizeDeg(-730), 350);
});

test("the cone follows the view: heading + yaw, with negative yaw", () => {
  assert.equal(coneDirection(90, 0), 90);
  assert.equal(coneDirection(90, -120), 330);
  assert.equal(coneDirection(350, 20), 10);
});

test("calibration then display gives back the arc direction", () => {
  for (const [arc, yaw] of [
    [0, 0],
    [45, 170],
    [300, -95],
    [10, -179.5],
  ] as const) {
    const heading = headingFromArc(arc, yaw);
    close(coneDirection(heading, yaw), normalizeDeg(arc));
  }
});

test("planAngle: 0 up, clockwise", () => {
  const c = { x: 0.5, y: 0.5 };
  close(planAngle(c, { x: 0.5, y: 0.1 }, 100, 100), 0);
  close(planAngle(c, { x: 0.9, y: 0.5 }, 100, 100), 90);
  close(planAngle(c, { x: 0.5, y: 0.9 }, 100, 100), 180);
  close(planAngle(c, { x: 0.1, y: 0.5 }, 100, 100), 270);
});

test("planAngle uses pixels, not fractions, on a non-square plan", () => {
  // Same fractions along x and y, but the image is twice as wide as tall:
  // in pixels the vector is (200, -100), not at 45°.
  const a = planAngle({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 }, 2000, 1000);
  close(a, (Math.atan2(200, 100) * 180) / Math.PI);
});

test("landmark calibration points the cone at the landmark at that yaw", () => {
  const pin = { x: 0.3, y: 0.7 };
  const target = { x: 0.8, y: 0.2 };
  const heading = headingFromLandmark(pin, target, -40, 1600, 900);
  close(coneDirection(heading, -40), planAngle(pin, target, 1600, 900));
});

test("polar and conePath", () => {
  const [x, y] = polar(10, 10, 5, 90);
  close(x, 15);
  close(y, 10);
  assert.equal(conePath(0, 0, 10, 0, 90), "M0 0L-7.07 -7.07A10 10 0 0 1 7.07 -7.07Z");
  assert.match(conePath(0, 0, 10, 0, 200), / 0 1 1 /, "large arc for wide cones");
});
