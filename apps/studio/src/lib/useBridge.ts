import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BoardResponse,
  ServerToStudio,
  StudioState,
} from '@visual-brainstorm/protocol';

const EMPTY: StudioState = {
  session: null,
  rounds: [],
  activeBoard: null,
  artifacts: [],
  artifactChat: [],
  thinking: null,
  engine: 'claude',
  themes: [],
  theme: 'neon-purple',
  models: [],
  defaultModel: 'claude-fable-5',
  targetRepo: null,
  progress: [],
  tokens: { input: 0, output: 0 },
  seedBrief: null,
  concierge: null,
};

/** WS in (boards), HTTP POST out (responses), auto-reconnect, hello resync. */
export function useBridge() {
  const [state, setState] = useState<StudioState>(EMPTY);
  const [connected, setConnected] = useState(false);
  const retry = useRef(0);

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
              return { ...prev, artifactChat: [...prev.artifactChat, msg.message] };
            case 'concierge':
              return { ...prev, concierge: msg.exchange };
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

  return { state, connected, respond, answerConcierge };
}
