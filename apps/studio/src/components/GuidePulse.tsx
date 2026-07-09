import { useEffect, useRef } from 'react';
import { buildTimeline, type Box, type Pt, type Role, type Segment } from '../lib/guidePath';

/**
 * GuidePulse — a single glowing pulse that drives the user through the UI by
 * tracing box borders, one box at a time, and flying to the closest point on
 * the next not-yet-completed box (rule 9: one traveling pulse, not per-box
 * conic gradients — those can't cross the gaps between boxes or hand off).
 *
 * Boxes opt in with a `data-guide` attribute:
 *   - `hub`   the nav box — the loop always starts and ends here, and is the
 *             ONLY box circled while a response is pending (`busy`).
 *   - `step`  an actionable card (concierge, gallery, board mechanic). Skipped
 *             once `data-guide-done="true"` (answered / prefilled).
 *   - `input` the composer ("input chat dialog box") — the finale, circled last.
 *
 * The look mimics the existing `.nav-edge-glow` chrome star: a bright core with
 * an accent glow, trailing a short comet. Disabled under prefers-reduced-motion
 * and paused when the tab is hidden. All geometry lives in ../lib/guidePath.
 */

const TAIL = 18; // comet trail length (frames of history)

/** Read the current guide boxes from the DOM (viewport coords; overlay is fixed). */
function collectBoxes(): Box[] {
  const out: Box[] = [];
  const els = document.querySelectorAll<HTMLElement>('[data-guide]');
  els.forEach((el, idx) => {
    const role = el.getAttribute('data-guide') as Role | null;
    if (role !== 'hub' && role !== 'step' && role !== 'input') return;
    if (role !== 'hub' && el.getAttribute('data-guide-done') === 'true') return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return; // hidden / collapsed
    const cs = getComputedStyle(el);
    const r = parseFloat(cs.borderTopLeftRadius) || 0;
    out.push({ key: `${role}#${idx}`, role, x: rect.x, y: rect.y, w: rect.width, h: rect.height, r });
  });
  return out;
}

const sigOf = (boxes: Box[], busy: boolean) =>
  boxes.map((b) => `${b.key}:${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`).join('|') +
  `#${busy ? 'b' : ''}`;

export function GuidePulse({ busy, active = true }: { busy: boolean; active?: boolean }) {
  const headRef = useRef<SVGCircleElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  const tailRefs = useRef<SVGCircleElement[]>([]);
  const rootRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduce?.matches) return;

    let raf = 0;
    let t0 = performance.now();
    let sig = '';
    let timeline: Segment[] = [];
    let total = 0;
    const history: Pt[] = [];

    const rebuild = (boxes: Box[], b: boolean) => {
      timeline = buildTimeline(boxes, b);
      total = timeline.reduce((s, seg) => s + seg.dur, 0);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const boxes = collectBoxes();
      const nextSig = sigOf(boxes, busy);
      if (nextSig !== sig) {
        sig = nextSig;
        rebuild(boxes, busy);
      }
      const svg = rootRef.current;
      if (!svg) return;
      if (total === 0) {
        svg.style.opacity = '0';
        return;
      }
      svg.style.opacity = '1';

      let t = ((now - t0) / 1000) % total;
      let pos: Pt = { x: 0, y: 0 };
      for (const seg of timeline) {
        if (t < seg.dur) {
          pos = seg.pos(t);
          break;
        }
        t -= seg.dur;
      }

      history.unshift(pos);
      if (history.length > TAIL) history.pop();
      if (headRef.current) {
        headRef.current.setAttribute('cx', String(pos.x));
        headRef.current.setAttribute('cy', String(pos.y));
      }
      if (haloRef.current) {
        haloRef.current.setAttribute('cx', String(pos.x));
        haloRef.current.setAttribute('cy', String(pos.y));
      }
      tailRefs.current.forEach((c, i) => {
        const p = history[i + 1];
        if (!c) return;
        if (!p) {
          c.setAttribute('opacity', '0');
          return;
        }
        const k = 1 - i / TAIL;
        c.setAttribute('cx', String(p.x));
        c.setAttribute('cy', String(p.y));
        c.setAttribute('r', String(1 + k * 2.6));
        c.setAttribute('opacity', String(k * 0.5));
      });
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [busy, active]);

  if (!active) return null;

  return (
    <svg
      ref={rootRef}
      className="guide-pulse"
      aria-hidden="true"
      style={{ opacity: 0 }}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      {Array.from({ length: TAIL - 1 }).map((_, i) => (
        <circle
          key={i}
          ref={(el) => {
            if (el) tailRefs.current[i] = el;
          }}
          className="guide-pulse-tail"
          r="2"
          cx="-10"
          cy="-10"
          opacity="0"
        />
      ))}
      <circle ref={haloRef} className="guide-pulse-halo" r="7" cx="-10" cy="-10" />
      <circle ref={headRef} className="guide-pulse-head" r="3.4" cx="-10" cy="-10" />
    </svg>
  );
}
