import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { WebSocketServer, WebSocket } from 'ws';
import {
  BoardResponseSchema,
  type Artifact,
  type Board,
  type BoardResponse,
  type ServerToStudio,
  type StudioState,
  type Theme,
} from '@visual-brainstorm/protocol';
import { SessionStore } from './session-store.js';

export interface BridgeOptions {
  /** Discussion root scanned for reloadable threads. */
  discussionRoot: string;
  themes: Theme[];
  theme: string;
  models: string[];
  defaultModel: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

function studioDist(): string {
  if (process.env.VIBR_STUDIO_DIST) return process.env.VIBR_STUDIO_DIST;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../studio/dist');
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const [cmd, args] =
    platform === 'win32'
      ? (['cmd', ['/c', 'start', '', url]] as const)
      : platform === 'darwin'
        ? (['open', [url]] as const)
        : (['xdg-open', [url]] as const);
  try {
    spawn(cmd, [...args], { detached: true, stdio: 'ignore' }).unref();
  } catch (err) {
    console.error(`[bridge] could not open browser: ${String(err)}`);
  }
}

/**
 * The mashup glue: serves the built studio over http, pushes boards to it over
 * WebSocket, and receives survey responses over POST /api/respond. Loopback only.
 */
export class Bridge {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly sockets = new Set<WebSocket>();
  private readonly pending = new Map<string, (response: BoardResponse) => void>();
  private readonly responses = new Map<string, BoardResponse>();
  private activeBoard: Board | null = null;
  private thinking: string | null = null;
  private browserOpened = false;
  /** UI-invoked procedures queued while no board is awaiting a response. */
  private commandQueue: string[] = [];
  port = 0;

  constructor(
    private readonly store: SessionStore,
    private readonly options: BridgeOptions,
  ) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private state(): StudioState {
    return {
      session: this.store.info,
      rounds: this.store.rounds,
      activeBoard: this.activeBoard,
      artifacts: this.store.artifacts,
      thinking: this.thinking,
      themes: this.options.themes,
      theme: this.options.theme,
      models: this.options.models,
      defaultModel: this.options.defaultModel,
    };
  }

  private broadcast(msg: ServerToStudio): void {
    const payload = JSON.stringify(msg);
    for (const socket of this.sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
  }

  async start(port = Number(process.env.VIBR_PORT ?? 5199)): Promise<void> {
    if (this.server) return;
    const dist = studioDist();

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/state') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(this.state()));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/discussions') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(SessionStore.list(this.options.discussionRoot)));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/command') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { command } = z
              .object({ command: z.enum(['plan-closeout', 'discover-skills']) })
              .parse(JSON.parse(body));
            const delivered = this.dispatchCommand(command);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, delivered }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      const discussionMatch = url.pathname.match(/^\/api\/discussions\/([^/]+)$/);
      if (req.method === 'GET' && discussionMatch) {
        const id = decodeURIComponent(discussionMatch[1]);
        const dir = SessionStore.resolveDir(this.options.discussionRoot, id);
        try {
          const thread = SessionStore.open(dir);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              session: thread.info,
              rounds: thread.rounds,
              artifacts: thread.artifacts,
            }),
          );
        } catch (err) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: `thread not found: ${String(err)}` }));
        }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/respond') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const response = BoardResponseSchema.parse(JSON.parse(body));
            this.acceptResponse(response);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      // Static studio
      const rel = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = path.join(dist, path.normalize(rel).replace(/^([.][.][\\/])+/, ''));
      if (file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, {
          'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        });
        fs.createReadStream(file).pipe(res);
        return;
      }
      if (!fs.existsSync(dist)) {
        res.writeHead(503, { 'content-type': 'text/plain' });
        res.end('Studio not built. Run: npm run build -w apps/studio');
        return;
      }
      // SPA fallback
      res.writeHead(200, { 'content-type': MIME['.html'] });
      fs.createReadStream(path.join(dist, 'index.html')).pipe(res);
    });

    const tryListen = (p: number) =>
      new Promise<number>((resolve, reject) => {
        const onError = (err: NodeJS.ErrnoException) => reject(err);
        server.once('error', onError);
        server.listen(p, '127.0.0.1', () => {
          server.removeListener('error', onError);
          resolve((server.address() as { port: number }).port);
        });
      });
    try {
      this.port = await tryListen(port);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && port !== 0) {
        console.error(
          `[bridge] port ${port} in use (another bridge running?) — falling back to an ephemeral port`,
        );
        this.port = await tryListen(0);
      } else {
        throw err;
      }
    }

    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.send(JSON.stringify({ type: 'hello', state: this.state() } satisfies ServerToStudio));
      socket.on('close', () => this.sockets.delete(socket));
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg?.type === 'response') {
            this.acceptResponse(BoardResponseSchema.parse(msg.response));
          }
        } catch (err) {
          console.error(`[bridge] bad ws message: ${String(err)}`);
        }
      });
    });
    this.server = server;
    this.wss = wss;
    console.error(`[bridge] listening on ${this.url} (studio: ${dist})`);
  }

  private acceptResponse(response: BoardResponse): void {
    if (this.responses.has(response.boardId)) return; // first response wins
    this.responses.set(response.boardId, response);
    this.store.recordResponse(response);
    if (this.activeBoard?.id === response.boardId) {
      this.activeBoard = null;
      this.thinking = 'Claude is processing your selection…';
    }
    this.broadcast({ type: 'responded', boardId: response.boardId, response });
    this.broadcast({ type: 'thinking', note: this.thinking });
    const resolve = this.pending.get(response.boardId);
    if (resolve) {
      this.pending.delete(response.boardId);
      resolve(response);
    }
  }

  /** Push a board and block until the studio responds (or timeout → null). */
  async presentAndWait(board: Board, timeoutMs: number, open = true): Promise<BoardResponse | null> {
    await this.start();
    this.store.recordBoard(board);
    this.activeBoard = board;
    this.thinking = null;
    this.broadcast({ type: 'board', board });
    this.broadcast({ type: 'thinking', note: null });
    if (open && !this.browserOpened) {
      this.browserOpened = true;
      openBrowser(this.url);
    }
    return new Promise<BoardResponse | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(board.id);
        resolve(null); // board stays live; peek_response recovers the late answer
      }, timeoutMs);
      this.pending.set(board.id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  peekResponse(boardId: string): BoardResponse | null {
    return this.responses.get(boardId) ?? null;
  }

  /**
   * UI command button pressed (plan-closeout / discover-skills). If a board is
   * awaiting a response, resolve the wait NOW with a synthetic park response
   * carrying the command — Claude stops brainstorming and runs the procedure.
   * Otherwise queue it; it drains into the next present_board tool result.
   */
  dispatchCommand(command: string): 'via-board-response' | 'queued' {
    if (this.activeBoard && this.pending.has(this.activeBoard.id)) {
      const response = BoardResponseSchema.parse({
        boardId: this.activeBoard.id,
        action: 'park',
        commands: [command],
        respondedAt: new Date().toISOString(),
      });
      this.acceptResponse(response);
      return 'via-board-response';
    }
    this.commandQueue.push(command);
    return 'queued';
  }

  drainCommands(): string[] {
    const drained = this.commandQueue;
    this.commandQueue = [];
    return drained;
  }

  peekCommands(): string[] {
    return [...this.commandQueue];
  }

  announceArtifact(artifact: Artifact): void {
    this.broadcast({ type: 'artifact', artifact });
  }

  async stop(): Promise<void> {
    this.wss?.close();
    for (const socket of this.sockets) socket.terminate();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
    this.server = null;
  }
}
