/**
 * Studio PREVIEW HARNESS — static fixture boards for exercising every surface
 * (phases, gates, preview modal, artifact shelf) in a browser. It contains NO
 * generator and NO orchestration: fixture in, response logged, next surface.
 * Real brainstorms run through Claude Code (the MCP server in .mcp.json).
 *
 * Run: npm run preview [phase]   →  open the printed URL.
 * Fixture threads persist to a temp dir, not .docs/discussion.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASES, PhaseSchema, SurveyConfigSchema, type Board } from '@visual-brainstorm/protocol';
import { Bridge } from './bridge-server.js';
import { SessionStore } from './session-store.js';
import { loadConfig } from './config.js';
import { FileLog, installCrashHandlers } from './log.js';
import { loadThemes } from './themes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const config = loadConfig(repoRoot);
const repoDiscussion = path.resolve(repoRoot, config.discussionDir);

const logger = new FileLog(path.join(repoDiscussion, '.logs'), 'preview');
installCrashHandlers(logger);

// Fixture data only — design-preview assets, never presented as generated output.
const fixture = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const FIXTURE_OPTIONS = [
  { id: 'fx-circle', label: 'Fixture: circle', svg: fixture('<circle cx="24" cy="24" r="14" stroke="#a855f7"/>') },
  { id: 'fx-square', label: 'Fixture: square', svg: fixture('<rect x="10" y="10" width="28" height="28" rx="4"/>') },
  { id: 'fx-triangle', label: 'Fixture: triangle', svg: fixture('<path d="M24 8 42 40H6Z" stroke="#a855f7"/>') },
  { id: 'fx-lines', label: 'Fixture: lines', svg: fixture('<path d="M8 14h32M8 24h32M8 34h20"/>') },
].map((o) => ({ ...o, description: 'static preview fixture', tags: ['fixture'], parents: [] }));

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-preview-'));
const store = new SessionStore('Studio preview tour (fixtures)', scratch);
const bridge = new Bridge(store, {
  discussionRoot: repoDiscussion, // real threads stay browsable in the left nav
  themes: loadThemes(config, repoRoot),
  theme: config.theme,
  models: config.models,
  defaultModel: config.defaultModel,
  engine: 'preview',
  log: (m) => logger.log(m),
  recentLogs: () => logger.recent(),
  logFile: () => logger.filePath,
});
bridge.onQueuedCommand = (request) => {
  bridge.think(
    request.command === 'new-brainstorm'
      ? `No generator here — this is the preview harness. Start Claude Code in this repo (the MCP server auto-loads via .mcp.json) and say: brainstorm: ${request.prompt ?? '<your prompt>'}`
      : `“${request.command}” noted — on the real engine, Claude runs .claude/commands/${request.command}.md.`,
  );
};
await bridge.start();
console.error(`\n  Studio preview (fixtures only) →  ${bridge.url}`);
console.error(`  Real brainstorms run through Claude Code — this harness only exercises the UI.\n`);

const phaseArg = PhaseSchema.safeParse(process.argv[2]);
let i = phaseArg.success ? PHASES.indexOf(phaseArg.data) : 0;

for (;;) {
  const phase = PHASES[i];
  const board: Board = {
    id: `preview-r${store.nextRound()}-${Date.now()}`,
    sessionId: store.info.id,
    round: store.nextRound(),
    kind: 'freeform',
    phase,
    title: `Preview — ${phase} surface`,
    prompt: `Fixture board for the ${phase} surface. Interact freely; responses are logged, nothing is generated.`,
    options: FIXTURE_OPTIONS,
    survey: SurveyConfigSchema.parse({
      multiSelect: true,
      axes: [
        { id: 'a1', label: 'Axis A', leftLabel: 'Left', rightLabel: 'Right', defaultValue: 50 },
        { id: 'a2', label: 'Axis B', leftLabel: 'Low', rightLabel: 'High', defaultValue: 30 },
        { id: 'a3', label: 'Axis C', leftLabel: 'Cold', rightLabel: 'Hot', defaultValue: 70 },
        { id: 'a4', label: 'Axis D', leftLabel: 'Soft', rightLabel: 'Hard', defaultValue: 50 },
        { id: 'a5', label: 'Axis E', leftLabel: 'Few', rightLabel: 'Many', defaultValue: 50 },
      ],
    }),
    createdAt: new Date().toISOString(),
  };
  const response = await bridge.presentAndWait(board, 60 * 60 * 1000);
  if (!response) continue; // timeout: re-present
  if (response.action === 'back') {
    i = (i - 1 + PHASES.length) % PHASES.length;
    continue;
  }
  // Capture keeps/final so the artifact shelf is exercisable too.
  const keeps = Object.entries(response.triage)
    .filter(([, v]) => v === 'keep')
    .map(([id]) => id);
  if (response.finalOptionId) keeps.push(response.finalOptionId);
  for (const id of new Set(keeps)) {
    const option = board.options.find((o) => o.id === id);
    if (option) {
      bridge.announceArtifact(
        store.captureArtifact(option.label, option.svg, 'preview fixture keep', {
          boardId: board.id,
          optionIds: [id],
        }),
      );
    }
  }
  i = response.requestedPhase ? PHASES.indexOf(response.requestedPhase) : (i + 1) % PHASES.length;
  bridge.think('fixture response logged — presenting the next surface');
  await new Promise((r) => setTimeout(r, 700));
}
