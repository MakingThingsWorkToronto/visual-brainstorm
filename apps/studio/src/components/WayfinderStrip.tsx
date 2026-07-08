import type { Artifact, Board, RoundRecord } from '@visual-brainstorm/protocol';
import { SvgPane } from './primitives';
import type { PhaseProposal } from '../lib/wayfinder';

/**
 * Wayfinder strip — one strip IS the brainstorm. Round thumbnails narrow left
 * to right (the funnel made physical), keeps hang grabbable beneath (drag a
 * card straight out — no export dialog), and the right end proposes the next
 * phase (Enter accepts it from the composer).
 */
export function WayfinderStrip({
  rounds,
  artifacts,
  pinned = [],
  activeBoard,
  proposal,
  onJump,
  onAdvance,
  onOpenArtifact,
  onDecisionTree,
}: {
  rounds: RoundRecord[];
  artifacts: Artifact[];
  /** Artifacts pinned to the thread (session.json) — a dedicated row below the strip. */
  pinned?: Artifact[];
  activeBoard: Board | null;
  proposal: PhaseProposal | null;
  onJump: (boardId: string) => void;
  onAdvance: () => void;
  /** When provided, clicking a keep opens the artifact chat instead of downloading (drag-out still exports). */
  onOpenArtifact?: (artifact: Artifact) => void;
  /** Opens the per-discussion decision-tree overlay (the visual decision record). */
  onDecisionTree?: () => void;
}) {
  if (rounds.length === 0) return null;
  const keeps = artifacts.slice(-6);
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
          rounds
        </span>
        {rounds.map((record, i) => {
          const size = Math.max(30, 46 - i * 4); // the strip narrows toward the winner
          const isActive = activeBoard?.id === record.board.id;
          return (
            <button
              key={record.board.id}
              type="button"
              onClick={() => onJump(record.board.id)}
              title={`Round ${record.board.round} · ${record.board.phase}: jump back to it`}
              className={`shrink-0 rounded-lg border p-1 transition-colors ${
                isActive ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:border-accent'
              }`}
              style={{ width: size, height: size }}
            >
              <SvgPane svg={record.board.options[0]?.svg ?? '<svg/>'} className="h-full w-full text-ink" />
            </button>
          );
        })}

        {keeps.length > 0 && (
          <>
            <span className="ml-3 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
              keeps, drag out
            </span>
            {keeps.map((artifact) => (
              <a
                key={artifact.slug}
                href={`/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg`}
                download={`${artifact.slug}.svg`}
                draggable
                onDragStart={(e) => {
                  // Chrome: dragging out of the window drops a real .svg file.
                  const url = `${location.origin}/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg`;
                  e.dataTransfer.setData('DownloadURL', `image/svg+xml:${artifact.slug}.svg:${url}`);
                  e.dataTransfer.setData('text/uri-list', url);
                }}
                onClick={(e) => {
                  if (onOpenArtifact) {
                    e.preventDefault();
                    onOpenArtifact(artifact);
                  }
                }}
                title={
                  onOpenArtifact
                    ? `${artifact.name}: click to enlarge and chat about it; drag into your editor to export`
                    : `${artifact.name}: drag into your editor or click to download; no export dialog`
                }
                className="shrink-0 cursor-grab rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs hover:border-accent active:cursor-grabbing"
              >
                {artifact.slug.slice(0, 18)}
              </a>
            ))}
          </>
        )}

        {onDecisionTree && (
          <button
            type="button"
            data-testid="decision-tree-toggle"
            onClick={onDecisionTree}
            title="See how this discussion decided — the decision tree across every round"
            className={`shrink-0 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-dim hover:border-accent hover:text-ink ${
              proposal && activeBoard ? '' : 'ml-auto'
            }`}
          >
            🌳 decision tree
          </button>
        )}

        {proposal && activeBoard && (
          <button
            type="button"
            onClick={onAdvance}
            title={`${proposal.reason}. Or press Enter in the composer once you've judged.`}
            className="ml-auto shrink-0 animate-pulse rounded-full border-2 border-accent bg-accent/10 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
          >
            next: {proposal.phase}
          </button>
        )}
      </div>

      {pinned.length > 0 && (
        <div className="mt-2 flex items-center gap-2 overflow-x-auto border-t border-line pt-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
            📌 pinned
          </span>
          {pinned.map((artifact) => (
            <button
              key={artifact.slug}
              type="button"
              onClick={() => onOpenArtifact?.(artifact)}
              title={`${artifact.name}: open fullscreen (notes + chat); unpin from there`}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1 text-xs hover:border-accent"
            >
              <span className="truncate">{artifact.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
