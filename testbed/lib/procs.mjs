/**
 * The child-process plumbing the testbed scripts share: run the built CLI,
 * start a server and wait for it to say it is up, and stop everything that
 * was started on the way out.
 */
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CLI = join(repoRoot, 'packages/cli/dist/cli.js');

/** Run the built CLI and return its output; throws on a non-zero exit. */
export async function cli(args, { cwd = repoRoot } = {}) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 32 * 1024 * 1024,
  });
  return { stdout, stderr };
}

export async function freePort() {
  const server = createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address();
  await new Promise((res) => server.close(res));
  return port;
}

const children = [];
process.on('exit', () => {
  for (const proc of children) if (proc.exitCode === null && !proc.killed) proc.kill('SIGTERM');
});

/**
 * Start a long-running node script and resolve once its output contains
 * `needle`. The process is tracked, so stopAll() ends it.
 */
export async function startServer(args, { cwd = repoRoot, needle, label = args[0] } = {}) {
  const proc = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(proc);
  let log = '';
  await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(`${label} did not start:\n${log}`)), 30_000);
    const onData = (chunk) => {
      log += chunk;
      if (log.includes(needle)) {
        clearTimeout(timer);
        resolvePromise();
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.once('exit', (code) => {
      clearTimeout(timer);
      rejectPromise(new Error(`${label} exited (${code}) before starting:\n${log}`));
    });
  });
  return proc;
}

export async function stopAll() {
  for (const proc of children.splice(0)) {
    if (proc.exitCode !== null || proc.killed) continue;
    proc.kill('SIGTERM');
    await once(proc, 'exit').catch(() => undefined);
  }
}
