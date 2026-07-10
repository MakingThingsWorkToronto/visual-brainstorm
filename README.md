# Visual Brainstorm 💡

**SVG-based visual brainstorming that runs beside Claude Code.** Instead of replying with
text, Claude replies with **pictures presented as a survey** — like AskUserQuestion, but the
answers are SVG graphics you multi-select, annotate, remix, and steer with taste dials. Every
round and every artifact is captured to your repo.

```
Claude Code ──stdio MCP──▶ visual-brainstorm ──WebSocket──▶ studio (your browser)
Claude Code ◀─tool result─          ▲          ◀─── you click "Send & iterate" ───┘
                                    └── every SVG + response persisted to discussion/&lt;thread&gt;/
```

Mashup-culture architecture: three small pieces loosely joined — Claude Code (intelligence),
an MCP server (glue), a local React app (surface). No accounts, no cloud, MIT.

GitHub Copilot workspace adapters live in `.github/` as thin prompts/agents that read the
provider-neutral registry at `.claude/agentic-surface-registry.json` and then the authoritative
`.claude/` workflows themselves instead of duplicating them. Local VS Code Copilot Chat can use
the same MCP tool surface and browser studio; the shipped runtime/model catalog still defaults to
Claude Code and Anthropic models, so this is not a fabricated Copilot model route.

## What a session feels like

1. You: *"Let's design icons for my app."*
2. Claude clarifies style/colors/references with **AskUserQuestion** (pre-phrasing).
3. Claude calls **`present_board`** — your browser opens with 6 divergent SVG icon candidates.
4. You multi-select two, note *"rounder corners"* on one, mark two for **⚡ remix**, drag the
   *Playful ↔ Serious* dial, write an elaboration, click **Send & iterate →**.
5. Claude gets your response as the tool result — including the **model** you picked for the
   next round, which the orchestrator delegates to — and presents round 2. Repeat until **✓ Accept**.
6. Winners are captured via **`capture_artifact`** — SVGs with full provenance land in the
   thread cache at `discussion/…` (and in your `targetRepo`, if configured), ready to commit.
7. Every thread is fully cached: reopen it from the studio's **left nav**, or have Claude
   resume it with `discussionId`. Nothing is ever regenerated. Any option opens **full-screen**
   with zoom/pan (pinch on mobile) — system diagrams stay readable.

Works for the opposite pole too: system/product design via `system-map`, `storyboard`,
`matrix`, `mindmap` boards. See `wiki/Product/board-modes.md`.

## Quickstart

```sh
npm install
npm run build
npm test          # unit + integration smoke + UI render smoke
```

Full walkthrough of every control: **[wiki/user-guide.md](wiki/user-guide.md)**.

Register with Claude Code (from your own project directory):

```sh
claude mcp add visual-brainstorm -- node C:/Code/svgbrainstorm/apps/mcp/dist/index.js
```

…or copy this repo's `.mcp.json` pattern. Then just ask Claude to brainstorm something
visual. Tip: raise the MCP tool timeout so boards can wait for slow humans —
`MCP_TOOL_TIMEOUT=1800000`.

Use with GitHub Copilot in this workspace:

- **Local VS Code Copilot Chat is the interactive path.** Run `npm install` and `npm run build`,
  trust the workspace, then use **MCP: List Servers** to start/trust both servers from
  `.vscode/mcp.json`. The local bridge binds to your `127.0.0.1`, so its browser studio can collect
  real board responses. Type `/` for workspace prompts such as `run-brainstorm`, `build-check`,
  `plan-closeout`, `discover-skills`, `diagnose-studio`, `artifact-chat`, `read-mindmap`,
  `read-scribble`, `reopen`, `new-command`, or `create-dispatch-command`.
- **GitHub-hosted Copilot is noninteractive.** `.github/mcp.json` is a versioned payload for
  agent-scoped MCP declarations or repository **Settings > Copilot > MCP servers**; GitHub.com
  does not auto-discover it. The setup workflow builds the servers in the runner, but the product
  MCP explicitly returns `unsupported-host` for browser-dependent studio tools there. Hosted
  sessions can use noninteractive tools, including the wiki server, but cannot complete a visual
  board journey.
- Repo verification proves the adapter chain, parity configuration, and real stdio MCP tool
  discovery. VS Code trust/server discovery and `/` menu visibility, plus GitHub organization
  policy and repository MCP acceptance, remain host-managed checks.

## MCP tools

| Tool | Purpose |
|---|---|
| `present_board` | push an SVG option board (≥5 domain-tailored range dials); **blocks** until you respond; `discussionId` resumes a cached thread |
| `peek_response` | recover a response after a timeout (`{status:"pending"}`) |
| `capture_artifact` | persist an accepted SVG + provenance; copies to `targetRepo` if configured |
| `list_discussions` / `load_discussion` | enumerate / fully reload cached threads |
| `session_status` | thread dir, rounds, artifacts |

## Configuration & themes

`visual-brainstorm.config.json` in your project root (all optional): `targetRepo` (also
receive artifacts there), `stylesDir` (theme JSON drop-ins, default `styles/`), `theme`
(default `neon-purple`), `runtime` (live orchestration runtime metadata), `models`
(structured composer catalog: id / label / provider / engineIds / capabilities),
`defaultModel`, `discussionDir`
(thread cache, default `discussion`). Themes are pickable visually in the studio
header or by editing the config — see `styles/sunset.json` for the drop-in format.

## Repo map

```
packages/protocol   zod schemas — the single source of truth for message shapes
apps/mcp            stdio MCP server + local bridge (http/WS) + session persistence
apps/studio         Vite + React + Tailwind v4 survey UI (shadcn-chat-inspired)
wiki/               authoritative facts & guardrails + user-guide.md (start: README.md there)
discussion/         plans + the brainstorm thread cache (_completed/ = archive; .logs/ = runtime logs)
.claude/            commands (procedures) · skills (craft) · agents (specialized roles)
.vscode/            VS Code Copilot workspace MCP manifest and native-hook loading settings
.github/            Copilot instructions, prompts/agents, MCP payload, hooks, and cloud setup over `.claude/`
.claude/agentic-surface-registry.json  provider-neutral registry external harness adapters reference
```

Contributors: read `CLAUDE.md` first — 12 rules + the session bootstrap, all enforced.
