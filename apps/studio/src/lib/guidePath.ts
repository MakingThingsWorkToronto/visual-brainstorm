/**
 * Pure geometry for the wayfinding pulse (GuidePulse.tsx) — no DOM, no React, so
 * it is unit-testable in isolation. The component supplies box rects (read from
 * the DOM) and renders the pulse; ALL of the "where does the pulse go" logic —
 * perimeter tracing, closest-point hand-off between boxes, and the nav→cards→
 * composer→nav sequence — lives here.
 */

export type Role = 'hub' | 'step' | 'input';

export interface Box {
  key: string;
  role: Role;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius (border-radius), clamped to half the shorter side. */
  r: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Poly {
  pts: Pt[];
  cum: number[];
  total: number;
}

export interface Segment {
  dur: number;
  pos: (t: number) => Pt;
  end: Pt;
}

export const LAPS = 2; // laps per box before the pulse jumps to the next
export const LAP_SPEED = 900; // px/sec traced along a border
export const LAP_MIN = 1.4; // clamp per-lap duration so tiny/huge boxes stay legible
export const LAP_MAX = 3.0;
export const LINK_DUR = 0.55; // sec to fly between two boxes
const SAMPLE_STEP = 9; // px between perimeter samples

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Sample a rounded-rect perimeter (clockwise from the top edge) into a closed polyline. */
export function samplePerimeter(b: Box): Poly {
  const r = Math.max(0, Math.min(b.r, Math.min(b.w, b.h) / 2));
  const { x, y, w, h } = b;
  const pts: Pt[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / SAMPLE_STEP));
    for (let i = 0; i < n; i++) pts.push({ x: x1 + ((x2 - x1) * i) / n, y: y1 + ((y2 - y1) * i) / n });
  };
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const len = Math.abs(a1 - a0) * r;
    const n = Math.max(1, Math.round(len / SAMPLE_STEP));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  };
  line(x + r, y, x + w - r, y); // top
  arc(x + w - r, y + r, -Math.PI / 2, 0); // top-right
  line(x + w, y + r, x + w, y + h - r); // right
  arc(x + w - r, y + h - r, 0, Math.PI / 2); // bottom-right
  line(x + w - r, y + h, x + r, y + h); // bottom
  arc(x + r, y + h - r, Math.PI / 2, Math.PI); // bottom-left
  line(x, y + h - r, x, y + r); // left
  arc(x + r, y + r, Math.PI, Math.PI * 1.5); // top-left
  const cum = [0];
  let total = 0;
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b2 = pts[i % pts.length];
    total += Math.hypot(b2.x - a.x, b2.y - a.y);
    cum.push(total);
  }
  return { pts, cum, total };
}

/** Point at arc-length L along a closed polyline (wraps). */
export function atLength(poly: Poly, L: number): Pt {
  const { pts, cum, total } = poly;
  if (total === 0) return pts[0] ?? { x: 0, y: 0 };
  L = ((L % total) + total) % total;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < L) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (L - cum[i - 1]) / seg;
  const a = pts[(i - 1) % pts.length];
  const b = pts[i % pts.length];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Arc-length offset of the perimeter point closest to p. */
export function nearestLength(poly: Poly, p: Pt): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < poly.pts.length; i++) {
    const d = (poly.pts[i].x - p.x) ** 2 + (poly.pts[i].y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return poly.cum[best];
}

/** hub first, then steps and inputs in visual (top-to-bottom, then left) order. */
export function orderBoxes(boxes: Box[]): Box[] {
  const rank: Record<Role, number> = { hub: 0, step: 1, input: 2 };
  return [...boxes].sort((a, b) => rank[a.role] - rank[b.role] || a.y - b.y || a.x - b.x);
}

/**
 * Build the full pulse journey: for each box in sequence, fly (a straight link)
 * to the point on its border closest to where we left the previous box, then
 * trace it for LAPS laps. `busy` collapses the journey to the hub box only.
 */
export function buildTimeline(boxes: Box[], busy: boolean): Segment[] {
  const seq = busy ? boxes.filter((b) => b.role === 'hub') : orderBoxes(boxes);
  if (seq.length === 0) return [];
  const polys = seq.map(samplePerimeter);
  const segments: Segment[] = [];
  let prev: Pt | null = null;
  let firstStart: Pt | null = null;
  for (let i = 0; i < seq.length; i++) {
    const poly = polys[i];
    // Enter at the point closest to where we left the previous box; the very
    // first box (nav) starts at its top edge.
    const startL = prev
      ? nearestLength(poly, prev)
      : nearestLength(poly, { x: seq[i].x + seq[i].w / 2, y: seq[i].y });
    const startPt = atLength(poly, startL);
    if (i === 0) firstStart = startPt;
    if (prev && Math.hypot(startPt.x - prev.x, startPt.y - prev.y) > 2) {
      const a = prev;
      segments.push({ dur: LINK_DUR, pos: (t) => lerp(a, startPt, ease(t / LINK_DUR)), end: startPt });
    }
    const lapDur = clamp(poly.total / LAP_SPEED, LAP_MIN, LAP_MAX);
    const loopDur = lapDur * LAPS;
    segments.push({
      dur: loopDur,
      pos: (t) => atLength(poly, startL + (t / loopDur) * poly.total * LAPS),
      end: startPt,
    });
    prev = startPt;
  }
  // Close the loop: fly from the last box back to the nav's start point.
  if (!busy && prev && firstStart && Math.hypot(prev.x - firstStart.x, prev.y - firstStart.y) > 2) {
    const a = prev;
    const b = firstStart;
    segments.push({ dur: LINK_DUR, pos: (t) => lerp(a, b, ease(t / LINK_DUR)), end: b });
  }
  return segments;
}
