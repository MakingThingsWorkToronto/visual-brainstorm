import { useState } from 'react';
import { FolderIcon } from './primitives';

/**
 * Target repo/folder — where final artifacts are COPIED (never moved) on capture
 * and plan-closeout, and whose wiki Claude may read for brainstorm context.
 * Any plain folder works. Per-thread override or config-file default; the bridge
 * validates the folder exists and broadcasts the new state to every client.
 */
export function TargetRepoPicker({ targetRepo }: { targetRepo: string | null }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = () => {
    setOpen(!open);
    if (!open) {
      setInput(targetRepo ?? '');
      setError(null);
    }
  };

  const apply = async (scope: 'thread' | 'default') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/target-repo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: input.trim() === '' ? null : input.trim(), scope }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error);
      } else {
        setOpen(false);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const shortName = targetRepo ? (targetRepo.split(/[\\/]/).filter(Boolean).pop() ?? targetRepo) : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className={`flex items-center gap-1.5 rounded-xl border bg-surface px-3 py-2 text-sm hover:border-accent ${
          targetRepo ? 'border-accent/50 text-ink' : 'border-line text-ink-dim'
        }`}
        title={
          targetRepo
            ? `Target repo/folder: ${targetRepo}. Final artifacts are copied here on closeout.`
            : 'Connect a target repo/folder. Claude reads its wiki for context and copies final artifacts there on closeout.'
        }
      >
        <FolderIcon />
        {shortName ?? 'Target Folder'}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-80 rounded-xl border border-line bg-surface p-3 shadow-xl">
          <div className="text-xs font-semibold">Target repo / folder</div>
          <p className="mt-1 text-[11px] leading-snug text-ink-dim">
            Any folder on this machine. Claude reads its wiki (if present) for brainstorm
            context and can write plans for it; on plan-closeout the final artifacts are{' '}
            <span className="font-medium text-ink">copied</span> there (you pick exactly
            where; originals stay archived here). Leave empty to clear.
          </p>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="C:\path\to\repo-or-folder"
            className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
          />
          {error && <div className="mt-2 text-[11px] text-red-500">{error}</div>}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => apply('thread')}
              title="Applies to the live brainstorm thread only (saved in its session.json)"
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
            >
              Set for this thread
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => apply('default')}
              title="Saved as targetRepo in visual-brainstorm.config.json — the default for every thread"
              className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-accent disabled:opacity-50"
            >
              Set as default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
