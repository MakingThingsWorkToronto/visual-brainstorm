import type { ProgressEvent, StudioState, TokenSink } from '@visual-brainstorm/protocol';

/**
 * The client-side progress token reduction — pure so the unit layer can prove
 * it (the server reduction lives in SessionStore.tokensBySink; this is its
 * live-increment mirror in the studio). The bridge stamps `category` (and
 * clamps overlapping deltas) BEFORE broadcasting, so this stays dumb: add the
 * event's tokens to the running meter and its sink bucket, fold uncategorized
 * tokens into `orchestration` exactly like the server does.
 */
export function reduceProgressTokens(
  prev: Pick<StudioState, 'tokens' | 'tokensBySink'>,
  event: ProgressEvent,
): Pick<StudioState, 'tokens' | 'tokensBySink'> {
  const tok = event.tokens;
  if (!tok) return { tokens: prev.tokens, tokensBySink: prev.tokensBySink };
  const sink: TokenSink = event.category ?? 'orchestration';
  return {
    tokens: {
      input: prev.tokens.input + tok.input,
      output: prev.tokens.output + tok.output,
    },
    tokensBySink: {
      ...prev.tokensBySink,
      [sink]: (prev.tokensBySink[sink] ?? 0) + tok.input + tok.output,
    },
  };
}
