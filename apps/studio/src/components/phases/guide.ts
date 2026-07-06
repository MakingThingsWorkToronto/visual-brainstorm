import type { Phase } from '@visual-brainstorm/protocol';

/**
 * Per-tab execution guide — how a human works each surface, always visible.
 * The board prompt says WHAT this round is about; this says HOW to answer it.
 */
export const PHASE_GUIDE: Record<Phase, { title: string; steps: string[] }> = {
  diverge: {
    title: 'Expand, then point the vector',
    steps: [
      'Click cards to select — your selections become the PARENTS: the next round is built from them (select bulb + bubble → five bulb×bubble syntheses).',
      '⚡ remix marks two options to breed an extra offspring immediately.',
      '✎ note tells Claude what works or fails on a specific option.',
      'Move any dial and send — a dial change alone regenerates the round re-tuned.',
      'Send & iterate. Unselected directions are dropped, not re-shown.',
    ],
  },
  expand: {
    title: 'Amplify what resonates',
    steps: [
      'Select the options worth growing — at least one; the gate stays shut with none.',
      'On send, the pool GROWS: multiple new syntheses of your picks are added. Nothing is removed here.',
      'Use ⚡ remix, ✎ notes, and the dials exactly as in Diverge — they all still land.',
      'When the pool feels rich, switch to Cluster or Converge to start narrowing.',
    ],
  },
  mutate: {
    title: 'Distort one thing at a time',
    steps: [
      'Use ‹ › to focus one option — the rest is hidden on purpose.',
      'Click a lens (Flip, Invert, Stretch…) to see the distortion live.',
      'If the distortion exposes something good, press “This lens reveals something” — it gets baked into that option next round.',
      'Repeat per option, then Send & iterate.',
    ],
  },
  wreck: {
    title: 'Break things to get unstuck',
    steps: [
      'Write what fails, lies, or looks cheap in each red box — brutal beats polite.',
      'Find at least 3 flaws; the send buttons stay locked until you do.',
      'Each flaw returns next round as a fix (and sometimes as a feature).',
    ],
  },
  cluster: {
    title: 'Group by dragging — distance is data',
    steps: [
      'Drag similar options near each other; rings show the clusters the system infers.',
      'The Scaffold panel names and structures your groups automatically — just keep dragging.',
      'Click a pulsing ? between clusters and name what lives in that gap — a hybrid of the two clusters spawns next round.',
      'Send when the map matches your head.',
    ],
  },
  converge: {
    title: 'The gate — no more generating',
    steps: [
      'Give EVERY option a verdict: Keep (captured as an artifact), Kill (gone forever), or Merge (collapsed into one synthesis).',
      'Crown ONE keep with 🏁 Final if this is THE answer.',
      'Send unlocks only when everything is triaged.',
      '🏁 Finalize ends everything: the final is captured and plan closeout runs automatically (learnings harvested, thread archived).',
    ],
  },
};
