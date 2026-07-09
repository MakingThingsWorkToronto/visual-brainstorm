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
  type MindTree,
  type ProgressEvent,
  type RoundRecord,
  type SessionInfo,
  type TokenSink,
} from '@visual-brainstorm/protocol';
import { buildFeedbackDigest } from './feedback.js';
import { countNodes, treeToSvg } from './tree-svg.js';
import { treeToOutline } from './tree-outline.js';
import { buildDecisionTree, decisionTreeToSvg } from './decision-tree.js';

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
  /**
   * The sink currently in progress — declared by the last boundary event that
   * carried a `category`. A token-bearing event that arrives without its own
   * category is attributed to this. Undefined until the first labeled activity.
   */
  private currentSink: TokenSink | undefined;
  /** Artifact chat dialogs (artifacts/chat.jsonl) — append-only, reloadable (rule 7). */
  readonly artifactChat: ArtifactChatMessage[] = [];
  /**
   * In-progress board answers ("generation meta"): the user's dials/selections/
   * notes/elaboration/model on a live board, persisted to `round-NN/draft.json`
   * (last-write-wins, one per board) and reloaded so dials PERSIST through an
   * artifact-chat detour and are recallable later. A draft is an un-submitted
   * BoardResponse (rule 5). Keyed in memory by boardId.
   */
  readonly drafts: BoardResponse[] = [];

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
      pinnedSlugs: [],
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
      drafts: [],
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
          const event = ProgressEventSchema.parse(JSON.parse(line));
          store.progress.push(event);
          // Mirror recordProgress bookkeeping so a live event after reload
          // inherits a trailing un-consumed boundary label (persisted events are
          // already stamped, so only currentSink needs reconstructing).
          if (event.category && !event.tokens) store.currentSink = event.category;
          else if (event.tokens) store.currentSink = undefined;
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
      // In-progress draft (generation meta) — restores the user's dials/notes.
      const draftFile = path.join(dir, roundDir, 'draft.json');
      if (fs.existsSync(draftFile)) {
        try {
          store.drafts.push(BoardResponseSchema.parse(JSON.parse(fs.readFileSync(draftFile, 'utf8'))));
        } catch (err) {
          console.error(`[store] skipping draft ${roundDir}: ${String(err)}`);
        }
      }
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
    // Idempotent by board id: an artifact-chat detour re-presents the SAME board
    // to re-establish the pending resolver (non-destructive park) — that must not
    // duplicate the round on disk or in memory.
    if (this.rounds.some((r) => r.board.id === board.id)) return;
    this.rounds.push({ board, response: null });
    const dir = this.roundDir(board.round);
    fs.writeFileSync(path.join(dir, 'board.json'), JSON.stringify(board, null, 2));
    for (const option of board.options) {
      fs.writeFileSync(path.join(dir, `option-${option.id}.svg`), option.svg);
    }
    // A mindmap board carries a live tree instead of options. Persist the tree
    // JSON and capture a deterministic SVG snapshot as an artifact (rule 7):
    // the presented structure is archived even before the user edits it.
    if (board.tree) {
      fs.writeFileSync(path.join(dir, 'tree.json'), JSON.stringify(board.tree, null, 2));
      // The MODEL-LEGIBLE form of the map: a traversable markdown outline the
      // orchestrator (and read-mindmap) reads without parsing JSON. Overwritten
      // as the tree is edited (response/draft) so it always reflects the latest.
      this.writeTreeOutline(dir, board.tree, `Presented tree — round ${board.round}`);
      const nodes = countNodes(board.tree.nodeData);
      this.captureArtifact(
        `${board.title} — round ${board.round} tree`,
        treeToSvg(board.tree),
        `Presented mind-map tree (${nodes} node${nodes === 1 ? '' : 's'}), archival snapshot.`,
        { boardId: board.id, optionIds: [] },
      );
    }
    this.appendMd(
      [
        `\n## Round ${board.round} — ${board.phase} · ${board.kind}`,
        '',
        board.prompt,
        '',
        board.tree
          ? treeToOutline(board.tree, 'Mind-map tree presented (co-edited live; snapshot in artifacts/)')
          : '### Options presented',
        ...(board.tree
          ? []
          : board.options.map(
              (o) =>
                `- **${o.label}** (\`${o.id}\`)` +
                (o.description ? ` — ${o.description}` : '') +
                (o.parents.length ? ` [parents: ${o.parents.join(', ')}]` : '') +
                (o.tags.length ? ` {${o.tags.join(', ')}}` : ''),
            )),
      ].join('\n'),
    );
  }

  recordResponse(response: BoardResponse): void {
    const round = this.rounds.find((r) => r.board.id === response.boardId);
    if (!round) return;
    round.response = response;
    const dir = this.roundDir(round.board.round);
    fs.writeFileSync(path.join(dir, 'response.json'), JSON.stringify(response, null, 2));
    // Mind-map decisions are structured data (rule: jsonl where decisions matter).
    // Every node op is appended to the round's tree-ops.jsonl — append-only, so
    // the full explode/delete/add/note history survives for later synthesis.
    if (response.treeOps.length > 0) {
      const opsFile = path.join(dir, 'tree-ops.jsonl');
      for (const op of response.treeOps) {
        try {
          fs.appendFileSync(opsFile, JSON.stringify(op) + '\n');
        } catch (err) {
          console.error(`[store] tree-ops.jsonl append failed: ${String(err)}`);
        }
      }
    }
    // The edited tree (with per-node notes) is the final shape — keep a dedicated
    // JSON alongside response.json so the decision-tree builder and re-synthesis
    // read it without unpacking the whole response.
    if (response.editedTree) {
      fs.writeFileSync(path.join(dir, 'edited-tree.json'), JSON.stringify(response.editedTree, null, 2));
      // Refresh the model-legible outline to the SUBMITTED shape.
      this.writeTreeOutline(dir, response.editedTree, `Edited tree — round ${round.board.round} (submitted)`);
    }
    this.appendMd(
      [
        '',
        `### User response (${response.respondedAt})`,
        ...buildFeedbackDigest(round.board, response).map((line) => `- ${line}`),
      ].join('\n'),
    );
    // The decision tree is a derived index over every round — rebuild + persist it
    // on each response so the studio's Decision-tree view reloads with the thread.
    this.writeDecisionTree();
  }

  /**
   * Persist a board's IN-PROGRESS answer (dials/selections/notes/elaboration/
   * model) as `round-NN/draft.json` — last-write-wins, one per board. This is the
   * "generation meta" that must survive an artifact-chat detour (dials persist
   * through chat) and be recallable later. A draft is NOT a submitted response:
   * kept in a separate file + the in-memory `drafts` list (never folded into
   * `rounds[].response`). A later real response supersedes it (the round's
   * `response.json` is authoritative for what was actually submitted).
   */
  recordBoardDraft(draft: BoardResponse): void {
    const round = this.rounds.find((r) => r.board.id === draft.boardId);
    if (!round) return; // no board to attach a draft to — ignore silently
    const idx = this.drafts.findIndex((d) => d.boardId === draft.boardId);
    if (idx >= 0) this.drafts[idx] = draft;
    else this.drafts.push(draft);
    try {
      const dir = this.roundDir(round.board.round);
      fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify(draft, null, 2));
      // A mind-map draft carries the LIVE in-progress tree — keep the model-legible
      // outline current so read-mindmap/an artifact-chat reads the tree the user is
      // actually looking at, not the originally-presented one.
      if (draft.editedTree) {
        this.writeTreeOutline(dir, draft.editedTree, `Live tree — round ${round.board.round} (in progress)`);
      }
    } catch (err) {
      console.error(`[store] draft.json write failed: ${String(err)}`);
    }
  }

  /**
   * Write the model-legible markdown outline of a mind tree to `round-NN/tree.md`
   * — the traversable form read-mindmap and the orchestrator read (the SVG is for
   * humans). Overwritten as the tree evolves; the newest shape always wins.
   */
  private writeTreeOutline(dir: string, tree: MindTree, heading: string): void {
    try {
      fs.writeFileSync(path.join(dir, 'tree.md'), treeToOutline(tree, heading) + '\n');
    } catch (err) {
      console.error(`[store] tree.md write failed: ${String(err)}`);
    }
  }

  /**
   * Chain-of-thought persistence (rule: persist chains of thought to the plan
   * folder). The bridge's live `thinking` stream was ephemeral; every non-null
   * note is now appended to thinking.jsonl — append-only, reloadable, never
   * rewritten. A null note (cleared) is not recorded.
   */
  recordThinking(note: string): void {
    try {
      fs.appendFileSync(
        path.join(this.info.dir, 'thinking.jsonl'),
        JSON.stringify({ at: new Date().toISOString(), note }) + '\n',
      );
    } catch (err) {
      console.error(`[store] thinking.jsonl append failed: ${String(err)}`);
    }
  }

  /**
   * Rebuild the discussion's decision tree from every round and write it as
   * decision-tree.json + decision-tree.svg at the thread root. Derived index
   * (not presented artwork), so overwriting each round is correct — the source
   * of truth is the append-only round records it is built from.
   */
  private writeDecisionTree(): void {
    try {
      const tree = buildDecisionTree(this.info.title, this.rounds);
      fs.writeFileSync(path.join(this.info.dir, 'decision-tree.json'), JSON.stringify(tree, null, 2));
      fs.writeFileSync(path.join(this.info.dir, 'decision-tree.svg'), decisionTreeToSvg(tree));
    } catch (err) {
      console.error(`[store] decision-tree write failed: ${String(err)}`);
    }
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
   * Per-sink token accounting (input+output) over every progress event. The
   * breakdown the studio presents. Tokens with no category fold into
   * `orchestration` — an uncategorized turn is the driver's own overhead.
   */
  tokensBySink(): Partial<Record<TokenSink, number>> {
    const bySink: Partial<Record<TokenSink, number>> = {};
    for (const e of this.progress) {
      if (!e.tokens) continue;
      const sink: TokenSink = e.category ?? 'orchestration';
      bySink[sink] = (bySink[sink] ?? 0) + e.tokens.input + e.tokens.output;
    }
    return bySink;
  }

  /**
   * Session-progress event (rule 7 recall): kept in memory for the studio tail
   * and appended to progress.jsonl — never rewritten, reloads with the thread.
   */
  recordProgress(event: ProgressEvent): void {
    // A boundary event (tool label) DECLARES the current sink; the NEXT
    // token-bearing turn-end event inherits it, then the label is consumed so it
    // attributes exactly that one turn — later uncategorized turns fold into
    // `orchestration`. The tokens are real deltas; only the attribution is a
    // heuristic ("what was being done when the turn ended").
    if (event.category) this.currentSink = event.category;
    else if (event.tokens) {
      if (this.currentSink) event.category = this.currentSink;
      this.currentSink = undefined;
    }
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

  /**
   * Concierge intake turn (adaptive clarifying Q&A): appended to brainstorm.md
   * so the question + the user's answer become part of the thread's text memory
   * — the digest the orchestrator builds the Living Gallery and boards on. A
   * null answer means the question timed out (recorded honestly, no fake answer).
   */
  recordConcierge(question: string, answer: string | null): void {
    this.appendMd(
      `\n> Concierge Q: ${question}\n> Concierge A: ${answer ?? '(no answer — timed out)'}`,
    );
  }

  /**
   * Living Gallery pick (methodology chooser): the method the user picked from
   * the offered roster, appended to brainstorm.md so the routing choice is part
   * of the thread's memory. A null pick means the gallery timed out (honest).
   */
  recordGalleryPick(method: string | null, offered: string[]): void {
    this.appendMd(
      `\n> Living Gallery — offered [${offered.join(', ')}]; user picked: ${method ?? '(no pick — timed out)'}`,
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

  /**
   * Toggle a captured artifact's pin (persisted to session.json, mirrors
   * setTheme/setTargetRepo). Returns the new pinned state so the endpoint can
   * report it. Only known artifact slugs should reach here (the bridge checks).
   */
  togglePinned(slug: string): boolean {
    const pins = this.info.pinnedSlugs ?? [];
    const has = pins.includes(slug);
    this.info.pinnedSlugs = has ? pins.filter((s) => s !== slug) : [...pins, slug];
    fs.writeFileSync(path.join(this.info.dir, 'session.json'), JSON.stringify(this.info, null, 2));
    this.appendMd(`\n> Artifact \`${slug}\` ${has ? 'unpinned from' : 'pinned to'} the filmstrip.`);
    return !has;
  }

  nextRound(): number {
    return this.rounds.length + 1;
  }
}
