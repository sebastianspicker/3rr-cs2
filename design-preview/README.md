# 3RR browser demo

[Open the demo](https://sebastianspicker.github.io/3rr/).

This static demo uses the current control plane's olive interface and
**Server → Setup → Check result** workflow. All servers, players, observations,
and command responses are fictional. Actions run locally in your browser;
there is no authentication, API, RCON, or game server connection.

## Try it

1. Select a server, then **Prepare server**.
2. Choose game type, mode, map, and optional team names. Review the requested
   setup before sending it.
3. **Send setup** simulates submitting commands. The previous map observation
   remains separate from the request.
4. **Check live map** produces a separate simulated observation. It confirms
   the requested map in the fixture; mode and team names remain unverified.

A disconnected fixture produces a send error. **Reconnect** restores its
simulated connection. Server search includes empty results and clear filters.
Console supports `status`, command history, and local command feedback.
Players supports search and simulated removal; Refresh restores the fixture.
Match and advanced buttons show local action notices. **Commands** or
**Ctrl/Cmd+K** focuses the console. Account contains Appearance and demo notices
for configuration pages. Theme choice persists; reloading resets other changes.

## Source alignment

`build.mjs` renders the maintained production EJS templates using fixed demo
locals and a small, build-only renderer for their trusted syntax. It embeds
`control-plane/src/features/game-catalog/maps.json` for the setup choices.
It reads the stylesheet order directly from
`control-plane/scripts/build-css.mjs`, bundles those CSS modules, and copies
the production texture and mark. The build adapts asset and navigation links
and omits production scripts and sign-out behavior.
The application runtime and production browser client remain independent.

Run from the repository root after changing templates, catalog, or styles:

```bash
node design-preview/build.mjs
node --check design-preview/preview.js
node design-preview/verify.mjs
```

The verifier runs `build.mjs --check` without writing files. It fails when
tracked HTML, styles, texture, or mark differ from the current production
sources, or when the demo references missing, external, or root-absolute
assets or uses runtime network APIs. No npm installation is required.
`preview.js` owns local interactions; `preview.css` contains only demo
notices. Generated `index.html` and `panel.css` should be refreshed through
the build script instead of edited directly.

## Run locally and publish

Open `index.html` directly, or serve it:

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory design-preview
```

The [Pages workflow](../.github/workflows/pages.yml) verifies source alignment
and publishes from `main`. Its artifact consists of `index.html`, `panel.css`,
`preview.css`, `preview.js`, `olive-texture.png`, `3rr-mark.svg`, and `fonts/`
including licenses. No build scripts or production server code are published.
All browser asset URLs work under a repository subpath such as `/3rr/`.

Before publishing, exercise server selection, setup submission, separate map
observation, console, player filtering, keyboard tabs, account navigation,
theme switching, and narrow-screen layout in a browser. These static checks
do not validate a live CS2/RCON deployment.

## Fonts

Bundled Inter, Syne, and JetBrains Mono fonts use the SIL Open Font License.
Their existing notices remain in `fonts/` and are published with the demo.
Production's native system typography is preserved; the bundled fonts remain
available to the production stylesheet.
