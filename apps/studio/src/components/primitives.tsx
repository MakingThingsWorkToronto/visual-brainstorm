import type { ReactNode } from 'react';
import { sanitizeSvg } from '../lib/sanitize';

/** Message surface — after shadcn chat's Bubble. */
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
        className={`max-w-[52rem] rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
          side === 'user'
            ? 'rounded-br-sm border-accent/30 bg-accent/10'
            : 'rounded-bl-sm border-line bg-surface'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Status rows and labeled separators — after shadcn chat's Marker. */
export function Marker({ children, shimmer = false }: { children: ReactNode; shimmer?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-line" />
      <span className={`text-xs font-medium tracking-wide text-ink-dim ${shimmer ? 'shimmer' : ''}`}>
        {children}
      </span>
      <div className="h-px flex-1 bg-line" />
    </div>
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
