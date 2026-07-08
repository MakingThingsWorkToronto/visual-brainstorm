/**
 * wiki-mcp unit tests — exercise the read-only wiki MCP's pure logic against
 * THIS repo's REAL wiki/ (rule 10: real canonical data, no fixtures). Requires
 * a prior `npm run build` so apps/wiki-mcp/dist exists (build-check runs it).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getPages, loadWiki } from '../apps/wiki-mcp/dist/wiki-loader.js';
import { searchWiki } from '../apps/wiki-mcp/dist/wiki-search.js';
import { outline, readSection } from '../apps/wiki-mcp/dist/wiki-read.js';

test('loader indexes the real wiki, including known pages', () => {
  const pages = loadWiki();
  assert.ok(pages.length >= 5, `expected several wiki pages, got ${pages.length}`);
  const paths = pages.map((p) => p.path);
  assert.ok(paths.includes('Meta/agentic-loop.md'), 'agentic-loop.md indexed');
  assert.ok(paths.includes('README.md'), 'root README.md indexed');
  const readme = pages.find((p) => p.path === 'README.md');
  assert.equal(readme.section, 'Root', 'top-level files are section "Root"');
  const meta = pages.find((p) => p.path === 'Meta/agentic-loop.md');
  assert.equal(meta.section, 'Meta');
  assert.ok(meta.wordCount > 0);
});

test('search returns bounded, body-free, relevance-ranked hits', () => {
  const results = searchWiki('testing observability');
  assert.ok(results.length > 0, 'found hits');
  assert.ok(results.length <= 8, 'default limit is 8');
  for (const r of results) {
    assert.equal(r.content, undefined, 'search never returns full page content');
    assert.ok(r.snippet.length <= 205, `snippet bounded, got ${r.snippet.length}`);
    assert.ok(r.score > 0 && r.score <= 1, 'score in (0,1]');
    assert.ok('wordCount' in r);
  }
  // scores are monotonically non-increasing (ranked)
  for (let i = 1; i < results.length; i++) assert.ok(results[i - 1].score >= results[i].score);
  assert.ok(
    results.some((r) => r.path === 'System/testing-observability.md'),
    'the testing-observability page is a hit',
  );
});

test('search caps limit at 25 and honors a smaller limit', () => {
  const capped = searchWiki('the', { limit: 1000 });
  assert.ok(capped.length <= 25, 'limit hard-capped at 25');
  const one = searchWiki('the', { limit: 1 });
  assert.ok(one.length <= 1, 'explicit small limit honored');
});

test('titleOnly search matches on titles', () => {
  const results = searchWiki('agentic', { titleOnly: true });
  assert.ok(
    results.some((r) => r.path === 'Meta/agentic-loop.md'),
    'title match finds agentic-loop',
  );
});

test('outline returns the heading tree without bodies', () => {
  const page = getPages().find((p) => p.path === 'Meta/agentic-loop.md');
  const heads = outline(page);
  assert.ok(heads.length >= 3, 'several headings');
  assert.ok(
    heads.some((h) => h.title === 'The five stages'),
    'known heading present',
  );
  for (let i = 1; i < heads.length; i++) assert.ok(heads[i].line > heads[i - 1].line, 'lines ascend');
  for (const h of heads) assert.ok(h.wordCount >= 0 && typeof h.title === 'string');
});

test('granular read returns ONLY the requested subsection', () => {
  const page = getPages().find((p) => p.path === 'Meta/agentic-loop.md');
  const section = readSection(page, 'The five stages');
  assert.equal(section.found, true);
  assert.ok(section.content.includes('The five stages'), 'contains its own heading');
  assert.ok(section.content.length < page.content.length, 'shorter than the full page');
  assert.ok(
    !section.content.includes('Memory map (what persists where'),
    'stops before a sibling heading',
  );
});

test('granular read on a missing heading reports available headings', () => {
  const page = getPages().find((p) => p.path === 'Meta/agentic-loop.md');
  const section = readSection(page, 'no such heading here');
  assert.equal(section.found, false);
  assert.ok(section.content.includes('Heading not found'));
  assert.ok(section.content.includes('The five stages'), 'lists real headings to choose from');
});
