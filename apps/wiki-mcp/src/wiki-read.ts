/**
 * wiki-read.ts
 * Granular read helpers that preserve client context: an outline of a page's
 * headings (cheap), and a read that can return a SINGLE heading's subsection
 * instead of the whole page. A full read over the size cap is truncated with
 * the outline attached so the caller can pull just the heading it needs.
 */

import type { WikiPage, OutlineEntry } from './types.js';
import { countWords } from './wiki-loader.js';

export const READ_MAX_CHARS = 8000;

interface Heading {
  level: number;
  title: string;
  /** 0-indexed line in the source. */
  index: number;
}

/** Parse ATX headings, ignoring any that fall inside ``` fenced code blocks. */
function parseHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) headings.push({ level: m[1]!.length, title: m[2]!.trim(), index });
  });
  return headings;
}

/** The line range [start, end) of the heading at `headings[i]`'s own subsection. */
function sectionRange(headings: Heading[], i: number, totalLines: number): [number, number] {
  const start = headings[i]!.index;
  const level = headings[i]!.level;
  let end = totalLines;
  for (let j = i + 1; j < headings.length; j++) {
    if (headings[j]!.level <= level) {
      end = headings[j]!.index;
      break;
    }
  }
  return [start, end];
}

export function outline(page: WikiPage): OutlineEntry[] {
  const lines = page.content.split('\n');
  const headings = parseHeadings(lines);
  return headings.map((h, i) => {
    const [start, end] = sectionRange(headings, i, lines.length);
    return {
      level: h.level,
      title: h.title,
      line: h.index + 1,
      wordCount: countWords(lines.slice(start, end).join('\n')),
    };
  });
}

export interface SectionRead {
  found: boolean;
  heading?: string;
  content: string;
}

/** Return only the subsection under the heading whose title matches `heading`. */
export function readSection(page: WikiPage, heading: string): SectionRead {
  const lines = page.content.split('\n');
  const headings = parseHeadings(lines);
  const wanted = heading.trim().toLowerCase();
  let i = headings.findIndex((h) => h.title.toLowerCase() === wanted);
  if (i === -1) i = headings.findIndex((h) => h.title.toLowerCase().includes(wanted));
  if (i === -1) {
    return {
      found: false,
      content: `Heading not found: "${heading}". Available headings: ${headings
        .map((h) => h.title)
        .join(' · ')}`,
    };
  }
  const [start, end] = sectionRange(headings, i, lines.length);
  return { found: true, heading: headings[i]!.title, content: lines.slice(start, end).join('\n').trim() };
}
