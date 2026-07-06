import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board } from '@visual-brainstorm/protocol';
import { SvgPane } from '../primitives';

type XY = { x: number; y: number };
const CLUSTER_DIST = 22; // percent units — closer than this means "these belong together"

function computeClusters(ids: string[], positions: Record<string, XY>): string[][] {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (a: string): string => {
    let root = a;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = positions[ids[i]];
      const b = positions[ids[j]];
      if (Math.hypot(a.x - b.x, a.y - b.y) < CLUSTER_DIST) {
        parent.set(find(ids[i]), find(ids[j]));
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()];
}

const centroid = (ids: string[], positions: Record<string, XY>): XY => ({
  x: ids.reduce((s, id) => s + positions[id].x, 0) / ids.length,
  y: ids.reduce((s, id) => s + positions[id].y, 0) / ids.length,
});

/**
 * Theory 4 (associative proximity) + Theory 5 (split cognition).
 * The user just DRAGS — distance is the data. Clusters are inferred from
 * proximity (no tags, no labels), and glowing gap ghosts appear in the blank
 * space between clusters: "what lives here?". The scaffold panel structures
 * everything in the background without ever interrupting the drag flow.
 */
export function ProximityField({
  board,
  positions,
  gapNotes,
  onPositions,
  onClusters,
  onGapNotes,
}: {
  board: Board;
  positions: Record<string, XY>;
  gapNotes: { between: [number, number]; note: string }[];
  onPositions: (positions: Record<string, XY>) => void;
  onClusters: (clusters: string[][]) => void;
  onGapNotes: (notes: { between: [number, number]; note: string }[]) => void;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  const [gapPrompt, setGapPrompt] = useState<[number, number] | null>(null);
  const [gapText, setGapText] = useState('');

  const ids = board.options.map((o) => o.id);
  const positionsKey = JSON.stringify(positions);
  const clusters = useMemo(
    () => computeClusters(ids, positions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positionsKey],
  );
  useEffect(() => {
    onClusters(clusters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters]);

  const multi = clusters.filter((c) => c.length >= 1);
  const gaps: { between: [number, number]; at: XY }[] = [];
  if (multi.length >= 2) {
    const pairs: { i: number; j: number; d: number; at: XY }[] = [];
    for (let i = 0; i < multi.length; i++) {
      for (let j = i + 1; j < multi.length; j++) {
        const a = centroid(multi[i], positions);
        const b = centroid(multi[j], positions);
        pairs.push({
          i,
          j,
          d: Math.hypot(a.x - b.x, a.y - b.y),
          at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    for (const pair of pairs.slice(0, 3)) {
      gaps.push({ between: [pair.i, pair.j], at: pair.at });
    }
  }

  const clusterIndexOf = (id: string) => clusters.findIndex((c) => c.includes(id));
  const RING_COLORS = ['#a855f7', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

  const move = (id: string, clientX: number, clientY: number) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    onPositions({
      ...positions,
      [id]: {
        x: Math.min(96, Math.max(4, ((clientX - rect.left) / rect.width) * 100)),
        y: Math.min(92, Math.max(6, ((clientY - rect.top) / rect.height) * 100)),
      },
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <div
        ref={fieldRef}
        className="relative h-[28rem] touch-none overflow-hidden rounded-2xl border border-line bg-surface"
        style={{
          backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {gaps.map((gap) => {
          const existing = gapNotes.find(
            (n) => n.between[0] === gap.between[0] && n.between[1] === gap.between[1],
          );
          return (
            <button
              key={`${gap.between[0]}-${gap.between[1]}`}
              type="button"
              onClick={() => {
                setGapPrompt(gap.between);
                setGapText(existing?.note ?? '');
              }}
              title="The blank space between clusters — what lives here?"
              className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-pulse items-center justify-center rounded-full border-2 border-dashed text-sm ${
                existing ? 'border-accent bg-accent/20 text-accent' : 'border-ink-dim/50 text-ink-dim'
              }`}
              style={{ left: `${gap.at.x}%`, top: `${gap.at.y}%` }}
            >
              ?
            </button>
          );
        })}
        {board.options.map((option) => {
          const pos = positions[option.id] ?? { x: 50, y: 50 };
          const ci = clusterIndexOf(option.id);
          const solo = clusters[ci]?.length === 1;
          return (
            <div
              key={option.id}
              className="absolute w-20 -translate-x-1/2 -translate-y-1/2 cursor-grab select-none active:cursor-grabbing"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              onPointerDown={(e) => {
                dragging.current = option.id;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (dragging.current === option.id) move(option.id, e.clientX, e.clientY);
              }}
              onPointerUp={() => (dragging.current = null)}
            >
              <div
                className="rounded-xl border-2 bg-surface p-1.5 shadow-sm"
                style={{ borderColor: solo ? 'var(--line)' : RING_COLORS[ci % RING_COLORS.length] }}
              >
                <div className="aspect-square text-ink">
                  <SvgPane svg={option.svg} className="h-full w-full" />
                </div>
              </div>
              <div className="mt-0.5 truncate text-center text-[10px] text-ink-dim">
                {option.label}
              </div>
            </div>
          );
        })}
        {gapPrompt && (
          <div className="absolute inset-x-4 bottom-4 rounded-xl border border-accent bg-surface p-3 shadow-xl">
            <div className="text-xs font-medium">
              What lives between cluster {gapPrompt[0] + 1} and cluster {gapPrompt[1] + 1}?
            </div>
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                value={gapText}
                onChange={(e) => setGapText(e.target.value)}
                className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
                placeholder="a hybrid? a missing idea? name the ghost…"
              />
              <button
                type="button"
                className="rounded-lg bg-accent px-3 text-xs font-medium text-white"
                onClick={() => {
                  onGapNotes([
                    ...gapNotes.filter(
                      (n) => !(n.between[0] === gapPrompt[0] && n.between[1] === gapPrompt[1]),
                    ),
                    ...(gapText.trim() ? [{ between: gapPrompt, note: gapText.trim() }] : []),
                  ]);
                  setGapPrompt(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Theory 5: the scaffold — organizes in the background, never interrupts */}
      <aside className="rounded-2xl border border-line bg-surface-2 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-dim">
          Scaffold (auto)
        </div>
        <div className="mt-2 space-y-2">
          {clusters.map((cluster, i) => {
            const options = cluster.map((id) => board.options.find((o) => o.id === id)!);
            const sharedTags = options
              .map((o) => o.tags)
              .reduce((a, b) => a.filter((t) => b.includes(t)));
            return (
              <div key={i} className="rounded-lg border border-line bg-surface p-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: RING_COLORS[i % RING_COLORS.length] }}
                  />
                  {cluster.length === 1
                    ? 'outlier'
                    : sharedTags[0]
                      ? `“${sharedTags[0]}”`
                      : `cluster ${i + 1}`}
                </div>
                <div className="mt-1 text-[11px] leading-snug text-ink-dim">
                  {options.map((o) => o.label).join(' · ')}
                </div>
              </div>
            );
          })}
          {gapNotes.length > 0 && (
            <div className="rounded-lg border border-dashed border-accent/50 p-2 text-[11px] text-ink-dim">
              {gapNotes.map((n, i) => (
                <div key={i}>✦ {n.note}</div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
