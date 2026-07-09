import { useEffect, useRef, useState } from 'react';
import type { PaletteColor, ScribbleAnnotations } from '@visual-brainstorm/protocol';
import { BodyPortal } from './primitives';

/**
 * The "Scribble a seed" pad — annotate a photo (or a blank canvas). With a photo
 * background the user marks it up with Pen, Highlighter, Arrow, Box, and Text-note
 * tools, each inked from the current generation palette (per-tool color). The pad
 * emits three things the model can actually USE:
 *   - a self-contained SVG (composeSeedSvg) — the editable composite markup,
 *   - a structured annotation list (toScribbleAnnotations) — traversable JSON,
 *   - and, rendered by the parent on send, a raster composite PNG
 *     (renderCompositePng) that is VISION-readable (an SVG read as text is not).
 * The bridge persists all three into a .seeds/seed-<stamp>/ folder the orchestrator
 * reads via /read-scribble to anchor the brainstorm. The sanitizer whitelists
 * data:image/ hrefs + <rect>/<polygon>/<text> (apps/studio/src/lib/sanitize.ts).
 */

const VIEW_W = 400;
const DEFAULT_VIEW_H = 240;
/** Concrete accent hex used when no palette is selected — the seed file is standalone (no CSS vars). */
export const DEFAULT_INK = '#A855F7';
/** The app's sans stack — notes render "in the styles" and rasterize the same. No
 *  quoted family names: an inner " would close the SVG font-family="…" attribute and
 *  malform the composite SVG (breaking the PNG rasterization). */
const NOTE_FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const HIGHLIGHTER_WIDTH = 14;
const PEN_WIDTH = 3;

type Pt = { x: number; y: number };
type StrokeKind = 'pen' | 'highlighter';
type Tool = StrokeKind | 'arrow' | 'box' | 'text';

export type Annotation =
  | { type: 'pen'; color: string; points: Pt[] }
  | { type: 'highlighter'; color: string; points: Pt[] }
  | { type: 'arrow'; color: string; from: Pt; to: Pt }
  | { type: 'box'; color: string; from: Pt; to: Pt }
  | { type: 'note'; color: string; at: Pt; text: string };

export interface ScribbleContent {
  photo: string | null;
  viewW: number;
  viewH: number;
  annotations: Annotation[];
}

const round = (n: number) => Math.round(n * 10) / 10;
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A committed stroke has real length; a stray tap (<2 points) never seeds. */
function isDrawn(a: Annotation): boolean {
  if (a.type === 'pen' || a.type === 'highlighter') return a.points.length > 1;
  return true; // arrows/boxes/notes are only committed when substantive
}

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

/** A box's normalized rect (min corner + positive size), clamped into frame. */
export function boxRect(from: Pt, to: Pt): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    w: Math.abs(to.x - from.x),
    h: Math.abs(to.y - from.y),
  };
}

/** A text note's card box, sized from its text (single line), clamped into frame. */
export function noteBox(at: Pt, text: string, viewW = VIEW_W, viewH = DEFAULT_VIEW_H): { x: number; y: number; w: number; h: number } {
  const w = Math.min(viewW - 8, Math.max(28, text.length * 6.6 + 12));
  const h = 20;
  const x = Math.max(2, Math.min(viewW - w - 2, at.x));
  const y = Math.max(2, Math.min(viewH - h - 2, at.y));
  return { x, y, w, h };
}

/**
 * Compose the annotated pad into one self-contained seed SVG, marks in draw
 * order (which is z-order: photo first, then each annotation front-to-back).
 * Returns null when there is nothing to seed.
 */
export function composeSeedSvg(content: ScribbleContent): string | null {
  const { photo, viewW, viewH, annotations } = content;
  const marks = annotations.filter(isDrawn);
  if (marks.length === 0) return null;

  const parts: string[] = [];
  if (photo) {
    parts.push(
      `<image href="${photo}" x="0" y="0" width="${viewW}" height="${viewH}" preserveAspectRatio="none"/>`,
    );
  }
  for (const a of marks) {
    if (a.type === 'pen' || a.type === 'highlighter') {
      const pts = a.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
      const w = a.type === 'highlighter' ? HIGHLIGHTER_WIDTH : PEN_WIDTH;
      const op = a.type === 'highlighter' ? ' stroke-opacity="0.35"' : '';
      parts.push(
        `<polyline points="${pts}" fill="none" stroke="${a.color}" stroke-width="${w}"${op} stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    } else if (a.type === 'arrow') {
      const head = arrowHead(a.from, a.to).map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
      parts.push(
        `<line x1="${round(a.from.x)}" y1="${round(a.from.y)}" x2="${round(a.to.x)}" y2="${round(a.to.y)}" stroke="${a.color}" stroke-width="3" stroke-linecap="round"/>` +
          `<polygon points="${head}" fill="${a.color}"/>`,
      );
    } else if (a.type === 'box') {
      const r = boxRect(a.from, a.to);
      parts.push(
        `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.w)}" height="${round(r.h)}" rx="3" fill="${a.color}" fill-opacity="0.12" stroke="${a.color}" stroke-width="2.5"/>`,
      );
    } else {
      const b = noteBox(a.at, a.text, viewW, viewH);
      parts.push(
        `<g>` +
          `<rect x="${round(b.x)}" y="${round(b.y)}" width="${round(b.w)}" height="${b.h}" rx="4" fill="rgba(255,255,255,0.9)" stroke="${a.color}" stroke-width="1.5"/>` +
          `<text x="${round(b.x + 6)}" y="${round(b.y + 14)}" font-family="${NOTE_FONT}" font-size="12" fill="${a.color}">${esc(a.text)}</text>` +
          `</g>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}">${parts.join('')}</svg>`;
}

/**
 * The structured, model-legible export (scribble.json). Resolves each mark's ink
 * to its palette color NAME so the model can refer to marks the way the user
 * would ("the ultraviolet arrow"). Coordinates stay in viewBox space.
 */
export function toScribbleAnnotations(content: ScribbleContent, palette: PaletteColor[]): ScribbleAnnotations {
  const nameOf = (value: string): string => {
    const hit = palette.find((c) => c.value.toLowerCase() === value.toLowerCase());
    return hit ? hit.name : 'accent';
  };
  const items = content.annotations.filter(isDrawn).map((a) => {
    const base = { type: a.type, colorName: nameOf(a.color), colorValue: a.color };
    if (a.type === 'pen' || a.type === 'highlighter') {
      return { ...base, points: a.points.map((p) => ({ x: round(p.x), y: round(p.y) })) };
    }
    if (a.type === 'arrow' || a.type === 'box') {
      return { ...base, from: { x: round(a.from.x), y: round(a.from.y) }, to: { x: round(a.to.x), y: round(a.to.y) } };
    }
    return { ...base, at: { x: round(a.at.x), y: round(a.at.y) }, text: a.text };
  });
  return {
    viewBox: { w: content.viewW, h: content.viewH },
    background: { present: content.photo !== null },
    palette: palette.map((c) => ({ name: c.name, value: c.value })),
    items,
  };
}

/**
 * Rasterize the annotated SVG to a VISION-readable composite PNG data URI, via a
 * canvas (mirrors composer.tsx's CameraModal). The SVG's embedded photo is a
 * same-origin data: URI, so the canvas is not tainted and toDataURL succeeds.
 * Rejects honestly on load/context failure so the caller can ship without it.
 */
export function renderCompositePng(svg: string, viewW: number, viewH: number, scale = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewW * scale);
        canvas.height = Math.round(viewH * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('no 2d canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => reject(new Error('composite SVG failed to load into an image'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
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
      <span className="text-ink">Want to scribble on this photo? Circle, highlight, point, and note over it.</span>
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

const TOOLS: { tool: Tool; label: string; testId: string }[] = [
  { tool: 'pen', label: 'Pen', testId: 'scribble-tool-pen' },
  { tool: 'highlighter', label: 'Highlighter', testId: 'scribble-tool-highlighter' },
  { tool: 'arrow', label: 'Arrow', testId: 'scribble-tool-arrow' },
  { tool: 'box', label: 'Box', testId: 'scribble-tool-box' },
  { tool: 'text', label: 'Text', testId: 'scribble-tool-text' },
];

/**
 * The annotate-a-photo pad. Owns the ordered annotation list, renders the live
 * preview, and emits the full ScribbleContent (or null when empty) via onChange —
 * the parent turns it into the enriched sketch seed on send.
 */
export function PhotoScribble({
  palette,
  fallbackColor = DEFAULT_INK,
  photo,
  onRemovePhoto,
  onChange,
}: {
  palette: PaletteColor[];
  fallbackColor?: string;
  photo: string | null;
  onRemovePhoto: () => void;
  onChange: (content: ScribbleContent | null) => void;
}) {
  const swatches: PaletteColor[] =
    palette.length > 0 ? palette : [{ name: 'Accent', value: fallbackColor }];
  const first = swatches[0].value;

  const [tool, setTool] = useState<Tool>('pen');
  const [toolColor, setToolColor] = useState<Record<Tool, string>>({
    pen: first,
    highlighter: first,
    arrow: first,
    box: first,
    text: first,
  });
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null); // arrow/box being dragged
  const [pending, setPending] = useState<{ at: Pt; text: string } | null>(null); // note popover
  const [viewH, setViewH] = useState(DEFAULT_VIEW_H);
  const [maximized, setMaximized] = useState(false); // fullscreen input view (no chat — input only)

  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);

  const activeColor = toolColor[tool];
  const setActiveColor = (c: string) => setToolColor((prev) => ({ ...prev, [tool]: c }));

  // Match the pad's aspect to the photo so it renders undistorted (box-aspect ==
  // viewBox-aspect, with preserveAspectRatio="none" the mapping stays linear).
  useEffect(() => {
    if (!photo) {
      setViewH(DEFAULT_VIEW_H);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        const h = Math.round((VIEW_W * img.naturalHeight) / img.naturalWidth);
        setViewH(Math.max(150, Math.min(600, h)));
      }
    };
    img.src = photo;
  }, [photo]);

  // Emit the full content (or null) whenever committed marks change.
  useEffect(() => {
    const content: ScribbleContent = { photo, viewW: VIEW_W, viewH, annotations };
    onChange(annotations.some(isDrawn) ? content : null);
  }, [photo, viewH, annotations, onChange]);

  const point = (e: React.PointerEvent): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((e.clientY - rect.top) / rect.height) * viewH,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (pending) return; // finish the open note first
    const p = point(e);
    const color = toolColor[tool];
    if (tool === 'pen' || tool === 'highlighter') {
      drawing.current = true;
      // tool is narrowed to 'pen' | 'highlighter' here — a sound stroke member.
      setAnnotations((prev) => [...prev, { type: tool, color, points: [p] } as Annotation]);
    } else if (tool === 'arrow' || tool === 'box') {
      drawing.current = true;
      setDraft({ type: tool, color, from: p, to: p });
    } else {
      setPending({ at: p, text: '' });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = point(e);
    if (tool === 'pen' || tool === 'highlighter') {
      setAnnotations((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last && (last.type === 'pen' || last.type === 'highlighter')) {
          next[next.length - 1] = { ...last, points: [...last.points, p] };
        }
        return next;
      });
    } else {
      // arrow/box drag — functional so a fast flick's moves aren't dropped.
      setDraft((prev) => (prev && (prev.type === 'arrow' || prev.type === 'box') ? { ...prev, to: p } : prev));
    }
  };

  const onUp = () => {
    // Drop a stray tap (a <2-point stroke) so it never seeds or lingers in undo.
    if (drawing.current && (tool === 'pen' || tool === 'highlighter')) {
      setAnnotations((prev) => {
        const last = prev[prev.length - 1];
        if (last && (last.type === 'pen' || last.type === 'highlighter') && last.points.length < 2) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    }
    drawing.current = false;
    // Commit a substantive arrow/box (freshest draft via the updater).
    setDraft((d) => {
      if (d && (d.type === 'arrow' || d.type === 'box')) {
        const len = Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y);
        if (len > 6) setAnnotations((prev) => [...prev, d]);
      }
      return null;
    });
  };

  const commitNote = () => {
    if (pending && pending.text.trim()) {
      setAnnotations((prev) => [...prev, { type: 'note', color: toolColor.text, at: pending.at, text: pending.text.trim() }]);
    }
    setPending(null);
  };

  const undoLast = () => {
    setPending(null);
    setDraft(null);
    setAnnotations((prev) => prev.slice(0, -1));
  };
  const clearAll = () => {
    setPending(null);
    setDraft(null);
    setAnnotations([]);
  };

  const hasContent = annotations.some(isDrawn);
  const cursor = tool === 'text' ? 'cursor-text' : 'cursor-crosshair';
  const live = draft ? [...annotations, draft] : annotations;

  const pad = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar: tool select + per-tool palette swatches + undo/clear */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Scribble tools">
          {TOOLS.map((t) => (
            <ToolButton
              key={t.tool}
              active={tool === t.tool}
              label={t.label}
              testId={t.testId}
              onClick={() => setTool(t.tool)}
            />
          ))}
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
        <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-dim">
          {photo && (
            <button type="button" onClick={onRemovePhoto} className="hover:text-ink">
              remove photo
            </button>
          )}
          {hasContent && (
            <button type="button" data-testid="scribble-undo" onClick={undoLast} className="hover:text-ink">
              undo
            </button>
          )}
          {hasContent && (
            <button type="button" onClick={clearAll} className="hover:text-ink">
              clear
            </button>
          )}
          <button
            type="button"
            data-testid="scribble-maximize"
            onClick={() => setMaximized((m) => !m)}
            title={maximized ? 'Exit fullscreen (marks are kept)' : 'Open the pad fullscreen for precise marking'}
            aria-pressed={maximized}
            className="rounded-md border border-line px-2 py-0.5 font-semibold hover:border-accent hover:text-ink"
          >
            {maximized ? 'Minimize' : 'Maximize'}
          </button>
        </div>
      </div>

      {/* Canvas: relative wrapper so the note popover can position over it. The
          aspect-ratio matches the viewBox so a photo renders undistorted. */}
      <div className="relative">
        <svg
          ref={svgRef}
          data-testid="scribble-canvas"
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          preserveAspectRatio="none"
          style={{ aspectRatio: `${VIEW_W} / ${viewH}` }}
          className={`w-full touch-none rounded-xl border border-dashed border-line bg-surface-2 ${maximized ? 'max-h-[78vh]' : 'max-h-[60vh]'} ${cursor}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          {photo && (
            <image href={photo} x={0} y={0} width={VIEW_W} height={viewH} preserveAspectRatio="none" />
          )}
          {live.map((a, i) => {
            if (a.type === 'pen' || a.type === 'highlighter') {
              return (
                <polyline
                  key={i}
                  points={a.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={a.color}
                  strokeOpacity={a.type === 'highlighter' ? 0.35 : 1}
                  strokeWidth={a.type === 'highlighter' ? HIGHLIGHTER_WIDTH : PEN_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            }
            if (a.type === 'arrow') {
              return (
                <g key={i}>
                  <line x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} stroke={a.color} strokeWidth={3} strokeLinecap="round" />
                  <polygon points={arrowHead(a.from, a.to).map((p) => `${p.x},${p.y}`).join(' ')} fill={a.color} />
                </g>
              );
            }
            if (a.type === 'box') {
              const r = boxRect(a.from, a.to);
              return (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={3} fill={a.color} fillOpacity={0.12} stroke={a.color} strokeWidth={2.5} />
              );
            }
            const b = noteBox(a.at, a.text, VIEW_W, viewH);
            return (
              <g key={i}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="rgba(255,255,255,0.9)" stroke={a.color} strokeWidth={1.5} />
                <text x={b.x + 6} y={b.y + 14} fontFamily={NOTE_FONT} fontSize={12} fill={a.color}>
                  {a.text}
                </text>
              </g>
            );
          })}
        </svg>

        {pending && (
          <div
            className="absolute z-10 flex items-center gap-1"
            style={{
              left: `${(noteBox(pending.at, pending.text || 'note', VIEW_W, viewH).x / VIEW_W) * 100}%`,
              top: `${(pending.at.y / viewH) * 100}%`,
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
              className="rounded-md border bg-surface px-2 py-1 text-xs text-ink outline-none"
              style={{ borderColor: toolColor.text, fontFamily: NOTE_FONT }}
            />
          </div>
        )}
      </div>

      <div className="mt-2 text-[11px] text-ink-dim">
        {photo
          ? 'Pen/Highlighter draw · Arrow points · Box circles a region · Text drops a note — all in the selected color.'
          : 'Draw a quick shape, or attach a photo to mark up.'}
      </div>
    </div>
  );

  // Input-only fullscreen: bigger canvas for precise marking, same tools + state.
  // No artifact-chat/capture — a scribble is a seed (input), not a saved artifact.
  if (maximized) {
    return (
      <BodyPortal>
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 sm:p-6" data-testid="scribble-fullscreen">
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col rounded-2xl border border-line bg-surface p-4 shadow-2xl">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-dim">
              Scribble a seed — fullscreen (marks are kept when you minimize)
            </div>
            {pad}
          </div>
        </div>
      </BodyPortal>
    );
  }
  return pad;
}
