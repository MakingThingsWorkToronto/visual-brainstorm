/**
 * Wiki domain types for the read-only wiki MCP.
 */

export interface WikiPage {
  /** Relative path from the wiki root, e.g. "Requirements/system-architecture.md" */
  path: string;
  /** Title from the first `# ` heading (falls back to the filename). */
  title: string;
  /** Top-level folder, e.g. "Requirements", "System", or "Root" for top-level files. */
  section: string;
  content: string;
  wordCount: number;
  /** Relative markdown links to other `.md` pages found in the content. */
  links: string[];
}

export interface SearchOptions {
  section?: string;
  titleOnly?: boolean;
  limit?: number;
}

export interface SearchResult {
  path: string;
  title: string;
  section: string;
  /** A single bounded excerpt around the best match — never the full page. */
  snippet: string;
  wordCount: number;
  /** 0–1, higher is a better match. */
  score: number;
}

export interface OutlineEntry {
  /** Heading depth: 1 for `#`, 2 for `##`, … */
  level: number;
  title: string;
  /** 1-indexed line number of the heading in the source. */
  line: number;
  /** Word count of this heading's own subsection (until the next same-or-higher heading). */
  wordCount: number;
}
