#!/usr/bin/env node
// Build static fixtures from trusted repository templates; never serve this renderer.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(dir, "../control-plane/web");
const check = process.argv.includes("--check");
const catalog = JSON.parse(
  fs.readFileSync(
    path.resolve(dir, "../control-plane/src/features/game-catalog/maps.json"),
    "utf8",
  ),
);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const fixtures = {
  hostname: "EU Scrim #1",
  host: "192.0.2.10",
  port: 27015,
  server_id: 1,
  connected: true,
  authenticated: true,
  hostname_error: false,
  csrfToken: "static-demo",
  cspNonce: "static-demo",
  isAdmin: false,
  requestedGameType: "competitive",
  requestedGameMode: "competitive",
  requestedMap: "de_mirage",
  gameTypes: Object.keys(catalog.gameTypes),
  mapGroups: Object.entries(catalog.mapGroups).map(([id, group]) => ({
    id,
    displayName: group.displayName,
  })),
};
// EJS syntax used by the maintained templates: statements, escaped values and includes.
// Inputs are exclusively checked-in files, not browser or user input.
function render(name, locals = fixtures) {
  if (name.endsWith("partials/footer") || name.endsWith("partials/theme-boot"))
    return "";
  const filename = path.resolve(web, "views", `${name}.ejs`);
  const source = fs.readFileSync(filename, "utf8");
  let code = 'let output = "";\n';
  let end = 0;
  for (const match of source.matchAll(/<%([=#-]?)([\s\S]*?)%>/g)) {
    code += `output += ${JSON.stringify(source.slice(end, match.index))};\n`;
    if (match[1] === "=") code += `output += escape(${match[2]});\n`;
    else if (match[1] === "-") code += `output += (${match[2]});\n`;
    else if (match[1] !== "#") code += `${match[2]}\n`;
    end = match.index + match[0].length;
  }
  code += `output += ${JSON.stringify(source.slice(end))}; return output;`;
  const include = (partial, extra = {}) =>
    render(
      path.relative(
        path.join(web, "views"),
        path.resolve(path.dirname(filename), partial),
      ),
      { ...locals, ...extra },
    );
  return new Function(
    "locals",
    "include",
    "escape",
    `with (locals) { ${code} }`,
  )(locals, include, escape);
}
const inventory = render("servers")
  .match(/<main[\s\S]*?<\/main>/)[0]
  .replace('id="main"', 'id="inventory-main"');
const manage = render("manage")
  .match(/<main[\s\S]*?<\/main>/)[0]
  .replace('id="main"', 'id="manage-main"');
const navbar = render("partials/navbar")
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(
    /<form[\s\S]*?<\/form>/g,
    '<p class="small text-muted">Local demo · no account required</p>',
  );
const html = `<!DOCTYPE html>
<!-- Built by build.mjs from control-plane/web/views. Edit the source templates or build script. -->
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><meta name="color-scheme" content="dark light"><title>3RR · Server control demo</title><link rel="icon" href="3rr-mark.svg" type="image/svg+xml"><link rel="stylesheet" href="panel.css"><link rel="stylesheet" href="preview.css"><script src="preview.js" defer></script></head>
<body><script id="demo-catalog" type="application/json">${JSON.stringify(catalog).replaceAll("<", "\\u003c")}</script><a class="skip-link" href="#inventory-main">Skip to main content</a><div class="shell ops-shell">${navbar}<p class="demo-disclosure">Design demo · simulated data. All actions stay in this browser; no server connection.</p><div id="demo-inventory">${inventory}</div><div id="demo-manage" class="main main-manage" hidden>${manage}</div></div><p id="demo-notice" class="demo-notice alert" role="status" hidden></p></body></html>\n`
  .replace(/href="\/servers"/g, 'href="#servers"')
  .replace(
    /href="\/(?:add-server|settings|admin\/users)"/g,
    'href="#demo-only"',
  )
  .replace(/href="\/manage\/\d+"/g, 'href="#setup"');
const builder = fs.readFileSync(
  path.resolve(dir, "../control-plane/scripts/build-css.mjs"),
  "utf8",
);
const modules = [
  ...builder
    .match(/const MODULES = \[([\s\S]*?)\];/)[1]
    .matchAll(/'([^']+\.css)'/g),
].map((match) => match[1]);
const css =
  "/* Built from production CSS by design-preview/build.mjs. */\n" +
  modules
    .map(
      (name) =>
        `/* ${name} */\n${fs.readFileSync(path.join(web, "assets/css", name), "utf8")}`,
    )
    .join("\n");
const outputs = new Map([
  ["index.html", Buffer.from(html.replace(/[ \t]+$/gm, ""))],
  [
    "panel.css",
    Buffer.from(
      css
        .replaceAll("'/fonts/", "'fonts/")
        .replaceAll("'/olive-texture.png'", "'olive-texture.png'"),
    ),
  ],
  [
    "olive-texture.png",
    fs.readFileSync(path.join(web, "assets/olive-texture.png")),
  ],
  ["3rr-mark.svg", fs.readFileSync(path.join(web, "assets/3rr-mark.svg"))],
]);
let stale = false;
for (const [name, value] of outputs) {
  const target = path.join(dir, name);
  if (check) {
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(value)) {
      console.error(
        `Stale demo artifact: ${name}. Run node design-preview/build.mjs`,
      );
      stale = true;
    }
  } else fs.writeFileSync(target, value);
}
if (stale) process.exitCode = 1;
else
  console.log(
    check
      ? "Demo matches production templates and styles"
      : "Built current production demo",
  );
