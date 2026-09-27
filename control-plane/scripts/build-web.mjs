/** Builds every browser artifact from its maintained source in one deterministic pass. */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import './build-css.mjs';
import './copy-fonts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = resolve(root, 'web/generated');
mkdirSync(resolve(generated, 'js'), { recursive: true });

copyFileSync(
  resolve(root, 'web/client/static/toast-inline.js'),
  resolve(generated, 'js/toast-inline.js')
);
copyFileSync(resolve(root, 'web/assets/3rr-mark.svg'), resolve(generated, '3rr-mark.svg'));

await build({
  entryPoints: [resolve(root, 'web/client/console.ts')],
  bundle: true,
  minify: true,
  outfile: resolve(generated, 'js/console.js'),
  target: 'es2020',
});
