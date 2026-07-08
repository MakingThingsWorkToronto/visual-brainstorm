/**
 * wiki-loader.ts
 * Reads markdown from the repo's authoritative `wiki/` folder, parses light
 * metadata, and caches an in-memory index for cheap tool lookups.
 *
 * READ-ONLY: this server never writes wiki files (CLAUDE.md — edits stay
 * plain-file through the wiki-librarian; the MCP only reads).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WikiPage } from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * The wiki lives at the repo root `wiki/`. Compiled, this file is at
 * `apps/wiki-mcp/dist/wiki-loader.js`, so `../../../wiki` resolves to it.
 * `WIKI_PATH` overrides (e.g. to point at a target repo's wiki).
 */
export const WIKI_PATH: string =
  process.env.WIKI_PATH ?? path.resolve(moduleDir, '..', '..', '..', 'wiki');

function extractTitle(content: string, relPath: string): string {
  const match = /^#\s+(.+)$/m.exec(content);
  return match ? match[1]!.trim() : path.basename(relPath, '.md');
}

function extractLinks(content: string): string[] {
  const linkRe = /\[[^\]]+\]\(([^)]+\.md[^)]*)\)/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(content)) !== null) found.push(m[1]!);
  return [...new Set(found)];
}

/** Word count with fenced code blocks and markdown punctuation stripped. */
export function countWords(content: string): number {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#*`_[\]()>|]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function findMdFiles(dir: string, base: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // skip .git, .obsidian, etc.
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMdFiles(full, base));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return results;
}

function loadPage(relPath: string): WikiPage {
  const content = fs.readFileSync(path.join(WIKI_PATH, relPath), 'utf8');
  const segments = relPath.split('/');
  const section = segments.length > 1 ? segments[0]! : 'Root';
  return {
    path: relPath,
    title: extractTitle(content, relPath),
    section,
    content,
    wordCount: countWords(content),
    links: extractLinks(content),
  };
}

export function loadWiki(): WikiPage[] {
  if (!fs.existsSync(WIKI_PATH)) {
    process.stderr.write(`[wiki-mcp] WARN: wiki path not found: ${WIKI_PATH}\n`);
    return [];
  }
  return findMdFiles(WIKI_PATH, WIKI_PATH).sort().map(loadPage);
}

let cachedPages: WikiPage[] | null = null;

export function getPages(): WikiPage[] {
  if (!cachedPages) {
    cachedPages = loadWiki();
    process.stderr.write(`[wiki-mcp] loaded ${cachedPages.length} wiki pages from ${WIKI_PATH}\n`);
  }
  return cachedPages;
}

export function invalidateCache(): void {
  cachedPages = null;
}
