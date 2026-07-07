import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { sanitizeSvg } from '../lib/sanitize';

/**
 * Mounts fullscreen overlays on document.body. `main.scroll-fade`'s mask-image
 * makes it a paint group that clips even position:fixed descendants, so any
 * `fixed inset-0` dialog rendered inside it paints inset and behind the nav —
 * portaling out is the fix. Inline fallback keeps renderToString smoke working
 * (the server renderer has no document and no portal support).
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, document.body);
}

/** Message surface — after shadcn chat's Bubble. Claude's side spans full width. */
export function Bubble({
  side,
  children,
}: {
  side: 'claude' | 'user';
  children: ReactNode;
}) {
  return (
    <div className={`flex ${side === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
          side === 'user'
            ? 'max-w-[52rem] rounded-br-sm border-accent/30 bg-accent/10'
            : 'w-full rounded-bl-sm border-line bg-surface'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Status rows and labeled separators — after shadcn chat's Marker. */
export function Marker({
  children,
  shimmer = false,
  action,
}: {
  children: ReactNode;
  shimmer?: boolean;
  /** Optional control next to the label (e.g. return-to-round) — reveal it on group-hover. */
  action?: ReactNode;
}) {
  return (
    <div className="group flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-line" />
      <span className={`text-xs font-medium tracking-wide text-ink-dim ${shimmer ? 'shimmer' : ''}`}>
        {children}
      </span>
      {action}
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

/** App icon — flat two-color lightbulb drawn in the active theme's colors. */
export function BulbIcon({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2a7 7 0 0 0-4 12.7c.7.5 1.2 1.3 1.4 2.1l.1.7h5l.1-.7c.2-.8.7-1.6 1.4-2.1A7 7 0 0 0 12 2Z"
        fill="var(--accent)"
      />
      <path
        d="M9.5 19h5v1a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 9.5 20v-1Z"
        fill="var(--ink-dim)"
      />
    </svg>
  );
}

/** Flat two-color folder in theme colors — pairs with BulbIcon. */
export function FolderIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M3 6a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.5.7L12.4 6H19a2 2 0 0 1 2 2v1H3V6Z"
        fill="var(--ink-dim)"
      />
      <path
        d="M3 9h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
        fill="var(--accent)"
      />
    </svg>
  );
}

/** Flat two-color microphone in theme colors — the voice-dictation control. */
export function MicIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" fill="var(--accent)" />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0"
        fill="none"
        stroke="var(--ink-dim)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M11.25 18h1.5v3h-1.5z M8.5 21h7v1.5h-7z" fill="var(--ink-dim)" />
    </svg>
  );
}

/** Renders untrusted SVG, sanitized (rule 8). */
export function SvgPane({ svg, className = '' }: { svg: string; className?: string }) {
  return (
    <div
      className={`svg-pane ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
    />
  );
}
