#!/usr/bin/env node
/**
 * pipe-progress — deterministic forwarder of Claude session progress to the
 * Visual Brainstorm studio (POST /api/progress on the bridge). No model, no
 * interpretation: an event in, an event posted, silence otherwise.
 *
 * Two modes:
 *   CLI:  node scripts/pipe-progress.mjs --note "drawing round 2" [--source svg-artisan]
 *         [--in 1234 --out 567] [--port 5199]
 *   Hook: wired in .claude/settings.json — reads the Claude Code hook JSON from
 *         stdin (PostToolUse/SubagentStop/Stop) and forwards a mechanical label.
 *
 * Hook safety: ALWAYS exits 0, silently — a missing bridge must never break a
 * session. The bridge persists each event to the thread's progress.jsonl.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

const port = Number(arg('--port') ?? process.env.VIBR_PORT ?? 5199);

/** Mechanical labels for hook payloads — naming, not interpreting. */
const TOOL_LABELS = {
  mcp__visual_brainstorm__present_board: 'presented a board to the studio',
  'mcp__visual-brainstorm__present_board': 'presented a board to the studio',
  'mcp__visual-brainstorm__capture_artifact': 'captured an artifact',
  'mcp__visual-brainstorm__compose_poster': 'composed the decision poster',
  'mcp__visual-brainstorm__load_discussion': 'reloaded a cached thread',
  Agent: 'a subagent finished its task',
  Task: 'a subagent finished its task',
};

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
 */
function tokenDelta(sessionId, transcriptPath) {
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
    fs.writeFileSync(cursorFile, JSON.stringify(totals));
    const delta = {
      input: Math.max(0, totals.input - (prev.input ?? 0)),
      output: Math.max(0, totals.output - (prev.output ?? 0)),
    };
    return delta.input || delta.output ? delta : undefined;
  } catch {
    return undefined;
  }
}

function fromHook(payload) {
  const event = payload.hook_event_name ?? 'hook';
  const tool = payload.tool_name ?? '';
  const note =
    event === 'SubagentStop'
      ? 'a subagent finished'
      : event === 'Stop'
        ? 'Claude finished a turn'
        : TOOL_LABELS[tool] ?? (tool ? `used ${tool}` : event);
  const tokens =
    (event === 'Stop' || event === 'SubagentStop') && payload.session_id && payload.transcript_path
      ? tokenDelta(payload.session_id, payload.transcript_path)
      : undefined;
  return { note, source: `hook:${event}`, tokens };
}

try {
  let note = arg('--note');
  let source = arg('--source');
  let tokens;
  if (!note) {
    const raw = await readStdin();
    if (raw.trim()) {
      const hook = fromHook(JSON.parse(raw));
      note = hook.note;
      source ??= hook.source;
      tokens = hook.tokens;
    }
  }
  const tokensIn = Number(arg('--in') ?? 0);
  const tokensOut = Number(arg('--out') ?? 0);
  if (tokensIn || tokensOut) tokens = { input: tokensIn, output: tokensOut };
  if (note) {
    const body = {
      at: new Date().toISOString(),
      source: source ?? 'orchestrator',
      note,
      ...(tokens ? { tokens } : {}),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch(`http://127.0.0.1:${port}/api/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
  }
} catch {
  /* no bridge, bad payload, timeout — all silent no-ops (hook safety) */
}
process.exit(0);
