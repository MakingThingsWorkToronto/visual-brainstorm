import { useEffect, useRef } from 'react';
import type { MindTree } from '@visual-brainstorm/protocol';

/**
 * The mind-map methodology's live surface: ONE co-edited mind-elixir canvas
 * instead of a grid of options. The user edits nodes directly; every edit lifts
 * the current tree up as `editedTree` (the artifact IS the feedback —
 * wiki/Research/visualization-engines.md).
 *
 * mind-elixir is a DOM/canvas engine that also pulls in `.less`, so it is
 * DYNAMICALLY imported inside the mount effect: the static import graph stays
 * clean for the renderToString ui-smoke (whose esbuild has no .less loader and
 * whose server render never runs effects), and the engine only loads in the
 * browser. The static wrapper below is what ui-smoke asserts.
 */
export function MindmapCanvas({
  tree,
  onEdit,
}: {
  tree: MindTree;
  /** Fired on every node edit with the full current tree. */
  onEdit: (edited: MindTree) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;

  useEffect(() => {
    let disposed = false;
    let mind: { getData: () => MindTree; destroy?: () => void; bus?: { addListener: (t: string, h: () => void) => void; removeListener?: (t: string, h: () => void) => void } } | null = null;
    let bus: { addListener: (t: string, h: () => void) => void; removeListener?: (t: string, h: () => void) => void } | undefined;
    const handler = () => {
      if (!mind) return;
      const data = mind.getData();
      onEditRef.current({ nodeData: data.nodeData, direction: data.direction });
    };
    void (async () => {
      const mod = await import('mind-elixir');
      if (disposed || !elRef.current) return;
      const MindElixir = mod.default;
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instance: any = new MindElixir({
        el: elRef.current,
        direction: (tree.direction ?? MindElixir.SIDE) as 0 | 1 | 2,
        editable: true,
        theme: dark ? MindElixir.DARK_THEME : MindElixir.THEME,
      });
      instance.init({ nodeData: tree.nodeData, direction: tree.direction });
      mind = instance;
      bus = instance.bus;
      bus?.addListener('operation', handler);
    })();
    return () => {
      disposed = true;
      bus?.removeListener?.('operation', handler);
      mind?.destroy?.();
      mind = null;
    };
    // Mount once: the board (and thus its tree) is keyed by board.id upstream,
    // so a new tree arrives as a fresh component, never as a prop mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid="mindmap-canvas" className="rounded-2xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-ink">Mind map — one living structure</div>
        <div className="text-[11px] text-ink-dim">
          double-click a node to rename · tab adds a child · your edits return as you go
        </div>
      </div>
      <div
        ref={elRef}
        data-testid="mindmap-engine"
        className="mindmap-engine h-[480px] w-full overflow-hidden rounded-xl border border-line bg-canvas"
      />
    </div>
  );
}
