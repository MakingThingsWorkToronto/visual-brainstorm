#!/usr/bin/env node
/**
 * pipe-progress — deterministic forwarder of Claude session progress to the
 * Visual Brainstorm studio (POST /api/progress on the bridge). No model, no
 * interpretation: an event in, an event posted, silence otherwise.
 *
 * Two modes:
 *   CLI:  node scripts/pipe-progress.mjs --note "drawing round 2" [--source svg-artisan]
 *         [--in 1234 --out 567] [--port 5199]
 *         Structured status (protocol ProgressEvent fields — correlate the note
 *         to a specific streaming artifact): [--stage generating|revising|replacing]
 *         [--artifact <slug>] [--option <optionId>] [--board <boardId>]
 *         [--step N --of M]  (e.g. --stage generating --step 3 --of 6)
 *   Hook: wired in .claude/settings.json — reads the Claude Code hook JSON from
 *         stdin (PreToolUse/PostToolUse/SubagentStop/Stop) and forwards a
 *         mechanical label.
 *
 * Hook safety: ALWAYS exits 0, silently — a missing bridge must never break a
 * session. The bridge persists each event to the thread's progress.jsonl.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const arg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

/**
 * The bridge's actual port: on a port conflict it falls back to a random one
 * and events posted to 5199 vanish into the wrong (or no) instance — so the
 * bridge writes <discussionRoot>/.logs/bridge-port.json on start and this
 * pipe reads it. Explicit --port / VIBR_PORT still win; 5199 is the fallback.
 */
function discoverPort() {
  try {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    let root = path.join(repoRoot, 'discussion');
    try {
      const config = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'visual-brainstorm.config.json'), 'utf8'),
      );
      if (config.discussionDir) root = path.resolve(repoRoot, config.discussionDir);
    } catch {
      /* no config — default root */
    }
    const info = JSON.parse(fs.readFileSync(path.join(root, '.logs', 'bridge-port.json'), 'utf8'));
    return Number.isInteger(info.port) && info.port > 0 ? info.port : undefined;
  } catch {
    return undefined;
  }
}

const port = Number(arg('--port') ?? process.env.VIBR_PORT ?? discoverPort() ?? 5199);

/** Mechanical labels for hook payloads — naming, not interpreting. */
const TOOL_LABELS = {
  mcp__visual_brainstorm__present_board: 'presented a board to the studio',
  'mcp__visual-brainstorm__present_board': 'presented a board to the studio',
  'mcp__visual-brainstorm__present_gallery': 'presented the living gallery',
  'mcp__visual-brainstorm__ask_concierge': 'asked a concierge question',
  'mcp__visual-brainstorm__capture_artifact': 'captured an artifact',
  'mcp__visual-brainstorm__compose_poster': 'composed the decision poster',
  'mcp__visual-brainstorm__load_discussion': 'reloaded a cached thread',
  Agent: 'a subagent finished its task',
  Task: 'a subagent finished its task',
};

/**
 * Token-sink DECLARED by a tool boundary — the bridge attributes the FOLLOWING
 * turn-end token delta to it (see session-store attribution). A boundary carries
 * no tokens itself; it only names what the just-finished turn was doing.
 * `tweak` vs `generation` is told mechanically at the DELEGATION boundary
 * (PreToolUse svg-artisan, MUTATE marker — see fromHook); CLI `--category`
 * remains the explicit override for any harness without hooks.
 */
const TOOL_SINKS = {
  mcp__visual_brainstorm__present_board: 'generation',
  'mcp__visual-brainstorm__present_board': 'generation',
  'mcp__visual-brainstorm__present_gallery': 'intake',
  'mcp__visual-brainstorm__ask_concierge': 'intake',
  'mcp__visual-brainstorm__compose_poster': 'poster',
};

/**
 * Valid `--category` / `--stage` values come from the protocol package (rule 5:
 * `TOKEN_SINKS` / `PROGRESS_STAGES` in packages/protocol are the single source
 * of truth — an unknown value is silently stripped here; a stripped category
 * would misfold into `orchestration`, a stripped stage just loses correlation).
 * The import is guarded because this pipe is a hook that must NEVER fail: with
 * protocol unbuilt (fresh clone, mid-build), fall back to a local mirror.
 */
async function loadVocab() {
  try {
    const protocol = await import('../packages/protocol/dist/index.js');
    if (Array.isArray(protocol.TOKEN_SINKS) && Array.isArray(protocol.PROGRESS_STAGES)) {
      return { sinks: new Set(protocol.TOKEN_SINKS), stages: new Set(protocol.PROGRESS_STAGES) };
    }
  } catch {
    /* protocol dist unbuilt — hook safety over freshness */
  }
  // Fallback mirrors of protocol TOKEN_SINKS / PROGRESS_STAGES — dist unreadable only.
  return {
    sinks: new Set(['generation', 'tweak', 'intake', 'orchestration', 'poster']),
    stages: new Set(['generating', 'revising', 'replacing']),
  };
}
const { sinks: SINKS, stages: STAGES } = await loadVocab();

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

/** Sum assistant-turn usage over a Claude Code transcript JSONL. Mechanical. */
function transcriptTotals(file) {
  let input = 0;
  let output = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const usage = obj?.type === 'assistant' ? obj?.message?.usage : undefined;
      if (usage) {
        input += usage.input_tokens ?? 0;
        output += usage.output_tokens ?? 0;
      }
    } catch {
      /* skip unreadable lines */
    }
  }
  return { input, output };
}

/**
 * Token DELTA for this session since the last run — cursor in the OS temp dir.
 * A shrunk transcript (compaction) would go negative; report zero and re-base
 * rather than fabricate usage (rule 6). Cache reads are deliberately excluded.
 * The cursor is committed ONLY after the bridge accepted the event — a failed
 * POST must not swallow the delta (it rides along on the next event instead).
 */
function tokenDelta(sessionId, transcriptPath) {
  const none = { delta: undefined, commit: () => {} };
  try {
    const totals = transcriptTotals(transcriptPath);
    const cursorFile = path.join(
      os.tmpdir(),
      `vibr-token-cursor-${String(sessionId).replace(/[^\w.-]+/g, '_')}.json`,
    );
    let prev = { input: 0, output: 0 };
    try {
      prev = JSON.parse(fs.readFileSync(cursorFile, 'utf8'));
    } catch {
      /* first run for this session */
    }
    const commit = () => {
      try {
        fs.writeFileSync(cursorFile, JSON.stringify(totals));
      } catch {
        /* cursor loss only over-reports later — never blocks the pipe */
      }
    };
    const delta = {
      input: Math.max(0, totals.input - (prev.input ?? 0)),
      output: Math.max(0, totals.output - (prev.output ?? 0)),
    };
    if (!delta.input && !delta.output) {
      commit(); // nothing to report — re-base now (covers compaction shrink)
      return none;
    }
    return { delta, commit };
  } catch {
    return none;
  }
}

function fromHook(payload) {
  const event = payload.hook_event_name ?? 'hook';
  const tool = payload.tool_name ?? '';
  // Delegation boundary (PreToolUse Agent/Task): an svg-artisan delegation
  // declares its sink BEFORE the subagent runs, so the SubagentStop delta —
  // which carries the artisan's transcript usage — attributes to generation
  // (or tweak when the brief carries the deterministic MUTATE marker) instead
  // of folding into orchestration. Mechanical string match, no interpretation;
  // other subagent types stay unlabeled (their deltas are orchestration).
  if (event === 'PreToolUse' && (tool === 'Agent' || tool === 'Task')) {
    const input = payload.tool_input ?? {};
    const kind = String(input.subagent_type ?? input.subagentType ?? '');
    if (kind !== 'svg-artisan') return { note: undefined, commitTokens: () => {} };
    const sink = /\bMUTATE\b/.test(String(input.prompt ?? '')) ? 'tweak' : 'generation';
    return {
      note: sink === 'tweak' ? 'delegating a mutation round to svg-artisan' : 'delegating a board round to svg-artisan',
      source: 'hook:PreToolUse',
      tokens: undefined,
      category: sink,
      // The sink names the token bucket; the stage names the work itself
      // (same mechanical boundary, structured for the studio's status line).
      stage: sink === 'tweak' ? 'revising' : 'generating',
      commitTokens: () => {},
    };
  }
  const note =
    event === 'SubagentStop'
      ? 'a subagent finished'
      : event === 'Stop'
        ? 'Claude finished a turn'
        : TOOL_LABELS[tool] ?? (tool ? `used ${tool}` : event);
  const usage =
    (event === 'Stop' || event === 'SubagentStop') && payload.session_id && payload.transcript_path
      ? tokenDelta(payload.session_id, payload.transcript_path)
      : { delta: undefined, commit: () => {} };
  // A boundary tool declares the sink for the next turn-end delta; token-bearing
  // Stop events carry no category and are attributed by the bridge.
  const category = TOOL_SINKS[tool];
  return { note, source: `hook:${event}`, tokens: usage.delta, category, commitTokens: usage.commit };
}

try {
  let note = arg('--note');
  let source = arg('--source');
  let tokens;
  let category = arg('--category');
  let stage = arg('--stage');
  let commitTokens = () => {};
  if (!note) {
    const raw = await readStdin();
    if (raw.trim()) {
      const hook = fromHook(JSON.parse(raw));
      note = hook.note;
      source ??= hook.source;
      tokens = hook.tokens;
      category ??= hook.category;
      stage ??= hook.stage;
      commitTokens = hook.commitTokens;
    }
  }
  const tokensIn = Number(arg('--in') ?? 0);
  const tokensOut = Number(arg('--out') ?? 0);
  if (tokensIn || tokensOut) tokens = { input: tokensIn, output: tokensOut };
  if (category && !SINKS.has(category)) category = undefined; // ignore an unknown label
  if (stage && !STAGES.has(stage)) stage = undefined; // ignore an unknown stage
  // Structured correlation fields — which artifact/option/board the note concerns,
  // and its N-of-M position in a known batch. Mechanical passthrough, no defaults.
  const artifactSlug = arg('--artifact');
  const optionId = arg('--option');
  const boardId = arg('--board');
  const step = Number(arg('--step') ?? 0);
  const of = Number(arg('--of') ?? 0);
  const sequence =
    Number.isInteger(step) && Number.isInteger(of) && step >= 1 && of >= 1
      ? { current: step, total: of }
      : undefined;
  if (note) {
    const body = {
      at: new Date().toISOString(),
      source: source ?? 'orchestrator',
      note,
      ...(tokens ? { tokens } : {}),
      ...(category ? { category } : {}),
      ...(stage ? { stage } : {}),
      ...(artifactSlug ? { artifactSlug } : {}),
      ...(optionId ? { optionId } : {}),
      ...(boardId ? { boardId } : {}),
      ...(sequence ? { sequence } : {}),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`http://127.0.0.1:${port}/api/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    // The delta only counts as delivered when the bridge said ok — otherwise
    // the cursor stays put and the next event carries it.
    if (res.ok) commitTokens();
  }
} catch {
  /* no bridge, bad payload, timeout — all silent no-ops (hook safety) */
}
process.exit(0);
