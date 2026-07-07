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
import { ArtifactChat } from './components/ArtifactChat';
import { BoardSurvey } from './components/BoardSurvey';
import { NewDiscussionPanel, type NewDiscussionExtras } from './components/NewDiscussionPanel';
import { ConciergeIntake } from './components/ConciergeIntake';
import { PreviewModal } from './components/PreviewModal';
import { SessionActivity } from './components/SessionActivity';
import { Sidebar } from './components/Sidebar';
import { ThemePicker } from './components/ThemePicker';
import { WayfinderStrip } from './components/WayfinderStrip';

interface Thread {
  session: SessionInfo;
  rounds: RoundRecord[];
  artifacts: Artifact[];
  /** Reloaded dialogs — shown read-only when viewing an archived thread. */
  artifactChat?: ArtifactChatMessage[];
  /** Cumulative token totals over the thread's progress events. */
  tokens?: { input: number; output: number };
}

type Preview = {
  svg: string;
  label: string;
  tags?: string[];
  /** Persisted per-option note from that round's response (read-only). */
  note?: string;
  /** Chat subject key (option:<boardId>:<optionId>) — docks a chat panel. */
  chatSlug?: string;
} | null;

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
  onPreview: (preview: NonNullable<Preview>) => void;
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
  const { state, connected, respond, answerConcierge } = useBridge();
  const [discussions, setDiscussions] = useState<DiscussionSummary[]>([]);
  const [archived, setArchived] = useState<Thread | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [themeName, setThemeName] = useState<string | null>(storedThemeName());
  const [navOpen, setNavOpen] = useState(false);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [advanceSignal, setAdvanceSignal] = useState(0);
  const [logs, setLogs] = useState<{ file: string | null; lines: string[] } | null>(null);
  // Revisit: the previous round re-opened for re-answering (its board id).
  const [revisitId, setRevisitId] = useState<string | null>(null);
  // Artifact chat: `slug` anchors the dialog (messages filter), `displaySlug`
  // follows revisions — a Claude change is captured as a NEW artifact (rule 7)
  // and the open modal switches its image to it while the conversation stays.
  const [chat, setChat] = useState<{ slug: string; displaySlug: string } | null>(null);
  // Claude-message count at the moment a send succeeded; busy until it grows.
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
    setChat({ slug: artifact.slug, displaySlug: artifact.slug });
    setChatSentAt(null);
  }, []);

  // The open dialog's messages — filtered by the ORIGINAL artifact's slug.
  const chatMessages = useMemo(
    () => (chat ? state.artifactChat.filter((m) => m.artifactSlug === chat.slug) : []),
    [chat, state.artifactChat],
  );
  const chatClaudeCount = useMemo(
    () => chatMessages.filter((m) => m.role === 'claude').length,
    [chatMessages],
  );
  const chatBusy = chatSentAt !== null && chatClaudeCount <= chatSentAt;

  // A Claude reply carrying revisedSlug switches the modal's image to the NEW
  // artifact (it arrived via the `artifact` envelope); the dialog stays put.
  useEffect(() => {
    const revision = [...chatMessages]
      .reverse()
      .find((m) => m.role === 'claude' && m.revisedSlug);
    if (revision?.revisedSlug) {
      const slug = revision.revisedSlug;
      setChat((c) => (c && c.displaySlug !== slug ? { ...c, displaySlug: slug } : c));
    }
  }, [chatMessages]);

  const chatArtifact = useMemo(() => {
    if (!chat) return null;
    return (
      state.artifacts.find((a) => a.slug === chat.displaySlug) ??
      state.artifacts.find((a) => a.slug === chat.slug) ??
      null
    );
  }, [chat, state.artifacts]);

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

  const sendArtifactChat = useCallback(
    async (text: string) => {
      if (!chat) return;
      if (await postChat(chat.slug, text)) setChatSentAt(chatClaudeCount);
    },
    [chat, chatClaudeCount, postChat],
  );

  // Option-chat state for the fullscreen preview (previous rounds).
  const [previewChatSentAt, setPreviewChatSentAt] = useState<number | null>(null);
  const openPreview = useCallback((next: NonNullable<Preview>) => {
    setPreview(next);
    setPreviewChatSentAt(null);
  }, []);
  const previewChatMessages = useMemo(() => {
    if (!preview?.chatSlug) return [];
    const source = archived ? archived.artifactChat ?? [] : state.artifactChat;
    return source.filter((m) => m.artifactSlug === preview.chatSlug);
  }, [preview, archived, state.artifactChat]);
  const previewClaudeCount = useMemo(
    () => previewChatMessages.filter((m) => m.role === 'claude').length,
    [previewChatMessages],
  );
  const previewChatBusy = previewChatSentAt !== null && previewClaudeCount <= previewChatSentAt;
  const sendPreviewChat = useCallback(
    async (text: string) => {
      if (!preview?.chatSlug) return;
      if (await postChat(preview.chatSlug, text)) setPreviewChatSentAt(previewClaudeCount);
    },
    [preview, previewClaudeCount, postChat],
  );

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
  // Empty live session → land on the New Discussion panel (the intake surface),
  // e.g. a bare /run-brainstorm opening the studio via open_studio. A pending
  // concierge question takes over the surface instead (adaptive intake).
  const landing =
    viewingLive &&
    history.length === 0 &&
    !state.activeBoard &&
    !state.thinking &&
    !state.concierge;

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
        {viewingLive && !newOpen && (
          <div className="pr-4 lg:pr-8">
            <WayfinderStrip
              rounds={state.rounds}
              artifacts={state.artifacts}
              activeBoard={state.activeBoard}
              proposal={proposal}
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
          className={`scroll-fade flex-1 space-y-6 overflow-y-auto pb-8 pr-4 lg:pr-8 ${
            newOpen || landing ? 'flex flex-col' : ''
          }`}
        >
          {(newOpen || landing) && (
            <NewDiscussionPanel
              enginePreview={state.engine === 'preview'}
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
              <span>
                Archived thread. Fully cached, nothing regenerated. Ask Claude to resume it with
                discussionId <code className="font-mono">{archived.session.id}</code>.
              </span>
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
                  viewingLive && revisitId !== record.board.id ? (
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

      {preview && (
        <PreviewModal
          svg={preview.svg}
          label={preview.label}
          tags={preview.tags}
          note={preview.note}
          chat={
            preview.chatSlug
              ? {
                  messages: previewChatMessages,
                  busy: previewChatBusy,
                  // Archived threads replay their persisted dialogs read-only.
                  onSend: viewingLive ? sendPreviewChat : undefined,
                }
              : undefined
          }
          onClose={() => setPreview(null)}
        />
      )}

      {chat && chatArtifact && (
        <ArtifactChat
          artifact={chatArtifact}
          messages={chatMessages}
          onSend={sendArtifactChat}
          onSaveNotes={
            viewingLive ? (notes) => saveArtifactNotes(chatArtifact.slug, notes) : undefined
          }
          busy={chatBusy}
          onClose={() => setChat(null)}
        />
      )}
    </div>
  );
}
