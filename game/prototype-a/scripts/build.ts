import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');

await build({
  root,
  logLevel: 'warn',
  build: { outDir: dist, emptyOutDir: true, cssCodeSplit: false, chunkSizeWarningLimit: 4_000 },
});

const assetDirectory = resolve(dist, 'assets');
const assets = await readdir(assetDirectory);
const scriptName = assets.find((name) => name.endsWith('.js'));
const styleName = assets.find((name) => name.endsWith('.css'));
if (!scriptName) throw new Error('Vite did not emit JavaScript');

let html = await readFile(resolve(dist, 'index.html'), 'utf8');
const script = (await readFile(resolve(assetDirectory, scriptName), 'utf8')).replaceAll('</script', '<\\/script');
html = html.replace(
  /<script[^>]+src="[^"]+"[^>]*><\/script>/,
  () => `<script type="module">${script}</script>`,
);
if (styleName) {
  const style = await readFile(resolve(assetDirectory, styleName), 'utf8');
  html = html.replace(/<link[^>]+href="[^"]+\.css"[^>]*>/, `<style>${style}</style>`);
}
if (/<script[^>]+src=|<link[^>]+href=/i.test(html)) throw new Error('Build contains external references');
await writeFile(resolve(dist, 'index.html'), html);
await rm(assetDirectory, { recursive: true, force: true });
console.log(`built self-contained dist/index.html (${Buffer.byteLength(html)} bytes)`);
