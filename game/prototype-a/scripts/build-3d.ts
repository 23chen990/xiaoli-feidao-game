import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, 'dist-3d');

await build({
  root: projectRoot,
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2_000,
    rollupOptions: {
      input: resolve(projectRoot, 'poc-3d.html'),
    },
  },
});

const assetDirectories = ['kenney-nature', 'cc0-weapon', 'draco'] as const;
for (const directory of assetDirectories) {
  const sourceAssets = resolve(projectRoot, 'public/assets', directory);
  const builtAssets = resolve(outputDirectory, 'assets', directory);
  if (!existsSync(sourceAssets)) throw new Error(`Missing pinned 3D assets at ${sourceAssets}`);
  await mkdir(builtAssets, { recursive: true });
  await cp(sourceAssets, builtAssets, { recursive: true });
}

console.log(JSON.stringify({
  schemaVersion: 1,
  artifactType: 'ThreeCutPocBuildResult',
  output: outputDirectory,
  assets: [
    'kenney-nature/tree_simple.glb',
    'kenney-nature/log_stack.glb',
    'cc0-weapon/sword-6.glb',
    'draco/draco_decoder.wasm',
  ],
}));
