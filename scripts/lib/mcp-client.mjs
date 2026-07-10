/**
 * Real-route MCP client for the browser harnesses (CLAUDE.md rule 10).
 *
 * Spawns the BUILT stdio MCP server (apps/mcp/dist/index.js) exactly as Claude
 * Code does — a child process speaking newline-delimited JSON-RPC over stdio —
 * and plays the orchestrator by issuing real `tools/call` requests. This is the
 * same initialize → notifications/initialized → tools/call dance
 * tests/copilot-mcp.test.mjs proves for discovery, kept alive for a whole
 * journey with CONCURRENT in-flight calls (a blocked present_board while
 * session_status polls — precisely a real session's shape).
 *
 * stdout is the protocol channel; stderr is the server's log (forwarded to the
 * harness's log capture so failures stay self-diagnosable). No fabrication
 * anywhere: a tool error is returned as the parsed error payload, a dead child
 * rejects every in-flight call.
 */
import { spawn } from 'node:child_process';

export class McpClient {
  /**
   * @param {object} opts
   * @param {string[]} opts.args   argv after `node` (the server entry + flags)
   * @param {string}   opts.cwd    working directory (the server loads visual-brainstorm.config.json from here)
   * @param {object}   opts.env    child environment (caller sets VIBR_HOME / VIBR_PORT)
   * @param {(line: string) => void} [opts.onLog]  receives each stderr line
   */
  constructor({ args, cwd, env, onLog }) {
    this.onLog = onLog ?? (() => {});
    this.nextId = 1;
    /** @type {Map<number, {resolve: Function, reject: Function}>} */
    this.inflight = new Map();
    this.dead = null;
    this.child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    this.child.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
      let nl;
      while ((nl = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, nl).trim();
        out = out.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          this.onLog(`[mcp-client] non-JSON stdout line (protocol corruption?): ${line.slice(0, 200)}`);
          continue;
        }
        if (msg.id !== undefined && this.inflight.has(msg.id)) {
          const { resolve, reject } = this.inflight.get(msg.id);
          this.inflight.delete(msg.id);
          if (msg.error) reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          else resolve(msg.result);
        }
        // Server-initiated notifications (logging etc.) are ignored — the
        // harness reads the FileLog via GET /api/logs instead.
      }
    });
    let err = '';
    this.child.stderr.on('data', (chunk) => {
      err += chunk.toString('utf8');
      let nl;
      while ((nl = err.indexOf('\n')) >= 0) {
        const line = err.slice(0, nl).replace(/\r$/, '');
        err = err.slice(nl + 1);
        if (line.trim()) this.onLog(line);
      }
    });
    this.child.on('exit', (code, signal) => {
      this.dead = new Error(`MCP server exited (code ${code}, signal ${signal}) with ${this.inflight.size} call(s) in flight`);
      for (const { reject } of this.inflight.values()) reject(this.dead);
      this.inflight.clear();
    });
  }

  /** Raw JSON-RPC request; resolves with `result`. */
  request(method, params, timeoutMs = 120_000) {
    if (this.dead) return Promise.reject(this.dead);
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inflight.delete(id);
        reject(new Error(`MCP request timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);
      this.inflight.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.child.stdin.write(payload);
    });
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }) + '\n');
  }

  /** The MCP handshake a real client performs before any tool call. */
  async initialize() {
    const result = await this.request(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'human-sim', version: '0.1.0' },
      },
      20_000,
    );
    this.notify('notifications/initialized');
    return result;
  }

  /**
   * Real tools/call. Returns the tool's payload PARSED from its text content
   * (every visual-brainstorm tool returns one JSON text block); a non-JSON
   * text falls through verbatim so assertions stay honest.
   */
  async call(tool, args = {}, timeoutMs = 180_000) {
    const result = await this.request('tools/call', { name: tool, arguments: args }, timeoutMs);
    const text = result?.content?.find((c) => c.type === 'text')?.text;
    if (typeof text !== 'string') {
      throw new Error(`tool ${tool} returned no text content: ${JSON.stringify(result).slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      if (result.isError) throw new Error(`tool ${tool} errored: ${text.slice(0, 500)}`);
      return text;
    }
  }

  close() {
    try {
      this.child.stdin.end();
    } catch {
      /* already gone */
    }
    try {
      this.child.kill();
    } catch {
      /* already gone */
    }
  }
}
