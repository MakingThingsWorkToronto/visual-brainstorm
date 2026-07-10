#!/usr/bin/env node
// check-agent-format.mjs — validates agent-submitted PRs and issues against the
// prompt-first format (wiki/System/agentic-pr-loop.md). Dependency-free; dumb by
// design (AGENTS.md rule 11) — it checks shape, it does not judge content.
//
// Usage (from the GitHub workflows):
//   node scripts/check-agent-format.mjs pr    <github-event.json> <changed-files.txt>
//   node scripts/check-agent-format.mjs issue <github-event.json>
//
// Exit 0 = format valid. Exit 1 = violations (one ::error annotation per finding).
//
// The two CANONICAL_*_PREFIX constants below are the single source of truth for the
// cache-stable prompt prefix. The templates (.github/pull_request_template.md,
// .github/ISSUE_TEMPLATE/agent-task.yml) embed them byte-for-byte and
// tests/agent-format.test.mjs fails the build if they drift.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CANONICAL_PR_PREFIX = `Agent PR review runner — visual-brainstorm.
Ground first: CLAUDE.md, then wiki/README.md, then the wiki pages the diff touches — the
wiki is authoritative; reconcile drift, never ignore it. Check out the branch declared
below. Read every file under the declared discussion folder (plan.md first): it is the
PR's full context and it travels in the diff.
Review the diff against the declared intent: every changed line must trace to it (rule 9);
no fake-success paths (rule 6); message shapes change only via packages/protocol (rule 5);
untrusted SVG stays sanitized (rule 8); wiki and user docs move with the change (rules 2, 12).
Prove, don't trust (rule 10): run npm run build and npm test, then every declared verify
step. End with exactly one verdict line:
VERDICT: APPROVE | REVISE — <required change> | REJECT — <reason>
The variable payload below the marker is this PR's only unique content.
---`;

export const CANONICAL_ISSUE_PREFIX = `Agent task runner — visual-brainstorm.
Ground first: CLAUDE.md, then wiki/README.md and the wiki pages this task touches — the
wiki is authoritative; reconcile drift, never ignore it. Work the task end to end:
plan at discussion/<slug>-<yyyy-mm-dd>/plan.md (rule 3); surgical changes only (rule 9);
tests ship with the change (rule 10); wiki + log move with any fact or contract change
(rules 2, 12); honest errors over fake success (rule 6). When npm run build and npm test
are green, move the plan folder to discussion_pr/<slug>/, open a PR in the agent PR
format (.github/pull_request_template.md — fill only the variable payload below its
marker), and link this issue.
The variable payload below the marker is this task's only unique content.
---`;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PR_TITLE_RE = /^(feat|fix|chore|docs|test|refactor|perf)(\([a-z0-9-]+\))?: .+/;
const ISSUE_TITLE_RE = /^(task|bug|chore): .+/;

const normalize = (text) =>
  String(text ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n');

// Returns { prefix, payload } from the body's single ```prompt fence, or an error string.
export function extractPrompt(body) {
  const text = normalize(body);
  const fences = [...text.matchAll(/^```prompt$([\s\S]*?)^```$/gm)];
  if (fences.length === 0) return { error: 'body has no ```prompt fenced block' };
  if (fences.length > 1) return { error: 'body must contain exactly one ```prompt block' };
  const inner = fences[0][1].replace(/^\n/, '').replace(/\n$/, '');
  const lines = inner.split('\n');
  const marker = lines.indexOf('---');
  if (marker === -1) return { error: 'prompt block has no --- variable-payload marker' };
  return {
    prefix: lines.slice(0, marker + 1).join('\n'),
    payload: lines.slice(marker + 1).join('\n'),
  };
}

// Minimal payload reader: top-level `key: value` scalars and `key:` + `  - item` lists.
export function parsePayload(payload) {
  const scalars = {};
  const lists = {};
  let openList = null;
  for (const raw of payload.split('\n')) {
    if (!raw.trim()) continue;
    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item && openList) {
      lists[openList].push(item[1].trim());
      continue;
    }
    const kv = raw.match(/^([a-z][a-z0-9_-]*):\s*(.*)$/i);
    if (kv) {
      const [, key, value] = kv;
      if (value === '') {
        openList = key;
        lists[key] ??= [];
      } else {
        openList = null;
        scalars[key] = value.trim();
      }
    }
  }
  return { scalars, lists };
}

const isPlaceholder = (v) => /^<.*>$/.test(v ?? '');

function checkPrompt(body, canonicalPrefix, errors) {
  const prompt = extractPrompt(body);
  if (prompt.error) {
    errors.push(prompt.error);
    return null;
  }
  if (prompt.prefix !== normalize(canonicalPrefix)) {
    errors.push('prompt stable prefix differs from the canonical prefix — it must be byte-identical (cache-stable); fill only the payload below the --- marker');
  }
  return parsePayload(prompt.payload);
}

function requireScalars(parsed, keys, errors) {
  for (const key of keys) {
    const v = parsed.scalars[key];
    if (!v || isPlaceholder(v)) errors.push(`payload is missing a filled-in scalar "${key}:"`);
  }
}

function requireLists(parsed, keys, errors) {
  for (const key of keys) {
    const items = (parsed.lists[key] ?? []).filter((i) => i && !isPlaceholder(i));
    if (items.length === 0) errors.push(`payload is missing a non-empty list "${key}:"`);
  }
}

export function validatePr({ title, body, changedFiles }) {
  const errors = [];
  if (!PR_TITLE_RE.test(title ?? '')) {
    errors.push('PR title must match type(scope)?: summary — types: feat|fix|chore|docs|test|refactor|perf');
  }
  const parsed = checkPrompt(body, CANONICAL_PR_PREFIX, errors);
  if (!parsed) return errors;
  requireScalars(parsed, ['branch', 'slug', 'discussion', 'intent', 'risk', 'breaking'], errors);
  requireLists(parsed, ['changes', 'verify'], errors);
  const slug = parsed.scalars.slug;
  if (slug && !SLUG_RE.test(slug)) errors.push(`slug "${slug}" is not kebab-case`);
  if (slug && SLUG_RE.test(slug)) {
    const dir = `discussion_pr/${slug}/`;
    if (parsed.scalars.discussion !== dir) {
      errors.push(`discussion must be exactly "${dir}"`);
    }
    if (!(changedFiles ?? []).some((f) => f.startsWith(dir))) {
      errors.push(`the diff must include the PR's discussion folder — no changed file under ${dir}`);
    }
  }
  return errors;
}

export function validateIssue({ title, body }) {
  const errors = [];
  if (!ISSUE_TITLE_RE.test(title ?? '')) {
    errors.push('issue title must match "task: …", "bug: …", or "chore: …"');
  }
  const parsed = checkPrompt(body, CANONICAL_ISSUE_PREFIX, errors);
  if (!parsed) return errors;
  requireScalars(parsed, ['slug', 'intent'], errors);
  requireLists(parsed, ['acceptance'], errors);
  const slug = parsed.scalars.slug;
  if (slug && !isPlaceholder(slug) && !SLUG_RE.test(slug)) errors.push(`slug "${slug}" is not kebab-case`);
  return errors;
}

function main() {
  const [mode, eventPath, changedFilesPath] = process.argv.slice(2);
  if (mode !== 'pr' && mode !== 'issue') {
    console.error('usage: check-agent-format.mjs pr <event.json> <changed-files.txt> | issue <event.json>');
    process.exit(2);
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  let errors;
  if (mode === 'pr') {
    const changedFiles = fs.readFileSync(changedFilesPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    errors = validatePr({ title: event.pull_request?.title, body: event.pull_request?.body, changedFiles });
  } else {
    errors = validateIssue({ title: event.issue?.title, body: event.issue?.body });
  }
  if (errors.length > 0) {
    for (const e of errors) console.log(`::error::agent ${mode} format: ${e}`);
    console.log(`\n${errors.length} violation(s). Format contract: ${mode === 'pr' ? '.github/pull_request_template.md' : '.github/ISSUE_TEMPLATE/agent-task.yml'} (see discussion_pr/README.md).`);
    process.exit(1);
  }
  console.log(`agent ${mode} format: valid`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
