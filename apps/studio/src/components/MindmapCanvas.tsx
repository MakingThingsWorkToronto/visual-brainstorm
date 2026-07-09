import { useEffect, useRef, useState } from 'react';
import type { MindNode, MindTree, TreeOp } from '@visual-brainstorm/protocol';

/**
 * The mind-map methodology's live surface: ONE co-edited mind-elixir canvas
 * instead of a grid of options. The user edits nodes directly; every edit lifts
 * the current tree up as `editedTree` (the artifact IS the feedback —
 * wiki/Research/visualization-engines.md).
 *
 * Per-node controls (bound to the SELECTED node, so they survive mind-elixir's
 * re-renders): EXPLODE (voice-button styling) marks the node to be expanded into
 * ≥5 children relevant to its topic + note next round; +5 seeds five child ideas
 * immediately; DELETE eliminates the node; NOTE attaches steering text. Notes are
 * kept out-of-band and FOLDED into `editedTree` on every emit, so they always
 * ride back even when no structural edit fired. Structural intents ride back as
 * `treeOps` (persisted to round-NN/tree-ops.jsonl, digested for synthesis).
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
  onOp,
  onMaximize,
}: {
  tree: MindTree;
  /** Fired on every node edit with the full current tree (notes folded in). */
  onEdit: (edited: MindTree) => void;
  /** Fired when the user takes a node action (explode/add/delete/note). */
  onOp: (op: TreeOp) => void;
  /**
   * Open the mind map in the unified fullscreen viewer (SVG left, chat right —
   * exact same as an artifact) so the user can ask about it / iteratively improve
   * it. Absent → no maximize control (e.g. the snapshot has not been captured).
   */
  onMaximize?: () => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onOpRef = useRef(onOp);
  onOpRef.current = onOp;
  // mind-elixir instance + the per-node notes kept out-of-band (folded on emit).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mindRef = useRef<any>(null);
  const notesRef = useRef<Record<string, string>>({});

  const [selected, setSelected] = useState<{ id: string; topic: string } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  /** Attach every out-of-band note onto its node, so editedTree carries them. */
  const foldNotes = (node: MindNode): MindNode => {
    const note = notesRef.current[node.id];
    return {
      ...node,
      ...(note && note.trim() ? { note: note.trim() } : {}),
      children: node.children?.map(foldNotes),
    };
  };

  /** Lift the current engine tree (notes folded) up as editedTree. */
  const emitEdit = () => {
    const mind = mindRef.current;
    if (!mind) return;
    const data = mind.getData();
    onEditRef.current({ nodeData: foldNotes(data.nodeData), direction: data.direction });
  };

  useEffect(() => {
    let disposed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bus: any;
    const onOperation = () => emitEdit();
    // Read the engine's OWN current selection (robust across mind-elixir versions
    // and independent of whether a programmatic vs. click selection fired a bus
    // event). currentNode is the selected Topic element; its `.nodeObj` is the data.
    const readSelection = () => {
      const mind = mindRef.current;
      if (!mind) return;
      const cur = mind.currentNode ?? (mind.currentNodes && mind.currentNodes[0]);
      const obj = cur?.nodeObj ?? cur;
      if (obj?.id) {
        setSelected({ id: obj.id, topic: obj.topic ?? '' });
        setNoteDraft(notesRef.current[obj.id] ?? '');
      } else {
        setSelected(null);
      }
    };
    // mind-elixir passes the selected node object; shape varies by version, so
    // read id/topic defensively (nodeObj wrapper OR the node itself).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSelect = (node: any) => {
      const obj = node?.nodeObj ?? node;
      if (obj?.id) {
        setSelected({ id: obj.id, topic: obj.topic ?? '' });
        setNoteDraft(notesRef.current[obj.id] ?? '');
      } else {
        readSelection();
      }
    };
    const onUnselect = () => setSelected(null);
    // Fallback: a real pointer click on the canvas re-reads the engine selection
    // one tick later (after mind-elixir has updated currentNode). Covers the human
    // pathway (click a node → the bar binds to it) even if no bus event fires.
    const onContainerClick = () => window.setTimeout(readSelection, 0);
    void (async () => {
      const mod = await import('mind-elixir');
      if (disposed || !elRef.current) return;
      const MindElixir = mod.default;
      const container = elRef.current;
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instance: any = new MindElixir({
        el: container,
        direction: (tree.direction ?? MindElixir.SIDE) as 0 | 1 | 2,
        editable: true,
        theme: dark ? MindElixir.DARK_THEME : MindElixir.THEME,
      });
      // Seed the out-of-band note map from any notes already on the tree.
      const seed = (n: MindNode) => {
        if (n.note) notesRef.current[n.id] = n.note;
        n.children?.forEach(seed);
      };
      seed(tree.nodeData);
      instance.init({ nodeData: tree.nodeData, direction: tree.direction });
      const rawSelectNode = instance.selectNode?.bind(instance);
      if (rawSelectNode) {
        instance.selectNode = (...args: unknown[]) => {
          const result = rawSelectNode(...args);
          window.setTimeout(readSelection, 0);
          return result;
        };
      }
      mindRef.current = instance;
      bus = instance.bus;
      bus?.addListener('operation', onOperation);
      bus?.addListener('selectNode', onSelect);
      bus?.addListener('unselectNode', onUnselect);
      bus?.addListener('unselectNodes', onUnselect);
      container.addEventListener('click', onContainerClick);
      // Expose the live instance on its container (mind-elixir interop convention):
      // lets devtools + the human-sim driver inspect the tree and invoke a REAL
      // edit (e.g. selectNode + addChild) so editedTree comes from the genuine
      // engine → onEdit path, never a fabricated response.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (container as any).mind = instance;
    })();
    return () => {
      disposed = true;
      bus?.removeListener?.('operation', onOperation);
      bus?.removeListener?.('selectNode', onSelect);
      bus?.removeListener?.('unselectNode', onUnselect);
      bus?.removeListener?.('unselectNodes', onUnselect);
      elRef.current?.removeEventListener('click', onContainerClick);
      mindRef.current?.destroy?.();
      mindRef.current = null;
    };
    // Mount once: the board (and thus its tree) is keyed by board.id upstream,
    // so a new tree arrives as a fresh component, never as a prop mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flashMsg = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 2600);
  };

  // The five ideation angles an explode fans a node into — honest, deterministic
  // seed prompts (NOT fabricated AI ideas). A live orchestrator refines each into
  // a real idea (it reads the explode op); the user sees the expansion immediately.
  const EXPLODE_FACETS = ['core', 'variation', 'bold take', 'risk', 'next step'];

  const explode = async () => {
    if (!selected) return;
    const mind = mindRef.current;
    if (!mind?.findEle || !mind?.addChild) return;
    const note = (notesRef.current[selected.id] ?? '').trim();
    // The note STEERS the expansion: it anchors every prompt, so a different note
    // yields a visibly different set of children.
    const base = note ? `${selected.topic} · ${note}` : selected.topic;
    for (const facet of EXPLODE_FACETS) {
      const el = mind.findEle(selected.id);
      if (!el) break;
      // generateNewObj() gives a fresh unique id; we set its topic to the seed.
      const node = mind.generateNewObj();
      node.topic = `${base} — ${facet}`;
      await mind.addChild(el, node);
    }
    onOpRef.current({
      op: 'explode',
      nodeId: selected.id,
      topic: selected.topic,
      note,
      at: new Date().toISOString(),
    });
    emitEdit();
    flashMsg(
      `Exploded “${selected.topic}” into ${EXPLODE_FACETS.length} idea prompts${note ? ' steered by your note' : ''} — refine each, or let the next round enrich them.`,
    );
  };

  const addFive = async () => {
    if (!selected) return;
    const mind = mindRef.current;
    if (!mind?.findEle || !mind?.addChild) return;
    for (let i = 0; i < 5; i++) {
      // Re-find the parent each time (the tree re-renders on every addChild) and
      // pass it EXPLICITLY, so all five land under the same node regardless of
      // where mind-elixir moves the selection.
      const el = mind.findEle(selected.id);
      if (!el) break;
      await mind.addChild(el);
    }
    onOpRef.current({
      op: 'add',
      nodeId: selected.id,
      topic: selected.topic,
      note: '',
      count: 5,
      at: new Date().toISOString(),
    });
    emitEdit();
    flashMsg(`Added 5 idea nodes under “${selected.topic}”.`);
  };

  const remove = () => {
    if (!selected) return;
    const mind = mindRef.current;
    if (!mind?.findEle) return;
    // The root anchors the map — mind-elixir cannot remove it; say so honestly.
    if (mind.nodeData?.id === selected.id) {
      flashMsg('The root can’t be deleted — it anchors the map.');
      return;
    }
    // mind-elixir v5 exposes removeNodes(Topic[]) — there is NO removeNode(); the
    // old `mind.removeNode?.()` silently no-op’d (optional-chained past undefined),
    // which is why delete appeared to do nothing.
    const el = mind.findEle(selected.id);
    if (el && mind.removeNodes) mind.removeNodes([el]);
    delete notesRef.current[selected.id];
    const removed = selected.topic;
    onOpRef.current({
      op: 'delete',
      nodeId: selected.id,
      topic: selected.topic,
      note: '',
      at: new Date().toISOString(),
    });
    setSelected(null);
    setNoteOpen(false);
    emitEdit();
    flashMsg(`Deleted “${removed}”.`);
  };

  const commitNote = () => {
    if (!selected) return;
    const note = noteDraft.trim();
    if (note) notesRef.current[selected.id] = note;
    else delete notesRef.current[selected.id];
    onOpRef.current({
      op: 'note',
      nodeId: selected.id,
      topic: selected.topic,
      note,
      at: new Date().toISOString(),
    });
    emitEdit();
    flashMsg(note ? `Note saved on “${selected.topic}”.` : `Note cleared on “${selected.topic}”.`);
  };

  const hasNote = selected ? !!(notesRef.current[selected.id]?.trim()) : false;
  const btn = 'rounded-xl border px-3 py-2 text-sm disabled:opacity-40';

  return (
    <div data-testid="mindmap-canvas" className="rounded-2xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-ink">Mind map — one living structure</div>
        <div className="flex items-center gap-2">
          <div className="hidden text-[11px] text-ink-dim sm:block">
            click a node to select · double-click to rename · tab adds a child
          </div>
          {onMaximize && (
            <button
              type="button"
              data-testid="mindmap-maximize"
              onClick={onMaximize}
              title="Full-screen view — ask about the map / iteratively improve it (chat on the right)"
              aria-label="Maximize mind map"
              className="rounded-lg border border-line px-2 py-1 text-ink-dim hover:border-accent hover:text-ink"
            >
              <MaximizeIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Selected-node action bar — the per-node controls (explode/+5/delete/note). */}
      <div
        data-testid="node-actions"
        className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2"
      >
        <span className="text-xs text-ink-dim">
          {selected ? (
            <>node: <span className="font-semibold text-ink">{selected.topic || '(untitled)'}</span></>
          ) : (
            'select a node to explode, add ideas, note, or delete it'
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="node-explode"
            disabled={!selected}
            onClick={explode}
            title="Explode: fan this node into 5 idea prompts anchored on its topic + note (the next round enriches them)"
            className={`${btn} ${selected ? 'border-accent bg-accent/15 text-accent hover:brightness-105' : 'border-line'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <ExplodeIcon className="h-4 w-4" /> Explode
            </span>
          </button>
          <button
            type="button"
            data-testid="node-add"
            disabled={!selected}
            onClick={addFive}
            title="Add 5 idea nodes under this node right now"
            className={`${btn} border-line hover:border-accent`}
          >
            +5 ideas
          </button>
          <button
            type="button"
            data-testid="node-note"
            disabled={!selected}
            onClick={() => setNoteOpen((v) => !v)}
            title="Attach a steering note; a note changes what an explode generates"
            className={`${btn} ${hasNote ? 'border-accent text-accent' : 'border-line hover:border-accent'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <NoteIcon className="h-4 w-4" /> Note{hasNote ? ' •' : ''}
            </span>
          </button>
          <button
            type="button"
            data-testid="node-delete"
            disabled={!selected}
            onClick={remove}
            title="Delete this node (and its subtree)"
            className={`${btn} border-line text-red-500 hover:border-red-400`}
          >
            Delete
          </button>
        </div>
      </div>

      {noteOpen && selected && (
        <div className="mb-2 rounded-xl border border-line bg-surface-2 p-2">
          <textarea
            data-testid="node-note-input"
            autoFocus
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitNote}
            placeholder={`What should “${selected.topic}” mean? This steers its explosion.`}
            rows={2}
            className="w-full resize-none rounded-lg border border-line bg-surface p-2 text-xs outline-none focus:border-accent"
          />
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              data-testid="node-note-save"
              onClick={() => {
                commitNote();
                setNoteOpen(false);
              }}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:brightness-105"
            >
              Save note
            </button>
          </div>
        </div>
      )}

      {flash && (
        <div data-testid="node-flash" className="mb-2 text-[11px] text-accent">
          {flash}
        </div>
      )}

      <div
        ref={elRef}
        data-testid="mindmap-engine"
        className="mindmap-engine h-[480px] w-full overflow-hidden rounded-xl border border-line bg-canvas"
      />
    </div>
  );
}

function ExplodeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function MaximizeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NoteIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
