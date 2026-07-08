/**
 * wiki-search.ts
 * Dependency-free relevance search over the in-memory wiki index.
 *
 * Output is deliberately SHAPED to stay small (CLAUDE.md — a search must not
 * flood the client): each hit carries one bounded snippet and metadata, never
 * the full page. Read the page (or a single heading) with the read tools.
 */

import type { WikiPage, SearchOptions, SearchResult } from './types.js';
import { getPages } from './wiki-loader.js';

const SNIPPET_MAX = 200;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;
const W_TITLE = 0.6;
const W_CONTENT = 0.4;

function terms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 2),
    ),
  ];
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/** 0–1 relevance: title presence dominates, content frequency saturates at 3. */
function scorePage(page: WikiPage, queryTerms: string[]): number {
  const title = page.title.toLowerCase();
  const content = page.content.toLowerCase();
  let total = 0;
  for (const term of queryTerms) {
    let s = 0;
    if (title.includes(term)) s += W_TITLE;
    const hits = countOccurrences(content, term);
    if (hits > 0) s += W_CONTENT * Math.min(1, hits / 3);
    total += Math.min(s, 1);
  }
  return +(total / queryTerms.length).toFixed(3);
}

function extractSnippet(content: string, queryTerms: string[]): string {
  const cleaned = content.replace(/```[\s\S]*?```/g, '').replace(/[#*`_>|]/g, '');
  const lower = cleaned.toLowerCase();
  let idx = -1;
  for (const term of queryTerms) {
    const at = lower.indexOf(term);
    if (at !== -1 && (idx === -1 || at < idx)) idx = at;
  }
  const start = Math.max(0, idx - 60);
  const raw = cleaned.slice(start, start + SNIPPET_MAX).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + raw + (start + SNIPPET_MAX < cleaned.length ? '…' : '');
}

export function searchWiki(query: string, options: SearchOptions = {}): SearchResult[] {
  const { section, titleOnly } = options;
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let pool = getPages();
  if (section) pool = pool.filter((p) => p.section === section);

  if (titleOnly) {
    const lower = query.toLowerCase();
    return pool
      .filter((p) => p.title.toLowerCase().includes(lower))
      .slice(0, limit)
      .map((p) => ({
        path: p.path,
        title: p.title,
        section: p.section,
        snippet: extractSnippet(p.content, [lower]),
        wordCount: p.wordCount,
        score: 1,
      }));
  }

  const queryTerms = terms(query);
  if (queryTerms.length === 0) return [];

  return pool
    .map((p) => ({ page: p, score: scorePage(p, queryTerms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path))
    .slice(0, limit)
    .map(({ page, score }) => ({
      path: page.path,
      title: page.title,
      section: page.section,
      snippet: extractSnippet(page.content, queryTerms),
      wordCount: page.wordCount,
      score,
    }));
}
