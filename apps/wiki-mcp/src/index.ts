#!/usr/bin/env node
/**
 * Visual Brainstorm — read-only WIKI MCP server for Claude Code.
 *
 * Separate from the product MCP (`apps/mcp`): this one only READS the repo's
 * authoritative `wiki/` and hands agents context-shaped answers. stdout is the
 * MCP channel — log to stderr ONLY (CLAUDE.md appendix). No write tools; wiki
 * edits stay plain-file (rule 1/2, via the wiki-librarian).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getPages, invalidateCache, WIKI_PATH } from './wiki-loader.js';
import { searchWiki } from './wiki-search.js';
import { outline, readSection, READ_MAX_CHARS } from './wiki-read.js';
import type { WikiPage } from './types.js';

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function buildToc(pages: WikiPage[]): Record<string, { path: string; title: string; wordCount: number }[]> {
  const out: Record<string, { path: string; title: string; wordCount: number }[]> = {};
  for (const p of pages) (out[p.section] ??= []).push({ path: p.path, title: p.title, wordCount: p.wordCount });
  for (const section of Object.keys(out)) out[section]!.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Pages this page links to (outbound) or that link to it (inbound), capped. */
function findRelated(target: WikiPage, all: WikiPage[]): WikiPage[] {
  const file = target.path.split('/').pop() ?? '';
  const linked = new Set(target.links.map((l) => l.split('#')[0]!));
  const outbound = all.filter((p) => linked.has(p.path) || linked.has('../' + p.path));
  const inbound = all.filter((p) => p.path !== target.path && p.links.some((l) => l.includes(file)));
  return [...new Set([...outbound, ...inbound])].filter((p) => p.path !== target.path).slice(0, 8);
}

const server = new McpServer({ name: 'visual-brainstorm-wiki', version: '0.1.0' });

server.tool(
  'wiki_search',
  'Full-text relevance search across the Visual Brainstorm wiki. Returns ranked hits with a ' +
    'SINGLE bounded excerpt each (never full pages) so it stays cheap on context — follow up ' +
    'with wiki_outline + wiki_read(heading) to pull only what you need.',
  {
    query: z.string().describe('Natural-language or keyword query'),
    section: z.string().optional().describe('Restrict to a top-level folder (e.g. "System", "Requirements", "Product", "Meta", "Research")'),
    titleOnly: z.boolean().optional().describe('Match titles only (faster, no fuzzy)'),
    limit: z.number().int().optional().describe('Max results (default 8, max 25)'),
  },
  async ({ query, section, titleOnly, limit }) => {
    const results = searchWiki(query, { section, titleOnly, limit });
    return text({ results, count: results.length });
  },
);

server.tool(
  'wiki_outline',
  'Return a page\'s heading tree (level, title, line, per-section word count) WITHOUT its body — ' +
    'the cheap way to see a page\'s shape, then read one heading with wiki_read(path, heading).',
  { path: z.string().describe('Relative path from the wiki root, e.g. "Requirements/system-architecture.md"') },
  async ({ path: pagePath }) => {
    const page = getPages().find((p) => p.path === pagePath);
    if (!page) return text({ status: 'not-found', path: pagePath });
    return text({ path: page.path, title: page.title, headings: outline(page) });
  },
);

server.tool(
  'wiki_read',
  'Read a wiki page. Pass `heading` to get ONLY that heading\'s subsection (granular — preserves ' +
    'context; discover headings with wiki_outline). Without `heading` the full page is returned, but ' +
    `a page over ${READ_MAX_CHARS} chars is truncated with its outline attached so you can pull a single ` +
    'heading instead.',
  {
    path: z.string().describe('Relative path from the wiki root'),
    heading: z.string().optional().describe('Return only this heading\'s subsection (exact or substring match)'),
    maxChars: z.number().int().optional().describe(`Truncation cap for a full read (default ${READ_MAX_CHARS})`),
  },
  async ({ path: pagePath, heading, maxChars }) => {
    const page = getPages().find((p) => p.path === pagePath);
    if (!page) return text({ status: 'not-found', path: pagePath });
    if (heading) {
      const section = readSection(page, heading);
      return text({ path: page.path, title: page.title, heading, ...section });
    }
    const cap = maxChars ?? READ_MAX_CHARS;
    if (page.content.length > cap) {
      return text({
        path: page.path,
        title: page.title,
        section: page.section,
        wordCount: page.wordCount,
        truncated: true,
        content: page.content.slice(0, cap),
        outline: outline(page),
        hint: `Page is ${page.content.length} chars (cap ${cap}). Read a single heading with wiki_read(path, heading) using the outline above.`,
      });
    }
    return text({
      path: page.path,
      title: page.title,
      section: page.section,
      wordCount: page.wordCount,
      content: page.content,
      links: page.links,
    });
  },
);

server.tool(
  'wiki_list',
  'List wiki pages (path, title, section, word count) — metadata only, no bodies. Filter by section.',
  { section: z.string().optional().describe('Filter by top-level folder name') },
  async ({ section }) => {
    const all = getPages();
    const pages = section ? all.filter((p) => p.section === section) : all;
    return text({
      pages: pages.map((p) => ({ path: p.path, title: p.title, section: p.section, wordCount: p.wordCount })),
      count: pages.length,
    });
  },
);

server.tool('wiki_toc', 'Return the wiki table of contents grouped by section (metadata only).', {}, async () => {
  const pages = getPages();
  return text({ sections: buildToc(pages), totalPages: pages.length });
});

server.tool(
  'wiki_related',
  'Find pages related to a page via the markdown link graph (inbound + outbound), capped at 8.',
  { path: z.string().describe('Path of the source page') },
  async ({ path: pagePath }) => {
    const all = getPages();
    const page = all.find((p) => p.path === pagePath);
    if (!page) return text({ status: 'not-found', path: pagePath });
    return text({
      source: page.path,
      related: findRelated(page, all).map((p) => ({ path: p.path, title: p.title, section: p.section })),
    });
  },
);

server.tool(
  'wiki_reload',
  'Invalidate the in-memory cache and reload wiki pages from disk. Call after editing wiki files.',
  {},
  async () => {
    invalidateCache();
    return text({ status: 'reloaded', pageCount: getPages().length, wikiPath: WIKI_PATH });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[wiki-mcp] visual-brainstorm wiki MCP connected (stdio) — wiki: ${WIKI_PATH}`);
