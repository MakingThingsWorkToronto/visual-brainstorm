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
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return; // hidden / collapsed
    const cs = getComputedStyle(el);
    const r = parseFloat(cs.borderTopLeftRadius) || 0;
    // Completed cards are STILL visited — the pulse glows green while circling
    // them instead of skipping. The hub is never "done".
    const done = role !== 'hub' && el.getAttribute('data-guide-done') === 'true';
    out.push({ key: `${role}#${idx}`, role, x: rect.x, y: rect.y, w: rect.width, h: rect.height, r, done });
  });
  return out;
}

const sigOf = (boxes: Box[], busy: boolean) =>
  boxes
    .map((b) => `${b.key}:${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}:${b.done ? 'd' : ''}`)
    .join('|') + `#${busy ? 'b' : ''}`;

export function GuidePulse({ busy, active = true }: { busy: boolean; active?: boolean }) {
  const headRef = useRef<SVGCircleElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  const tailRefs = useRef<SVGCircleElement[]>([]);
  const rootRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!active) return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    let raf = 0;
    let t0 = performance.now();
    let sig = '';
    let keySig = '';
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
        // Re-anchor the clock ONLY when the SET of boxes changes (a card mounts/
        // unmounts, or the hub appears/disappears) — that restructures the
        // timeline, so a fixed t0 would teleport the pulse mid-lap and smear the
        // comet. A pure geometry change (scroll/resize) or a done-flip keeps
        // `total` identical, so the box-following and the green switch stay
        // continuous.
        const nextKeySig = boxes.map((b) => b.key).join(',');
        if (nextKeySig !== keySig) {
          keySig = nextKeySig;
          t0 = now;
          history.length = 0;
        }
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
      let cur: Segment | null = null;
      for (const seg of timeline) {
        if (t < seg.dur) {
          cur = seg;
          break;
        }
        t -= seg.dur;
      }
      // Fall back to the last segment's end on any floating-point spill so the
      // pulse never blinks to the (0,0) corner for a frame.
      const pos: Pt = cur ? cur.pos(t) : timeline[timeline.length - 1].end;
      // Green while circling a completed box; accent everywhere else (incl. flights).
      svg.classList.toggle('is-complete', cur?.kind === 'loop' && cur.done);

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

    // A single GUARDED loop. start() no-ops if a loop is already pending, if the
    // OS asks for reduced motion, or while the tab is hidden — so a mount, a
    // visibility flip, and a reduced-motion change can never stack two rAF loops
    // (which would run the pulse at double speed and leak past unmount).
    const start = () => {
      if (raf || (mq && mq.matches) || document.hidden) return;
      t0 = performance.now();
      history.length = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (rootRef.current) rootRef.current.style.opacity = '0';
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    // Live prefers-reduced-motion: stop when it turns on, resume when it turns
    // off. The effect deps are only [busy, active], so without this listener the
    // pulse would stay frozen after the OS setting flips post-mount.
    const onReduce = () => (mq && mq.matches ? stop() : start());

    document.addEventListener('visibilitychange', onVisibility);
    mq?.addEventListener?.('change', onReduce);
    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      mq?.removeEventListener?.('change', onReduce);
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
