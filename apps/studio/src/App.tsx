import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Artifact,
  DiscussionSummary,
  RoundRecord,
  SessionInfo,
} from '@visual-brainstorm/protocol';
import { useBridge } from './lib/useBridge';
import { applyTheme, storedThemeName, storeThemeName } from './lib/theme';
import { Bubble, Marker, SvgPane } from './components/primitives';
import { BoardSurvey } from './components/BoardSurvey';
import { PreviewModal } from './components/PreviewModal';
import { Sidebar } from './components/Sidebar';
import { ThemePicker } from './components/ThemePicker';

interface Thread {
  session: SessionInfo;
  rounds: RoundRecord[];
  artifacts: Artifact[];
}

type Preview = { svg: string; label: string } | null;

/** Rotating progress strings — visible feedback while Claude works between rounds. */
const PROGRESS = [
  'reading your selections…',
  'weighing the dials…',
  'breeding remix offspring…',
  'inking new candidates…',
  'checking lineage against earlier rounds…',
  'sharpening strokes…',
  'arguing with itself about composition…',
];

function ThinkingMarker({ note }: { note: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="space-y-1">
      <Marker shimmer>{note}</Marker>
      <div className="text-center text-[11px] text-ink-dim">{PROGRESS[tick % PROGRESS.length]}</div>
    </div>
  );
}

/** A completed round in the timeline: Claude's bubble + mini grid + user's reply bubble. */
function RoundHistoryView({
  record,
  onPreview,
}: {
  record: RoundRecord;
  onPreview: (preview: { svg: string; label: string }) => void;
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
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {board.options.map((option) => (
          <button
            key={option.id}
            type="button"
            title={`${option.label} — click for full-screen preview`}
            onClick={() => onPreview({ svg: option.svg, label: option.label })}
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
            {response.model && ` · → ${response.model.replace(/^claude-/, '')}`}
          </div>
          {response.elaboration && <div className="mt-1">{response.elaboration}</div>}
        </Bubble>
      )}
    </div>
  );
}

export default function App() {
  const { state, connected, respond } = useBridge();
  const [discussions, setDiscussions] = useState<DiscussionSummary[]>([]);
  const [archived, setArchived] = useState<Thread | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [themeName, setThemeName] = useState<string | null>(storedThemeName());
  const [navOpen, setNavOpen] = useState(false);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [logs, setLogs] = useState<{ file: string | null; lines: string[] } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const openLogs = useCallback(async () => {
    setLogs(await (await fetch('/api/logs')).json());
  }, []);

  const invokeCommand = useCallback(async (command: 'plan-closeout' | 'discover-skills' | 'new-brainstorm', prompt?: string) => {
    const res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command, prompt }),
    });
    const body = await res.json();
    setCommandStatus(
      body.ok
        ? body.delivered === 'via-board-response'
          ? `${command} sent — Claude is on it`
          : `${command} queued for Claude's next check-in`
        : `failed: ${body.error}`,
    );
    setTimeout(() => setCommandStatus(null), 5000);
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

  // Theme: stored pick wins, else config default; applied live, tracks OS scheme.
  useEffect(() => {
    const name = themeName ?? state.theme;
    const theme = state.themes.find((t) => t.name === name) ?? state.themes[0];
    if (theme) return applyTheme(theme);
  }, [themeName, state.theme, state.themes]);

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
  const artifacts = viewingLive ? state.artifacts : archived.artifacts;
  const history = rounds.filter((r) => r.response !== null);

  useEffect(() => {
    if (viewingLive) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [viewingLive, state.activeBoard?.id, state.rounds.length, state.thinking]);

  return (
    <div className="flex min-h-screen">
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
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-4 py-6 lg:px-8">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm lg:hidden"
            aria-label="Open discussions"
          >
            ☰
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-lg">💡</div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">Visual Brainstorm</h1>
            <div className="truncate text-xs text-ink-dim">
              {viewingLive
                ? (state.session ? state.session.title : 'waiting for a session')
                : `${archived.session.title} (archived)`}
              <span
                className={`ml-2 inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-400'}`}
              />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {commandStatus && (
              <span className="hidden text-xs text-ink-dim sm:inline">{commandStatus}</span>
            )}
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              title="Start a fresh brainstorm from your own prompt (requires the Claude engine)"
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105"
            >
              ✚ New Brainstorm
            </button>
            <button
              type="button"
              onClick={() => invokeCommand('discover-skills')}
              title="Interactive: match local skills to the task, or web-discover new techniques and ingest them as skills — quality compounds every turn"
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs hover:border-accent"
            >
              ✨ Discover skills
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Run plan closeout? Claude will harvest learnings, improve the slash commands, update the wiki, and archive this discussion.')) {
                  invokeCommand('plan-closeout');
                }
              }}
              title="Run .claude/commands/plan-closeout.md — harvest learnings, improve commands, archive the thread"
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs hover:border-accent"
            >
              📦 Plan closeout
            </button>
            {artifacts.length > 0 && (
              <div className="hidden items-center gap-2 md:flex">
                {artifacts.slice(-4).map((artifact) => (
                  <span
                    key={artifact.slug}
                    title={artifact.name}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-xs"
                  >
                    🏆 {artifact.slug}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={openLogs}
              title="Live bridge logs — every board, response, command, and error"
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-ink"
            >
              🧾
            </button>
            <ThemePicker
              themes={state.themes}
              current={themeName ?? state.theme}
              onPick={(name) => {
                setThemeName(name);
                storeThemeName(name);
              }}
            />
          </div>
        </header>

        <main className="scroll-fade flex-1 space-y-6 overflow-y-auto pb-8">
          {!viewingLive && (
            <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-xs">
              Archived thread — fully cached, nothing regenerated. Ask Claude to resume it with
              discussionId <code className="font-mono">{archived.session.id}</code>.
            </div>
          )}

          {history.length === 0 && !state.activeBoard && !state.thinking && viewingLive && (
            <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
              <div className="text-3xl">🎨</div>
              <h2 className="mt-3 font-semibold">No board yet</h2>
              <p className="mt-2 text-sm text-ink-dim">
                Ask Claude Code to brainstorm something visual. It will clarify with
                AskUserQuestion, then present SVG options here for you to select, annotate,
                remix, and steer. Previous threads live in the left nav.
              </p>
            </div>
          )}

          {history.map((record) => (
            <div key={record.board.id}>
              <Marker>Round {record.board.round} · {record.board.kind} · {record.board.phase}</Marker>
              <div className="mt-3">
                <RoundHistoryView record={record} onPreview={setPreview} />
              </div>
            </div>
          ))}

          {viewingLive && state.activeBoard && (
            <div>
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
                  onPreview={setPreview}
                />
              </div>
            </div>
          )}

          {viewingLive && !state.activeBoard && state.thinking && (
            <ThinkingMarker note={state.thinking} />
          )}
          <div ref={bottomRef} />
        </main>
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <h2 className="text-sm font-bold">✚ New Brainstorm</h2>
            <p className="mt-1 text-xs text-ink-dim">
              What are we brainstorming? Your prompt seeds the first board.
            </p>
            {state.engine === 'preview' && (
              <div className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] leading-snug text-ink-dim">
                <span className="font-semibold text-ink">Preview harness — no generator attached.</span>{' '}
                This server only shows static fixture boards for exercising the UI. To brainstorm
                for real, start Claude Code in this repo (the MCP server auto-loads via .mcp.json)
                and ask it to brainstorm your prompt.
              </div>
            )}
            <textarea
              autoFocus
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="e.g. app icons for a note-taking tool — hand-drawn, warm, must read at 16px"
              rows={3}
              className="mt-3 w-full resize-y rounded-xl border border-line bg-surface-2 p-3 text-sm outline-none focus:border-accent"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-ink-dim hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newPrompt.trim()}
                onClick={() => {
                  invokeCommand('new-brainstorm', newPrompt.trim());
                  setNewOpen(false);
                  setNewPrompt('');
                }}
                className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
              >
                Start brainstorm →
              </button>
            </div>
          </div>
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
                ↻ refresh
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
        <PreviewModal svg={preview.svg} label={preview.label} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
