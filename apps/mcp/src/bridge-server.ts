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

export interface CommandRequest {
  command: string;
  /** Seed text, e.g. the new-brainstorm topic the user typed. */
  prompt?: string;
}

export interface BridgeOptions {
  /** Discussion root scanned for reloadable threads. */
  discussionRoot: string;
  themes: Theme[];
  theme: string;
  models: string[];
  defaultModel: string;
  /** Who is driving — the studio adapts its promises to this. */
  engine: 'claude' | 'preview';
  /** Diagnostic sink — see log.ts. Defaults to console.error. */
  log?: (message: string) => void;
  /** Live log tail source for GET /api/logs (FileLog.recent). */
  recentLogs?: () => string[];
  /** Log file path reported by GET /api/logs. */
  logFile?: () => string | null;
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
  private commandQueue: CommandRequest[] = [];
  port = 0;

  /** Invoked when a UI command is queued (no board waiting) — demo orchestrator hook. */
  onQueuedCommand: ((request: CommandRequest) => void) | null = null;
  private startedAt: string | null = null;

  constructor(
    private store: SessionStore,
    private readonly options: BridgeOptions,
  ) {}

  private log(message: string): void {
    (this.options.log ?? console.error)(`[bridge] ${message}`);
  }

  /** Point the bridge at a fresh thread (New Brainstorm) and resync all clients. */
  attachStore(store: SessionStore): void {
    this.store = store;
    this.activeBoard = null;
    this.thinking = null;
    // Old-thread response/wait state must not shadow the new thread's boards.
    // (Orphaned waits resolve as null via their own timeouts.)
    this.responses.clear();
    this.pending.clear();
    this.log(`attached new thread "${store.info.id}" — response state cleared`);
    this.broadcast({ type: 'hello', state: this.state() });
  }

  /** Live progress feedback — shown as the shimmer marker in the studio. */
  think(note: string | null): void {
    this.thinking = note;
    this.broadcast({ type: 'thinking', note });
  }

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
      engine: this.options.engine,
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
      if (req.method === 'GET' && url.pathname === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            name: 'visual-brainstorm-bridge',
            pid: process.pid,
            port: this.port,
            startedAt: this.startedAt,
            studioDist: dist,
            studioDistExists: fs.existsSync(dist),
            session: { id: this.store.info.id, dir: this.store.info.dir },
            rounds: this.store.rounds.length,
            activeBoard: this.activeBoard
              ? { id: this.activeBoard.id, round: this.activeBoard.round, phase: this.activeBoard.phase }
              : null,
            awaitingResponse: this.pending.size > 0,
            connectedClients: this.sockets.size,
            queuedCommands: this.commandQueue.length,
          }),
        );
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/logs') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            file: this.options.logFile?.() ?? null,
            lines: this.options.recentLogs?.() ?? ['(no log source attached to this bridge)'],
          }),
        );
        return;
      }
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
            const { command, prompt } = z
              .object({
                command: z.enum(['plan-closeout', 'discover-skills', 'new-brainstorm']),
                prompt: z.string().max(2000).optional(),
              })
              .parse(JSON.parse(body));
            const delivered = this.dispatchCommand(command, prompt);
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
        this.port = await tryListen(0);
        this.log(`!!! PORT CONFLICT: ${port} is held by another instance — THIS instance is on ${this.port}.`);
        this.log(`!!! A browser tab open on port ${port} shows the OTHER instance, not this one.`);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1500);
          const other = (await (
            await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal })
          ).json()) as { pid?: number; startedAt?: string; session?: { id?: string } };
          clearTimeout(timer);
          this.log(
            `!!! the holder of ${port}: pid ${other.pid}, started ${other.startedAt}, session "${other.session?.id}". ` +
              `Kill it with: Stop-Process -Id ${other.pid} -Force`,
          );
        } catch {
          this.log(`!!! the holder of ${port} did not answer /api/health — likely a stale non-bridge process.`);
        }
      } else {
        throw err;
      }
    }

    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (socket) => {
      this.sockets.add(socket);
      this.log(`studio connected (${this.sockets.size} client${this.sockets.size === 1 ? '' : 's'})`);
      socket.send(JSON.stringify({ type: 'hello', state: this.state() } satisfies ServerToStudio));
      socket.on('close', () => {
        this.sockets.delete(socket);
        this.log(`studio disconnected (${this.sockets.size} left)`);
      });
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg?.type === 'response') {
            this.acceptResponse(BoardResponseSchema.parse(msg.response));
          }
        } catch (err) {
          this.log(`bad ws message: ${String(err)}`);
        }
      });
    });
    this.server = server;
    this.wss = wss;
    this.startedAt = new Date().toISOString();
    this.log(`listening on ${this.url} (studio: ${dist}${fs.existsSync(dist) ? '' : ' — MISSING, run npm run build -w apps/studio'})`);
    this.log(`session "${this.store.info.id}" → ${this.store.info.dir}`);
  }

  private acceptResponse(response: BoardResponse): void {
    if (this.responses.has(response.boardId)) return; // first response wins
    this.responses.set(response.boardId, response);
    this.log(
      `response for ${response.boardId}: action=${response.action}, selected=${response.selectedOptionIds.length}, ` +
        `kills=${Object.values(response.triage).filter((v) => v === 'kill').length}, remix=${response.remixPairs.length}, ` +
        `flaws=${Object.keys(response.flaws).length}, commands=[${response.commands.join(',')}]` +
        (response.requestedPhase ? `, requestedPhase=${response.requestedPhase}` : ''),
    );
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
    this.log(
      `presenting ${board.id}: round ${board.round}, phase ${board.phase}, ${board.options.length} options, ` +
        `timeout ${Math.round(timeoutMs / 1000)}s, ${this.sockets.size} client(s) connected`,
    );
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
  dispatchCommand(command: string, prompt?: string): 'via-board-response' | 'queued' {
    this.log(`UI command: ${command}${prompt ? ` (seed: "${prompt.slice(0, 60)}")` : ''} (${this.activeBoard && this.pending.has(this.activeBoard.id) ? 'board waiting — delivering via response' : 'queueing'})`);
    if (this.activeBoard && this.pending.has(this.activeBoard.id)) {
      const response = BoardResponseSchema.parse({
        boardId: this.activeBoard.id,
        action: 'park',
        commands: [command],
        // The seed text rides in elaboration so the digest surfaces it verbatim.
        elaboration: prompt ?? '',
        respondedAt: new Date().toISOString(),
      });
      this.acceptResponse(response);
      return 'via-board-response';
    }
    const request: CommandRequest = { command, prompt };
    this.commandQueue.push(request);
    this.onQueuedCommand?.(request);
    return 'queued';
  }

  drainCommands(): CommandRequest[] {
    const drained = this.commandQueue;
    this.commandQueue = [];
    return drained;
  }

  peekCommands(): CommandRequest[] {
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
