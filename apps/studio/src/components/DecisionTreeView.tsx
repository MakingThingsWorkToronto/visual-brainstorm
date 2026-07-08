import { BodyPortal, SvgPane } from './primitives';

/**
 * The decision-tree overlay: a per-discussion visual of HOW the brainstorm
 * decided (chosen ✓ / rejected ✕ / action / mind-map explode·delete·note ops).
 * The SVG is built deterministically on the server (apps/mcp/src/decision-tree.ts)
 * and fetched from GET /api/decision-tree/:id — this component only renders it +
 * a legend, so it stays honest (nothing regenerated client-side).
 */

const LEGEND: { label: string; swatch: string }[] = [
  { label: 'round', swatch: '#6366f1' },
  { label: 'chosen', swatch: '#10b981' },
  { label: 'rejected', swatch: '#cbd5e1' },
  { label: 'explode / +ideas', swatch: '#f59e0b' },
  { label: 'deleted', swatch: '#ef4444' },
  { label: 'note / edit', swatch: '#a855f7' },
];

export function DecisionTreeView({
  title,
  svg,
  onClose,
}: {
  title: string;
  /** Server-rendered decision-tree SVG, or null while loading / on error. */
  svg: string | null;
  onClose: () => void;
}) {
  return (
    <BodyPortal>
      <div
        data-testid="decision-tree-view"
        className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4"
      >
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink">Decision tree</div>
              <div className="truncate text-xs text-ink-dim">{title}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {LEGEND.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-dim">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.swatch }} />
                  {item.label}
                </span>
              ))}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line px-3 py-1 text-xs hover:border-accent"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-canvas p-4">
            {svg ? (
              <SvgPane svg={svg} className="min-h-full min-w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink-dim">
                building the decision tree…
              </div>
            )}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
