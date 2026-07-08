import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  optionChatSlug,
  type Artifact,
  type ArtifactChatMessage,
  type DiscussionSummary,
  type RoundRecord,
  type SeedIntake,
  type SessionInfo,
} from '@visual-brainstorm/protocol';
import { useBridge } from './lib/useBridge';
import { compactCount } from './lib/format';
import { applyTheme, storedThemeName, storeThemeName } from './lib/theme';
import { proposeNextPhase } from './lib/wayfinder';
import { BulbIcon, Bubble, Marker, SvgPane } from './components/primitives';
import { ArtifactFullscreen } from './components/ArtifactFullscreen';
import { BoardSurvey } from './components/BoardSurvey';
import { NewDiscussionPanel, type NewDiscussionExtras } from './components/NewDiscussionPanel';
import { ConciergeIntake } from './components/ConciergeIntake';
import { LivingGallery } from './components/LivingGallery';
import { SessionActivity } from './components/SessionActivity';
import { Sidebar } from './components/Sidebar';
import { ThemePicker } from './components/ThemePicker';
import { WayfinderStrip } from './components/WayfinderStrip';
import { DecisionTreeView } from './components/DecisionTreeView';

interface Thread {
  session: SessionInfo;
  rounds: RoundRecord[];
  artifacts: Artifact[];
  /** Reloaded dialogs — shown read-only when viewing an archived thread. */
  artifactChat?: ArtifactChatMessage[];
  /** Cumulative token totals over the thread's progress events. */
  tokens?: { input: number; output: number };
}

/** A previous-round option opened fullscreen — inline SVG, read-only note, option chat. */
type OptionView = {
  svg: string;
  label: string;
  tags?: string[];
  /** Persisted per-option note from that round's response (read-only). */
  note?: string;
  /** Chat subject key (option:<boardId>:<optionId>). */
  chatSlug: string;
};

/**
 * The single fullscreen target — every artifact/option click resolves to one of
 * these and opens the one ArtifactFullscreen viewer (rule 9, no duplicate paths).
 * `artifact`: a captured keep/pin (SVG fetched by slug; a revision swaps
 * displaySlug). `option`: a previous-round board option (inline SVG).
 */
type Fullscreen =
  | { kind: 'artifact'; slug: string; displaySlug: string }
  | ({ kind: 'option' } & OptionView)
  | null;

/** Rotating progress strings — visible feedback while Claude works between rounds. */
const PROGRESS = [
  'reading your selections...',
  'weighing the dials...',
  'combining your remix picks...',
  'drawing new candidates...',
  'checking against earlier rounds...',
  'sharpening strokes...',
  'weighing composition choices...',
];

function ThinkingMarker({ note, latest }: { note: string; latest?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="space-y-1">
      <Marker shimmer>{note}</Marker>
      <div className="text-center text-[11px] text-ink-dim">
        {latest || PROGRESS[tick % PROGRESS.length]}
      </div>
    </div>
  );
}

/** A completed round in the timeline: Claude's bubble + mini grid + user's reply bubble. */
function RoundHistoryView({
  record,
  onPreview,
}: {
  record: RoundRecord;
  onPreview: (option: OptionView) => void;
}) {
  const { board, response } = record;
  const selectedSet = new Set(response?.selectedOptionIds ?? []);
  return (
    <div className="space-y-3">
      <Bubble side="claude">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
          {board.title}
        </div>
        {board.prompt}
      </Bubble>
      {board.tree && (
        <div className="rounded-xl border border-line bg-surface p-3" data-testid="mindmap-history">
          <div className="text-xs font-semibold text-ink">
            Mind map · {board.tree.nodeData.topic}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(board.tree.nodeData.children ?? []).map((branch) => (
              <span
                key={branch.id}
                className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-dim"
              >
                {branch.topic}
              </span>
            ))}
          </div>
          {response?.editedTree && (
            <div className="mt-1.5 text-[11px] text-accent">edited live — see editedTree</div>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {board.options.map((option) => (
          <button
            key={option.id}
            type="button"
            title={`${option.label}: click for full-screen preview, notes and chat`}
            onClick={() =>
              onPreview({
                svg: option.svg,
                label: option.label,
                tags: option.tags,
                note: response?.perOptionNotes[option.id],
                chatSlug: optionChatSlug(board.id, option.id),
              })
            }
            className={`rounded-xl border p-2 text-left ${
              selectedSet.has(option.id)
                ? 'border-accent bg-accent/10'
                : 'border-line bg-surface opacity-50 hover:opacity-90'
            }`}
          >
            <div className="aspect-square text-ink">
              <SvgPane svg={option.svg} className="h-full w-full" />
            </div>
            <div className="mt-1 truncate text-center text-[10px] text-ink-dim">{option.label}</div>
          </button>
        ))}
      </div>
      {response && (
        <Bubble side="user">
          <div className="text-xs text-ink-dim">
            {response.action} · picked {response.selectedOptionIds.length}
            {response.remixPairs.length > 0 && ` · ${response.remixPairs.length} remix`}
            {response.model && ` · to ${response.model.replace(/^claude-/, '')}`}
          </div>
          {response.elaboration && <div className="mt-1">{response.elaboration}</div>}
        </Bubble>
      )}
    </div>
  );
}

export default function App() {
  const { state, connected, respond, answerConcierge, pickMethod } = useBridge();
  const [discussions, setDiscussions] = useState<DiscussionSummary[]>([]);
  const [archived, setArchived] = useState<Thread | null>(null);
  const [themeName, setThemeName] = useState<string | null>(storedThemeName());
  const [navOpen, setNavOpen] = useState(false);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [advanceSignal, setAdvanceSignal] = useState(0);
  const [logs, setLogs] = useState<{ file: string | null; lines: string[] } | null>(null);
  // Revisit: the previous round re-opened for re-answering (its board id).
  const [revisitId, setRevisitId] = useState<string | null>(null);
  // The one fullscreen viewer's target (null = closed). Set by every artifact/
  // option click; a captured-artifact viewer follows revisions via displaySlug.
  const [fullscreen, setFullscreen] = useState<Fullscreen>(null);
  // Decision-tree overlay: { title, svg } while open (svg null = loading). The
  // SVG is built server-side (GET /api/decision-tree/:id), never client-side.
  const [decisionTree, setDecisionTree] = useState<{ title: string; svg: string | null } | null>(null);
  // Claude-message count at the moment a send succeeded; busy until it grows
  // (one counter for whichever subject the fullscreen viewer has open).
  const [chatSentAt, setChatSentAt] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const openLogs = useCallback(async () => {
    setLogs(await (await fetch('/api/logs')).json());
  }, []);

  const invokeCommand = useCallback(async (
    command: 'plan-closeout' | 'discover-skills' | 'new-brainstorm',
    prompt?: string,
    seed?: SeedIntake,
    extras?: NewDiscussionExtras,
  ) => {
    const res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command, prompt, seed, ...extras }),
    });
    const body = await res.json();
    setCommandStatus(
      body.ok
        ? body.delivered === 'via-board-response'
          ? `${command} sent, Claude is on it`
          : `${command} queued for Claude's next check-in`
        : `failed: ${body.error}`,
    );
    setTimeout(() => setCommandStatus(null), 5000);
  }, []);

  const openArtifactChat = useCallback((artifact: Artifact) => {
    setFullscreen({ kind: 'artifact', slug: artifact.slug, displaySlug: artifact.slug });
    setChatSentAt(null);
  }, []);

  // Reopen an archived thread: confirm, ask Claude to move it out of _completed
  // and resume it live at `round`. Drop back to the live view so the resumed
  // board (arriving over WS) takes over.
  const reopenDiscussion = useCallback(
    async (discussionId: string, round: number, title: string) => {
      if (
        !window.confirm(
          `Reopen "${title}" at round ${round}? Claude will move it out of _completed back ` +
            `into discussion and resume the brainstorm here — nothing is regenerated.`,
        )
      ) {
        return;
      }
      try {
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ command: 'reopen', discussionId, round }),
        });
        const body = await res.json();
        setCommandStatus(
          body.ok
            ? body.delivered === 'via-board-response'
              ? 'reopen sent, Claude is on it'
              : 'reopen queued for Claude’s next check-in'
            : `failed: ${body.error}`,
        );
      } catch (err) {
        setCommandStatus(`reopen failed: ${err instanceof Error ? err.message : err}`);
      }
      setTimeout(() => setCommandStatus(null), 5000);
      setArchived(null); // return to live; the resumed thread arrives over WS
    },
    [],
  );

  // One sender for every chat subject (captured artifact or option: slug).
  // Do NOT append locally — the message returns over WS from state, so
  // persistence stays the single truth. Returns whether the send landed.
  const postChat = useCallback(async (artifactSlug: string, text: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/artifact-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ artifactSlug, text }),
      });
      const body = await res.json();
      if (body.ok) return true;
      throw new Error(body.error);
    } catch (err) {
      setCommandStatus(`chat failed: ${err instanceof Error ? err.message : err}`);
      setTimeout(() => setCommandStatus(null), 5000);
      return false;
    }
  }, []);

  const openPreview = useCallback((next: OptionView) => {
    setFullscreen({ kind: 'option', ...next });
    setChatSentAt(null);
  }, []);

  // The open viewer's chat subject: an artifact's ORIGINAL slug, or an option: slug.
  const fsChatSlug = fullscreen
    ? fullscreen.kind === 'artifact'
      ? fullscreen.slug
      : fullscreen.chatSlug
    : null;
  // Its messages — an archived thread replays reloaded dialogs; live reads state.
  const fsMessages = useMemo(() => {
    if (!fsChatSlug) return [];
    const source = archived ? archived.artifactChat ?? [] : state.artifactChat;
    return source.filter((m) => m.artifactSlug === fsChatSlug);
  }, [fsChatSlug, archived, state.artifactChat]);
  const fsClaudeCount = useMemo(
    () => fsMessages.filter((m) => m.role === 'claude').length,
    [fsMessages],
  );
  const fsBusy = chatSentAt !== null && fsClaudeCount <= chatSentAt;

  // A Claude reply carrying revisedSlug switches a captured-artifact viewer's
  // image to the NEW artifact (rule 7 — original untouched); dialog stays put.
  useEffect(() => {
    const revision = [...fsMessages].reverse().find((m) => m.role === 'claude' && m.revisedSlug);
    if (revision?.revisedSlug) {
      const slug = revision.revisedSlug;
      setFullscreen((f) =>
        f && f.kind === 'artifact' && f.displaySlug !== slug ? { ...f, displaySlug: slug } : f,
      );
    }
  }, [fsMessages]);

  // The captured artifact an artifact-kind viewer shows (revision → displaySlug).
  const fsArtifact = useMemo(() => {
    if (fullscreen?.kind !== 'artifact') return null;
    const source = archived ? archived.artifacts : state.artifacts;
    return (
      source.find((a) => a.slug === fullscreen.displaySlug) ??
      source.find((a) => a.slug === fullscreen.slug) ??
      null
    );
  }, [fullscreen, archived, state.artifacts]);

  const sendFsChat = useCallback(
    async (text: string) => {
      if (!fsChatSlug) return;
      if (await postChat(fsChatSlug, text)) setChatSentAt(fsClaudeCount);
    },
    [fsChatSlug, fsClaudeCount, postChat],
  );

  // Pin/unpin a captured artifact to the filmstrip (persists to session.json).
  const togglePin = useCallback(async (slug: string) => {
    try {
      const res = await fetch('/api/pinned', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
    } catch (err) {
      setCommandStatus(`pin failed: ${err instanceof Error ? err.message : err}`);
      setTimeout(() => setCommandStatus(null), 5000);
    }
  }, []);

  // Persist artifact notes to the thread folder; the updated artifact returns
  // over WS ('artifact' upsert), so state stays disk-truth.
  const saveArtifactNotes = useCallback(async (artifactSlug: string, notes: string) => {
    try {
      const res = await fetch('/api/artifact-notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ artifactSlug, notes }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
    } catch (err) {
      setCommandStatus(`saving notes failed: ${err instanceof Error ? err.message : err}`);
      setTimeout(() => setCommandStatus(null), 5000);
    }
  }, []);

  const refreshDiscussions = useCallback(async () => {
    try {
      setDiscussions(await (await fetch('/api/discussions')).json());
    } catch {
      /* bridge may not be up yet */
    }
  }, []);

  useEffect(() => {
    refreshDiscussions();
  }, [refreshDiscussions, state.session?.id, state.rounds.length, state.artifacts.length]);

  // Theme: the viewed discussion's theme wins, then the stored local pick,
  // then the config default; applied live, tracks OS scheme.
  const effectiveTheme =
    (archived ? archived.session.theme : state.session?.theme) ?? themeName ?? state.theme;
  useEffect(() => {
    const theme = state.themes.find((t) => t.name === effectiveTheme) ?? state.themes[0];
    if (theme) return applyTheme(theme);
  }, [effectiveTheme, state.themes]);

  const openDiscussion = useCallback(
    async (id: string | null) => {
      setNavOpen(false);
      if (id === null) {
        setArchived(null);
        return;
      }
      const res = await fetch(`/api/discussions/${encodeURIComponent(id)}`);
      if (res.ok) setArchived(await res.json());
    },
    [],
  );

  const viewingLive = archived === null;
  const rounds = viewingLive ? state.rounds : archived.rounds;
  const history = rounds.filter((r) => r.response !== null);
  // Pinned artifacts (session.json) → a dedicated filmstrip row. Slugs resolve
  // against the same thread's artifacts; a stale slug (deleted capture) drops.
  const artifactSource = viewingLive ? state.artifacts : archived.artifacts;
  const pinnedSlugs = (viewingLive ? state.session?.pinnedSlugs : archived.session.pinnedSlugs) ?? [];
  const pinned = pinnedSlugs
    .map((slug) => artifactSource.find((a) => a.slug === slug))
    .filter((a): a is Artifact => Boolean(a));
  // Empty live session → land on the New Discussion panel (the intake surface),
  // e.g. a bare /run-brainstorm opening the studio via open_studio. A pending
  // concierge question takes over the surface instead (adaptive intake).
  const landing =
    viewingLive &&
    history.length === 0 &&
    !state.activeBoard &&
    !state.thinking &&
    !state.concierge &&
    !state.gallery;

  // Wayfinder: what the studio would do next (the orchestrator still decides).
  const proposal = useMemo(
    () => (viewingLive ? proposeNextPhase(state.rounds, state.activeBoard?.phase ?? null) : null),
    [viewingLive, state.rounds, state.activeBoard?.phase],
  );
  const jumpToRound = useCallback((boardId: string) => {
    document.getElementById(`round-${boardId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (viewingLive) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [viewingLive, state.activeBoard?.id, state.rounds.length, state.thinking]);

  return (
    <div className="flex h-screen">
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        className="fixed left-3 top-3 z-20 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm shadow lg:hidden"
        aria-label="Open discussions"
      >
        ☰
      </button>

      <div className={`${navOpen ? 'block' : 'hidden'} fixed inset-0 z-30 lg:static lg:block`}>
        <div
          className="absolute inset-0 bg-black/40 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
        <div className="relative z-10 h-full">
          <Sidebar
            discussions={discussions.filter((d) => !d.archived)}
            archive={discussions.filter((d) => d.archived)}
            liveId={state.session?.id ?? null}
            selectedId={archived?.session.id ?? null}
            onSelect={openDiscussion}
            brand={
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15">
                    <BulbIcon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-base font-bold leading-tight">Visual Brainstorm</h1>
                    <div className="truncate text-xs text-ink-dim">
                      {viewingLive
                        ? (state.session ? state.session.title : 'waiting for a session')
                        : `${archived.session.title} (archived)`}
                      <span
                        className={`ml-2 inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-400'}`}
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNewOpen(true)}
                  title="Start a fresh brainstorm from your own prompt (requires the Claude engine)"
                  className="mt-3 w-full rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105"
                >
                  New Discussion
                </button>
              </div>
            }
            footer={
              <div className="flex items-end justify-between gap-2">
                <button
                  type="button"
                  onClick={openLogs}
                  title="Live bridge logs: every board, response, command, and error"
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-ink"
                >
                  Logs
                </button>
                <ThemePicker
                  themes={state.themes}
                  current={effectiveTheme}
                  onPick={(name) => {
                    setThemeName(name);
                    storeThemeName(name);
                    // Bind the pick to the live discussion too — its artifacts
                    // and skin travel together (session.json persists it).
                    void fetch('/api/session-theme', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ name }),
                    }).catch(() => {});
                  }}
                />
              </div>
            }
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col pb-6 pl-4 pt-16 lg:pl-8 lg:pt-6">
        {!newOpen && (
          <div className="pr-4 lg:pr-8">
            {/* Archived threads render the same strip so a captured keep stays
                clickable (its chat replays read-only); live gets the proposal. */}
            <WayfinderStrip
              rounds={viewingLive ? state.rounds : archived.rounds}
              artifacts={viewingLive ? state.artifacts : archived.artifacts}
              pinned={pinned}
              activeBoard={viewingLive ? state.activeBoard : null}
              proposal={viewingLive ? proposal : null}
              onJump={jumpToRound}
              onOpenArtifact={openArtifactChat}
              onAdvance={() => {
                setAdvanceSignal((s) => s + 1);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
            />
          </div>
        )}

        <main
          className={`flex-1 space-y-6 overflow-y-auto pb-8 pr-4 lg:pr-8 ${
            newOpen || landing ? 'flex flex-col' : 'scroll-fade'
          }`}
        >
          {(newOpen || landing) && (
            <NewDiscussionPanel
              themes={state.themes}
              models={state.models}
              defaultModel={state.defaultModel}
              targetRepo={state.targetRepo}
              cancellable={!landing}
              initialPrompt={state.seedBrief ?? ''}
              onCancel={() => setNewOpen(false)}
              onStart={(prompt, seed, extras) => {
                invokeCommand('new-brainstorm', prompt || undefined, seed, extras);
                setNewOpen(false);
              }}
            />
          )}
          {!newOpen && !landing && (
            <>
          {!viewingLive && (
            <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-xs">
              <span>Completed thread — fully cached, nothing regenerated.</span>
              <button
                type="button"
                onClick={() =>
                  reopenDiscussion(
                    archived.session.id,
                    history.length > 0 ? history[history.length - 1].board.round : 1,
                    archived.session.title,
                  )
                }
                title="Move this thread out of _completed and resume the brainstorm live from its last round"
                className="shrink-0 rounded-lg border border-accent/50 bg-surface px-2.5 py-1 font-medium text-accent hover:bg-accent/10"
              >
                ↩ Reopen
              </button>
              {archived.tokens && archived.tokens.input + archived.tokens.output > 0 && (
                <span
                  title="Total tokens reported for this thread over its progress events"
                  className="ml-auto shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-ink-dim"
                >
                  {`Σ ${compactCount(archived.tokens.input + archived.tokens.output)} tok`}
                </span>
              )}
            </div>
          )}

          {history.map((record) => (
            <div key={record.board.id} id={`round-${record.board.id}`}>
              <Marker
                action={
                  viewingLive ? (
                    revisitId !== record.board.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRevisitId(record.board.id);
                          setTimeout(() => jumpToRound(record.board.id), 50);
                        }}
                        title={`Re-open round ${record.board.round}'s answers, change them, and Send & iterate — the brainstorm rewinds to this round`}
                        className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-dim opacity-0 transition-opacity hover:border-accent hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        ⟲ return to this round
                      </button>
                    ) : undefined
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        reopenDiscussion(archived.session.id, record.board.round, archived.session.title)
                      }
                      title={`Reopen this completed thread and resume the brainstorm from round ${record.board.round}`}
                      className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-dim opacity-0 transition-opacity hover:border-accent hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      ↩ reopen from here
                    </button>
                  )
                }
              >
                Round {record.board.round} · {record.board.kind} · {record.board.phase}
                {revisitId === record.board.id && ' · revisiting'}
              </Marker>
              <div className="mt-3">
                {revisitId === record.board.id ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-xs">
                      <span>
                        Revisiting round {record.board.round} — your previous answers are
                        prefilled. Change anything and Send &amp; iterate: the brainstorm rewinds
                        to this round (later rounds stay in the history).
                      </span>
                      <button
                        type="button"
                        onClick={() => setRevisitId(null)}
                        className="ml-auto shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs hover:border-accent"
                      >
                        Cancel
                      </button>
                    </div>
                    <Bubble side="claude">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
                        {record.board.title}
                      </div>
                      {record.board.prompt}
                    </Bubble>
                    <BoardSurvey
                      key={`revisit-${record.board.id}`}
                      board={record.board}
                      initial={record.response ?? undefined}
                      models={state.models}
                      defaultModel={state.defaultModel}
                      onRespond={async (r) => {
                        await respond(r);
                        setRevisitId(null);
                      }}
                      targetRepo={state.targetRepo}
                      themes={state.themes}
                    />
                  </div>
                ) : (
                  <RoundHistoryView record={record} onPreview={openPreview} />
                )}
              </div>
            </div>
          ))}

          {viewingLive && state.concierge && (
            <div className="mt-3">
              <ConciergeIntake exchange={state.concierge} onAnswer={answerConcierge} />
            </div>
          )}

          {viewingLive && state.gallery && (
            <div className="mt-3">
              <LivingGallery gallery={state.gallery} onPick={pickMethod} />
            </div>
          )}

          {viewingLive && state.activeBoard && (
            <div id={`round-${state.activeBoard.id}`}>
              <Marker>
                Round {state.activeBoard.round} · {state.activeBoard.kind} · {state.activeBoard.phase} · your turn
              </Marker>
              <div className="mt-3 space-y-4">
                <Bubble side="claude">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
                    {state.activeBoard.title}
                  </div>
                  {state.activeBoard.prompt}
                </Bubble>
                <BoardSurvey
                  key={state.activeBoard.id}
                  board={state.activeBoard}
                  models={state.models}
                  defaultModel={state.defaultModel}
                  onRespond={respond}
                  proposal={proposal}
                  advanceSignal={advanceSignal}
                  onCommand={invokeCommand}
                  targetRepo={state.targetRepo}
                  themes={state.themes}
                />
              </div>
            </div>
          )}

          {viewingLive && !state.activeBoard && state.thinking && (
            <ThinkingMarker
              note={state.thinking}
              latest={state.progress.length > 0 ? state.progress[state.progress.length - 1].note : undefined}
            />
          )}

          {viewingLive && <SessionActivity events={state.progress} tokens={state.tokens} />}
            </>
          )}
          <div ref={bottomRef} />
        </main>
      </div>

      {commandStatus && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-xl">
          {commandStatus}
        </div>
      )}

      {logs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[70vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-surface p-4 shadow-2xl">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-bold">Bridge logs</h2>
              <span className="truncate text-xs text-ink-dim">{logs.file ?? 'in-memory only'}</span>
              <button
                type="button"
                onClick={openLogs}
                className="ml-auto rounded-lg border border-line px-2.5 py-1 text-xs hover:border-accent"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setLogs(null)}
                className="rounded-lg border border-line px-2.5 py-1 text-xs hover:border-accent"
              >
                ✕
              </button>
            </div>
            <pre className="flex-1 overflow-auto rounded-xl bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-dim">
              {logs.lines.join('\n') || '(empty)'}
            </pre>
          </div>
        </div>
      )}

      {fullscreen && (
        <ArtifactFullscreen
          title={fullscreen.kind === 'artifact' ? fsArtifact?.name ?? fullscreen.slug : fullscreen.label}
          tags={fullscreen.kind === 'option' ? fullscreen.tags : undefined}
          svg={fullscreen.kind === 'option' ? fullscreen.svg : undefined}
          fetchSlug={fullscreen.kind === 'artifact' ? fullscreen.displaySlug : undefined}
          revised={fullscreen.kind === 'artifact' && Boolean(fsArtifact?.provenance.revises)}
          notes={{
            value:
              fullscreen.kind === 'artifact' ? fsArtifact?.notes ?? '' : fullscreen.note ?? '',
            // Editable only for a captured artifact on the live thread.
            onSave:
              fullscreen.kind === 'artifact' && viewingLive && fsArtifact
                ? (notes) => saveArtifactNotes(fsArtifact.slug, notes)
                : undefined,
          }}
          chat={{
            messages: fsMessages,
            busy: fsBusy,
            // Archived threads replay their persisted dialog read-only.
            onSend: viewingLive ? sendFsChat : undefined,
            emptyHint:
              fullscreen.kind === 'option'
                ? viewingLive
                  ? 'Ask about this option or the choice it represents — the conversation persists with the thread.'
                  : 'No dialog was recorded for this option.'
                : undefined,
          }}
          pin={
            fullscreen.kind === 'artifact' && viewingLive && fsArtifact
              ? { pinned: pinnedSlugs.includes(fsArtifact.slug), onToggle: () => togglePin(fsArtifact.slug) }
              : undefined
          }
          onClose={() => setFullscreen(null)}
        />
      )}
    </div>
  );
}
