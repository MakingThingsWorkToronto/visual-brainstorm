import { useMemo, useState } from 'react';
import type { Board, BoardResponse, ResponseAction } from '@visual-brainstorm/protocol';
import { SvgPane } from './primitives';
import { PhaseBar } from './phases/PhaseBar';
import { MutationLab } from './phases/MutationLab';
import { WreckYard } from './phases/WreckYard';
import { TriageGate } from './phases/TriageGate';
import { ProximityField } from './phases/ProximityField';

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
  onPreview,
}: {
  board: Board;
  models: string[];
  defaultModel: string;
  onRespond: (response: BoardResponse) => Promise<void>;
  onPreview: (preview: { svg: string; label: string }) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [remixMarks, setRemixMarks] = useState<string[]>([]);
  const [axisValues, setAxisValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(board.survey.axes.map((a) => [a.id, a.defaultValue])),
  );
  const [elaboration, setElaboration] = useState('');
  const [model, setModel] = useState(defaultModel);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // per-phase state
  const [triage, setTriage] = useState<Record<string, 'keep' | 'kill' | 'merge'>>({});
  const [mutations, setMutations] = useState<Record<string, string[]>>({});
  const [flaws, setFlaws] = useState<Record<string, string>>({});
  const [positions, setPositions] = useState(() => scatter(board));
  const [clusters, setClusters] = useState<string[][]>([]);
  const [gapNotes, setGapNotes] = useState<{ between: [number, number]; note: string }[]>([]);

  const { multiSelect, minSelect, maxSelect } = board.survey;
  const phase = board.phase;

  // Gates: the interface physically refuses to move on until the phase's work is done.
  const gate = useMemo((): { ok: boolean; reason: string } => {
    if (phase === 'converge') {
      const left = board.options.length - board.options.filter((o) => triage[o.id]).length;
      return { ok: left === 0, reason: left === 0 ? '' : `triage ${left} more before the gate opens` };
    }
    if (phase === 'wreck') {
      const needed = Math.min(3, board.options.length);
      const found = Object.values(flaws).filter((f) => f.trim() !== '').length;
      return { ok: found >= needed, reason: found >= needed ? '' : `find ${needed - found} more flaw${needed - found === 1 ? '' : 's'}` };
    }
    return { ok: true, reason: '' };
  }, [phase, triage, flaws, board.options]);

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

  const send = async (action: ResponseAction) => {
    if (phase === 'diverge' && selected.size < minSelect) {
      setError(`Select at least ${minSelect} option${minSelect === 1 ? '' : 's'}.`);
      return;
    }
    if (!gate.ok) {
      setError(gate.reason);
      return;
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
        flaws: Object.fromEntries(Object.entries(flaws).filter(([, v]) => v.trim() !== '')),
        positions: phase === 'cluster' ? positions : {},
        clusters: phase === 'cluster' ? clusters : [],
        gapNotes,
        commands: [],
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
      <div className="flex justify-center">
        <PhaseBar phase={phase} />
      </div>

      {phase === 'mutate' && (
        <MutationLab board={board} mutations={mutations} onMutations={setMutations} />
      )}
      {phase === 'wreck' && <WreckYard board={board} flaws={flaws} onFlaws={setFlaws} />}
      {phase === 'converge' && <TriageGate board={board} triage={triage} onTriage={setTriage} />}
      {phase === 'cluster' && (
        <ProximityField
          board={board}
          positions={positions}
          gapNotes={gapNotes}
          onPositions={setPositions}
          onClusters={setClusters}
          onGapNotes={setGapNotes}
        />
      )}

      {phase === 'diverge' && (
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
                  onClick={() => toggleSelect(option.id)}
                  className="block w-full text-left"
                  aria-pressed={isSelected}
                >
                  <div className="aspect-square w-full rounded-xl bg-surface-2 p-6 text-ink">
                    <SvgPane svg={option.svg} className="h-full w-full" />
                  </div>
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
                  <button
                    type="button"
                    onClick={() => onPreview({ svg: option.svg, label: option.label })}
                    className="rounded-md border border-line px-2 py-1 text-xs text-ink-dim hover:text-ink"
                    title="Full-screen preview (zoom & pan)"
                  >
                    ⛶
                  </button>
                  {board.survey.allowPerOptionNotes && (
                    <button
                      type="button"
                      onClick={() => setNoteOpen(noteOpen === option.id ? null : option.id)}
                      className={`rounded-md border border-line px-2 py-1 text-xs ${
                        notes[option.id]?.trim() ? 'text-accent' : 'text-ink-dim'
                      } hover:text-ink`}
                    >
                      ✎ note
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
                      title="Mark for remix — marked options are mashed up in pairs next round"
                    >
                      ⚡ remix{remixIndex >= 0 ? ` #${Math.floor(remixIndex / 2) + 1}` : ''}
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
                    placeholder={`What works / doesn't about “${option.label}”?`}
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
              <div className="mb-1 flex justify-between text-xs text-ink-dim">
                <span>{axis.leftLabel}</span>
                <span className="font-medium text-ink">{axis.label}</span>
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

      <div className="rounded-2xl border border-line bg-surface p-4">
        <textarea
          value={elaboration}
          onChange={(e) => setElaboration(e.target.value)}
          placeholder={board.survey.elaborationPrompt}
          rows={3}
          className="w-full resize-y rounded-xl border border-line bg-surface-2 p-3 text-sm outline-none focus:border-accent"
        />
        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={sending || !gate.ok}
            onClick={() => send('iterate')}
            title={gate.ok ? '' : gate.reason}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow hover:brightness-105 disabled:opacity-50"
          >
            Send & iterate →
          </button>
          <button
            type="button"
            disabled={sending || !gate.ok}
            onClick={() => send('accept')}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-50"
          >
            ✓ Accept
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => send('park')}
            className="rounded-xl px-3 py-2 text-sm text-ink-dim hover:text-ink disabled:opacity-50"
          >
            Park
          </button>
          {models.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-ink-dim">
              model
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
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
          <span className="ml-auto text-xs text-ink-dim">
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
    </div>
  );
}
