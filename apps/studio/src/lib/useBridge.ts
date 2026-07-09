import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArtifactChatMessage,
  BoardResponse,
  ServerToStudio,
  StudioState,
} from '@visual-brainstorm/protocol';

/** Called for every artifact-chat envelope (any thread) with its owning discussionId. */
export type ChatHandler = (message: ArtifactChatMessage, discussionId?: string) => void;

const EMPTY: StudioState = {
  session: null,
  rounds: [],
  activeBoard: null,
  artifacts: [],
  artifactChat: [],
  thinking: null,
  runtime: { id: 'claude', label: 'Claude Code', provider: 'Anthropic' },
  themes: [],
  theme: 'neon-purple',
  models: [],
  defaultModel: 'claude-fable-5',
  targetRepo: null,
  progress: [],
  tokens: { input: 0, output: 0 },
  seedBrief: null,
  concierge: null,
  gallery: null,
};

/** WS in (boards), HTTP POST out (responses), auto-reconnect, hello resync. */
export function useBridge() {
  const [state, setState] = useState<StudioState>(EMPTY);
  const [connected, setConnected] = useState(false);
  const retry = useRef(0);
  // Subscribers for artifact-chat envelopes — App routes archived-thread replies
  // (a different discussionId than the live thread) into the archived view.
  const chatSubs = useRef(new Set<ChatHandler>());
  const subscribeChat = useCallback((handler: ChatHandler) => {
    chatSubs.current.add(handler);
    return () => {
      chatSubs.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${location.host}/ws`);
      socket.onopen = () => {
        retry.current = 0;
        setConnected(true);
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) {
          timer = setTimeout(connect, Math.min(1000 * 2 ** retry.current++, 10_000));
        }
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerToStudio;
        // Side-channel (outside the state reducer, which may run twice in
        // StrictMode): every chat envelope reaches App so it can route replies to
        // whichever thread is on screen (live state OR the archived snapshot).
        if (msg.type === 'artifact-chat') {
          for (const handler of chatSubs.current) handler(msg.message, msg.discussionId);
        }
        setState((prev) => {
          switch (msg.type) {
            case 'hello':
              // Merge over defaults: a bridge process built before (or after) this
              // bundle may omit state fields — missing ones degrade to EMPTY's
              // values instead of crashing the render (blank-page skew, 2026-07-07).
              return { ...EMPTY, ...msg.state };
            case 'board': {
              const known = prev.rounds.some((r) => r.board.id === msg.board.id);
              return {
                ...prev,
                activeBoard: msg.board,
                thinking: null,
                rounds: known ? prev.rounds : [...prev.rounds, { board: msg.board, response: null }],
              };
            }
            case 'responded':
              return {
                ...prev,
                activeBoard: prev.activeBoard?.id === msg.boardId ? null : prev.activeBoard,
                rounds: prev.rounds.map((r) =>
                  r.board.id === msg.boardId ? { ...r, response: msg.response } : r,
                ),
              };
            case 'thinking':
              return { ...prev, thinking: msg.note };
            case 'artifact': {
              // Upsert: the envelope carries new captures AND updates to an
              // existing capture's metadata (e.g. saved notes) — same slug.
              const exists = prev.artifacts.some((a) => a.slug === msg.artifact.slug);
              return {
                ...prev,
                artifacts: exists
                  ? prev.artifacts.map((a) => (a.slug === msg.artifact.slug ? msg.artifact : a))
                  : [...prev.artifacts, msg.artifact],
              };
            }
            case 'artifact-chat':
              // Only the LIVE thread's dialogs belong in live state. A message
              // addressed to another (archived) thread is routed to that view via
              // subscribeChat, not appended here.
              if (msg.discussionId && prev.session && msg.discussionId !== prev.session.id) {
                return prev;
              }
              return { ...prev, artifactChat: [...prev.artifactChat, msg.message] };
            case 'concierge':
              return { ...prev, concierge: msg.exchange };
            case 'gallery':
              return { ...prev, gallery: msg.gallery };
            case 'progress':
              return {
                ...prev,
                progress: [...prev.progress, msg.event].slice(-200),
                tokens: msg.event.tokens
                  ? {
                      input: prev.tokens.input + msg.event.tokens.input,
                      output: prev.tokens.output + msg.event.tokens.output,
                    }
                  : prev.tokens,
              };
          }
        });
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, []);

  const respond = useCallback(async (response: BoardResponse) => {
    const res = await fetch('/api/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(response),
    });
    if (!res.ok) throw new Error(`respond failed: ${res.status} ${await res.text()}`);
  }, []);

  /** Answer the pending concierge question (adaptive intake). */
  const answerConcierge = useCallback(async (id: string, answer: string) => {
    const res = await fetch('/api/concierge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, answer }),
    });
    if (!res.ok) throw new Error(`concierge answer failed: ${res.status} ${await res.text()}`);
  }, []);

  /** Pick a methodology from the Living Gallery — routes the session into it. */
  const pickMethod = useCallback(async (id: string, method: string) => {
    const res = await fetch('/api/gallery-pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, method }),
    });
    if (!res.ok) throw new Error(`gallery pick failed: ${res.status} ${await res.text()}`);
  }, []);

  return { state, connected, respond, answerConcierge, pickMethod, subscribeChat };
}
