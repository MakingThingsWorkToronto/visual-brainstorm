import { useEffect, useRef, useState } from 'react';
import { SvgPane } from './primitives';

/**
 * Full-screen zoomable SVG preview — system-map boards can be dense.
 * Wheel zoom, drag pan, two-pointer pinch (mobile), double-click / ⟲ reset, Esc closes.
 */
export function PreviewModal({
  svg,
  label,
  tags = [],
  note,
  onNoteChange,
  onClose,
}: {
  svg: string;
  label: string;
  tags?: string[];
  /** Current per-option note; editable when onNoteChange is provided (live board only). */
  note?: string;
  onNoteChange?: (note: string) => void;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const clamp = (s: number) => Math.min(24, Math.max(0.2, s));
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm">
      <div className="flex items-center gap-2 p-3 text-white">
        <span className="truncate text-sm font-medium">{label}</span>
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
          >
            {tag}
          </span>
        ))}
        <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <div className="ml-auto flex items-center gap-1">
          {[
            ['−', () => setScale((s) => clamp(s / 1.4))],
            ['+', () => setScale((s) => clamp(s * 1.4))],
            ['⟲', reset],
            ['✕', onClose],
          ].map(([labelBtn, fn]) => (
            <button
              key={labelBtn as string}
              type="button"
              onClick={fn as () => void}
              className="h-9 w-9 rounded-lg bg-white/10 text-base hover:bg-white/20"
            >
              {labelBtn as string}
            </button>
          ))}
        </div>
      </div>
      <div
        className="flex-1 touch-none overflow-hidden"
        style={{ cursor: 'grab' }}
        onDoubleClick={reset}
        onWheel={(e) => setScale((s) => clamp(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
          }
        }}
        onPointerMove={(e) => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          const current = { x: e.clientX, y: e.clientY };
          pointers.current.set(e.pointerId, current);
          if (pointers.current.size === 1) {
            setOffset((o) => ({ x: o.x + current.x - prev.x, y: o.y + current.y - prev.y }));
          } else if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinchDist.current > 0) {
              setScale((s) => clamp((s * dist) / pinchDist.current));
            }
            pinchDist.current = dist;
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          pinchDist.current = 0;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinchDist.current = 0;
        }}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="text-white"
            style={{
              width: 'min(80vw, 80vh)',
              height: 'min(80vw, 80vh)',
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            <SvgPane svg={svg} className="h-full w-full" />
          </div>
        </div>
      </div>
      {onNoteChange && (
        <div className="p-3">
          <textarea
            value={note ?? ''}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={`Notes on "${label}", sent with your response`}
            rows={2}
            className="w-full resize-none rounded-xl border border-white/20 bg-white/10 p-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
          />
        </div>
      )}
    </div>
  );
}
