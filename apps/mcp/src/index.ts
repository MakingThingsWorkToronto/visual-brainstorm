#!/usr/bin/env node
/**
 * Visual Brainstorm — stdio MCP server for Claude Code.
 * stdout is the MCP channel: log to stderr ONLY (CLAUDE.md appendix).
 */
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  AxisSchema,
  BoardKindSchema,
  PhaseSchema,
  SurveyConfigSchema,
  type Board,
  type BoardOption,
} from '@visual-brainstorm/protocol';
import { Bridge, type BridgeOptions } from './bridge-server.js';
import { buildFeedbackDigest } from './feedback.js';
import { composePoster } from './poster.js';
import { SessionStore } from './session-store.js';
import { discussionRoot, loadConfig, saveTargetRepo } from './config.js';
import { FileLog, installCrashHandlers } from './log.js';
import { loadThemes, saveThemeFile } from './themes.js';

const config = loadConfig();
const root = discussionRoot(config);
const logger = new FileLog(path.join(root, '.logs'), 'mcp');
installCrashHandlers(logger);

let store: SessionStore | null = null;
let bridge: Bridge | null = null;
/** Config default; a thread override in session.json wins (see effectiveTargetRepo). */
let defaultTargetRepo: string | null = config.targetRepo ?? null;

function effectiveTargetRepo(): string | null {
  return store?.info.targetRepo ?? defaultTargetRepo;
}

function bridgeOptions(): BridgeOptions {
  return {
    discussionRoot: root,
    themes: loadThemes(config),
    theme: config.theme,
    models: config.models,
    defaultModel: config.defaultModel,
    engine: 'claude',
    defaultTargetRepo: () => defaultTargetRepo,
    setDefaultTargetRepo: (p) => {
      defaultTargetRepo = p;
      saveTargetRepo(p);
    },
    saveTheme: (theme) => {
      saveThemeFile(theme, config);
      return loadThemes(config);
    },
    log: (m) => logger.log(m),
    recentLogs: () => logger.recent(),
    logFile: () => logger.filePath,
  };
}

/** Start a new thread, or resume an existing one when discussionId is given. */
function ensureSession(title: string, discussionId?: string): { store: SessionStore; bridge: Bridge } {
  if (!store) {
    store = discussionId
      ? SessionStore.open(SessionStore.resolveDir(root, discussionId))
      : new SessionStore(title, root);
    bridge = new Bridge(store, bridgeOptions());
    console.error(`[mcp] thread ${discussionId ? 'resumed' : 'started'}: ${store.info.dir}`);
  }
  return { store, bridge: bridge! };
}

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({ name: 'visual-brainstorm', version: '0.1.0' });

const OptionInputSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  description: z.string().optional(),
  svg: z.string().describe('Self-contained SVG markup with viewBox; no external refs or raster'),
  tags: z.array(z.string()).optional(),
  parents: z.array(z.string()).optional().describe('Option ids from earlier rounds this descends from'),
});

server.tool(
  'present_board',
  'Present an SVG option board to the user in the Visual Brainstorm studio and BLOCK until they respond ' +
    '(multi-select + per-option notes + remix pairs + axis dials + elaboration + model choice + action). ' +
    'Pre-phrase with AskUserQuestion first; make options meaningfully divergent. ' +
    'PHASE FUNNEL (see .claude/skills/brainstorm-phases): diverge (airy grid, expand freely) → mutate ' +
    '(SCAMPER lenses on one option at a time; honor response.mutations) → wreck (saboteur mode; convert ' +
    'response.flaws into fixes next round) → cluster (proximity field; response.positions/clusters/gapNotes ' +
    'encode the user’s implicit mental model — the gaps between clusters are where breakthroughs live) → ' +
    'converge (triage gate: response.triage keep/kill/merge is final). ' +
    'AXIS DELTAS ARE A COMPLETE INSTRUCTION: if axisValues moved versus their defaults — even with zero ' +
    'selections and no elaboration — regenerate the SAME concepts re-tuned to the new dial values and say so ' +
    'in the next prompt. A dial-only response must NEVER produce a no-op. ' +
    'If response.requestedPhase is set the user clicked a phase tab — present the next board in exactly that phase. ' +
    'If the response carries commands (plan-closeout, discover-skills, new-brainstorm), STOP brainstorming and run ' +
    'the matching .claude/commands/<command>.md procedure immediately (new-brainstorm → run-brainstorm.md from step 1). ' +
    'REQUIRED: at least 5 axes TAILORED to the domain of the prompt — never absolutes, always a range ' +
    'between two poles (icons: e.g. playful↔serious, flat↔glowing, geometric↔organic; ' +
    'system design: e.g. low↔high cloud cost, simple↔complex, monolith↔distributed, managed↔self-hosted). ' +
    'If the response carries a `model`, DELEGATE the next round’s generation to that model (subagent with model override). ' +
    'Pass discussionId to RESUME a prior thread from list_discussions. ' +
    'On timeout returns {status:"pending"} — the board stays live; recover with peek_response.',
  {
    title: z.string().describe('Board title; the first board also names the thread'),
    prompt: z.string().describe('Narration for this round — what changed since last round and what to judge'),
    kind: BoardKindSchema.default('freeform'),
    phase: PhaseSchema.default('diverge').describe(
      'Funnel phase: diverge | mutate | wreck | cluster | converge — the studio re-architects per phase',
    ),
    options: z.array(OptionInputSchema).min(1).max(16),
    axes: z
      .array(AxisSchema)
      .min(5)
      .describe('Minimum 5 range dials tailored to the initial prompt/domain'),
    survey: SurveyConfigSchema.omit({ axes: true }).partial().optional(),
    discussionId: z.string().optional().describe('Resume this prior thread (id from list_discussions)'),
    timeoutSeconds: z.number().int().min(10).max(86400).default(1740),
    openBrowser: z.boolean().default(true),
  },
  async (args) => {
    const { store, bridge } = ensureSession(args.title, args.discussionId);
    // A thread opened via open_studio has a placeholder title; the first real
    // board names it (display title only — the directory keeps its slug).
    if (store.rounds.length === 0 && !args.discussionId) store.retitle(args.title);
    const round = store.nextRound();
    const options: BoardOption[] = args.options.map((option, i) => ({
      id: option.id ?? `r${round}-o${i + 1}`,
      label: option.label,
      description: option.description,
      svg: option.svg,
      tags: option.tags ?? [],
      parents: option.parents ?? [],
    }));
    const board: Board = {
      id: `board-r${round}-${Date.now()}`,
      sessionId: store.info.id,
      round,
      kind: args.kind,
      phase: args.phase,
      title: args.title,
      prompt: args.prompt,
      options,
      survey: SurveyConfigSchema.parse({ ...(args.survey ?? {}), axes: args.axes }),
      createdAt: new Date().toISOString(),
    };
    console.error(`[mcp] presenting round ${round} (${options.length} options) — waiting for user`);
    const response = await bridge.presentAndWait(board, args.timeoutSeconds * 1000, args.openBrowser);
    if (!response) {
      return text({
        status: 'pending',
        boardId: board.id,
        studioUrl: bridge.url,
        hint: 'User has not responded yet. The board is still live in the studio; call peek_response with this boardId to collect the response. Do not treat this as failure.',
      });
    }
    // Package EVERY UI gesture into labeled, executable instructions — the
    // iterative-cycle contract (wiki/Requirements/interaction-protocol.md).
    const digest = buildFeedbackDigest(board, response);
    if (store.info.theme) {
      const theme = loadThemes(config).find((t) => t.name === store.info.theme);
      digest.push(
        `Discussion theme: ${theme?.label ?? store.info.theme}.` +
          (theme?.palette?.length
            ? ` Generate SVGs with its palette: ${theme.palette.map((c) => `${c.name} (${c.value})`).join(', ')}.`
            : '') +
          ' The studio is skinned with it; artifacts should harmonize.',
      );
    }
    const target = effectiveTargetRepo();
    if (target && (response.action === 'finalize' || response.commands.includes('plan-closeout'))) {
      digest.push(
        `Target repo for this thread: ${target} — Claude may read its wiki for context and write plans for it. ` +
          'During plan-closeout, ASK the user (AskUserQuestion) exactly where inside it the final artifacts go ' +
          '(its wiki/, its discussion/, an app images folder, or a custom path), then COPY the artifact .svg + .json ' +
          'provenance sidecars there. Copy, never move — the originals stay archived in this repo.',
      );
    }
    for (const { command, prompt, seedNote } of bridge.drainCommands()) {
      const file = command === 'new-brainstorm' ? 'run-brainstorm' : command;
      digest.push(
        `Command (queued from UI): run .claude/commands/${file}.md NOW.` +
          (prompt ? ` Seed prompt from the user: "${prompt}"` : '') +
          (seedNote ? ` ${seedNote}` : ''),
      );
    }
    return text({
      status: 'responded',
      boardId: board.id,
      feedbackDigest: digest,
      response,
      threadDir: store.info.dir,
    });
  },
);

server.tool(
  'open_studio',
  'Open the Visual Brainstorm studio with NO board — the New Discussion landing panel — and BLOCK until the ' +
    'user submits a brief (arrives as a new-brainstorm command with their prompt/seed notes) or the timeout ' +
    'passes. Use this when the user asks to start a brainstorm WITHOUT saying what about (e.g. a bare ' +
    '/run-brainstorm): instead of interrogating them in chat, land them on the panel and build the ' +
    'AskUserQuestion clarifications on what they submit. Timeout returns {status:"waiting"} — the studio ' +
    'stays open; call open_studio again (or check session_status.pendingUiCommands) to keep waiting.',
  {
    timeoutSeconds: z.number().int().min(10).max(86400).default(1740),
  },
  async ({ timeoutSeconds }) => {
    const { store, bridge } = ensureSession('New discussion');
    await bridge.openStudio();
    console.error('[mcp] studio open on the New Discussion panel — waiting for a brief');
    const request = await bridge.waitForCommand(timeoutSeconds * 1000);
    if (!request) {
      return text({
        status: 'waiting',
        studioUrl: bridge.url,
        hint: 'No brief submitted yet. The studio stays open on the New Discussion panel; call open_studio again to keep waiting.',
      });
    }
    const file = request.command === 'new-brainstorm' ? 'run-brainstorm' : request.command;
    return text({
      status: 'submitted',
      studioUrl: bridge.url,
      threadDir: store.info.dir,
      command: request.command,
      prompt: request.prompt ?? null,
      seedNote: request.seedNote ?? null,
      instruction:
        `Run .claude/commands/${file}.md NOW.` +
        (request.prompt ? ` The user's brief: "${request.prompt}".` : '') +
        (request.seedNote ? ` ${request.seedNote}` : ''),
    });
  },
);

server.tool(
  'peek_response',
  'Non-blocking: fetch the user response for a board that previously returned {status:"pending"}.',
  { boardId: z.string() },
  async ({ boardId }) => {
    const response = bridge?.peekResponse(boardId) ?? null;
    return text(response ? { status: 'responded', boardId, response } : { status: 'pending', boardId });
  },
);

server.tool(
  'capture_artifact',
  'Persist an accepted/final SVG artifact with provenance to the thread directory (every artifact is captured — rule 7). ' +
    'Also copies to <targetRepo>/brainstorm-artifacts/ when a target repo/folder is set (per-thread via the studio 📁 ' +
    'button, or the default in visual-brainstorm.config.json). Shows on the studio artifact shelf.',
  {
    name: z.string(),
    svg: z.string(),
    notes: z.string().default(''),
    boardId: z.string().optional(),
    optionIds: z.array(z.string()).default([]),
  },
  async ({ name, svg, notes, boardId, optionIds }) => {
    const { store, bridge } = ensureSession(name);
    const artifact = store.captureArtifact(name, svg, notes, { boardId, optionIds });
    bridge.announceArtifact(artifact);
    return text({ status: 'captured', artifact, copiedTo: copyToTargetRepo(artifact) });
  },
);

function copyToTargetRepo(artifact: { slug: string; svgPath: string }): string | null {
  const target = effectiveTargetRepo();
  if (!target) return null;
  const targetDir = path.join(path.resolve(target), 'brainstorm-artifacts');
  fs.mkdirSync(targetDir, { recursive: true });
  const copiedTo = path.join(targetDir, `${artifact.slug}.svg`);
  fs.copyFileSync(artifact.svgPath, copiedTo);
  fs.writeFileSync(path.join(targetDir, `${artifact.slug}.json`), JSON.stringify(artifact, null, 2));
  return copiedTo;
}

server.tool(
  'compose_poster',
  'Sudden-death finale: deterministically compose the shareable decision poster for the crowned option — ' +
    'winner large, lineage tree, and the notes that decided it — as ONE self-contained SVG built from the ' +
    'thread\'s cached rounds (nothing regenerated). Captures it as an artifact (rule 7) and shows it on the ' +
    'studio shelf. Call it right after capture_artifact when a finalize response arrives.',
  {
    optionId: z.string().describe('The crowned option id (response.finalOptionId)'),
    name: z.string().optional().describe('Poster artifact name; defaults to "<thread title> — decision poster"'),
    notes: z.string().default(''),
  },
  async ({ optionId, name, notes }) => {
    if (!store) {
      return text({ status: 'no-session', hint: 'compose_poster needs the live thread that produced the winner' });
    }
    const svg = composePoster(store.rounds, optionId, store.info.title);
    const artifact = store.captureArtifact(
      name ?? `${store.info.title} — decision poster`,
      svg,
      notes || `Auto-composed decision poster for crowned option ${optionId}.`,
      { optionIds: [optionId] },
    );
    bridge?.announceArtifact(artifact);
    return text({ status: 'captured', artifact, copiedTo: copyToTargetRepo(artifact) });
  },
);

server.tool(
  'list_discussions',
  'List all cached brainstorm threads in the discussion folder (discussion by default) — newest first. Use an id with present_board.discussionId or load_discussion.',
  {},
  async () => text(SessionStore.list(root)),
);

server.tool(
  'load_discussion',
  'Reload a cached thread in full (boards, responses, artifacts) so a chat can be reinitialized without regenerating anything. SVGs are on disk at the returned paths.',
  { id: z.string().describe('Thread id from list_discussions') },
  async ({ id }) => {
    const thread = SessionStore.open(SessionStore.resolveDir(root, id));
    return text({
      session: thread.info,
      rounds: thread.rounds.map((r) => ({
        round: r.board.round,
        title: r.board.title,
        kind: r.board.kind,
        prompt: r.board.prompt,
        options: r.board.options.map((o) => ({
          id: o.id,
          label: o.label,
          description: o.description,
          tags: o.tags,
          parents: o.parents,
          svgPath: path.join(thread.info.dir, `round-${String(r.board.round).padStart(2, '0')}`, `option-${o.id}.svg`),
        })),
        response: r.response,
      })),
      artifacts: thread.artifacts,
    });
  },
);

server.tool(
  'session_status',
  'Current brainstorm thread: directory, rounds so far (with responses), captured artifacts, studio URL.',
  {},
  async () => {
    if (!store) return text({ status: 'no-session', hint: 'present_board starts a thread; list_discussions shows cached ones' });
    return text({
      status: 'active',
      session: store.info,
      studioUrl: bridge?.url ?? null,
      targetRepo: effectiveTargetRepo(),
      pendingUiCommands: bridge?.peekCommands() ?? [],
      rounds: store.rounds.map((r) => ({
        round: r.board.round,
        title: r.board.title,
        kind: r.board.kind,
        optionCount: r.board.options.length,
        responded: r.response !== null,
        action: r.response?.action ?? null,
      })),
      artifacts: store.artifacts,
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mcp] visual-brainstorm MCP server connected (stdio)');
