#!/usr/bin/env node
// Copies installed font assets so the control plane does not depend on a CDN.
const fs = process.getBuiltinModule('fs');
const path = process.getBuiltinModule('path');

const modules = path.join(__dirname, '..', 'node_modules');
const dest = path.join(__dirname, '..', 'web', 'generated', 'fonts');

/** Barlow carries the interface voice; JetBrains Mono marks machine values. */
const FONTS = [
  ['@fontsource/barlow-semi-condensed', 'barlow-semi-condensed-latin-500-normal.woff2'],
  ['@fontsource/barlow-semi-condensed', 'barlow-semi-condensed-latin-600-normal.woff2'],
  ['@fontsource/barlow-semi-condensed', 'barlow-semi-condensed-latin-700-normal.woff2'],
  ['@fontsource/barlow-condensed', 'barlow-condensed-latin-600-normal.woff2'],
  ['@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2'],
];

fs.rmSync(dest, { force: true, recursive: true });
fs.mkdirSync(dest, { recursive: true });
for (const [pkg, file] of FONTS) {
  fs.copyFileSync(path.join(modules, pkg, 'files', file), path.join(dest, file));
}
