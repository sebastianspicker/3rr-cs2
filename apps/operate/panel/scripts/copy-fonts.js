#!/usr/bin/env node
const fs = process.getBuiltinModule('fs');
const path = process.getBuiltinModule('path');

const src = path.join(__dirname, '..', 'node_modules', '@fontsource-variable');
const dest = path.join(__dirname, '..', 'public', 'fonts');

fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(
  path.join(src, 'syne', 'files', 'syne-latin-wght-normal.woff2'),
  path.join(dest, 'syne-latin-wght-normal.woff2')
);
fs.copyFileSync(
  path.join(src, 'jetbrains-mono', 'files', 'jetbrains-mono-latin-wght-normal.woff2'),
  path.join(dest, 'jetbrains-mono-latin-wght-normal.woff2')
);
