/**
 * The ONLY way the bridge starts a process. execFile / spawn with
 * shell:false: arguments are passed as an argv vector, so shell
 * metacharacters in any argument are inert data. `exec` is never used.
 */
import { execFile, spawn } from 'node:child_process';

export interface RunResult {
  stdout: string;
  stderr: string;
}

export class RunError extends Error {
  constructor(
    message: string,
    public stderr: string,
    public code: number | string | null,
  ) {
    super(message);
  }
}

export interface RunOptions {
  input?: string;
  timeoutMs?: number;
  /** extra environment: how DATA reaches PowerShell scripts on Windows */
  env?: NodeJS.ProcessEnv;
}

export type Runner = (file: string, args: readonly string[], opts?: RunOptions) => Promise<RunResult>;

export const run: Runner = (file, args, opts = {}) =>
  new Promise((resolve, reject) => {
    if (opts.input !== undefined) {
      const child = spawn(file, [...args], { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: opts.env, windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs ?? 10_000);
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new RunError(e.message, stderr, (e as NodeJS.ErrnoException).code ?? null));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new RunError(`${file} exited ${code}`, stderr, code));
      });
      child.stdin.end(opts.input);
      return;
    }
    execFile(file, [...args], { shell: false, timeout: opts.timeoutMs ?? 10_000, maxBuffer: 16 * 1024 * 1024, env: opts.env, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new RunError(err.message, String(stderr ?? ''), (err as NodeJS.ErrnoException).code ?? null));
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });

/**
 * Start a GUI program that keeps running (a browser, an app) without
 * waiting for it — detached, no shell, argv only. The exec timeout must
 * never kill the user's browser.
 */
export function launchDetached(file: string, args: readonly string[]) {
  const child = spawn(file, [...args], { shell: false, detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
}

/**
 * AppleScript with DATA passed through argv. The script text is always a
 * constant from this codebase; caller data only ever arrives as `item n of
 * argv`, so it can never become code.
 */
export function osascript(runner: Runner, script: string, args: readonly string[] = [], lang: 'AppleScript' | 'JavaScript' = 'AppleScript') {
  return runner('osascript', ['-l', lang, '-e', script, ...args], { timeoutMs: 12_000 });
}
