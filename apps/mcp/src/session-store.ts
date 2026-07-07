import fs from 'node:fs';
import path from 'node:path';
import {
  ArtifactChatMessageSchema,
  ArtifactSchema,
  BoardResponseSchema,
  BoardSchema,
  ProgressEventSchema,
  SessionInfoSchema,
  type Artifact,
  type ArtifactChatMessage,
  type Board,
  type BoardResponse,
  type DiscussionSummary,
  type ProgressEvent,
  type RoundRecord,
  type SessionInfo,
} from '@visual-brainstorm/protocol';
import { buildFeedbackDigest } from './feedback.js';

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'session'
  );
}

/** Token-meter sum from a thread's progress.jsonl without loading the whole thread. */
function sumTokensFile(threadDir: string): number {
  const file = path.join(threadDir, 'progress.jsonl');
  if (!fs.existsSync(file)) return 0;
  let total = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const tokens = (JSON.parse(line) as { tokens?: { input?: number; output?: number } }).tokens;
      total += (tokens?.input ?? 0) + (tokens?.output ?? 0);
    } catch {
      /* corrupt lines are skipped, same as reload */
    }
  }
  return total;
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Persists every board, per-option SVG, response, and artifact (CLAUDE.md rule 7) to the
 * donor-style discussion folder: <root>/<stamp>-<slug>/. Nothing is ever regenerated —
 * threads reload via SessionStore.open() and list via SessionStore.list().
 * A directory is a brainstorm thread iff it contains session.json (plans coexist).
 */
export class SessionStore {
  readonly info: SessionInfo;
  readonly rounds: RoundRecord[] = [];
  readonly artifacts: Artifact[] = [];
  /** Session-progress events (progress.jsonl) — deterministic UI feedback, reloadable. */
  readonly progress: ProgressEvent[] = [];
  /** Artifact chat dialogs (artifacts/chat.jsonl) — append-only, reloadable (rule 7). */
  readonly artifactChat: ArtifactChatMessage[] = [];

  /** Create a NEW thread under the discussion root. */
  constructor(title: string, root: string) {
    const now = new Date();
    const slug = slugify(title);
    const dir = path.join(root, `${stamp(now)}-${slug}`);
    fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
    this.info = {
      id: path.basename(dir),
      slug,
      title,
      startedAt: now.toISOString(),
      dir,
    };
    fs.writeFileSync(
      path.join(dir, 'session.json'),
      JSON.stringify(this.info, null, 2),
    );
    this.appendMd(`# ${title}\n\nStarted ${this.info.startedAt}. Append-only text memory of every round — the re-synthesis source: what was shown, what the user did, and therefore what the next round must build on.\n`);
  }

  /** brainstorm.md — the thread's human/model-readable memory. Never rewritten. */
  private appendMd(text: string): void {
    try {
      fs.appendFileSync(path.join(this.info.dir, 'brainstorm.md'), text + '\n');
    } catch (err) {
      console.error(`[store] brainstorm.md append failed: ${String(err)}`);
    }
  }

  /** Reopen an existing thread directory — full history reloads from disk. */
  static open(dir: string): SessionStore {
    const info = SessionInfoSchema.parse(
      JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')),
    );
    const store = Object.create(SessionStore.prototype) as SessionStore;
    Object.assign(store, {
      info: { ...info, id: path.basename(dir), dir },
      rounds: [],
      artifacts: [],
      progress: [],
      artifactChat: [],
    });
    const chatFile = path.join(dir, 'artifacts', 'chat.jsonl');
    if (fs.existsSync(chatFile)) {
      for (const line of fs.readFileSync(chatFile, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          store.artifactChat.push(ArtifactChatMessageSchema.parse(JSON.parse(line)));
        } catch (err) {
          console.error(`[store] skipping artifact-chat line: ${String(err)}`);
        }
      }
    }
    const progressFile = path.join(dir, 'progress.jsonl');
    if (fs.existsSync(progressFile)) {
      for (const line of fs.readFileSync(progressFile, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          store.progress.push(ProgressEventSchema.parse(JSON.parse(line)));
        } catch (err) {
          console.error(`[store] skipping progress line: ${String(err)}`);
        }
      }
    }
    const roundDirs = fs
      .readdirSync(dir)
      .filter((d) => /^round-\d+$/.test(d))
      .sort();
    for (const roundDir of roundDirs) {
      const boardFile = path.join(dir, roundDir, 'board.json');
      if (!fs.existsSync(boardFile)) continue;
      const board = BoardSchema.parse(JSON.parse(fs.readFileSync(boardFile, 'utf8')));
      const responseFile = path.join(dir, roundDir, 'response.json');
      const response = fs.existsSync(responseFile)
        ? BoardResponseSchema.parse(JSON.parse(fs.readFileSync(responseFile, 'utf8')))
        : null;
      store.rounds.push({ board: board as Board, response });
    }
    const artifactsDir = path.join(dir, 'artifacts');
    if (fs.existsSync(artifactsDir)) {
      for (const file of fs.readdirSync(artifactsDir).filter((f) => f.endsWith('.json'))) {
        try {
          store.artifacts.push(
            ArtifactSchema.parse(JSON.parse(fs.readFileSync(path.join(artifactsDir, file), 'utf8'))),
          );
        } catch (err) {
          console.error(`[store] skipping artifact ${file}: ${String(err)}`);
        }
      }
    }
    return store;
  }

  /**
   * All threads under the discussion root, newest first. Threads moved to
   * `_completed/` (plan-closeout) are included with `archived: true` — the
   * studio shows them under the top-level Archive nav section.
   */
  static list(root: string): DiscussionSummary[] {
    const scan = (dir: string, archived: boolean): DiscussionSummary[] => {
      if (!fs.existsSync(dir)) return [];
      const summaries: DiscussionSummary[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const threadDir = path.join(dir, entry.name);
        const sessionFile = path.join(threadDir, 'session.json');
        if (!fs.existsSync(sessionFile)) continue; // a plan folder, not a thread
        try {
          const info = SessionInfoSchema.parse(JSON.parse(fs.readFileSync(sessionFile, 'utf8')));
          const rounds = fs.readdirSync(threadDir).filter((d) => /^round-\d+$/.test(d)).length;
          const artifactsDir = path.join(threadDir, 'artifacts');
          const artifacts = fs.existsSync(artifactsDir)
            ? fs.readdirSync(artifactsDir).filter((f) => f.endsWith('.svg')).length
            : 0;
          summaries.push({
            id: entry.name,
            title: info.title,
            startedAt: info.startedAt,
            dir: threadDir,
            rounds,
            artifacts,
            archived,
            tokens: sumTokensFile(threadDir),
          });
        } catch (err) {
          console.error(`[store] skipping ${entry.name}: ${String(err)}`);
        }
      }
      return summaries;
    };
    return [...scan(root, false), ...scan(path.join(root, '_completed'), true)].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
  }

  /** Resolve a thread id to its directory, checking live root then _completed/. */
  static resolveDir(root: string, id: string): string {
    const base = path.basename(id);
    const live = path.join(root, base);
    if (fs.existsSync(path.join(live, 'session.json'))) return live;
    return path.join(root, '_completed', base);
  }

  private roundDir(round: number): string {
    const dir = path.join(this.info.dir, `round-${String(round).padStart(2, '0')}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  recordBoard(board: Board): void {
    this.rounds.push({ board, response: null });
    const dir = this.roundDir(board.round);
    fs.writeFileSync(path.join(dir, 'board.json'), JSON.stringify(board, null, 2));
    for (const option of board.options) {
      fs.writeFileSync(path.join(dir, `option-${option.id}.svg`), option.svg);
    }
    this.appendMd(
      [
        `\n## Round ${board.round} — ${board.phase} · ${board.kind}`,
        '',
        board.prompt,
        '',
        '### Options presented',
        ...board.options.map(
          (o) =>
            `- **${o.label}** (\`${o.id}\`)` +
            (o.description ? ` — ${o.description}` : '') +
            (o.parents.length ? ` [parents: ${o.parents.join(', ')}]` : '') +
            (o.tags.length ? ` {${o.tags.join(', ')}}` : ''),
        ),
      ].join('\n'),
    );
  }

  recordResponse(response: BoardResponse): void {
    const round = this.rounds.find((r) => r.board.id === response.boardId);
    if (!round) return;
    round.response = response;
    const dir = this.roundDir(round.board.round);
    fs.writeFileSync(path.join(dir, 'response.json'), JSON.stringify(response, null, 2));
    this.appendMd(
      [
        '',
        `### User response (${response.respondedAt})`,
        ...buildFeedbackDigest(round.board, response).map((line) => `- ${line}`),
      ].join('\n'),
    );
  }

  /** Token meter: cumulative usage over every progress event of this thread. */
  tokenTotals(): { input: number; output: number } {
    return this.progress.reduce(
      (sum, e) => ({
        input: sum.input + (e.tokens?.input ?? 0),
        output: sum.output + (e.tokens?.output ?? 0),
      }),
      { input: 0, output: 0 },
    );
  }

  /**
   * Session-progress event (rule 7 recall): kept in memory for the studio tail
   * and appended to progress.jsonl — never rewritten, reloads with the thread.
   */
  recordProgress(event: ProgressEvent): void {
    this.progress.push(event);
    try {
      fs.appendFileSync(path.join(this.info.dir, 'progress.jsonl'), JSON.stringify(event) + '\n');
    } catch (err) {
      console.error(`[store] progress.jsonl append failed: ${String(err)}`);
    }
  }

  /**
   * Artifact-chat message (rule 7 recall): kept in memory for the studio and
   * appended to artifacts/chat.jsonl — never rewritten, reloads with the
   * thread. Also leaves a one-line trace in brainstorm.md (the text memory).
   */
  recordArtifactChat(message: ArtifactChatMessage): void {
    this.artifactChat.push(message);
    try {
      const dir = path.join(this.info.dir, 'artifacts');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'chat.jsonl'), JSON.stringify(message) + '\n');
    } catch (err) {
      console.error(`[store] artifacts/chat.jsonl append failed: ${String(err)}`);
    }
    this.appendMd(
      `\n> Artifact chat (\`${message.artifactSlug}\`) ${message.role}: ${message.text}` +
        (message.revisedSlug ? ` → revised as \`${message.revisedSlug}\`` : ''),
    );
  }

  captureArtifact(
    name: string,
    svg: string,
    notes: string,
    provenance: { boardId?: string; optionIds: string[]; revises?: string },
  ): Artifact {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; this.artifacts.some((a) => a.slug === slug); i++) {
      slug = `${base}-${i}`;
    }
    const svgPath = path.join(this.info.dir, 'artifacts', `${slug}.svg`);
    fs.writeFileSync(svgPath, svg);
    const artifact: Artifact = {
      slug,
      name,
      svgPath,
      notes,
      provenance,
      capturedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(this.info.dir, 'artifacts', `${slug}.json`),
      JSON.stringify(artifact, null, 2),
    );
    this.artifacts.push(artifact);
    return artifact;
  }

  /**
   * User notes on a captured artifact (fullscreen Notes panel). The note is
   * metadata, not the artwork: the .json sidecar is rewritten in place (the
   * SVG is untouched — rule 7 protects the artwork, not the annotation).
   */
  updateArtifactNotes(slug: string, notes: string): Artifact | null {
    const artifact = this.artifacts.find((a) => a.slug === slug);
    if (!artifact) return null;
    artifact.notes = notes;
    fs.writeFileSync(
      path.join(this.info.dir, 'artifacts', `${slug}.json`),
      JSON.stringify(artifact, null, 2),
    );
    this.appendMd(`\n> Artifact notes (\`${slug}\`) updated: ${notes || '(cleared)'}`);
    return artifact;
  }

  /**
   * Rename a thread started as a placeholder (open_studio landing) once the
   * real topic arrives with the first board. Display title only — the
   * directory name keeps its original stamp-slug.
   */
  retitle(title: string): void {
    if (title === this.info.title) return;
    this.info.title = title;
    fs.writeFileSync(path.join(this.info.dir, 'session.json'), JSON.stringify(this.info, null, 2));
    this.appendMd(`\n> Thread retitled to "${title}" when the first board arrived.`);
  }

  /** Per-thread theme override — persisted so a resumed thread keeps its look. */
  setTheme(theme: string | undefined): void {
    if (theme === undefined) {
      delete (this.info as { theme?: string }).theme;
    } else {
      this.info.theme = theme;
    }
    fs.writeFileSync(path.join(this.info.dir, 'session.json'), JSON.stringify(this.info, null, 2));
    this.appendMd(
      `\n> Discussion theme ${theme ? `set to \`${theme}\`` : 'cleared'} — the studio skin and generated artifact colors follow it.`,
    );
  }

  /** Per-thread target repo/folder override — persisted so a resumed thread keeps it. */
  setTargetRepo(targetRepo: string | undefined): void {
    if (targetRepo === undefined) {
      delete (this.info as { targetRepo?: string }).targetRepo;
    } else {
      this.info.targetRepo = targetRepo;
    }
    fs.writeFileSync(path.join(this.info.dir, 'session.json'), JSON.stringify(this.info, null, 2));
    this.appendMd(
      `\n> Target repo for this thread ${targetRepo ? `set to \`${targetRepo}\`` : 'cleared'} — final artifacts are COPIED there on plan-closeout.`,
    );
  }

  nextRound(): number {
    return this.rounds.length + 1;
  }
}
