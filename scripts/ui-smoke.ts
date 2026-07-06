/**
 * Per-surface render test: every phase mechanic (Diverge grid, Mutation Lab,
 * Wreck Yard, Proximity Field + Scaffold, Triage Gate) must server-render
 * without crashing and contain its signature UI text. Run: npm run smoke:ui
 */
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;

const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const { BoardSchema } = await import('@visual-brainstorm/protocol');
const { BoardSurvey } = await import('../apps/studio/src/components/BoardSurvey.js');

const EXPECT: Record<string, string[]> = {
  diverge: ['remix', 'Send &amp; iterate', 'Playful', 'Back'],
  expand: ['remix', 'Amplify what resonates', 'select at least one option to expand from'],
  mutate: ['X-ray', 'the rest is hidden on purpose'],
  wreck: ['Wreckage mode', 'What breaks first'],
  cluster: ['Scaffold', 'cursor-grab'],
  converge: ['The gate', 'Keep', 'Kill', 'Merge', 'Final'],
};

for (const [phase, markers] of Object.entries(EXPECT)) {
  const board = BoardSchema.parse({
    id: `b-${phase}`,
    sessionId: 's',
    round: 1,
    kind: 'icon-grid',
    phase,
    title: `t-${phase}`,
    prompt: 'p',
    options: [
      { id: 'a', label: 'Alpha', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' },
      { id: 'b', label: 'Beta', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8"/></svg>' },
      { id: 'c', label: 'Gamma', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 9L5 1L9 9Z"/></svg>' },
    ],
    survey: {
      axes: [
        { id: 'x1', label: 'Tone', leftLabel: 'Playful', rightLabel: 'Serious' },
        { id: 'x2', label: 'Density', leftLabel: 'Minimal', rightLabel: 'Detailed' },
        { id: 'x3', label: 'Glow', leftLabel: 'Flat', rightLabel: 'Neon' },
        { id: 'x4', label: 'Shape', leftLabel: 'Geometric', rightLabel: 'Organic' },
        { id: 'x5', label: 'Read', leftLabel: 'Literal', rightLabel: 'Abstract' },
      ],
    },
    createdAt: 'now',
  });

  const html = renderToString(
    createElement(BoardSurvey, {
      board,
      models: ['claude-fable-5'],
      defaultModel: 'claude-fable-5',
      onRespond: async () => {},
      onPreview: () => {},
    }),
  );
  for (const marker of markers) {
    assert.ok(html.includes(marker), `[${phase}] missing marker "${marker}"`);
  }
  // The steerable PhaseBar must be present on every surface.
  assert.ok(html.includes('Converge'), `[${phase}] PhaseBar missing`);
  console.log(`UI ${phase.padEnd(8)} renders ✓ (${markers.length} markers)`);
}

console.log(`UI SMOKE PASS — all ${Object.keys(EXPECT).length} phase surfaces render with their mechanics`);
