# /diagnose-studio — self-diagnose a "broken" studio, preview, or bridge

Run whenever the studio/preview/bridge "seems to have failed". Work the checks in order; each has a
verdict. Most reports are a port-conflict ghost, not a failure.

## Procedure

1. **Who owns 5199?** `curl -s http://127.0.0.1:5199/api/health`
   - Answers with JSON → note `pid`, `startedAt`, `session.id`, `activeBoard`,
     `connectedClients`. If `session.id` isn't the thread you expect, the browser tab is
     showing a DIFFERENT instance (the #1 cause of "it failed").
   - No answer → nothing on 5199; the instance you started is on an ephemeral port — find
     its URL in step 3.
2. **How many instances exist?**
   `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'preview\.js|apps/mcp/dist/index.js' } | Select-Object ProcessId, CommandLine`
   - More than one instance → kill the stale ones: `Stop-Process -Id <pid> -Force`. Killing an
     `npm run` wrapper orphans its node child — always kill the node.exe pid itself.
3. **Read the log.** `discussion/.logs/preview-<yyyy-mm-dd>.log` (real engine: `mcp-<date>.log`).
   Every line is pid-tagged. Look for:
   - `PORT CONFLICT` lines — they name the holder's pid and the real URL of this instance.
   - `presenting board-…` with `0 client(s) connected` — no browser tab is on THIS instance.
   - `FATAL uncaught…` — an actual crash, with stack. Fix the code, don't restart-loop.
   - `studio … MISSING` — run `npm run build -w apps/studio`.
4. **Is the studio stale?** Hard-refresh the tab (Ctrl+Shift+R) — an old tab keeps old JS;
   the WS auto-reconnects but the bundle doesn't self-update. Know the split: the bridge
   streams `apps/studio/dist` per-request, so a STUDIO rebuild only needs a refresh — but
   themes, config, and endpoints load at process start, so an `apps/mcp` or
   `packages/protocol` change needs a server RESTART (a "missing endpoint/theme" symptom
   with a fresh bundle means the server predates the change).
5. **Did paths/config change since the server started?** Config loads ONCE at process
   start — a server predating a `discussionDir` (or other config) change keeps writing to
   the OLD location. `/api/health` → `session.dir` shows the root it ACTUALLY uses; expect
   stray writes there until the server restarts, and migrate them.
6. **Report** the verdict with evidence (health JSON, log lines, pids killed).

## Failure table

| Symptom | Cause | Fix |
|---|---|---|
| "it failed" but log shows `listening` | port conflict — browser shows other instance | step 1–2: kill stale pid, reopen printed URL |
| responses do nothing | tab connected to a different instance | same |
| blank page / 503 | studio dist missing | build studio |
| board never appears | 0 clients in log — wrong URL open | use the URL from the log |
| process gone, no output | crash — see FATAL in log | fix root cause |

## Changelog
- 2026-07-06 — step 4: refresh-vs-restart split — dist streams per-request (refresh
  suffices) but themes/config/endpoints load at process start (restart needed) (from
  ui-changes)
- 2026-07-06 — step 5: config loads once at start — a pre-path-change server writes to the
  OLD discussionDir; check health session.dir, migrate strays (from studio-journey-ux-2026-07-06)
- 2026-07-06 — created (from operator report "demo failed"; root cause was an orphaned old-build instance holding 5199)
- 2026-07-06 — renamed diagnose-demo → diagnose-studio; demo orchestrator de-slopped into the fixtures-only preview harness (operator: hardcoded "demo" is slop)
