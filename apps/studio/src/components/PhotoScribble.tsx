import { useEffect, useRef, useState } from 'react';
import type { PaletteColor } from '@visual-brainstorm/protocol';

/**
 * The "Scribble a seed" pad, upgraded to annotate a photo. When a photo is
 * dropped in as the background, the user can draw (pen), drop styled text notes,
 * and point with arrows over it; every tool draws in a color chosen from the
 * current generation palette (per-tool). The composite ships as a self-contained
 * `sketch` seed SVG with the photo embedded as <image> — the sanitizer whitelists
 * data:image/ hrefs (apps/studio/src/lib/sanitize.ts), and the bridge persists the
 * markup verbatim. With no photo it degrades to the original plain scribble.
 */

const VIEW_W = 400;
const VIEW_H = 240;
/** Concrete accent hex used when no palette is selected — the seed file is standalone (no CSS vars). */
export const DEFAULT_INK = '#A855F7';

type Pt = { x: number; y: number };
export type Stroke = { color: string; points: Pt[] };
export type Arrow = { color: string; from: Pt; to: Pt };
export type Note = { color: string; at: Pt; text: string };
type Tool = 'pen' | 'text' | 'arrow';

export interface ScribbleContent {
  photo: string | null;
  strokes: Stroke[];
  arrows: Arrow[];
  notes: Note[];
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Arrowhead triangle: tip at `to`, base a fixed length back along the shaft. */
export function arrowHead(from: Pt, to: Pt): Pt[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const L = 14; // head length
  const W = 7; // half base width
  const bx = to.x - ux * L;
  const by = to.y - uy * L;
  const px = -uy; // perpendicular unit
  const py = ux;
  return [
    { x: to.x, y: to.y },
    { x: bx + px * W, y: by + py * W },
    { x: bx - px * W, y: by - py * W },
  ];
}

/** A text note's card box, sized from its text (single line, no wrapping). */
export function noteBox(note: Note): { x: number; y: number; w: number; h: number } {
  const w = Math.min(VIEW_W - 8, Math.max(28, note.text.length * 6.6 + 12));
  const h = 20;
  // Anchor the card so the click point sits at its top-left, clamped into frame.
  const x = Math.max(2, Math.min(VIEW_W - w - 2, note.at.x));
  const y = Math.max(2, Math.min(VIEW_H - h - 2, note.at.y));
  return { x, y, w, h };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Compose the annotated pad into one self-contained seed SVG. Z-order: photo,
 * pen strokes, arrows, text notes. Returns null when there is nothing to seed
 * (no annotations) — a bare photo is already carried as an attachment.
 */
export function composeSeedSvg(content: ScribbleContent): string | null {
  const { photo, strokes, arrows, notes } = content;
  const drawn = strokes.filter((s) => s.points.length > 1);
  if (drawn.length === 0 && arrows.length === 0 && notes.length === 0) return null;

  const parts: string[] = [];
  if (photo) {
    parts.push(
      `<image href="${photo}" x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  }
  for (const s of drawn) {
    const pts = s.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
    parts.push(
      `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  for (const a of arrows) {
    const head = arrowHead(a.from, a.to)
      .map((p) => `${round(p.x)},${round(p.y)}`)
      .join(' ');
    parts.push(
      `<line x1="${round(a.from.x)}" y1="${round(a.from.y)}" x2="${round(a.to.x)}" y2="${round(a.to.y)}" stroke="${a.color}" stroke-width="3" stroke-linecap="round"/>` +
        `<polygon points="${head}" fill="${a.color}"/>`,
    );
  }
  for (const n of notes) {
    const b = noteBox(n);
    parts.push(
      `<g>` +
        `<rect x="${round(b.x)}" y="${round(b.y)}" width="${round(b.w)}" height="${b.h}" rx="4" fill="rgba(255,255,255,0.88)" stroke="${n.color}" stroke-width="1.5"/>` +
        `<text x="${round(b.x + 6)}" y="${round(b.y + 14)}" font-family="system-ui, sans-serif" font-size="12" fill="${n.color}">${esc(n.text)}</text>` +
        `</g>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}">${parts.join('')}</svg>`;
}

/**
 * The offer shown when an image lands in the composer: open it in the scribble
 * pad as a background to mark up, or leave it as a plain attachment.
 */
export function PhotoOfferBanner({
  onAccept,
  onDismiss,
}: {
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      data-testid="scribble-offer"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs"
    >
      <span className="text-ink">Want to scribble on this photo? Draw, add notes or arrows over it.</span>
      <button
        type="button"
        data-testid="scribble-offer-accept"
        onClick={onAccept}
        className="ml-auto rounded-lg bg-accent px-3 py-1 font-semibold text-white hover:brightness-105"
      >
        Scribble a seed
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-lg border border-line px-3 py-1 text-ink-dim hover:text-ink"
      >
        No thanks
      </button>
    </div>
  );
}

function ToolButton({
  active,
  label,
  testId,
  onClick,
}: {
  active: boolean;
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
        active ? 'border-accent bg-accent/15 text-accent' : 'border-line text-ink-dim hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * The annotate-a-photo pad. Owns annotation state, renders the live preview, and
 * emits the composite seed SVG (or null) via onSvgChange on every change.
 */
export function PhotoScribble({
  palette,
  fallbackColor = DEFAULT_INK,
  photo,
  onRemovePhoto,
  onSvgChange,
}: {
  palette: PaletteColor[];
  fallbackColor?: string;
  photo: string | null;
  onRemovePhoto: () => void;
  onSvgChange: (svg: string | null) => void;
}) {
  const swatches: PaletteColor[] =
    palette.length > 0 ? palette : [{ name: 'Accent', value: fallbackColor }];
  const first = swatches[0].value;

  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState(first);
  const [arrowColor, setArrowColor] = useState(first);
  const [textColor, setTextColor] = useState(first);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState<Arrow | null>(null); // arrow being dragged
  const [pending, setPending] = useState<{ at: Pt; text: string } | null>(null); // text popover

  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);

  const activeColor = tool === 'pen' ? penColor : tool === 'arrow' ? arrowColor : textColor;
  const setActiveColor = (c: string) =>
    (tool === 'pen' ? setPenColor : tool === 'arrow' ? setArrowColor : setTextColor)(c);

  // Emit the composite whenever committed content changes (draft/pending excluded).
  useEffect(() => {
    onSvgChange(composeSeedSvg({ photo, strokes, arrows, notes }));
  }, [photo, strokes, arrows, notes, onSvgChange]);

  const point = (e: React.PointerEvent): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((e.clientY - rect.top) / rect.height) * VIEW_H,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (pending) return; // finish the open note first
    const p = point(e);
    // No setPointerCapture: onPointerLeave ends a drag that exits the pad, and
    // capture that isn't implicitly released (some synthetic pointerup paths)
    // would swallow the NEXT tool's pointerdown. The pad is bounded, so capture
    // buys nothing here.
    if (tool === 'pen') {
      drawing.current = true;
      setStrokes((prev) => [...prev, { color: penColor, points: [p] }]);
    } else if (tool === 'arrow') {
      drawing.current = true;
      setDraft({ color: arrowColor, from: p, to: p });
    } else {
      setPending({ at: p, text: '' });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = point(e);
    if (tool === 'pen') {
      setStrokes((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, points: [...last.points, p] };
        return next;
      });
    } else if (tool === 'arrow') {
      // Functional update: a fast flick can fire many moves before the draft's
      // setState renders, so reading `draft` from the closure would drop them.
      setDraft((prev) => (prev ? { ...prev, to: p } : { color: arrowColor, from: p, to: p }));
    }
  };

  const onUp = () => {
    drawing.current = false;
    // Read the freshest draft via the updater so a rapid drag still commits.
    setDraft((d) => {
      if (d) {
        const len = Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y);
        if (len > 6) setArrows((prev) => [...prev, d]);
      }
      return null;
    });
  };

  const commitNote = () => {
    if (pending && pending.text.trim()) {
      setNotes((prev) => [...prev, { color: textColor, at: pending.at, text: pending.text.trim() }]);
    }
    setPending(null);
  };

  const hasContent = strokes.some((s) => s.points.length > 1) || arrows.length > 0 || notes.length > 0;

  const cursor = tool === 'text' ? 'cursor-text' : 'cursor-crosshair';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar: tool select + per-tool palette swatches */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Scribble tools">
          <ToolButton active={tool === 'pen'} label="Pen" testId="scribble-tool-pen" onClick={() => setTool('pen')} />
          <ToolButton active={tool === 'text'} label="Text" testId="scribble-tool-text" onClick={() => setTool('text')} />
          <ToolButton active={tool === 'arrow'} label="Arrow" testId="scribble-tool-arrow" onClick={() => setTool('arrow')} />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Tool color">
          {swatches.map((c) => (
            <button
              key={`${c.value}-${c.name}`}
              type="button"
              data-testid="scribble-swatch"
              onClick={() => setActiveColor(c.value)}
              title={`${c.name} (${c.value})`}
              aria-pressed={activeColor === c.value}
              className={`h-6 w-6 rounded-md border ${
                activeColor === c.value ? 'border-accent ring-2 ring-accent/50' : 'border-line'
              }`}
              style={{ background: c.value }}
            />
          ))}
        </div>
        <div className="ml-auto flex gap-2 text-[11px] text-ink-dim">
          {photo && (
            <button type="button" onClick={onRemovePhoto} className="hover:text-ink">
              remove photo
            </button>
          )}
          {hasContent && (
            <button
              type="button"
              onClick={() => {
                setStrokes([]);
                setArrows([]);
                setNotes([]);
                setPending(null);
                setDraft(null);
              }}
              className="hover:text-ink"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Canvas: relative wrapper so the text popover can position over it */}
      <div className="relative">
        <svg
          ref={svgRef}
          data-testid="scribble-canvas"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className={`h-64 w-full touch-none rounded-xl border border-dashed border-line bg-surface-2 ${cursor}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          {photo && (
            <image
              href={photo}
              x={0}
              y={0}
              width={VIEW_W}
              height={VIEW_H}
              preserveAspectRatio="xMidYMid slice"
            />
          )}
          {strokes.map((s, i) => (
            <polyline
              key={i}
              points={s.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {[...arrows, ...(draft ? [draft] : [])].map((a, i) => (
            <g key={i}>
              <line
                x1={a.from.x}
                y1={a.from.y}
                x2={a.to.x}
                y2={a.to.y}
                stroke={a.color}
                strokeWidth={3}
                strokeLinecap="round"
              />
              <polygon points={arrowHead(a.from, a.to).map((p) => `${p.x},${p.y}`).join(' ')} fill={a.color} />
            </g>
          ))}
          {notes.map((n, i) => {
            const b = noteBox(n);
            return (
              <g key={i}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="rgba(255,255,255,0.88)" stroke={n.color} strokeWidth={1.5} />
                <text x={b.x + 6} y={b.y + 14} fontFamily="system-ui, sans-serif" fontSize={12} fill={n.color}>
                  {n.text}
                </text>
              </g>
            );
          })}
        </svg>

        {pending && (
          <div
            className="absolute z-10 flex items-center gap-1"
            style={{
              left: `${(noteBox({ color: textColor, at: pending.at, text: pending.text || 'note' }).x / VIEW_W) * 100}%`,
              top: `${(pending.at.y / VIEW_H) * 100}%`,
            }}
          >
            <input
              autoFocus
              data-testid="scribble-note-input"
              value={pending.text}
              onChange={(e) => setPending({ ...pending, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNote();
                if (e.key === 'Escape') setPending(null);
              }}
              onBlur={commitNote}
              placeholder="type a note"
              className="rounded-md border border-accent bg-surface px-2 py-1 text-xs text-ink outline-none"
              style={{ borderColor: textColor }}
            />
          </div>
        )}
      </div>

      <div className="mt-2 text-[11px] text-ink-dim">
        {photo
          ? 'Pen draws, Text drops a note, Arrow points — all in the selected color.'
          : 'Draw a quick shape, or attach a photo to mark up.'}
      </div>
    </div>
  );
}
