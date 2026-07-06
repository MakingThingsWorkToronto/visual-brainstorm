/**
 * Demo: start the bridge and present a sample icon-grid board without Claude.
 * Run: npm run demo   →  open the printed URL, select options, click Send.
 * The demo thread persists to this repo's .docs/discussion/ so it shows up in
 * the studio's left nav afterwards.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Board } from '@visual-brainstorm/protocol';
import { PhaseSchema, SurveyConfigSchema } from '@visual-brainstorm/protocol';
import { Bridge } from './bridge-server.js';
import { SessionStore } from './session-store.js';
import { loadConfig } from './config.js';
import { loadThemes } from './themes.js';

const NEON = '#a855f7';
const icon = (body: string, accent = NEON) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body.replaceAll('ACCENT', accent)}</svg>`;

const options = [
  {
    id: 'bulb-classic',
    label: 'Classic bulb',
    description: 'Literal, friendly, instantly read',
    svg: icon(
      '<path d="M24 6a12 12 0 0 0-7 21.5c1.6 1.3 3 3 3 5v1.5h8V32.5c0-2 1.4-3.7 3-5A12 12 0 0 0 24 6Z" stroke="ACCENT"/><path d="M20 39h8M22 43h4"/>',
    ),
    tags: ['literal', 'rounded'],
    parents: [],
  },
  {
    id: 'bulb-spark',
    label: 'Spark burst',
    description: 'Abstract energy — the moment of the idea',
    svg: icon(
      '<path d="M24 10v8M24 30v8M10 24h8M30 24h8" stroke="ACCENT"/><path d="M14 14l5.5 5.5M28.5 28.5 34 34M34 14l-5.5 5.5M19.5 28.5 14 34"/>',
    ),
    tags: ['abstract', 'energetic'],
    parents: [],
  },
  {
    id: 'bulb-chat',
    label: 'Idea in a bubble',
    description: 'Brainstorm-as-conversation framing',
    svg: icon(
      '<path d="M8 12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H22l-8 8v-8h-2a4 4 0 0 1-4-4V12Z"/><circle cx="24" cy="18" r="4.5" stroke="ACCENT"/><path d="M24 24.5v3" stroke="ACCENT"/>',
    ),
    tags: ['conversational'],
    parents: [],
  },
  {
    id: 'bulb-branch',
    label: 'Branching mind',
    description: 'Mind-map lineage — ideas beget ideas',
    svg: icon(
      '<circle cx="24" cy="24" r="5" stroke="ACCENT"/><circle cx="10" cy="10" r="3.5"/><circle cx="38" cy="10" r="3.5"/><circle cx="24" cy="41" r="3.5"/><path d="M20.5 20.5 13 13M27.5 20.5 35 13M24 29v8.5"/>',
    ),
    tags: ['structural'],
    parents: [],
  },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const config = loadConfig(repoRoot);
const repoDiscussion = path.resolve(repoRoot, config.discussionDir);

const store = new SessionStore('Demo — pick a logo direction', repoDiscussion);
const bridge = new Bridge(store, {
  discussionRoot: repoDiscussion,
  themes: loadThemes(config, repoRoot),
  theme: config.theme,
  models: config.models,
  defaultModel: config.defaultModel,
});
await bridge.start();
console.error(`\n  Visual Brainstorm demo →  ${bridge.url}\n`);

// Try any phase mechanic without Claude: npm run demo -- mutate|wreck|cluster|converge
const phaseArg = PhaseSchema.safeParse(process.argv[2]);
const phase = phaseArg.success ? phaseArg.data : 'diverge';

const board: Board = {
  id: `board-r1-demo`,
  sessionId: store.info.id,
  round: 1,
  kind: 'icon-grid',
  phase,
  title: `Visual Brainstorm logo — round 1 (${phase})`,
  prompt:
    'Four divergent directions for the project logo. Select the ones with legs, note anything per-option, mark a remix pair if two should be mashed up, and set the dials.',
  options,
  survey: SurveyConfigSchema.parse({
    multiSelect: true,
    maxSelect: 3,
    axes: [
      { id: 'tone', label: 'Tone', leftLabel: 'Playful', rightLabel: 'Serious', defaultValue: 40 },
      { id: 'weight', label: 'Density', leftLabel: 'Minimal', rightLabel: 'Detailed', defaultValue: 50 },
      { id: 'glow', label: 'Neon-ness', leftLabel: 'Flat', rightLabel: 'Full glow', defaultValue: 50 },
      { id: 'shape', label: 'Geometry', leftLabel: 'Geometric', rightLabel: 'Organic', defaultValue: 50 },
      { id: 'color', label: 'Color', leftLabel: 'Monochrome', rightLabel: 'Colorful', defaultValue: 60 },
      { id: 'read', label: 'Reading', leftLabel: 'Literal', rightLabel: 'Abstract', defaultValue: 40 },
    ],
  }),
  createdAt: new Date().toISOString(),
};

const response = await bridge.presentAndWait(board, 60 * 60 * 1000);
console.error('[demo] response:', JSON.stringify(response, null, 2));
console.error(`[demo] thread captured at ${store.info.dir}`);
await bridge.stop();
