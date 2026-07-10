// Shared MCP stdio client for contract tests + demos: spawn a real server,
// initialize, send ONE follow-up request, resolve its result. Extracted from
// three diverging copies (copilot-mcp test, cursor-adapter test, cursor-demo)
// — the same hoist bridge-harness.mjs exists for. No mocks (rule 6): this
// always drives a real child process over real stdio.
import { spawn } from 'node:child_process';

/**
 * @param {string} command  executable (usually 'node')
 * @param {string[]} args   entry args (workspace-relative; pass cwd)
 * @param {string} cwd      working directory for the child
 * @param {{method: string, params: object}} request  the id-2 follow-up
 * @param {{env?: object, timeoutMs?: number, clientName?: string}} [options]
 *   timeoutMs default 30s: a cold node spawn + MCP handshake takes >5s under
 *   concurrent sessions' load (observed 6.9s standalone; >15s with multiple
 *   live sessions building/testing on the same machine — 5s and then 15s both
 *   flaked in full-suite runs). A ceiling, not a wait: passing runs pay nothing.
 */
export function initializeThenRequest(command, args, cwd, request, options = {}) {
  const { env = {}, timeoutMs = 30_000, clientName = 'mcp-stdio-client' } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(result);
    };

    const timer = setTimeout(
      () => finish(new Error(`MCP initialize timed out for ${args.join(' ')}${stderr ? `\n${stderr}` : ''}`)),
      timeoutMs,
    );

    child.once('error', (error) => finish(error));
    // An instantly-dying child (dist not built, bad entry) must fail fast with
    // its stderr, not sit out the whole timeout.
    child.once('exit', (code) =>
      finish(new Error(`MCP server exited (code ${code}) before responding: ${args.join(' ')}${stderr ? `\n${stderr}` : ''}`)),
    );
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split('\n');
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id === 1 && message.result) {
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: request.method, params: request.params }) + '\n');
            continue;
          }
          if (message.id === 1 && message.error) return finish(new Error(JSON.stringify(message.error)));
          if (message.id === 2 && message.result) return finish(null, message.result);
          if (message.id === 2 && message.error) return finish(new Error(JSON.stringify(message.error)));
        } catch {
          finish(new Error(`Invalid MCP stdout from ${args.join(' ')}: ${line}\n${stderr}`));
        }
      }
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: clientName, version: '1.0.0' },
        },
      }) + '\n',
    );
  });
}
