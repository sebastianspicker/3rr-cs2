# 3RR interface redesign: design brief

## Status and summary

- **Decision:** Direction A, "Server Browser, operator side", was approved and implemented on
  2026-09-25.
- **The problem:** the panel's olive/gold "CS 1.6" look was only surface paint. There was no
  consistent type, colour, or depth system. Worse, what the operator *requested* looked exactly
  like what the server *reported*, although that distinction is the whole point of the
  product. [Design brief §1, §3]
- **The solution:** the new look is modelled on the classic Counter-Strike/Steam server
  browser dialog. Depth now carries meaning:
  - **raised** means you can press it;
  - **sunken** means the server reported it;
  - **dashed** means you requested it, but it isn't confirmed.

  [Design brief §5A]
- **Built:** a new set of design tokens, all ten stylesheets rewritten, tabs moved to the top,
  and nine fixes from a critique pass. Behaviour, IDs, and routes are unchanged. [Design brief
  §7]
- **Not yet proven:** operators haven't used it. The dashed "requested" style needs a real
  usability test. Keyboard and screen-reader checks were automated only. [Design brief §7,
  Still open]

## 1. The product and its central idea

[Design brief §1]

3RR controls existing self-hosted CS2 servers from a browser over RCON (the game's remote
console). It does not set up hosts. The main journey has three steps:

1. **Choose a server** (`/servers`):
   - fleet counts, search, and filter;
   - a table where you select one row (the "radio-row" pattern), showing each server's
     address, RCON state, and last check;
   - selecting a row shows the server's last observed map and players.
2. **Prepare** (`/manage/:id`):
   - pick game type → mode → map;
   - add optional team names;
   - review the request, then send it to a named server.
3. **Check result**:
   - "commands sent" is kept separate from "map observed";
   - the status check confirms the map and players **only**;
   - mode and teams stay *Not reported*.

**Secondary work** happens under the same server:

- Console: one printable-ASCII RCON command at a time, with history;
- Match, Scrim and Practice presets (about 80 buttons);
- Players: kick and mute;
- Workshop maps and map groups;
- round restore;
- reconnect.

Accounts, settings, and admin users are under the Account menu.

**The moment of value.** The operator:

- knows *which* server they are about to touch;
- sends a setup deliberately;
- can then tell what they asked for apart from what the server says.

The whole product rests on separating **requested** from **observed**.

## 2. Who it's for

[Design brief §2]

**The users:**

- community server operators, scrim organizers, and admins;
- running anywhere from a handful to a few dozen servers;
- technical: they use a terminal, `rcon`, HLSW, Discord, and the CS console every day;
- most have played since CS 1.6 or Source;
- they return often, work on a desktop, and are usually in a hurry: ten players are waiting
  in Discord for the map to change.

**What they trust:**

- exact values (IP:port, `de_mirage`, console variable names);
- timestamps;
- an honest *unknown*;
- keyboard speed;
- information density that respects their expertise.

**What they distrust:**

- marketing tone;
- anything that says "ready" when it only sent a command;
- hidden state;
- flashy "gamer RGB" styling.

**What reads as quality to them:** it behaves like a well-made tool. The correct server is
always named, nothing jumps around, numbers line up, and the Counter-Strike references are
accurate without being costume.

## 3. What was wrong before

[Design brief §3]

**The starting point:**

- **Technology:** Express with EJS templates, bundled browser TypeScript, and plain CSS in 10
  modules (`control-plane/web/assets/css`, joined by `scripts/build-css.mjs`).
- **Tokens:** shared design values live in `tokens.css`.
- **Themes:** dark is the default, and a light theme exists.
- **Fonts:** installed as development packages from `@fontsource` and copied in at build time.
- **Demo:** `design-preview/` renders the same templates and CSS as a static demo, and its
  verifier fails if the two drift apart.

**What already worked:**

- the olive/gold CS 1.6 "VGUI" mood, which the owner likes;
- the Server → Setup → Check result flow;
- honest wording, such as "Not reported", "Checks server status without sending setup
  again", and "Unknown state is never treated as offline";
- solid accessibility groundwork: a skip link, page landmarks, screen-reader announcements
  ("live regions"), keyboard navigation for the server table, and reduced motion.

**What felt generic or broken:**

- **The retro look was only paint.** Olive and gold were applied, but the typefaces were
  system fallbacks (`Trebuchet MS`, `Arial Narrow`), so the look changed from one operating
  system to the next. Inter and Syne were built and shipped but never used.
- **There was no type scale.** The CSS used about 30 different font sizes (0.65–2rem). On
  `/servers`, the second-level heading ("Selected: …") was larger than the page title.
- **Gold did four jobs:** main action, selection, current step, and warning. The "map change
  interrupts play" warning looked like the Send button beside it.
- **Requested and observed looked the same.** Both were plain text in similar tables, so the
  product's central idea had no visual form.
- **Depth effects were inconsistent.** Primary buttons were raised, panels were flat with a
  1px border, and input fields were sunken in one place and flat in another. A leftover blue
  focus shadow (`rgb(91 124 250 / 22%)`) and old alias tokens (`--blue`, `--coral`,
  `--glow-*`) remained from an earlier theme.
- **Two navigation systems collided.** The steps "1 Server / 2 Setup / 3 Check result" sat at
  the top, and the tool tabs "Console / Match / Players / Setup" sat at the *bottom*. The
  word "Setup" named both a step and a tab.
- **Match/Practice was one wall** of about 80 equally weighted buttons. On/Off pairs looked
  like ordinary buttons and didn't show which one was last sent.
- **Mobile:** step labels wrapped ("Check / result"), and a decorative background image
  (raster texture) stayed behind the page.

## 4. Fixed constraints

[Design brief §4]

These could not change:

- **Behavioural hooks.** Template IDs and `data-*` attributes are used by the browser code
  (`web/client/*.ts`) and by the 30 automated browser test files (Playwright,
  `test/browser/*.spec.mjs`). Styling could change freely; renaming anything required
  updating the code and tests too.
- **Server contracts.** HTTP routes, response shapes, and CSRF, session, and rate-limit
  behaviour stay unchanged, as does the CSP nonce. The CSP nonce is the security rule that
  only approved scripts run, and it means no external font or CDN requests. Fonts must be
  self-hosted via `@fontsource`, and adding one changes the dependency lockfile.
- **Themes.** Dark stays the default. The light theme and its saved setting (`3rr.theme`)
  remain, and so does the script that applies the theme before the page first paints
  (`theme-boot.ejs`).
- **Accessibility:**
  - text contrast at the WCAG AA level;
  - visible keyboard focus;
  - labels that don't rely on colour alone;
  - respect for the reduced-motion setting;
  - touch targets of at least 44px.
- **Demo and screenshots.** `design-preview/` must be rebuilt (`node design-preview/build.mjs`)
  and pass `verify.mjs`. The screenshot tour in `docs/screenshots` needs a refresh.
- **Product rules** (`PRODUCT.md`) exclude:
  - decorative terminal effects;
  - oversized tiles;
  - layered cards;
  - large type;
  - status colours used for anything except status.
- **No SEO or translation concerns.** Every page requires sign-in and is English only.

**Open questions at the start:**

- How big is a real fleet? 8 rows or 80 rows changes the table design.
- How often do operators use a phone? It is currently assumed to be occasional.
- Does the light theme get real use, or does it exist only for accessibility?

## 5. Three directions considered

[Design brief §5]

All three stay rooted in Counter-Strike, as requested, but each draws on a different part of
it.

### Direction A: Server Browser, operator side (evolve VGUI)

**Concept.** The CS 1.6 / 2003-era Steam client was built from VGUI dialog windows. The
most-used one was *Find Servers*: a dense list with Servers, Game, Players, Map, and Latency
columns and a Connect button. 3RR's first screen is that same dialog, seen from the
administrator's side. The rule: **depth carries meaning.**

- **Raised** (light top-left edge, dark bottom-right): things you can press.
- **Sunken** (the reverse): what the *server reported*. Every observed value sits in a sunken
  box with its timestamp.
- **Flat with a dashed outline**: what *you requested*, a draft that isn't true yet.

This makes requested and observed look physically different in both themes **without relying
on colour**, in the visual language this audience grew up with.

**Type.**

- *Barlow Semi Condensed* (weights 500/600/700) for the interface. It is slightly narrow and
  sign-like, close to the bold Tahoma captions of VGUI, and suits dense tables.
- *Barlow Condensed* 600, in spaced capitals, for dialog titles and column headers only
  ("FIND SERVERS" style).
- *JetBrains Mono* (already bundled), with equal-width digits, for anything the server says
  or accepts: addresses, `de_` map names, console variables, times, and counts. The strict
  rule: monospace means "machine value".

**Colour, each with one job.** These are classic Steam values, checked for contrast. A ratio
of 4.5:1 is the WCAG AA minimum for normal text.

| Role       | Dark value | Job                                                                                       |
| ---------- | ---------- | ----------------------------------------------------------------------------------------- |
| window     | `#3e4637`  | dialog background                                                                         |
| sunken     | `#2a3023`  | observed readouts and input fields                                                        |
| text       | `#d8ded3`  | 7.2:1 on window, 9.9:1 on sunken                                                          |
| gold       | `#c4b550`  | the one main action per screen and the selected row; filled, with `#1c2016` text (7.9:1) |
| HUD orange | `#e0913a`  | warnings only; 5.4:1, so used on sunken only                                             |
| green      | `#8fd06a`  | observed OK; sunken only (7.4:1)                                                         |
| red        | `#f08a6c`  | disconnected, error, destructive (5.5:1 on sunken)                                       |

Status colours appear only inside sunken readouts, which keeps them at AA contrast. Muted
text is lightened to reach at least 4.5:1 on the window colour.

**Layout.**

- One centred "dialog" window, at most about 1180px wide, with a VGUI title bar.
- **Tabs at the top**, like VGUI property sheets.
- A status bar at the bottom, proposed as the single fixed place for connection information
  (`192.0.2.2:27015 · RCON ok · observed 20:56:13`). The build changed this; see §8.
- The steps become a subtitle of the Setup tab instead of competing with the tabs.
- A 4px base grid, a 7-step type scale (12/13/14/16/18/22/28px), and desk-tool density with
  32px table rows.

**Motion.** Almost none:

- a 1px press offset on buttons;
- instant tab switches;
- one 160ms transition from a dashed *requested* outline to a sunken *observed* readout when a
  check confirms the map. It is switched off under reduced motion.

**Signatures.**

1. The requested → observed pair: a dashed-outline value next to its sunken, timestamped
   twin. It is one component, used on every screen.
2. On/Off presets become VGUI radio pairs that show the *last sent* value in the dashed
   "requested" style. They never claim to be observed.

**Avoids:**

- texture behind the interface (the olive background image is removed);
- fake CRT scanlines;
- pixel fonts;
- CS logos or insignia;
- all-caps body text.

### Direction B: HUD

- **Concept.** The in-game CS 1.6 HUD: see-through orange numbers at the screen edges, where
  you read health, armour, and money without thinking. The observed state would become a
  permanent strip at the bottom edge (map, players, RCON, age) in large equal-width numbers.
  Everything else fades into near-black flat panels.
- **Type:** a squared techno display face for numbers only (for example *Chakra Petch*), with
  *IBM Plex Sans* for the interface.
- **Colour:** near-black, HUD amber for *observed* values, and off-white for everything else.
  Nothing more.
- **Layout:** a full-width workspace with no window, centred content, and the HUD strip pinned
  to the bottom.
- **Motion:** readouts tick over when a new observation arrives.
- **Signature:** the HUD strip and a crosshair-style focus ring.
- **Avoids:** glow and bloom.

**Drawbacks.** It fits the "at a glance" need, but it drops the olive VGUI look the owner
likes. Amber on near-black is close to the "glowing on dark" cliché, and the large numbers
break the `PRODUCT.md` "no large type" rule.

### Direction C: Scrim sheet

- **Concept.** LAN-era organising on paper: the printed bracket, the map-veto sheet, and a
  `server.cfg` printout marked up in pen. It is light-first, with ivory paper, a ruled grid,
  and stamped states: SENT in outlined ink, and OBSERVED as a solid stamp with a time.
- **Type:** *IBM Plex Serif* headings, *IBM Plex Sans* interface, *IBM Plex Mono* for CFG
  lines.
- **Colour:** ink, paper, one red pen for warnings, and one green stamp.
- **Layout:** a form layout on a baseline grid, with generous margins.
- **Signature:** the stamp.
- **Avoids:** fake paper texture.

**Drawbacks.** It is distinctive and suits the scrim organiser, but it abandons the
retro-client look. It also flips the dark default for a desk tool that is often used at
night.

## 6. Why Direction A

[Design brief §6]

- **It fits the audience and the product.** The fleet page *is* a server browser, and the
  metaphor is the users' own, not invented for them. It keeps the CS 1.6 feel the owner likes
  and gives it discipline instead of paint.
- **It solves the core problem.** Depth marks requested, observed, and actionable without
  adding colour. That works in the light theme, for colour-blind users, and in greyscale.
  Neither B nor C encodes the distinction as structurally.
- **It respects `PRODUCT.md`.** It is compact and calm, uses status colours only for status,
  keeps connection information in one place, and adds no large type or terminal effects.
- **It carries the lowest risk.** The work is mostly tokens and CSS, plus a few targeted
  template changes:
  - moving the tool tabs to the top;
  - adding a status bar;
  - a shared requested/observed template.

  IDs and `data-*` contracts stay as they are. One font dependency (Barlow) is added, and
  Inter and Syne are removed.

The one idea borrowed from Direction B: equal-width (tabular) digits for all counts and times.

## 7. What was built

[Design brief §7]

**Tokens.** All shared design values are in `control-plane/web/assets/css/tokens.css`:

- surfaces: `--desk`, `--window`, `--raised`, `--sunken`, `--sunken-deep`, `--select`;
- text colours;
- edges: `--draft` for dashed requested outlines, plus a bevel pair;
- gold;
- the three status colours with their tinted backgrounds;
- a 7-step type scale and a 4px spacing scale;
- depth recipes: `--edge-raised` and `--edge-sunken`.

**Stylesheets.** The ten CSS modules were rewritten from scratch. The old stylesheet had
grown through several layers of overrides. The new one is 64 KB, covers every class used in
the templates and browser code, and has no unused selectors or legacy aliases.

**Layout changes.** IDs and `data-*` attributes are preserved.

- On `/manage/:id`:
  - the tabs moved to the top, in the order Setup, Console, Match, Players;
  - the session steps moved inside Setup;
  - Commands, Reconnect, and Refresh moved into the server header.
- The step numbers are wrapped in `.session-step-n`, and the selected-server readout gained a
  "Players" label.
- Practice Mode is now secondary, so *Start match* is the only gold button on the Match tab.
  A legend explains what the dashed outline means.

## 8. Change from the proposal

[Design brief §7, Deviation from the proposal]

The status bar shows the product line ("Unknown state is never treated as offline"), **not**
connection details. Connection information already has one fixed place, in the server header
and its sunken readout, and repeating it at the bottom would duplicate it.

## 9. Fixes from the critique pass

[Design brief §7, Critique pass fixes]

1. The manage-page readout collapsed into narrow columns because of a CSS precedence clash.
   It is now a proper grid.
2. Fleet counts showed a red "0 disconnected". Status is now shown by a marker in the label,
   and the counts stay neutral.
3. Player counts moved from monospace to interface type, because they are phrases, not
   machine values.
4. The Match tab had two gold buttons; now it has one.
5. Practice sub-groups had no vertical rhythm, so a row gap was added.
6. The login status bar floated at the bottom of the page; it is now attached to the dialog.
7. On mobile, the address in server rows collided with the time. The address now stays whole,
   and the time is hidden below 480px, since the selected-server readout repeats it.
8. Mobile preset grids left single orphaned buttons. They now keep their column count, with
   thinner framing around them.
9. The lone Players group box was framed twice inside its tab; it is now unframed.

## 10. Still open

[Design brief §7, Still open; §4, Open questions]

- **Operators have not seen it yet.** The dashed "requested" style needs a real usability
  check.
- **Keyboard and screen-reader testing was automated only**, through the Playwright suite.
- **The Match tab is still long on a phone.** The next step would be to make the practice
  groups collapsible.
- **One empty state wasn't rewritten.** The message shown when a server reports a player count
  but an empty player list comes from the browser code.
- **Research questions from the start remain open:** real fleet size, phone use, and whether
  the light theme is used.

## Glossary

- **Bevel / raised / sunken**: light and dark edges that make an element look pressed out of,
  or into, the surface.
- **CDN**: an external server network for files such as fonts; not allowed here.
- **CSP nonce**: a per-page security token that allows only approved scripts to run.
- **Design tokens**: named, shared design values (colours, sizes) that all styles use.
- **EJS**: the HTML template system the panel uses.
- **`@fontsource`**: packages that let fonts be self-hosted instead of loaded from outside.
- **HUD**: the in-game heads-up display.
- **Monospace / tabular digits**: text where every character or digit has the same width, so
  numbers line up in columns.
- **Observed**: reported by the server, with a time.
- **Playwright**: the tool that runs the automated browser tests.
- **Radio row**: a table row you select like a radio button, one at a time.
- **RCON**: the password-protected remote-console protocol for game servers.
- **Reduced motion**: an operating-system setting that asks apps to minimise animation.
- **Requested**: sent by the operator, but not confirmed by the server.
- **Type scale**: a fixed set of font sizes.
- **VGUI**: the interface toolkit of the classic Half-Life/CS 1.6 and Steam clients.
- **WCAG AA**: a widely used accessibility standard; for normal text it requires a contrast of
  at least 4.5:1.
