import fs from 'node:fs';
import path from 'node:path';

/**
 * Tee logger: every line goes to stderr (stdout is the MCP channel) AND to a
 * dated file under <discussionRoot>/.logs/ so failures are self-diagnosable
 * after the process is gone. See .claude/commands/diagnose-demo.md.
 */
const RING_SIZE = 500;

export class FileLog {
  private readonly file: string | null;
  /** In-memory tail — served over GET /api/logs so the layer is observable live. */
  private readonly ring: string[] = [];

  constructor(logsDir: string, name = 'vibr') {
    let file: string | null = null;
    try {
      fs.mkdirSync(logsDir, { recursive: true });
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      file = path.join(logsDir, `${name}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.log`);
    } catch (err) {
      console.error(`[log] file logging disabled: ${String(err)}`);
    }
    this.file = file;
  }

  log(message: string): void {
    const line = `[${new Date().toISOString()}] [pid ${process.pid}] ${message}`;
    console.error(line);
    this.ring.push(line);
    if (this.ring.length > RING_SIZE) this.ring.shift();
    if (this.file) {
      try {
        fs.appendFileSync(this.file, line + '\n');
      } catch {
        /* never let logging kill the bridge */
      }
    }
  }

  recent(): string[] {
    return [...this.ring];
  }

  get filePath(): string | null {
    return this.file;
  }
}

/** Last-resort diagnostics: fatal errors are written to the log before exit. */
export function installCrashHandlers(logger: FileLog, exitOnCrash = true): void {
  process.on('uncaughtException', (err) => {
    logger.log(`FATAL uncaughtException: ${err.stack ?? String(err)}`);
    if (exitOnCrash) process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.log(
      `FATAL unhandledRejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
    );
    if (exitOnCrash) process.exit(1);
  });
}
