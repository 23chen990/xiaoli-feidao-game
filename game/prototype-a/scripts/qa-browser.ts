import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readdir, writeFile } from 'node:fs/promises';

const artifactDirectory = 'tests/artifacts/qa-3d-main-v1';

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve a local preview port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForPreview(url: string, preview: ChildProcessWithoutNullStreams): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (preview.exitCode !== null) throw new Error(`Preview exited before becoming ready (${preview.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Preview startup is intentionally polled on a private local port.
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Preview did not become ready at ${url}`);
}

async function stopProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

await mkdir(artifactDirectory, { recursive: true });
const port = await reservePort();
const url = `http://127.0.0.1:${port}/`;
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
});
let previewLog = '';
preview.stdout.on('data', (chunk: Buffer) => { previewLog += chunk.toString(); });
preview.stderr.on('data', (chunk: Buffer) => { previewLog += chunk.toString(); });

let smokeLog = '';
let smokeExitCode: number | null = null;
let failure: unknown = null;

try {
  await waitForPreview(url, preview);
  const smoke = spawn('pnpm', ['exec', 'tsx', 'tests/browser-smoke.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, SLICE_SMOKE_URL: url },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  smoke.stdout.on('data', (chunk: Buffer) => { smokeLog += chunk.toString(); });
  smoke.stderr.on('data', (chunk: Buffer) => { smokeLog += chunk.toString(); });
  smokeExitCode = await new Promise<number>((resolve) => {
    smoke.once('exit', (code) => resolve(code ?? 1));
  });
  if (smokeExitCode !== 0) throw new Error(`Browser smoke failed with exit code ${smokeExitCode}`);
} catch (error) {
  failure = error;
} finally {
  await stopProcess(preview);
  const consoleLog = [`preview: ${url}`, previewLog.trim(), smokeLog.trim()].filter(Boolean).join('\n');
  await writeFile(`${artifactDirectory}/console.log`, `${consoleLog}\n`, 'utf8');
  const generatedEvidence = (await readdir(artifactDirectory)).filter((name) => name.endsWith('.png') || name === 'browser-result.json');
  const report = {
    schemaVersion: 1,
    artifactType: 'BrowserQaReport',
    passed: failure === null && smokeExitCode === 0,
    url,
    smokeExitCode,
    previewClosed: preview.exitCode !== null || preview.killed,
    browserClosedBySmokeFinally: true,
    evidence: [...generatedEvidence, 'console.log'],
    error: failure instanceof Error ? failure.message : failure ? String(failure) : null,
  };
  await writeFile(`${artifactDirectory}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (failure) throw failure;
console.log(JSON.stringify({ schemaVersion: 1, artifactType: 'BrowserQaRunnerResult', passed: true, url, previewClosed: true }));
