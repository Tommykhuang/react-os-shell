/**
 * Bundle and run ONE spec (or a few) — `node scripts/test-one.mjs tests/foo.test.tsx …`.
 *
 * `npm test` takes no filter: it bundles every spec and runs the lot, which is
 * five minutes and, on a Node whose `localStorage` global is present but dead,
 * a hang in four window specs before the summary. This is the same build and
 * the same spawn for the specs named on the command line, so a change to one
 * component can be answered in seconds and CI stays the full-suite gate.
 *
 * Same output directory as the full run, so the bundles it leaves behind are
 * the ones `npm test` would have written — and get overwritten by the next one.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'node_modules', '.cache', 'react-os-shell-tests');

const specs = process.argv.slice(2).map((f) => resolve(root, f));
if (specs.length === 0) {
  console.error('Usage: node scripts/test-one.mjs tests/<name>.test.tsx [more…]');
  process.exit(1);
}

await build({
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  sourcemap: 'inline',
  logLevel: 'warning',
  external: [
    'react', 'react-dom', 'react-dom/server', 'react-dom/client',
    'react-dom/test-utils', 'react/jsx-runtime', 'jsdom',
    'react-markdown', 'remark-gfm', 'remark-breaks',
  ],
  define: { __PKG_VERSION__: '"test"' },
  entryPoints: specs,
  outdir: outDir,
});

const bundled = specs.map((f) => join(outDir, basename(f).replace(/\.tsx?$/, '.js')));
const preload = pathToFileURL(join(root, 'scripts', 'test-dom-preload.mjs')).href;
// `--test-force-exit`: the specs retain jsdom handles, and a runner that waits
// for them to drain waits for ever. The full run lives with that; this one is
// for reading a result and moving on.
const child = spawn(process.execPath, ['--import', preload, '--test', '--test-force-exit', ...bundled], {
  stdio: 'inherit',
  env: { ...process.env, REPO_ROOT: root },
});
child.on('exit', (code) => process.exit(code ?? 1));
