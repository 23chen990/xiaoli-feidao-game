import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.FIDELITY_RUN_URL ?? 'http://127.0.0.1:4185/';
const label = process.env.FIDELITY_RUN_LABEL ?? 'after';
const out = resolve(process.env.FIDELITY_RUN_OUT ?? `evidence/fidelity-uplift-01/${label}`);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
const page = await context.newPage();
const consoleLog: string[] = [];
const pageErrors: string[] = [];
page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') consoleLog.push(`${message.type()}: ${message.text()}`); });
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
const timeline: Array<Record<string, unknown>> = [];
const shot = async (name: string) => {
  const path = resolve(out, `${name}.png`);
  await page.screenshot({ path });
  return path;
};
const state = async () => page.evaluate(() => window.__GAME_TEST__.getState());
timeline.push({ atMs: 0, event: 'ready', screenshot: await shot('01-ready'), state: await state() });
const schedule = (process.env.FIDELITY_RUN_SCHEDULE_MS ?? '0,1200,2400,3600,4800,6000,7200,8400,9600,10800,12000,13200,14400,15600,16800,18000,19000').split(',').map(Number);
const started = Date.now();
for (let i = 0; i < schedule.length; i += 1) {
  const due = started + schedule[i];
  const wait = due - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  await page.mouse.click(550, 360);
  timeline.push({ atMs: Date.now() - started, event: 'tap', inputIndex: i + 1, state: await state() });
  if (i === 0) { await page.waitForTimeout(350); timeline.push({ atMs: Date.now() - started, event: 'first-flight', screenshot: await shot('02-first-flight'), state: await state() }); }
  if (i === 6) { await page.waitForTimeout(220); timeline.push({ atMs: Date.now() - started, event: 'continuous-cuts', screenshot: await shot('03-continuous-cuts'), state: await state() }); }
  if (i === 8) { await page.waitForTimeout(180); timeline.push({ atMs: Date.now() - started, event: 'hazard-beat', screenshot: await shot('04-hazard'), state: await state() }); }
}
await page.waitForTimeout(1800);
timeline.push({ atMs: Date.now() - started, event: 'finish', screenshot: await shot('05-finish'), state: await state() });
await writeFile(resolve(out, 'run.json'), JSON.stringify({ label, url, viewport: { width: 1100, height: 720 }, schedule, timeline, consoleLog, pageErrors }, null, 2));
await browser.close();
