import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';

const artifactDirectory = '../../qa-level-pack-v1';

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve QA port');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForPreview(url: string, process: ChildProcessWithoutNullStreams): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`Preview exited (${process.exitCode})`);
    try { if ((await fetch(url)).ok) return; } catch { /* private preview is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Preview did not start at ${url}`);
}

async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise<void>((resolve) => child.once('exit', () => resolve())), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

await mkdir(artifactDirectory, { recursive: true });
const port = await reservePort();
const url = `http://127.0.0.1:${port}/`;
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
let log = '';
preview.stdout.on('data', (chunk: Buffer) => { log += chunk.toString(); });
preview.stderr.on('data', (chunk: Buffer) => { log += chunk.toString(); });
let failure: unknown = null;
let smokeExitCode: number | null = null;
try {
  await waitForPreview(url, preview);
  const smoke = spawn('pnpm', ['exec', 'tsx', 'tests/level-pack-browser.ts'], { cwd: process.cwd(), env: { ...process.env, SLICE_LEVEL_QA_URL: url }, stdio: ['pipe', 'pipe', 'pipe'] });
  smoke.stdout.on('data', (chunk: Buffer) => { log += chunk.toString(); });
  smoke.stderr.on('data', (chunk: Buffer) => { log += chunk.toString(); });
  smokeExitCode = await new Promise<number>((resolve) => smoke.once('exit', (code) => resolve(code ?? 1)));
  if (smokeExitCode !== 0) throw new Error(`Level-pack smoke failed (${smokeExitCode})`);
} catch (error) { failure = error; }
finally {
  await stop(preview);
  await writeFile(`${artifactDirectory}/console.log`, log, 'utf8');
  await writeFile(`${artifactDirectory}/runner-report.json`, `${JSON.stringify({ schemaVersion: 1, artifactType: 'LevelPackQaRunner', passed: failure === null, url, smokeExitCode, previewClosed: preview.exitCode !== null || preview.killed, error: failure instanceof Error ? failure.message : failure ? String(failure) : null }, null, 2)}\n`, 'utf8');
}
if (failure) throw failure;
console.log(JSON.stringify({ passed: true, artifactDirectory }));

