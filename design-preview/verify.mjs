#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const demoDir = path.dirname(fileURLToPath(import.meta.url));
const requiredFiles = [
  "index.html",
  "preview.css",
  "panel.css",
  "olive-texture.png",
  "3rr-mark.svg",
  "fonts/inter-latin-wght-normal.woff2",
  "preview.js",
  "README.md",
  "fonts/inter-normal-400-latin.woff2",
  "fonts/inter-normal-500-latin.woff2",
  "fonts/inter-normal-600-latin.woff2",
  "fonts/inter-normal-700-latin.woff2",
  "fonts/jetbrains-mono-latin-wght-normal.woff2",
  "fonts/syne-latin-wght-normal.woff2",
  "fonts/inter-LICENSE.txt",
  "fonts/syne-LICENSE.txt",
  "fonts/jetbrains-mono-LICENSE.txt",
];
const requiredIds = [
  "nav-toggle-btn",
  "serverList",
  "prepare-selected-server",
  "server_setup_form",
  "gameTypeValue",
  "gameModeValue",
  "selectedMap",
  "send-setup-commands",
  "session-result",
  "session-check-map",
  "session-observed-result",
  "rconInput",
  "rconResultText",
  "playerSearch",
  "demo-notice",
];
const failures = [];

function fail(message) {
  failures.push(message);
}

function withinDemo(candidate) {
  const relative = path.relative(demoDir, candidate);
  return (
    relative &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function checkReference(reference, source) {
  const value = reference.trim();
  if (!value || value.startsWith("#") || value.startsWith("data:")) return;
  if (/^(?:https?:)?\/\//i.test(value)) {
    fail(`${source}: external HTTP(S) reference is not allowed: ${value}`);
    return;
  }
  if (value.startsWith("/")) {
    fail(`${source}: root-absolute reference is not allowed: ${value}`);
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    fail(`${source}: non-local reference is not allowed: ${value}`);
    return;
  }
  const localPath = value.split(/[?#]/, 1)[0];
  const resolved = path.resolve(demoDir, localPath);
  if (
    !withinDemo(resolved) ||
    !existsSync(resolved) ||
    !statSync(resolved).isFile()
  ) {
    fail(`${source}: unresolved local reference: ${value}`);
  }
}

for (const file of requiredFiles) {
  const target = path.join(demoDir, file);
  if (!existsSync(target) || !statSync(target).isFile())
    fail(`missing required file: ${file}`);
}

const html = readFileSync(path.join(demoDir, "index.html"), "utf8");
for (const id of requiredIds) {
  if (!new RegExp(`\\bid=["']${id}["']`).test(html))
    fail(`index.html: missing core interaction ID #${id}`);
}
if (!/Design demo · simulated data/.test(html))
  fail("index.html: missing the simulated-data disclosure");

for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const attributes = match[1];
  if (/\btype=["']application\/json["']/i.test(attributes)) {
    try {
      JSON.parse(match[2]);
    } catch {
      fail("index.html: invalid embedded fixture JSON");
    }
  } else if (
    !/\bsrc=["']preview\.js["']/i.test(attributes) ||
    match[2].trim()
  ) {
    fail(
      "index.html: unexpected executable script; only preview.js is allowed",
    );
  }
}
if (/\bon[a-z]+\s*=/i.test(html))
  fail("index.html: inline event handlers are not allowed");

for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
  checkReference(match[1], "index.html");
}

const alignment = spawnSync(
  process.execPath,
  [path.join(demoDir, "build.mjs"), "--check"],
  { encoding: "utf8" },
);
if (alignment.status !== 0)
  fail(
    alignment.stderr ||
      alignment.error?.message ||
      "Production alignment check failed",
  );
const css = ["preview.css", "panel.css"]
  .map((file) => readFileSync(path.join(demoDir, file), "utf8"))
  .join("\n");
for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
  checkReference(match[1], "preview.css");
}
if (/(?:^|})\s*\[data-view\]\s*\{/.test(css)) {
  fail("preview.css: an unscoped [data-view] rule would hide the body element");
}

const js = readFileSync(path.join(demoDir, "preview.js"), "utf8");
for (const pattern of [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bnavigator\.sendBeacon\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
]) {
  if (pattern.test(js))
    fail(`preview.js: runtime network API is not allowed: ${pattern}`);
}
if (/\b(?:https?:)?\/\//i.test(js))
  fail("preview.js: HTTP(S) runtime dependency is not allowed");

if (failures.length) {
  console.error("design-preview verification failed:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("design-preview verification passed");
}
