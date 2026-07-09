import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ArtifactChatMessageSchema,
  BoardResponseSchema,
  PaletteColorSchema,
  ProgressEventSchema,
  ResponseAttachmentSchema,
  SeedIntakeSchema,
  ThemeSchema,
  TokenSinkSchema,
  parseOptionChatSlug,
  type Artifact,
  type ArtifactChatMessage,
  type Board,
  type BoardResponse,
  type ConciergeExchange,
  type LivingGallery,
  type ModelCatalogEntry,
  type ResponseAttachment,
  type RuntimeEngine,
  type ScribbleAnnotations,
  type SeedBrief,
  type SeedIntake,
  type ServerToStudio,
  type StudioState,
  type Theme,
} from '@visual-brainstorm/protocol';
import { SessionStore } from './session-store.js';
import { buildDecisionTree, decisionTreeToSvg } from './decision-tree.js';
import { createEngineAdapter, type EngineAdapter } from './engine-adapter.js';

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
  /** Runtime adapter over the shared bridge/session backbone. */
  engine?: EngineAdapter;
  runtime?: RuntimeEngine;
  themes: Theme[];
  theme: string;
  models: Array<ModelCatalogEntry | string>;
  defaultModel: string;
  /** Default target repo/folder (config); the thread override lives in SessionInfo. */
  defaultTargetRepo?: () => string | null;
  /** Persist a new default targetRepo to the config file — absent when the server has no config writer. */
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

/** One-line human summary of a scribble's marks for the seed note. */
function summarizeMarks(a: ScribbleAnnotations): string {
  const counts = new Map<string, number>();
  for (const it of a.items) counts.set(it.type, (counts.get(it.type) ?? 0) + 1);
  const parts = [...counts.entries()].map(([t, n]) => `${n} ${t}${n === 1 ? '' : 's'}`);
  const notes = a.items.filter((it) => it.type === 'note' && it.text).map((it) => `"${it.text}"`);
  return [parts.join(', ') || 'no marks', notes.length ? `notes: ${notes.join(', ')}` : '']
    .filter(Boolean)
    .join('; ');
}

/** The model-facing README written into a scribble seed folder (how to read it). */
function scribbleReadme(a: ScribbleAnnotations | undefined, hasComposite: boolean, photoExt?: string): string {
  const view = hasComposite ? 'composite.png' : photoExt ? `photo.${photoExt}` : 'scribble.svg';
  const bullets = a
    ? a.items
        .map((it) => {
          const tail = it.type === 'note' && it.text ? `: "${it.text}"` : '';
          return `- ${it.type} (${it.colorName})${tail}`;
        })
        .join('\n')
    : '- (no structured annotations were captured)';
  return `# Scribble seed — an annotated photo (user INPUT / intent)

The user marked up a photo in the studio's "Scribble a seed" pad. This is their
intent and it ANCHORS the brainstorm — round 1 and every round build on it.

## Read this in order
1. **VIEW ${view}** — the photo WITH the user's marks, exactly as they saw it.${hasComposite ? '' : ' (composite render was unavailable — reconstruct marks from scribble.json over this image.)'}
2. **Read scribble.json** — every mark: type, palette color NAME, coordinates, and any note text.
3. photo.${photoExt ?? 'png'} is the clean background; scribble.svg is the editable composite.

## What the marks mean
- **arrow** → points AT a target   · **box** → scopes/emphasizes a region
- **highlighter** → mark-important  · **pen** → freehand circle / underline / cross-out
- **note** → a LITERAL instruction the user typed (obey the words, in their palette color)

## The marks${a ? ` (${a.items.length})` : ''}
${bullets}

Run \`.claude/commands/read-scribble.md\` to interpret these and write the intent into brainstorm.md.
`;
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
  /**
   * Structured model catalog served to the studio, even from legacy callers.
   * Scoped to the LIVE runtime: only models whose engineIds include this
   * harness can honestly be delegated to, so the studio's picker never offers a
   * model the running harness (Claude today; Copilot/CODEX when built) can't use.
   */
  private readonly modelsList: ModelCatalogEntry[];
  /** Runtime adapter that owns orchestration-facing metadata/copy. */
  private readonly engine: EngineAdapter;
  /** Live orchestration runtime metadata served to the studio. */
  private readonly runtime: RuntimeEngine;
  /** Orchestrator → studio handoff: the purpose the human already described. */
  private seedBrief: SeedBrief | null = null;
  /** Pending concierge question + its answer resolver (adaptive intake). */
  private concierge: ConciergeExchange | null = null;
  private conciergeResolve: ((answer: string | null) => void) | null = null;
  private conciergeSeq = 1;
  /** Pending Living Gallery + its pick resolver (methodology chooser). */
  private gallery: LivingGallery | null = null;
  private galleryResolve: ((method: string | null) => void) | null = null;
  /**
   * Intake gate (structural lock, run-brainstorm.md step 0): true once a Living
   * Gallery pick has been made for THIS thread, i.e. the mandatory concierge→
   * gallery front door has been walked. The present_board tool refuses the FIRST
   * board of a fresh thread until this is true — the crowned methodology cannot
   * be skipped à la carte. Resumed/non-empty threads are already past intake.
   */
  private galleryPicked = false;
  port = 0;

  /** Invoked when a UI command is queued (no board waiting) — demo orchestrator hook. */
  onQueuedCommand: ((request: CommandRequest) => void) | null = null;
  private startedAt: string | null = null;

  constructor(
    private store: SessionStore,
    private readonly options: BridgeOptions,
  ) {
    this.engine = options.engine ?? createEngineAdapter(options.runtime);
    this.themesList = options.themes;
    this.runtime = this.engine.runtime;
    // Only surface models usable on THIS harness: an entry is offered iff its
    // engineIds include the live runtime. String-configured models always match
    // (normalizeModel stamps them with the runtime's id); explicitly cross-harness
    // entries (e.g. a Copilot-only model in a Claude session) are filtered out.
    this.modelsList = options.models
      .map((model) => this.engine.normalizeModel(model))
      .filter((model) => model.engineIds.includes(this.runtime.id));
  }

  /**
   * True once the mandatory concierge→gallery intake has been walked for this
   * thread (a gallery pick was made). The present_board tool gates the first
   * board on it (structural lock — run-brainstorm.md step 0).
   */
  get intakeComplete(): boolean {
    return this.galleryPicked;
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
    this.galleryPicked = false; // a fresh thread must walk the intake front door again
    this.log(`attached new thread "${store.info.id}" — response state cleared`);
    this.broadcast({ type: 'hello', state: this.state() });
  }

  /** Live progress feedback — shown as the shimmer marker in the studio. */
  think(note: string | null): void {
    this.thinking = note;
    // Persist the chain of thought (rule: chains of thought persist to the plan
    // folder). Only real notes are recorded; clearing (null) is not an event.
    if (note) this.store.recordThinking(note);
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
      runtime: this.runtime,
      themes: this.themesList,
      theme: this.options.theme,
      models: this.modelsList,
      defaultModel: this.options.defaultModel,
      targetRepo: this.store.info.targetRepo ?? this.options.defaultTargetRepo?.() ?? null,
      progress: this.store.progress.slice(-200),
      tokens: this.store.tokenTotals(),
      tokensBySink: this.store.tokensBySink(),
      artifactChat: this.store.artifactChat,
      drafts: this.store.drafts,
      seedBrief: this.seedBrief,
      concierge: this.concierge,
      gallery: this.gallery,
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
            const { command, prompt, seed, attachments, model, palette, discussionId, round } = z
              .object({
                command: z.enum(['plan-closeout', 'discover-skills', 'new-brainstorm', 'reopen']),
                prompt: z.string().max(2000).optional(),
                seed: SeedIntakeSchema.optional(),
                /** New Discussion composer: files/photos seeding the brainstorm. */
                attachments: z.array(ResponseAttachmentSchema).optional(),
                /** New Discussion composer: model for round generation. */
                model: z.string().max(200).optional(),
                /** New Discussion composer: generation colors picked in the palette. */
                palette: z.array(PaletteColorSchema).max(64).optional(),
                /** reopen: the archived thread to bring back live. */
                discussionId: z.string().max(200).optional(),
                /** reopen: the round to resume the brainstorm at. */
                round: z.number().int().min(1).optional(),
              })
              .parse(JSON.parse(body));
            const seedNote = command === 'reopen'
              ? this.reopenSeedNote(discussionId, round)
              : ((): string | undefined => {
                  const notes = [
                    seed ? this.persistSeed(seed) : undefined,
                    ...(attachments ?? []).map((a) => {
                      const saved = this.persistAttachment(a);
                      return saved.savedPath
                        ? `Seed file "${saved.name || 'unnamed'}" saved at ${saved.savedPath} — Read it (vision for images) and fold it into the brief.`
                        : `Seed file "${a.name || 'unnamed'}" FAILED to persist (bad data URI or over 10MB) — tell the user honestly.`;
                    }),
                    // Routing is ALWAYS explicit (never by omission): a new
                    // brainstorm without a composer pick still names the
                    // best-SVG default itself. Non-generation commands
                    // (plan-closeout, discover-skills) carry no routing line.
                    model
                      ? `Model routing: the user chose ${model} — delegate round generation to it.`
                      : command === 'new-brainstorm'
                        ? `Model routing: no composer pick — delegate round generation to the best-SVG default ${this.options.defaultModel} (explicit; never route by omission).`
                        : undefined,
                    palette && palette.length > 0
                      ? `Palette: generate ALL SVGs using ONLY these colors: ${palette.map((c) => `${c.name} (${c.value})`).join(', ')}.`
                      : undefined,
                  ].filter(Boolean);
                  return notes.length > 0 ? notes.join('\n') : undefined;
                })();
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
      if (req.method === 'POST' && url.pathname === '/api/pinned') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { slug } = z.object({ slug: z.string().max(200) }).parse(JSON.parse(body));
            if (!this.store.artifacts.some((a) => a.slug === slug)) {
              res.writeHead(404, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: `no artifact "${slug}" in the live thread` }));
              return;
            }
            const pinned = this.store.togglePinned(slug);
            this.log(`artifact "${slug}" ${pinned ? 'pinned' : 'unpinned'} for ${this.store.info.id}`);
            this.broadcast({ type: 'hello', state: this.state() });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, pinned }));
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
                error: 'this server cannot persist a default target repo (no config writer) — set targetRepo in visual-brainstorm.config.json or use thread scope',
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
        const svgPath = this.resolveArtifactSvgPath(slug);
        if (svgPath) {
          res.writeHead(200, { 'content-type': MIME['.svg'] });
          fs.createReadStream(svgPath).pipe(res);
        } else {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: `no artifact "${slug}" in any cached thread` }));
        }
        return;
      }
      const decisionMatch = url.pathname.match(/^\/api\/decision-tree\/([^/]+)$/);
      if (req.method === 'GET' && decisionMatch) {
        try {
          // decodeURIComponent + resolveDir MUST be inside the try: a throw here
          // (malformed id, unresolvable dir) previously escaped the handler with
          // NO response written, hanging the client fetch forever — the studio
          // overlay stuck on "building the decision tree…" (caught by human-sim's
          // canonical-content assertion, 2026-07-08).
          const id = decodeURIComponent(decisionMatch[1]);
          const dir = SessionStore.resolveDir(this.options.discussionRoot, id);
          const thread = SessionStore.open(dir);
          const tree = buildDecisionTree(thread.info.title, thread.rounds);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ tree, svg: decisionTreeToSvg(tree) }));
        } catch (err) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: `thread not found: ${String(err)}` }));
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
              tokens: thread.tokenTotals(),
              // Persisted dialogs reload with the thread (read-only in the studio).
              artifactChat: thread.artifactChat,
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
                category: TokenSinkSchema.optional(),
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
      if (req.method === 'POST' && url.pathname === '/api/client-log') {
        // Client-error observability: uncaught studio errors land in the SAME
        // log ring as bridge events, so GET /api/logs tells the whole story
        // (a blank page must never be evidence-free — 2026-07-07).
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 32_000) req.destroy(); // cap: errors are small
        });
        req.on('end', () => {
          try {
            const { source, message, stack } = z
              .object({
                source: z.string().max(200),
                message: z.string().min(1).max(4000),
                stack: z.string().max(8000).optional(),
              })
              .parse(JSON.parse(body));
            const firstFrames = (stack ?? '').split('\n').slice(0, 6).join(' | ');
            this.log(`STUDIO CLIENT ERROR [${source}]: ${message}${firstFrames ? ` — ${firstFrames}` : ''}`);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/artifact-chat') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { artifactSlug, text, discussionId } = z
              .object({
                artifactSlug: z.string(),
                text: z.string().min(1).max(4000),
                // Present when chatting on an archived (non-live) thread; absent
                // means the live thread. Users can ask about any artifact whenever.
                discussionId: z.string().optional(),
              })
              .parse(JSON.parse(body));
            // Resolve the owning thread (live store or an archived thread opened
            // in place). A bad id → 404 rather than silently answering the wrong
            // thread.
            let target: SessionStore;
            try {
              target = this.resolveChatStore(discussionId);
            } catch (err) {
              res.writeHead(404, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: `no discussion "${discussionId}": ${String(err)}` }));
              return;
            }
            const isLive = target.info.id === this.store.info.id;
            // The chat subject is a captured artifact OR a board option from
            // any round (previous choices), addressed by its option: slug.
            const artifact = target.artifacts.find((a) => a.slug === artifactSlug);
            const optionRef = artifact ? null : parseOptionChatSlug(artifactSlug);
            const optionRound = optionRef
              ? target.rounds.find((r) => r.board.id === optionRef.boardId)
              : undefined;
            const option = optionRound?.board.options.find((o) => o.id === optionRef?.optionId);
            if (!artifact && !option) {
              res.writeHead(404, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: `no artifact or board option "${artifactSlug}" in thread "${target.info.id}"` }));
              return;
            }
            this.announceArtifactChat(
              ArtifactChatMessageSchema.parse({
                artifactSlug,
                role: 'user',
                text,
                at: new Date().toISOString(),
              }),
              target.info.id,
            );
            // A dialog on an archived thread names it so the orchestrator loads
            // it (load_discussion) and replies in place with discussionId. Since
            // capture_artifact writes to the LIVE store, revisions on an archived
            // thread are answered honestly ("reopen to revise") — never captured
            // into the wrong thread (rules 6/7).
            const where = isLive
              ? ''
              : ` This artifact belongs to ARCHIVED thread "${target.info.id}" (NOT the live thread): ` +
                `first load_discussion("${target.info.id}") to read it, then reply_artifact_chat with ` +
                `discussionId "${target.info.id}". A question is answered in place; a CHANGE request cannot be ` +
                `captured into an archived thread — reply honestly that reopening the thread is required to revise.`;
            const seedNote = artifact
              ? `Artifact chat: the user is asking about artifact "${artifact.name}" (slug ${artifact.slug}, ` +
                `SVG at ${artifact.svgPath}). Run .claude/commands/artifact-chat.md: ALWAYS delegate to a ` +
                `subagent; answer with the reply_artifact_chat tool` +
                (isLive
                  ? `; if the artifact is changed, capture the revision with capture_artifact (revises: "${artifact.slug}") and include revisedSlug in the reply.`
                  : `.`) +
                where
              : `Artifact chat about a board option: the user is asking about option "${option!.label}" ` +
                `(round ${optionRound!.board.round}, id ${option!.id}) — SVG at ` +
                `${path.join(target.info.dir, `round-${String(optionRound!.board.round).padStart(2, '0')}`, `option-${option!.id}.svg`)}. ` +
                `Run .claude/commands/artifact-chat.md: ALWAYS delegate to a subagent; answer with the ` +
                `reply_artifact_chat tool using artifactSlug "${artifactSlug}" EXACTLY.` +
                (isLive
                  ? ` If the user asks for a change, capture the result as a NEW artifact (capture_artifact with ` +
                    `boardId/optionIds provenance) and include its slug as revisedSlug in the reply — round options ` +
                    `are never overwritten (rule 7).`
                  : ``) +
                where;
            const delivered = this.dispatchCommand('artifact-chat', text, seedNote);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, delivered }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/board-draft') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            // The studio's in-progress board answer (dials/selections/notes/…),
            // persisted so it survives an artifact-chat detour and is recallable.
            const draft = BoardResponseSchema.parse(JSON.parse(body));
            if (!this.store.rounds.some((r) => r.board.id === draft.boardId)) {
              res.writeHead(404, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: `no board "${draft.boardId}" in the live thread` }));
              return;
            }
            this.store.recordBoardDraft(draft);
            this.broadcast({ type: 'draft', draft });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/artifact-notes') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { artifactSlug, notes } = z
              .object({ artifactSlug: z.string(), notes: z.string().max(8000) })
              .parse(JSON.parse(body));
            const artifact = this.store.updateArtifactNotes(artifactSlug, notes);
            if (!artifact) {
              res.writeHead(404, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: `no artifact "${artifactSlug}" in the live thread` }));
              return;
            }
            this.log(`artifact notes saved (${artifactSlug}): "${notes.slice(0, 80)}"`);
            this.broadcast({ type: 'artifact', artifact });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, artifact }));
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
      if (req.method === 'POST' && url.pathname === '/api/concierge') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { id, answer } = z
              .object({ id: z.string(), answer: z.string().max(4000) })
              .parse(JSON.parse(body));
            if (!this.concierge || this.concierge.id !== id || !this.conciergeResolve) {
              res.writeHead(404, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'no concierge question awaiting this id' }));
              return;
            }
            this.conciergeResolve(answer);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/gallery-pick') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { id, method } = z
              .object({ id: z.string(), method: z.string().max(200) })
              .parse(JSON.parse(body));
            if (!this.gallery || this.gallery.id !== id || !this.galleryResolve) {
              res.writeHead(404, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'no living gallery awaiting this id' }));
              return;
            }
            if (!this.gallery.cards.some((c) => c.method === method)) {
              res.writeHead(400, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: `method "${method}" is not a card in this gallery` }));
              return;
            }
            this.galleryResolve(method);
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
    // Port discovery for the deterministic progress pipe: a port-conflict
    // fallback would otherwise silently orphan every posted event (the
    // lost-token-meter incident, 2026-07-07). Last-started bridge wins.
    try {
      const portFile = path.join(this.options.discussionRoot, '.logs', 'bridge-port.json');
      fs.mkdirSync(path.dirname(portFile), { recursive: true });
      fs.writeFileSync(
        portFile,
        JSON.stringify(
          { port: this.port, pid: process.pid, startedAt: this.startedAt, session: this.store.info.id },
          null,
          2,
        ),
      );
      this.log(`port file written: ${portFile}`);
    } catch (err) {
      this.log(`port file write failed (progress pipe will fall back to 5199): ${String(err)}`);
    }
  }

  private acceptResponse(raw: BoardResponse): void {
    // A response for a board that ALREADY has one is a REVISIT: the user
    // returned to a previous round and re-answered it (never a double-submit
    // of the live board — that path resolves and clears `pending` first).
    const answeredRound = this.store.rounds.find(
      (r) => r.board.id === raw.boardId && r.response !== null,
    );
    if (this.responses.has(raw.boardId) || answeredRound) {
      const board = answeredRound?.board ?? this.activeBoard;
      if (!board || board.id !== raw.boardId) {
        this.log(`repeat response for ${raw.boardId} without a matching round — ignored`);
        return;
      }
      this.acceptRevisit(board, raw);
      return;
    }
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
      this.thinking = this.engine.processingSelectionNote();
    }
    this.broadcast({ type: 'responded', boardId: response.boardId, response });
    this.broadcast({ type: 'thinking', note: this.thinking });
    const resolve = this.pending.get(response.boardId);
    if (resolve) {
      this.pending.delete(response.boardId);
      resolve(response);
    }
  }

  /**
   * Revisit: a previous round re-answered from the studio (return-to-round).
   * The new response replaces the recorded one (response.json rewritten;
   * brainstorm.md appends — history is never erased) and the orchestrator is
   * told to REWIND: a wait blocked on the current board resolves NOW with the
   * revisit response (its boardId names the rewound round); with no wait
   * blocked, a revisit-round command is queued for the next check-in.
   */
  private acceptRevisit(board: Board, raw: BoardResponse): void {
    const response: BoardResponse =
      raw.attachments.length > 0
        ? { ...raw, attachments: raw.attachments.map((a) => this.persistAttachment(a)) }
        : raw;
    this.responses.set(response.boardId, response);
    this.store.recordResponse(response);
    this.log(
      `REVISIT: round ${board.round} (${board.id}) re-answered — action=${response.action}, ` +
        `selected=${response.selectedOptionIds.length}; rewinding the funnel to it`,
    );
    this.broadcast({ type: 'responded', boardId: response.boardId, response });
    const active = this.activeBoard;
    const resolve = active ? this.pending.get(active.id) : undefined;
    this.thinking = this.engine.rewindNote(board.round);
    if (active && resolve) {
      this.pending.delete(active.id);
      this.activeBoard = null;
      resolve(response);
    } else {
      const request: CommandRequest = {
        command: 'revisit-round',
        seedNote:
          `REWIND: the user returned to round ${board.round} (board ${board.id}, "${board.title}") and ` +
          `re-answered it. The updated response is recorded at ` +
          `${path.join(this.store.info.dir, `round-${String(board.round).padStart(2, '0')}`, 'response.json')} ` +
          `(digest appended to brainstorm.md). Regenerate the funnel from THIS round's steering — later ` +
          `rounds are superseded history (they stay on disk, never deleted).`,
      };
      const waiter = this.commandWaiters.shift();
      if (waiter) {
        waiter(request);
      } else {
        this.commandQueue.push(request);
      }
      this.onQueuedCommand?.(request);
    }
    // Full resync: the rewound round's response, cleared active board, and
    // the rewinding shimmer all land in one hello.
    this.broadcast({ type: 'hello', state: this.state() });
  }

  /** Push a board and block until the studio responds (or timeout → null). */
  async presentAndWait(board: Board, timeoutMs: number, open = true): Promise<BoardResponse | null> {
    await this.start();
    this.log(
      `presenting ${board.id}: round ${board.round}, phase ${board.phase}, ${board.options.length} options, ` +
        `timeout ${Math.round(timeoutMs / 1000)}s, ${this.sockets.size} client(s) connected`,
    );
    this.activeBoard = board;
    this.thinking = null;
    this.broadcast({ type: 'board', board });
    this.broadcast({ type: 'thinking', note: null });
    if (open && !this.browserOpened) {
      this.browserOpened = true;
      openBrowser(this.url);
    }
    const responsePromise = new Promise<BoardResponse | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(board.id);
        resolve(null); // board stays live; peek_response recovers the late answer
      }, timeoutMs);
      this.pending.set(board.id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
    // Persistence is OFF the present→wire critical path. recordBoard() does
    // synchronous disk I/O (board.json, one write per option SVG, brainstorm.md;
    // for a mindmap also a tree-SVG snapshot + artifact capture) that measured
    // ~5–15ms — and running it BEFORE the broadcast blocked the queued board
    // frame from flushing to the studio (it can't leave the socket until the
    // sync tick ends). The pending resolver is already registered, so no
    // response can be dropped; one setImmediate lets the frame flush, then we
    // persist synchronously — still well before any networked response could
    // arrive (recordResponse relies on the round existing).
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.store.recordBoard(board);
    return responsePromise;
  }

  peekResponse(boardId: string): BoardResponse | null {
    return this.responses.get(boardId) ?? null;
  }

  /**
   * Start serving and open the browser with no board — the New Discussion
   * landing. `seed` is the handoff from Claude Code: the brief pre-fills the
   * composer, and (on a real run-brainstorm) a summary, a bespoke intake survey
   * (`questions`), and pre-selected `picks` let the human refine instead of
   * retyping (requires no rework). Empty fields are dropped so a bare
   * open_studio leaves the panel generic.
   */
  async openStudio(seed?: SeedBrief, open = true): Promise<void> {
    await this.start();
    const brief = seed?.brief?.trim();
    const summary = seed?.summary?.trim();
    const questions = seed?.questions && seed.questions.length > 0 ? seed.questions : undefined;
    const picks = seed?.picks && Object.keys(seed.picks).length > 0 ? seed.picks : undefined;
    if (brief || summary || questions || picks) {
      this.seedBrief = {
        ...(brief && { brief }),
        ...(summary && { summary }),
        ...(questions && { questions }),
        ...(picks && { picks }),
      };
      this.broadcast({ type: 'hello', state: this.state() });
    }
    if (open && !this.browserOpened) {
      this.browserOpened = true;
      openBrowser(this.url);
    }
  }

  /**
   * Adaptive concierge intake: present ONE clarifying question in the studio
   * (with tappable suggestion chips) and BLOCK until the user answers via
   * POST /api/concierge or the timeout passes. Claude calls this as many times
   * as it takes; each answered exchange is appended to brainstorm.md so it
   * lands in the digest the orchestrator builds the Living Gallery + boards on.
   */
  async askConcierge(
    question: string,
    suggestions: string[],
    timeoutMs: number,
  ): Promise<string | null> {
    await this.start();
    const exchange: ConciergeExchange = {
      id: `concierge-${this.store.info.id}-${this.conciergeSeq++}`,
      question,
      suggestions,
      answer: '',
    };
    this.concierge = exchange;
    this.log(`concierge asks: "${question.slice(0, 80)}" (${suggestions.length} chips)`);
    this.broadcast({ type: 'concierge', exchange });
    return new Promise<string | null>((resolve) => {
      const finish = (answer: string | null) => {
        this.concierge = null;
        this.conciergeResolve = null;
        this.broadcast({ type: 'concierge', exchange: null });
        resolve(answer);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      this.conciergeResolve = (answer) => {
        clearTimeout(timer);
        this.store.recordConcierge(question, answer);
        finish(answer);
      };
    });
  }

  /**
   * Living Gallery: present the methodology cards (each a live mini seeded from
   * the brief + answers) and BLOCK until the user picks one via
   * POST /api/gallery-pick or the timeout passes. The picked method routes the
   * session into that methodology; the choice is recorded to brainstorm.md.
   */
  async presentGallery(gallery: LivingGallery, timeoutMs: number): Promise<string | null> {
    await this.start();
    this.gallery = gallery;
    const methods = gallery.cards.map((c) => c.method);
    this.log(
      `living gallery: ${gallery.cards.length} cards (${methods.join(', ')}), ` +
        `recommended ${gallery.cards.find((c) => c.recommended)?.method ?? 'none'}`,
    );
    this.broadcast({ type: 'gallery', gallery });
    return new Promise<string | null>((resolve) => {
      const finish = (method: string | null) => {
        this.gallery = null;
        this.galleryResolve = null;
        this.broadcast({ type: 'gallery', gallery: null });
        resolve(method);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      this.galleryResolve = (method) => {
        clearTimeout(timer);
        this.galleryPicked = true; // intake gate satisfied — boards may now present
        this.store.recordGalleryPick(method, methods);
        finish(method);
      };
    });
  }

  /**
   * Resolve a captured artifact's on-disk SVG by slug. Live thread first (fast
   * path), then any cached thread — live root AND _completed/ — so an archived
   * thread's keeps render in the read-only fullscreen viewer. `path.basename`
   * guards against traversal from a decoded slug (mirrors resolveDir).
   */
  private resolveArtifactSvgPath(slug: string): string | null {
    const live = this.store.artifacts.find((a) => a.slug === slug);
    if (live && fs.existsSync(live.svgPath)) return live.svgPath;
    const safe = path.basename(slug);
    const roots = [this.options.discussionRoot, path.join(this.options.discussionRoot, '_completed')];
    for (const root of roots) {
      let entries: string[];
      try {
        entries = fs.readdirSync(root);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const candidate = path.join(root, entry, 'artifacts', `${safe}.svg`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return null;
  }

  /**
   * Build the reopen command's seed note — names the archived thread, its
   * current on-disk folder (under _completed/), and the round to resume at, so
   * .claude/commands/reopen.md moves it back and resumes without guessing.
   */
  private reopenSeedNote(discussionId?: string, round?: number): string {
    if (!discussionId) {
      return 'REOPEN requested but no discussionId was supplied — ask the user which archived thread to reopen.';
    }
    const dir = SessionStore.resolveDir(this.options.discussionRoot, discussionId);
    const at = round ? ` at round ${round}` : '';
    return (
      `REOPEN: the user asked to bring archived thread "${discussionId}" back live${at}. ` +
      `Its folder is currently ${dir} (under _completed/). Run .claude/commands/reopen.md: move it back into ` +
      `${this.options.discussionRoot} (git mv, keep the folder name), then resume the brainstorm live` +
      `${round ? ` from round ${round}` : ''} by calling present_board with discussionId="${discussionId}". ` +
      `Nothing is regenerated — the cached rounds/artifacts reload (rule 7).`
    );
  }

  /**
   * UI command button pressed (plan-closeout / discover-skills / reopen). If a
   * board is awaiting a response, resolve the wait NOW with a synthetic park
   * response carrying the command — Claude stops brainstorming and runs the
   * procedure. Otherwise queue it; it drains into the next present_board result.
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
      if (command === 'artifact-chat') {
        // NON-DESTRUCTIVE detour: hand the chat to the blocked present_board
        // WITHOUT recording a park response or clearing the board. The board
        // stays live so the user's in-progress dials/selections survive the chat
        // (they never unmount); the orchestrator answers, then re-enters
        // present_board (same board id — recordBoard is idempotent) to re-arm the
        // resolver. A real park/plan-closeout still goes through acceptResponse.
        const resolve = this.pending.get(this.activeBoard.id);
        this.pending.delete(this.activeBoard.id);
        this.log(`artifact-chat detour delivered via present_board (board ${this.activeBoard.id} stays live)`);
        resolve?.(response);
        return 'via-board-response';
      }
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
        // Rich annotated-photo scribble → a traversable folder the model can fully
        // read: composite.png (VISION-readable, unlike the SVG-as-text), photo.png,
        // scribble.svg, scribble.json (structured marks), README.md (how to read).
        if (seed.compositeDataUri || seed.annotations) {
          const folder = path.join(dir, `seed-${stamp}`);
          fs.mkdirSync(folder, { recursive: true });
          fs.writeFileSync(path.join(folder, 'scribble.svg'), seed.svg);
          if (seed.annotations) {
            fs.writeFileSync(path.join(folder, 'scribble.json'), JSON.stringify(seed.annotations, null, 2));
          }
          const composite = seed.compositeDataUri ? this.decodeImageDataUri(seed.compositeDataUri) : null;
          if (composite) fs.writeFileSync(path.join(folder, 'composite.png'), composite.buffer);
          const photo = seed.photoDataUri ? this.decodeImageDataUri(seed.photoDataUri) : null;
          if (photo) fs.writeFileSync(path.join(folder, `photo.${photo.ext}`), photo.buffer);
          fs.writeFileSync(path.join(folder, 'README.md'), scribbleReadme(seed.annotations, !!composite, photo?.ext));
          const view = composite ? 'composite.png' : photo ? `photo.${photo.ext}` : 'scribble.svg';
          return (
            `Seed scribble (annotated photo) saved at ${folder} — run .claude/commands/read-scribble.md on it: ` +
            `VIEW ${view} (vision) + read scribble.json/README.md, then ANCHOR the brainstorm on the user's marks` +
            (seed.annotations ? ` (${summarizeMarks(seed.annotations)})` : '') +
            '.' +
            (composite ? '' : ' NOTE: composite.png could not be persisted — reconstruct the marks from scribble.json over photo.png.')
          );
        }
        // Legacy / blank-canvas scribble: a single self-contained SVG.
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

  /** Decode a base64 image data URI to bytes + a normalized extension, or null. */
  private decodeImageDataUri(dataUri: string): { buffer: Buffer; ext: string } | null {
    const match = dataUri.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s);
    if (!match) return null;
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.byteLength > 10 * 1024 * 1024) {
      this.log('scribble image rejected: over 10MB');
      return null;
    }
    return { buffer, ext: match[1] === 'jpg' ? 'jpeg' : match[1] };
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

  /**
   * The store an artifact-chat targets. Absent/matching discussionId → the live
   * store (in-memory truth, reflected in /api/state). A DIFFERENT id → an
   * archived thread opened in place (answer-in-place, no reopen): disk is the
   * truth and the studio follows via the WS envelope's discussionId. Throws if
   * the thread folder does not exist.
   */
  resolveChatStore(discussionId?: string): SessionStore {
    if (!discussionId || discussionId === this.store.info.id) return this.store;
    return SessionStore.open(SessionStore.resolveDir(this.options.discussionRoot, discussionId));
  }

  /**
   * Persist + broadcast one artifact-chat message (HTTP user messages and MCP
   * replies both land here). `discussionId` addresses the owning thread — the
   * live thread when absent, an archived thread otherwise — so a dialog on a
   * completed thread records into ITS chat.jsonl and routes to that view.
   */
  announceArtifactChat(message: ArtifactChatMessage, discussionId?: string): void {
    const target = this.resolveChatStore(discussionId);
    target.recordArtifactChat(message);
    this.log(
      `artifact-chat (${message.artifactSlug}@${target.info.id}) ${message.role}: "${message.text.slice(0, 80)}"` +
        (message.revisedSlug ? ` → revised as ${message.revisedSlug}` : ''),
    );
    this.broadcast({ type: 'artifact-chat', message, discussionId: target.info.id });
  }

  async stop(): Promise<void> {
    this.wss?.close();
    for (const socket of this.sockets) socket.terminate();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
    this.server = null;
  }
}
