import type { Phase } from '@visual-brainstorm/protocol';

/**
 * Per-tab execution guide: how a human works each surface, always visible.
 * The board prompt says WHAT this round is about; this says HOW to answer it.
 * Plain language only: no emojis, no em dashes, no decorative characters.
 */
export const PHASE_GUIDE: Record<Phase, { title: string; steps: string[] }> = {
  diverge: {
    title: 'Pick what to build on',
    steps: [
      'Click the cards you like. The next round is built from your picks.',
      'Remix marks two options to combine into an extra variation right away.',
      'Note lets you tell Claude what works or fails on one option.',
      'Move a dial to steer the style of the next round.',
      'Send when done. Anything you did not pick is dropped.',
    ],
  },
  expand: {
    title: 'Amplify what resonates',
    steps: [
      'Pick at least one option to grow from. Sending is locked until you do.',
      'On send, new variations of your picks are added. Nothing is removed.',
      'Remix, notes, and dials work the same as in Diverge.',
      'When the pool feels rich, switch to Cluster or Converge to narrow it down.',
    ],
  },
  mutate: {
    title: 'Change one thing at a time',
    steps: [
      'Use the arrows to focus on one option. The rest is hidden on purpose.',
      'Click a lens (Flip, Invert, Stretch) to see the change live.',
      'If a change looks promising, press "This lens reveals something". It gets built into that option next round.',
      'Repeat for each option, then send.',
    ],
  },
  wreck: {
    title: 'Find what is broken',
    steps: [
      'Write what fails or looks cheap in each red box. Be blunt.',
      'Find at least 3 flaws. Sending is locked until you do.',
      'Each flaw comes back next round as a fix.',
    ],
  },
  cluster: {
    title: 'Group by dragging',
    steps: [
      'Drag similar options near each other. Rings show the groups the system infers.',
      'The Scaffold panel names your groups automatically as you drag.',
      'Click a pulsing ? between groups and describe what belongs in that gap. A hybrid appears next round.',
      'Send when the map matches how you see it.',
    ],
  },
  converge: {
    title: 'The gate: choose the final',
    steps: [
      'Give every option a verdict: Keep (saved as an artifact), Kill (gone for good), or Merge (combined into one).',
      'Mark one keep as Final if it is the answer.',
      'Send unlocks once everything has a verdict.',
      'Finalize saves the final option and closes out the discussion.',
    ],
  },
};
