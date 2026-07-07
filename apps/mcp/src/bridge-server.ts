import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { WebSocketServer, WebSocket } from 'ws';
import {
  BoardResponseSchema,
  PaletteColorSchema,
  ProgressEventSchema,
  ResponseAttachmentSchema,
  SeedIntakeSchema,
  ThemeSchema,
  type Artifact,
  type Board,
  type BoardResponse,
  type ResponseAttachment,
  type SeedIntake,
  type ServerToStudio,
  type StudioState,
  type Theme,
} from '@visual-brainstorm/protocol';
import { SessionStore } from './session-store.js';

export interface CommandRequest {
  command: string;
  /** Seed text, e.g. the new-brainstorm topic the user typed. */
  prompt?: string;
  /** Where a non-text seed (sketch/image/voice) landed + how to use it. */
  seedNote?: string;
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
  /** Default target repo/folder (config); the thread override lives in SessionInfo. */
  defaultTargetRepo?: () => string | null;
  /** Persist a new default targetRepo to the config file — absent in the preview harness. */
  setDefaultTargetRepo?: (path: string | null) => void;
  /**
   * Persist an edited/new theme (palette edits from the studio) to the styles
   * drop-in dir and return the refreshed theme list. Absent → honest 400.
   */
  saveTheme?: (theme: Theme) => Theme[];
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
  /** Resolvers blocked in waitForCommand (open_studio landing flow). */
  private commandWaiters: ((request: CommandRequest) => void)[] = [];
  /** Live theme list — refreshed when the studio saves a palette edit. */
  private themesList: Theme[];
  port = 0;

  /** Invoked when a UI command is queued (no board waiting) — demo orchestrator hook. */
  onQueuedCommand: ((request: CommandRequest) => void) | null = null;
  private startedAt: string | null = null;

  constructor(
    private store: SessionStore,
    private readonly options: BridgeOptions,
  ) {
    this.themesList = options.themes;
  }

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
      themes: this.themesList,
      theme: this.options.theme,
      models: this.options.models,
      defaultModel: this.options.defaultModel,
      targetRepo: this.store.info.targetRepo ?? this.options.defaultTargetRepo?.() ?? null,
      progress: this.store.progress.slice(-200),
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
            const { command, prompt, seed, attachments, model, palette } = z
              .object({
                command: z.enum(['plan-closeout', 'discover-skills', 'new-brainstorm']),
                prompt: z.string().max(2000).optional(),
                seed: SeedIntakeSchema.optional(),
                /** New Discussion composer: files/photos seeding the brainstorm. */
                attachments: z.array(ResponseAttachmentSchema).optional(),
                /** New Discussion composer: model for round generation. */
                model: z.string().max(200).optional(),
                /** New Discussion composer: generation colors picked in the palette. */
                palette: z.array(PaletteColorSchema).max(64).optional(),
              })
              .parse(JSON.parse(body));
            const notes = [
              seed ? this.persistSeed(seed) : undefined,
              ...(attachments ?? []).map((a) => {
                const saved = this.persistAttachment(a);
                return saved.savedPath
                  ? `Seed file "${saved.name || 'unnamed'}" saved at ${saved.savedPath} — Read it (vision for images) and fold it into the brief.`
                  : `Seed file "${a.name || 'unnamed'}" FAILED to persist (bad data URI or over 10MB) — tell the user honestly.`;
              }),
              model ? `Model routing: the user chose ${model} — delegate round generation to it.` : undefined,
              palette && palette.length > 0
                ? `Palette: generate ALL SVGs using ONLY these colors: ${palette.map((c) => `${c.name} (${c.value})`).join(', ')}.`
                : undefined,
            ].filter(Boolean);
            const seedNote = notes.length > 0 ? notes.join('\n') : undefined;
            const delivered = this.dispatchCommand(command, prompt, seedNote);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, delivered }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/themes') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { theme } = z.object({ theme: ThemeSchema }).parse(JSON.parse(body));
            if (!this.options.saveTheme) {
              res.writeHead(400, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'this server cannot persist themes (no styles writer attached)' }));
              return;
            }
            this.themesList = this.options.saveTheme(theme);
            this.log(`theme "${theme.name}" saved (${theme.palette?.length ?? 0} palette colors)`);
            this.broadcast({ type: 'hello', state: this.state() });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, themes: this.themesList.length }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/session-theme') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { name } = z.object({ name: z.string().max(200).nullable() }).parse(JSON.parse(body));
            if (name !== null && !this.themesList.some((t) => t.name === name)) {
              res.writeHead(400, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: `unknown theme: ${name}` }));
              return;
            }
            this.store.setTheme(name ?? undefined);
            this.log(`discussion theme ${name ? `set to "${name}"` : 'cleared'} for ${this.store.info.id}`);
            this.broadcast({ type: 'hello', state: this.state() });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, theme: name }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/target-repo') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { path: rawPath, scope } = z
              .object({
                path: z.string().max(1000).nullable(),
                scope: z.enum(['thread', 'default']),
              })
              .parse(JSON.parse(body));
            let resolved: string | null = null;
            if (rawPath !== null && rawPath.trim() !== '') {
              resolved = path.resolve(rawPath.trim());
              if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
                res.writeHead(400, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: `not a folder on this machine: ${resolved}` }));
                return;
              }
            }
            if (scope === 'thread') {
              this.store.setTargetRepo(resolved ?? undefined);
            } else if (this.options.setDefaultTargetRepo) {
              this.options.setDefaultTargetRepo(resolved);
            } else {
              res.writeHead(400, { 'content-type': 'application/json' });
              res.end(JSON.stringify({
                ok: false,
                error: 'this server cannot persist a default target repo (preview harness) — set targetRepo in visual-brainstorm.config.json or use thread scope',
              }));
              return;
            }
            this.log(`target repo (${scope}) ${resolved ? `set to ${resolved}` : 'cleared'}`);
            this.broadcast({ type: 'hello', state: this.state() });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, targetRepo: this.state().targetRepo }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      const artifactMatch = url.pathname.match(/^\/api\/artifact-svg\/([^/]+)\.svg$/);
      if (req.method === 'GET' && artifactMatch) {
        const slug = decodeURIComponent(artifactMatch[1]);
        const artifact = this.store.artifacts.find((a) => a.slug === slug);
        if (artifact && fs.existsSync(artifact.svgPath)) {
          res.writeHead(200, { 'content-type': MIME['.svg'] });
          fs.createReadStream(artifact.svgPath).pipe(res);
        } else {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: `no artifact "${slug}" in the live thread` }));
        }
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
      if (req.method === 'POST' && url.pathname === '/api/progress') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const raw = z
              .object({
                at: z.string().optional(),
                source: z.string().max(200).optional(),
                note: z.string().min(1).max(2000),
                tokens: z
                  .object({ input: z.number().min(0).default(0), output: z.number().min(0).default(0) })
                  .optional(),
              })
              .parse(JSON.parse(body));
            const event = ProgressEventSchema.parse({
              ...raw,
              at: raw.at ?? new Date().toISOString(),
            });
            this.store.recordProgress(event);
            this.broadcast({ type: 'progress', event });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
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

  private acceptResponse(raw: BoardResponse): void {
    if (this.responses.has(raw.boardId)) return; // first response wins
    // Attachments arrive as data URIs; persist to the thread dir before the
    // response is recorded/broadcast so every consumer sees savedPath.
    const response: BoardResponse =
      raw.attachments.length > 0
        ? { ...raw, attachments: raw.attachments.map((a) => this.persistAttachment(a)) }
        : raw;
    this.responses.set(response.boardId, response);
    this.log(
      `response for ${response.boardId}: action=${response.action}, selected=${response.selectedOptionIds.length}, ` +
        `kills=${Object.values(response.triage).filter((v) => v === 'kill').length}, remix=${response.remixPairs.length}, ` +
        `flaws=${Object.keys(response.flaws).length}, attachments=${response.attachments.length}, commands=[${response.commands.join(',')}]` +
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

  /** Start serving and open the browser with no board — the New Discussion landing. */
  async openStudio(): Promise<void> {
    await this.start();
    if (!this.browserOpened) {
      this.browserOpened = true;
      openBrowser(this.url);
    }
  }

  /**
   * UI command button pressed (plan-closeout / discover-skills). If a board is
   * awaiting a response, resolve the wait NOW with a synthetic park response
   * carrying the command — Claude stops brainstorming and runs the procedure.
   * Otherwise queue it; it drains into the next present_board tool result.
   */
  dispatchCommand(command: string, prompt?: string, seedNote?: string): 'via-board-response' | 'queued' {
    this.log(`UI command: ${command}${prompt ? ` (seed: "${prompt.slice(0, 60)}")` : ''}${seedNote ? ' (+seed payload)' : ''} (${this.activeBoard && this.pending.has(this.activeBoard.id) ? 'board waiting — delivering via response' : 'queueing'})`);
    if (this.activeBoard && this.pending.has(this.activeBoard.id)) {
      const response = BoardResponseSchema.parse({
        boardId: this.activeBoard.id,
        action: 'park',
        commands: [command],
        // The seed text rides in elaboration so the digest surfaces it verbatim.
        elaboration: [prompt, seedNote].filter(Boolean).join('\n'),
        respondedAt: new Date().toISOString(),
      });
      this.acceptResponse(response);
      return 'via-board-response';
    }
    const request: CommandRequest = { command, prompt, seedNote };
    const waiter = this.commandWaiters.shift();
    if (waiter) {
      waiter(request); // a blocked waitForCommand takes it directly, not the queue
    } else {
      this.commandQueue.push(request);
    }
    this.onQueuedCommand?.(request);
    return 'queued';
  }

  /**
   * Landing flow (bare /run-brainstorm): block until the studio submits a
   * command (usually new-brainstorm from the New Discussion panel) or the
   * timeout passes. Already-queued commands resolve immediately.
   */
  async waitForCommand(timeoutMs: number): Promise<CommandRequest | null> {
    await this.start();
    const queued = this.commandQueue.shift();
    if (queued) return queued;
    return new Promise<CommandRequest | null>((resolve) => {
      const waiter = (request: CommandRequest) => {
        clearTimeout(timer);
        resolve(request);
      };
      const timer = setTimeout(() => {
        this.commandWaiters = this.commandWaiters.filter((w) => w !== waiter);
        resolve(null);
      }, timeoutMs);
      this.commandWaiters.push(waiter);
    });
  }

  /**
   * Composer attachment (file/photo) → decoded file under the thread's
   * attachments/ dir. Returns the record with dataUri blanked and savedPath
   * set; a record without savedPath means persistence failed (rule 6: the
   * digest reports that honestly instead of pretending).
   */
  private persistAttachment(attachment: ResponseAttachment): ResponseAttachment {
    try {
      const match = attachment.dataUri.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s);
      if (!match) {
        this.log(`attachment "${attachment.name}" rejected: not a base64 data URI`);
        return { name: attachment.name, dataUri: '' };
      }
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.byteLength > 10 * 1024 * 1024) {
        this.log(`attachment "${attachment.name}" rejected: over 10MB`);
        return { name: attachment.name, dataUri: '' };
      }
      const dir = path.join(this.store.info.dir, 'attachments');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeName = attachment.name.replace(/[^\w.-]+/g, '_').replace(/^[_.]+/, '');
      const extFromMime = `.${(match[1].split('/')[1] ?? 'bin').replace('jpeg', 'jpg')}`;
      const file = path.join(dir, `${stamp}-${safeName || `attachment${extFromMime}`}`);
      fs.writeFileSync(file, buffer);
      this.log(`attachment saved: ${file} (${buffer.byteLength} bytes)`);
      return { name: attachment.name, dataUri: '', savedPath: file };
    } catch (err) {
      this.log(`persistAttachment failed: ${String(err)}`);
      return { name: attachment.name, dataUri: '' };
    }
  }

  /**
   * "Open with anything": write a non-text seed to disk under the discussion
   * root and return a digest-ready instruction pointing at it. The image/sketch
   * is a SEED for generation — never itself a board option (options stay vector).
   */
  private persistSeed(seed: SeedIntake): string | undefined {
    try {
      if (seed.kind === 'text') return seed.text.trim() ? `Seed text: "${seed.text.trim()}"` : undefined;
      if (seed.kind === 'voice') {
        return seed.transcript.trim()
          ? `Seed (spoken, transcribed): "${seed.transcript.trim()}"`
          : undefined;
      }
      const dir = path.join(this.options.discussionRoot, '.seeds');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (seed.kind === 'sketch') {
        const file = path.join(dir, `seed-${stamp}.svg`);
        fs.writeFileSync(file, seed.svg);
        return `Seed sketch (user-drawn) saved at ${file} — Read it and riff on its shapes and gesture.`;
      }
      // image data URI → file
      const match = seed.dataUri.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s);
      if (!match) {
        this.log('seed image rejected: not a base64 image data URI');
        return 'Seed image was attached but could not be decoded (not a base64 image data URI) — tell the user honestly and ask them to retry.';
      }
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.byteLength > 10 * 1024 * 1024) {
        this.log('seed image rejected: over 10MB');
        return 'Seed image was attached but exceeded the 10MB limit — tell the user honestly and ask for a smaller file.';
      }
      const ext = match[1] === 'jpg' ? 'jpeg' : match[1];
      const file = path.join(dir, `seed-${stamp}.${ext}`);
      fs.writeFileSync(file, buffer);
      return `Seed image${seed.name ? ` ("${seed.name}")` : ''} saved at ${file} — Read it (vision) and extract its subject, shapes, and mood as the brief.`;
    } catch (err) {
      this.log(`persistSeed failed: ${String(err)}`);
      return `Seed attachment failed to persist (${String(err)}) — tell the user honestly.`;
    }
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
