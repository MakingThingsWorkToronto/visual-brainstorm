import type { Artifact, Board, PendingReplacement, RoundRecord } from '@visual-brainstorm/protocol';
import { SvgPane } from './primitives';
import type { PhaseProposal } from '../lib/wayfinder';

/** One shelf slot: a live artifact, or a killed slot whose replacement is generating. */
type ShelfSlot =
  | { kind: 'artifact'; artifact: Artifact }
  | { kind: 'pending'; pending: PendingReplacement };

/**
 * The shelf's slot model: killed artifacts vanish from their slot — the slot
 * shows the landed replacement (chains follow replacedBy), or a live
 * placeholder while one is generating, or collapses when neither exists.
 * Replacements render in the slot they fill, never as an extra entry.
 */
export function shelfSlots(
  artifacts: Artifact[],
  pendingReplacements: PendingReplacement[],
): ShelfSlot[] {
  const bySlug = new Map(artifacts.map((a) => [a.slug, a]));
  const slots: ShelfSlot[] = [];
  for (const artifact of artifacts) {
    // A replacement renders inside the slot it fills (reached via the killed
    // artifact's replacedBy chain), never as its own extra entry — unless its
    // killed ancestor is gone from the list (orphan → show it plainly).
    if (artifact.provenance.replaces && bySlug.has(artifact.provenance.replaces)) continue;
    let current: Artifact | undefined = artifact;
    // Follow the replacement chain out of a killed slot.
    while (current && current.verdict === 'kill' && current.replacedBy) {
      current = bySlug.get(current.replacedBy);
    }
    if (!current) continue;
    if (current.verdict === 'kill') {
      const pending = pendingReplacements.find((p) => p.replacesSlug === current!.slug);
      if (pending) slots.push({ kind: 'pending', pending });
      continue; // killed with nothing in flight — the slot collapses
    }
    slots.push({ kind: 'artifact', artifact: current });
  }
  return slots;
}

/**
 * Wayfinder strip — one strip IS the brainstorm. Round thumbnails narrow left
 * to right (the funnel made physical), keeps hang grabbable beneath (drag a
 * card straight out — no export dialog), and the right end proposes the next
 * phase (Enter accepts it from the composer).
 */
export function WayfinderStrip({
  rounds,
  artifacts,
  pendingReplacements = [],
  pinned = [],
  activeBoard,
  proposal,
  hasIntake = false,
  onIntake,
  onJump,
  onAdvance,
  onOpenArtifact,
  onDecisionTree,
}: {
  rounds: RoundRecord[];
  artifacts: Artifact[];
  /** Kill-verdict replacements still generating — each renders a live placeholder in its slot. */
  pendingReplacements?: PendingReplacement[];
  /** Artifacts pinned to the thread (session.json) — a dedicated row below the strip. */
  pinned?: Artifact[];
  activeBoard: Board | null;
  proposal: PhaseProposal | null;
  /** True once the thread has intake history (brief/concierge) — shows the 🌱 chip. */
  hasIntake?: boolean;
  /** Jump back to the intake history — ALWAYS the strip's first slot. */
  onIntake?: () => void;
  onJump: (boardId: string) => void;
  onAdvance: () => void;
  /** When provided, clicking a keep opens the artifact chat instead of downloading (drag-out still exports). */
  onOpenArtifact?: (artifact: Artifact) => void;
  /** Opens the per-discussion decision-tree overlay (the visual decision record). */
  onDecisionTree?: () => void;
}) {
  if (rounds.length === 0 && !hasIntake) return null;
  const keeps = shelfSlots(artifacts, pendingReplacements).slice(-6);
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        {hasIntake && onIntake && (
          <button
            type="button"
            data-testid="intake-chip"
            onClick={onIntake}
            title="Back to the start — your brief and intake answers; revise the brief from there"
            className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-dim hover:border-accent hover:text-ink"
          >
            🌱 brief
          </button>
        )}
        {rounds.length > 0 && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
            rounds
          </span>
        )}
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
            {keeps.map((slot) =>
              slot.kind === 'pending' ? (
                <span
                  key={`pending-${slot.pending.replacesSlug}`}
                  data-testid="pending-replacement"
                  title={`Replacement generating${slot.pending.note ? ` — "${slot.pending.note}"` : ''} (killed: ${slot.pending.replacesSlug})`}
                  className="shimmer shrink-0 rounded-lg border border-dashed border-accent/60 bg-accent/10 px-2 py-1 text-xs text-ink-dim"
                >
                  ↻ replacing…
                </span>
              ) : (
                <a
                  key={slot.artifact.slug}
                  href={`/api/artifact-svg/${encodeURIComponent(slot.artifact.slug)}.svg`}
                  download={`${slot.artifact.slug}.svg`}
                  draggable
                  onDragStart={(e) => {
                    // Chrome: dragging out of the window drops a real .svg file.
                    const url = `${location.origin}/api/artifact-svg/${encodeURIComponent(slot.artifact.slug)}.svg`;
                    e.dataTransfer.setData('DownloadURL', `image/svg+xml:${slot.artifact.slug}.svg:${url}`);
                    e.dataTransfer.setData('text/uri-list', url);
                  }}
                  onClick={(e) => {
                    if (onOpenArtifact) {
                      e.preventDefault();
                      onOpenArtifact(slot.artifact);
                    }
                  }}
                  title={
                    onOpenArtifact
                      ? `${slot.artifact.name}: click to enlarge and chat about it; drag into your editor to export`
                      : `${slot.artifact.name}: drag into your editor or click to download; no export dialog`
                  }
                  className={`shrink-0 cursor-grab rounded-lg border px-2 py-1 text-xs hover:border-accent active:cursor-grabbing ${
                    slot.artifact.verdict === 'keep'
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-line bg-surface-2'
                  }`}
                >
                  {slot.artifact.verdict === 'keep' && <span title="kept">✓ </span>}
                  {slot.artifact.slug.slice(0, 18)}
                </a>
              ),
            )}
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
