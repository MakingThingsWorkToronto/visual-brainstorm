import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Board,
  BoardOption,
  BoardResponse,
  MindTree,
  PaletteColor,
  Phase,
  ResponseAction,
  Theme,
  TreeOp,
} from '@visual-brainstorm/protocol';
import { SvgPane } from './primitives';
import { ArtifactFullscreen } from './ArtifactFullscreen';
import { TargetRepoPicker } from './TargetRepoPicker';
import { PalettePicker } from './PalettePicker';
import {
  AttachmentChips,
  CameraModal,
  MicButton,
  cameraAvailable,
  useAttachments,
} from './composer';
import { useVoice } from '../lib/useVoice';
import { PhaseBar } from './phases/PhaseBar';
import { PHASE_GUIDE } from './phases/guide';
import { MutationLab } from './phases/MutationLab';
import { WreckYard } from './phases/WreckYard';
import { TriageGate } from './phases/TriageGate';
import { ProximityField } from './phases/ProximityField';
import { JudgeDeck } from './phases/JudgeDeck';
import { MindmapCanvas } from './MindmapCanvas';
import type { DuelResult } from '../lib/deck';
import type { PhaseProposal } from '../lib/wayfinder';

/** Deterministic scatter for the proximity field's opening state. */
function scatter(board: Board): Record<string, { x: number; y: number }> {
  return Object.fromEntries(
    board.options.map((o, i) => [o.id, { x: 18 + ((i * 37) % 62), y: 16 + ((i * 53) % 64) }]),
  );
}

/**
 * The active board rendered as the phase's interface mechanic + shared composer.
 * The studio physically re-architects per phase (wiki/Product/phase-funnel.md).
 */
export function BoardSurvey({
  board,
  models,
  defaultModel,
  onRespond,
  proposal = null,
  advanceSignal = 0,
  onCommand,
  targetRepo = null,
  themes = [],
  initial,
}: {
  board: Board;
  models: string[];
  defaultModel: string;
  onRespond: (response: BoardResponse) => Promise<void>;
  /** Wayfinder's next-phase suggestion — Enter accepts it once you've judged. */
  proposal?: PhaseProposal | null;
  /** Bumped when the wayfinder pill is clicked — switches the local mechanic. */
  advanceSignal?: number;
  /** Studio command hook for the composer's pop-out menu (discover-skills, plan-closeout). */
  onCommand?: (command: 'plan-closeout' | 'discover-skills') => void;
  /** Current target repo/folder, shown next to Accept. */
  targetRepo?: string | null;
  /** Ingested themes — source of the generation color palettes. */
  themes?: Theme[];
  /**
   * Revisit mode: prefill every visible mechanic from a previously recorded
   * response so the user changes settings instead of re-answering from zero.
   */
  initial?: BoardResponse;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial?.selectedOptionIds ?? []),
  );
  const [notes, setNotes] = useState<Record<string, string>>(initial?.perOptionNotes ?? {});
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  // Full-screen preview — EVERY phase mechanic opens it by clicking an option's SVG
  // (dense system-architecture boards need zoom/pan + notes in context).
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewOption = board.options.find((o) => o.id === previewId) ?? null;
  const onPreview = (option: BoardOption) => setPreviewId(option.id);
  const [remixMarks, setRemixMarks] = useState<string[]>(() => initial?.remixPairs.flat() ?? []);
  const [axisValues, setAxisValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      board.survey.axes.map((a) => [a.id, initial?.axisValues[a.id] ?? a.defaultValue]),
    ),
  );
  const [elaboration, setElaboration] = useState(initial?.elaboration ?? '');
  const [model, setModel] = useState(initial?.model ?? defaultModel);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [genTheme, setGenTheme] = useState<string | null>(null);
  const [paletteColors, setPaletteColors] = useState<PaletteColor[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voice = useVoice((heard) =>
    setElaboration((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard)),
  );
  const intake = useAttachments();
  // User-steerable phase: clicking a tab switches the mechanic locally and is
  // sent back as requestedPhase. All mechanics share the same option data.
  const [localPhase, setLocalPhase] = useState(board.phase);
  // per-phase state
  const [triage, setTriage] = useState<Record<string, 'keep' | 'kill' | 'merge'>>(
    initial?.triage ?? {},
  );
  const [finalId, setFinalId] = useState<string | null>(initial?.finalOptionId ?? null);
  const [mutations, setMutations] = useState<Record<string, string[]>>(initial?.mutations ?? {});
  const [flaws, setFlaws] = useState<Record<string, string>>(initial?.flaws ?? {});
  const [positions, setPositions] = useState(() =>
    initial && Object.keys(initial.positions).length > 0 ? initial.positions : scatter(board),
  );
  const [clusterTouched, setClusterTouched] = useState(false);
  const [clusters, setClusters] = useState<string[][]>(initial?.clusters ?? []);
  const [gapNotes, setGapNotes] = useState<{ between: [number, number]; note: string }[]>(
    initial?.gapNotes ?? [],
  );
  // judge deck (diverge/expand review mode) + sudden-death duels (converge)
  const [reviewMode, setReviewMode] = useState<'grid' | 'deck'>('grid');
  const [deckVerdicts, setDeckVerdicts] = useState<Record<string, 'keep' | 'kill'>>(
    initial?.deckVerdicts ?? {},
  );
  const [deckRanking, setDeckRanking] = useState<string[]>(initial?.ranking ?? []);
  const [duelResults, setDuelResults] = useState<DuelResult[]>([]);
  // Mind-map methodology: a board carries ONE live tree instead of options.
  const isMindmap = board.kind === 'mindmap' && !!board.tree;
  const [editedTree, setEditedTree] = useState<MindTree | undefined>(initial?.editedTree);
  // Mind-map node ops (explode/add/delete/note) accumulate this round; they ship
  // as treeOps and persist to tree-ops.jsonl. editedTree is the SHAPE, ops the INTENT.
  const [treeOps, setTreeOps] = useState<TreeOp[]>(() => initial?.treeOps ?? []);

  const { multiSelect, minSelect, maxSelect } = board.survey;
  const phase = localPhase;
  const dialsMoved = board.survey.axes.filter(
    (axis) => (axisValues[axis.id] ?? axis.defaultValue) !== axis.defaultValue,
  ).length;

  // Gates: the interface physically refuses to move on until the phase's work is done.
  const gate = useMemo((): { ok: boolean; reason: string } => {
    // A mind-map board is always sendable: the tree is presented pre-populated,
    // and "no edits" is itself a valid answer (the presented structure stands).
    if (isMindmap) return { ok: true, reason: '' };
    if (phase === 'converge') {
      const left = board.options.length - board.options.filter((o) => triage[o.id]).length;
      return { ok: left === 0, reason: left === 0 ? '' : `triage ${left} more before the gate opens` };
    }
    if (phase === 'wreck') {
      const needed = Math.min(3, board.options.length);
      const found = Object.values(flaws).filter((f) => f.trim() !== '').length;
      return { ok: found >= needed, reason: found >= needed ? '' : `find ${needed - found} more flaw${needed - found === 1 ? '' : 's'}` };
    }
    if (phase === 'expand') {
      return {
        ok: selected.size >= 1,
        reason: selected.size >= 1 ? '' : 'select at least one option to expand from',
      };
    }
    return { ok: true, reason: '' };
  }, [phase, triage, flaws, selected, board.options]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!multiSelect) next.clear();
        if (maxSelect && next.size >= maxSelect) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const toggleRemix = (id: string) =>
    setRemixMarks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const remixPairs = useMemo(() => {
    const pairs: [string, string][] = [];
    for (let i = 0; i + 1 < remixMarks.length; i += 2) {
      pairs.push([remixMarks[i], remixMarks[i + 1]]);
    }
    return pairs;
  }, [remixMarks]);

  // Deck verdicts drive the synthesis vector: keeps join the selection set.
  const deckVerdict = (id: string, verdict: 'keep' | 'kill') => {
    setDeckVerdicts((prev) => ({ ...prev, [id]: verdict }));
    setSelected((prev) => {
      const next = new Set(prev);
      if (verdict === 'keep') next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const restartDeck = () => {
    setSelected((prev) => new Set([...prev].filter((id) => !(id in deckVerdicts))));
    setDeckVerdicts({});
    setDeckRanking([]);
    setDuelResults([]);
  };

  // Wayfinder: the strip's "next: X" pill switches the local mechanic…
  const lastAdvance = useRef(advanceSignal);
  useEffect(() => {
    if (advanceSignal !== lastAdvance.current) {
      lastAdvance.current = advanceSignal;
      if (proposal) setLocalPhase(proposal.phase);
    }
  }, [advanceSignal, proposal]);

  // …and Enter sends once you've actually judged something (gate willing).
  const touched =
    selected.size > 0 ||
    Object.keys(triage).length > 0 ||
    Object.keys(deckVerdicts).length > 0 ||
    clusterTouched ||
    !!editedTree ||
    treeOps.length > 0 ||
    Object.values(flaws).some((f) => f.trim() !== '') ||
    Object.values(mutations).some((l) => l.length > 0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
      if (sending || !gate.ok || !touched) return;
      e.preventDefault();
      if (proposal && localPhase === board.phase) {
        setLocalPhase(proposal.phase);
        void send('iterate', proposal.phase);
      } else {
        void send('iterate');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const send = async (action: ResponseAction, phaseOverride?: Phase) => {
    const steeredPhase = phaseOverride ?? localPhase;
    // Back is an escape hatch — it bypasses every gate by design.
    if (action !== 'back') {
      if ((phase === 'diverge' || phase === 'expand') && selected.size < minSelect) {
        setError(`Select at least ${minSelect} option${minSelect === 1 ? '' : 's'}.`);
        return;
      }
      if (!gate.ok) {
        setError(gate.reason);
        return;
      }
      if (action === 'finalize' && !finalId) {
        setError('Mark one option as Final first.');
        return;
      }
    }
    const selectedIds =
      phase === 'converge'
        ? board.options.filter((o) => triage[o.id] === 'keep' || triage[o.id] === 'merge').map((o) => o.id)
        : [...selected];
    setError(null);
    setSending(true);
    try {
      await onRespond({
        boardId: board.id,
        selectedOptionIds: selectedIds,
        elaboration,
        perOptionNotes: Object.fromEntries(
          Object.entries(notes).filter(([, v]) => v.trim() !== ''),
        ),
        axisValues,
        remixPairs,
        action,
        model,
        triage,
        mutations,
        // Feedback is NEVER dropped: every mechanic the user touched ships its
        // state, regardless of which phase tab is active at send time.
        flaws: Object.fromEntries(Object.entries(flaws).filter(([, v]) => v.trim() !== '')),
        positions: clusterTouched ? positions : {},
        clusters: clusterTouched ? clusters : [],
        gapNotes,
        deckVerdicts,
        duelResults,
        ranking: deckRanking,
        attachments: intake.attachments,
        paletteColors,
        // Finality triggers the closeout procedure on the orchestrator side.
        commands: action === 'finalize' ? ['plan-closeout'] : [],
        requestedPhase: steeredPhase !== board.phase ? steeredPhase : undefined,
        finalOptionId: action === 'finalize' ? (finalId ?? undefined) : undefined,
        // Mind-map: the user's edited tree IS the feedback (absent = untouched).
        editedTree,
        // Mind-map: the ordered explode/add/delete/note decisions this round.
        treeOps,
        respondedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(String(err));
      setSending(false);
    }
  };

  const cols =
    board.options.length <= 2 ? 'sm:grid-cols-2' : board.options.length <= 6 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="space-y-4">
      <div>
        <PhaseBar phase={phase} onSelect={setLocalPhase} />
        <div className="rounded-xl rounded-tl-none border border-line bg-surface-2/70 px-4 py-3">
          {localPhase !== board.phase && (
            <div className="mb-1 text-[11px] text-accent">
              switched from {board.phase}; the next round will be asked for {localPhase}
            </div>
          )}
          <div className="text-xs font-semibold">{PHASE_GUIDE[phase].title}</div>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-ink-dim">
            {PHASE_GUIDE[phase].steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      </div>

      {isMindmap && board.tree && (
        <MindmapCanvas
          tree={board.tree}
          onEdit={setEditedTree}
          onOp={(op) => setTreeOps((prev) => [...prev, op])}
        />
      )}

      {!isMindmap && (
        <>
      {phase === 'mutate' && (
        <MutationLab board={board} mutations={mutations} onMutations={setMutations} onPreview={onPreview} />
      )}
      {phase === 'wreck' && <WreckYard board={board} flaws={flaws} onFlaws={setFlaws} onPreview={onPreview} />}
      {phase === 'converge' && (
        <TriageGate
          board={board}
          triage={triage}
          finalId={finalId}
          notes={notes}
          onNote={
            board.survey.allowPerOptionNotes
              ? (id, note) => setNotes((prev) => ({ ...prev, [id]: note }))
              : undefined
          }
          onTriage={setTriage}
          onFinal={setFinalId}
          onDuel={(duel) => setDuelResults((prev) => [...prev, duel])}
          onPreview={onPreview}
        />
      )}
      {phase === 'cluster' && (
        <ProximityField
          board={board}
          positions={positions}
          gapNotes={gapNotes}
          onPositions={(p) => {
            setClusterTouched(true);
            setPositions(p);
          }}
          onClusters={setClusters}
          onGapNotes={(n) => {
            setClusterTouched(true);
            setGapNotes(n);
          }}
          onPreview={onPreview}
        />
      )}

      {(phase === 'diverge' || phase === 'expand') && (
        <div className="flex justify-center gap-1">
          {(['grid', 'deck'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setReviewMode(mode)}
              title={
                mode === 'grid'
                  ? 'Whole pool at once, the classic grid'
                  : 'One card at a time: flick right keeps, left kills; close calls become duels'
              }
              className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                reviewMode === mode
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line text-ink-dim hover:text-ink'
              }`}
            >
              {mode === 'grid' ? 'grid' : 'judge deck'}
            </button>
          ))}
        </div>
      )}

      {(phase === 'diverge' || phase === 'expand') && reviewMode === 'deck' && (
        <JudgeDeck
          board={board}
          verdicts={deckVerdicts}
          ranking={deckRanking}
          onVerdict={deckVerdict}
          onRanking={setDeckRanking}
          onDuel={(duel) => setDuelResults((prev) => [...prev, duel])}
          onRestart={restartDeck}
          onPreview={onPreview}
        />
      )}

      {(phase === 'diverge' || phase === 'expand') && reviewMode === 'grid' && (
        <div className={`grid grid-cols-1 gap-4 ${cols}`}>
          {board.options.map((option) => {
            const isSelected = selected.has(option.id);
            const remixIndex = remixMarks.indexOf(option.id);
            return (
              <div
                key={option.id}
                className={`group relative rounded-2xl border bg-surface p-3 transition-shadow ${
                  isSelected
                    ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]'
                    : 'border-line hover:shadow-md'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPreview(option)}
                  className="block w-full cursor-zoom-in rounded-xl"
                  title="Click for full-screen view (zoom, pan, notes)"
                >
                  <div className="aspect-square w-full rounded-xl bg-surface-2 p-6 text-ink">
                    <SvgPane svg={option.svg} className="h-full w-full" />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelect(option.id)}
                  className="block w-full text-left"
                  aria-pressed={isSelected}
                  title={isSelected ? 'Deselect' : 'Select'}
                >
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{option.label}</div>
                      {option.description && (
                        <div className="mt-0.5 text-xs text-ink-dim">{option.description}</div>
                      )}
                    </div>
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs ${
                        isSelected ? 'border-accent bg-accent text-white' : 'border-line'
                      }`}
                    >
                      {isSelected ? '✓' : ''}
                    </div>
                  </div>
                </button>

                <div className="mt-2 flex items-center gap-2">
                  {board.survey.allowPerOptionNotes && (
                    <button
                      type="button"
                      onClick={() => setNoteOpen(noteOpen === option.id ? null : option.id)}
                      className={`rounded-md border border-line px-2 py-1 text-xs ${
                        notes[option.id]?.trim() ? 'text-accent' : 'text-ink-dim'
                      } hover:text-ink`}
                    >
                      note
                    </button>
                  )}
                  {board.survey.allowRemix && (
                    <button
                      type="button"
                      onClick={() => toggleRemix(option.id)}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        remixIndex >= 0
                          ? 'border-accent text-accent'
                          : 'border-line text-ink-dim hover:text-ink'
                      }`}
                      title="Mark for remix. Marked options are combined in pairs next round."
                    >
                      remix{remixIndex >= 0 ? ` #${Math.floor(remixIndex / 2) + 1}` : ''}
                    </button>
                  )}
                  {option.tags.map((tag) => (
                    <span key={tag} className="text-[10px] uppercase tracking-wide text-ink-dim">
                      {tag}
                    </span>
                  ))}
                </div>

                {noteOpen === option.id && (
                  <textarea
                    autoFocus
                    value={notes[option.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [option.id]: e.target.value })}
                    placeholder={`What works or doesn't about "${option.label}"?`}
                    className="mt-2 w-full resize-none rounded-lg border border-line bg-surface-2 p-2 text-xs outline-none focus:border-accent"
                    rows={2}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {board.survey.axes.length > 0 && (
        <div className="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
          {board.survey.axes.map((axis) => (
            <label key={axis.id} className="block">
              <div className="mb-1 flex items-center justify-between text-xs text-ink-dim">
                <span>{axis.leftLabel}</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  {axis.label}
                  {/* Value in its own tag, right-aligned to the heading — reads as a
                      value, not a postfix to the label. Turns accent when moved. */}
                  <span
                    className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums leading-none ${
                      (axisValues[axis.id] ?? axis.defaultValue) !== axis.defaultValue
                        ? 'border-accent/50 bg-accent/10 font-semibold text-accent'
                        : 'border-line bg-surface-2 text-ink-dim'
                    }`}
                    title={
                      (axisValues[axis.id] ?? axis.defaultValue) !== axis.defaultValue
                        ? 'Moved. This alone will steer the next round.'
                        : undefined
                    }
                  >
                    {axisValues[axis.id] ?? axis.defaultValue}
                  </span>
                </span>
                <span>{axis.rightLabel}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={axisValues[axis.id] ?? 50}
                onChange={(e) =>
                  setAxisValues({ ...axisValues, [axis.id]: Number(e.target.value) })
                }
                className="w-full"
                style={{ accentColor: 'var(--accent)' }}
              />
            </label>
          ))}
        </div>
      )}
        </>
      )}

      <div className="rounded-2xl border border-line bg-surface p-4">
        <textarea
          value={elaboration}
          onChange={(e) => setElaboration(e.target.value)}
          placeholder={board.survey.elaborationPrompt}
          rows={3}
          className="w-full resize-y rounded-xl border border-line bg-surface-2 p-3 text-sm outline-none focus:border-accent"
        />
        {voice.listening && (
          <div className="mt-1 text-[11px] text-accent shimmer">listening, speak your reply...</div>
        )}
        {voice.error && <div className="mt-1 text-[11px] text-red-500">{voice.error}</div>}
        <AttachmentChips attachments={intake.attachments} onRemove={intake.remove} />
        {(error ?? intake.error) && (
          <div className="mt-2 text-xs text-red-500">{error ?? intake.error}</div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MicButton voice={voice} hint="Dictate your reply. The transcript lands in the box." />
          <button
            type="button"
            disabled={sending}
            onClick={() => send('back')}
            title="This round's options don't work. Go back and re-answer the previous board."
            className="rounded-xl border border-line px-3 py-2 text-sm text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={sending || !gate.ok}
            onClick={() => send('iterate')}
            title={gate.ok ? '' : gate.reason}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow hover:brightness-105 disabled:opacity-50"
          >
            Send & iterate
          </button>
          <button
            type="button"
            disabled={sending || !gate.ok}
            onClick={() => send('accept')}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-50"
          >
            Accept
          </button>
          <TargetRepoPicker targetRepo={targetRepo} />
          {phase === 'converge' && finalId && (
            <button
              type="button"
              disabled={sending || !gate.ok}
              onClick={() => send('finalize')}
              title="Save the final option and run plan closeout. This ends the brainstorm."
              className="rounded-xl border-2 border-accent bg-accent/15 px-4 py-2 text-sm font-bold text-accent hover:bg-accent/25 disabled:opacity-50"
            >
              Finalize & close out
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="More Tools"
              title="More Tools"
              className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink-dim hover:border-accent hover:text-ink"
            >
              +
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 z-40 mb-2 w-72 rounded-xl border border-line bg-surface p-2 shadow-xl">
                <label
                  title="Attach a file. It is saved with your response for Claude to read."
                  className="block cursor-pointer rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
                >
                  Attach file
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        intake.attach(file);
                        setMenuOpen(false);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                {cameraAvailable() ? (
                  <button
                    type="button"
                    title="Take a photo with your device camera. It is saved with your response."
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    onClick={() => {
                      setMenuOpen(false);
                      setCameraOpen(true);
                    }}
                  >
                    Take a photo
                  </button>
                ) : (
                  <label
                    title="No camera access in this browser; picks an image file instead."
                    className="block cursor-pointer rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
                  >
                    Take a photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          intake.attach(file);
                          setMenuOpen(false);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                {themes.length > 0 && (
                  <div>
                    <button
                      type="button"
                      title="Pick named colors from the theme palettes; the next round's SVGs use only these."
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                      onClick={() => setColorsOpen(!colorsOpen)}
                    >
                      Colors{paletteColors.length > 0 ? ` (${paletteColors.length} picked)` : ''}
                    </button>
                    {colorsOpen && (
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-line p-2">
                        <PalettePicker
                          themes={themes}
                          selectedTheme={genTheme}
                          linkSession
                          onSelect={(theme, colors) => {
                            setGenTheme(theme?.name ?? null);
                            setPaletteColors(colors);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {models.length > 0 && (
                  <label className="block px-2 py-1.5 text-xs text-ink-dim">
                    Model for the next round
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                      title="The orchestrator delegates the next round's generation to this model"
                    >
                      {models.map((m) => (
                        <option key={m} value={m}>
                          {m.replace(/^claude-/, '')}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    setMenuOpen(false);
                    void send('park');
                  }}
                  title="Pause this thread without a verdict. Resume it any time."
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                >
                  Park
                </button>
                {onCommand && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onCommand('discover-skills');
                    }}
                    title="Match local skills to the task, or find and ingest new techniques from the web"
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    Discover skills
                  </button>
                )}
                {onCommand && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Run plan closeout? Claude will harvest learnings, improve the slash commands, update the wiki, and archive this discussion.')) {
                        setMenuOpen(false);
                        onCommand('plan-closeout');
                      }
                    }}
                    title="Harvest learnings, improve commands, archive the thread"
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    Plan closeout
                  </button>
                )}
              </div>
            )}
          </div>
          <span className="ml-auto text-xs text-ink-dim">
            {dialsMoved > 0 && (
              <span className="mr-2 text-accent">
                {dialsMoved} dial{dialsMoved > 1 ? 's' : ''} moved, steers the next round
              </span>
            )}
            {proposal && gate.ok && touched && localPhase === board.phase && (
              <span className="mr-2" title={proposal.reason}>
                Enter sends &amp; asks for {proposal.phase}
              </span>
            )}
            {!gate.ok
              ? gate.reason
              : phase === 'diverge'
                ? `${selected.size} selected${remixPairs.length > 0 ? ` · ${remixPairs.length} remix` : ''}`
                : phase === 'mutate'
                  ? `${Object.values(mutations).flat().length} lenses marked`
                  : phase === 'cluster'
                    ? `${clusters.length} clusters · ${gapNotes.length} gap notes`
                    : 'gate open'}
          </span>
        </div>
      </div>

      {cameraOpen && (
        <CameraModal onCapture={intake.addDataUri} onClose={() => setCameraOpen(false)} />
      )}

      {previewOption && (
        <ArtifactFullscreen
          title={previewOption.label}
          tags={previewOption.tags}
          svg={previewOption.svg}
          notes={{
            value: notes[previewOption.id] ?? '',
            onChange: board.survey.allowPerOptionNotes
              ? (value) => setNotes({ ...notes, [previewOption.id]: value })
              : undefined,
          }}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}
