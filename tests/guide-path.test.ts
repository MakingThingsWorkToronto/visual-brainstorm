import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildTimeline,
  samplePerimeter,
  atLength,
  nearestLength,
  orderBoxes,
  LAPS,
  LINK_DUR,
  type Box,
} from '../apps/studio/src/lib/guidePath.ts';

const near = (a: number, b: number, eps = 1.0) => Math.abs(a - b) <= eps;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const isLink = (dur: number) => Math.abs(dur - LINK_DUR) < 1e-6;

const box = (role: Box['role'], x: number, y: number, w: number, h: number, r = 0, done = false): Box => ({
  key: `${role}@${x},${y}`,
  role,
  x,
  y,
  w,
  h,
  r,
  done,
});

test('samplePerimeter: sharp rect total length is the true perimeter', () => {
  const poly = samplePerimeter(box('step', 0, 0, 100, 60, 0));
  assert.ok(near(poly.total, 2 * (100 + 60), 1.5), `got ${poly.total}`);
});

test('samplePerimeter: rounded corners shorten the perimeter by the corner cut', () => {
  const r = 12;
  const poly = samplePerimeter(box('step', 0, 0, 100, 60, r));
  const expected = 2 * (100 - 2 * r) + 2 * (60 - 2 * r) + 2 * Math.PI * r;
  assert.ok(near(poly.total, expected, 2), `got ${poly.total}, expected ~${expected}`);
});

test('atLength wraps around the closed loop', () => {
  const poly = samplePerimeter(box('step', 10, 20, 100, 60, 0));
  const a = atLength(poly, 5);
  const b = atLength(poly, poly.total + 5);
  assert.ok(dist(a, b) < 0.5, `wrap mismatch ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
});

test('nearestLength picks the closest perimeter point (right edge for a point to the right)', () => {
  const poly = samplePerimeter(box('step', 0, 0, 100, 60, 0));
  const p = atLength(poly, nearestLength(poly, { x: 400, y: 30 }));
  assert.ok(near(p.x, 100, 1.5), `expected right edge x~100, got ${p.x}`);
  assert.ok(p.y > 0 && p.y < 60, `expected on the right edge, got y=${p.y}`);
});

test('buildTimeline: nav → step → input → back, one loop per box + a link between each', () => {
  const boxes = [
    box('input', 0, 500, 400, 120, 16), // deliberately out of order
    box('step', 0, 200, 400, 200, 16),
    box('hub', 0, 0, 256, 700, 0),
  ];
  const segs = buildTimeline(boxes, false);
  const loops = segs.filter((s) => !isLink(s.dur));
  const links = segs.filter((s) => isLink(s.dur));
  assert.equal(loops.length, 3, 'one loop per box');
  assert.equal(links.length, 3, 'two hand-offs + one return link');
  assert.ok(segs.reduce((s, x) => s + x.dur, 0) > 0);
});

test('buildTimeline: links hand off continuously — each link ends where the next loop begins', () => {
  const boxes = [box('hub', 0, 0, 256, 700, 0), box('step', 0, 200, 400, 200, 16), box('input', 0, 500, 400, 120, 16)];
  const segs = buildTimeline(boxes, false);
  for (let i = 0; i < segs.length - 1; i++) {
    if (isLink(segs[i].dur)) {
      const linkEnd = segs[i].pos(LINK_DUR);
      const nextStart = segs[i + 1].pos(0);
      assert.ok(dist(linkEnd, nextStart) < 0.5, `discontinuity at segment ${i}`);
    }
  }
});

test('buildTimeline: a loop returns to its start after exactly LAPS laps', () => {
  const boxes = [box('hub', 0, 0, 256, 700, 0)];
  const segs = buildTimeline(boxes, true);
  const loop = segs[0];
  assert.ok(dist(loop.pos(0), loop.pos(loop.dur)) < 0.5, 'loop is not closed');
  assert.equal(LAPS, 2);
});

test('busy collapses the journey to the hub box only (no links)', () => {
  const boxes = [box('hub', 0, 0, 256, 700, 0), box('step', 0, 200, 400, 200, 16), box('input', 0, 500, 400, 120, 16)];
  const segs = buildTimeline(boxes, true);
  assert.equal(segs.length, 1, 'busy → single segment');
  assert.ok(!isLink(segs[0].dur), 'busy segment is a loop, not a link');
});

test('the hand-off targets the CLOSEST point on the next box', () => {
  // hub on the left, step to its right: the link should enter the step near its
  // left edge (closest to the hub), not wander to the far side.
  const boxes = [box('hub', 0, 0, 200, 600, 0), box('step', 400, 250, 300, 100, 0)];
  const segs = buildTimeline(boxes, false);
  const link = segs.find((s) => isLink(s.dur))!;
  const entry = link.pos(LINK_DUR);
  assert.ok(near(entry.x, 400, 2), `expected entry near the step's left edge x~400, got ${entry.x}`);
});

test('completed boxes are STILL visited (not skipped); only their loop carries done=true', () => {
  const boxes = [
    box('hub', 0, 0, 256, 700, 0),
    box('step', 0, 200, 400, 200, 16, true), // answered
    box('input', 0, 500, 400, 120, 16),
  ];
  const segs = buildTimeline(boxes, false);
  const loops = segs.filter((s) => s.kind === 'loop');
  assert.equal(loops.length, 3, 'a done box is still traced — one loop per box');
  assert.equal(loops[0].done, false, 'hub loop is never done');
  assert.equal(loops[1].done, true, 'the answered step loop is marked done (green)');
  assert.equal(loops[2].done, false, 'the composer loop is not done (still the finale)');
});

test('the done flag rides ONLY loops — every link is neutral (accent, never green)', () => {
  const boxes = [box('hub', 0, 0, 256, 700, 0, true), box('step', 0, 200, 400, 200, 16, true)];
  const segs = buildTimeline(boxes, false);
  for (const s of segs.filter((x) => x.kind === 'link')) {
    assert.equal(s.done, false, 'links must never be marked done');
  }
  // hub is passed done=true here but collectBoxes forces hub un-done; buildTimeline
  // faithfully carries whatever it is given, so the hub loop reflects the input.
  assert.equal(segs.find((s) => s.kind === 'loop')!.done, true);
});

test('kind matches the duration heuristic used by the other tests', () => {
  const boxes = [box('hub', 0, 0, 256, 700, 0), box('step', 0, 200, 400, 200, 16), box('input', 0, 500, 400, 120, 16)];
  for (const s of buildTimeline(boxes, false)) {
    assert.equal(s.kind === 'link', isLink(s.dur), 'kind and dur must agree');
  }
});

test('orderBoxes: hub first, inputs last, steps by vertical position', () => {
  const ordered = orderBoxes([
    box('input', 0, 900, 10, 10),
    box('step', 0, 300, 10, 10),
    box('step', 0, 100, 10, 10),
    box('hub', 0, 0, 10, 10),
  ]);
  assert.deepEqual(
    ordered.map((b) => b.role),
    ['hub', 'step', 'step', 'input'],
  );
  assert.ok(ordered[1].y < ordered[2].y, 'steps ordered top-to-bottom');
});
