# Design proposal: Night Desk Instrument

Status: adopted into production panel UI (Night Desk default; modular CSS + manage partials).  
Audience: self-hosted CS2 operators, match/scrim admins, account admins.  
Primary surface: authenticated operate panel (product register).

## Scene

22:40 mid-scrim. Laptop under cool room light, second monitor with a game client.
The operator needs to answer four questions without hunting:

1. Which server am I on?
2. Is RCON observed, unknown, or disconnected?
3. What did I last request versus what has been observed?
4. What is the next safe action?

This is a **match-control desk**, not a consumer dashboard and not a game client.

## Audience fit

| Audience              | Design consequence                                                           |
| --------------------- | ---------------------------------------------------------------------------- |
| Server operator       | Dense fleet table; address + state first; no vanity metrics                  |
| Match/scrim admin     | Sticky identity + truth rail; setup/observe/control as equal workbench zones |
| Account admin         | Standard forms and tables; consequence-first destructive copy                |
| Occasional maintainer | Explicit recovery language; unknown never equals offline                     |

## Direction name

**Night Desk Instrument**

Cold graphite equipment housing. Teal for _verified observation_ (aligned with “signal acquired”).
Indigo for _operator intent_ (primary actions). Coral for _irreversible_. Amber for _unresolved_.
No neon HUD, no glassmorphism stack, no cream SaaS canvas, no decorative telemetry.

## Why not the current light desk alone

The current daylight system (cold white + ultramarine + Syne) is already disciplined.
This proposal explores a **night-primary instrument theme** for long evening sessions
while keeping the same information contracts:

- requested ≠ observed
- unknown is a first-class state
- target before controls
- mono only for addresses, commands, timestamps, counts

## Color strategy (restrained product)

OKLCH-first tokens; hex approximates for mockup:

| Role           | Token             | Approx    | Use                        |
| -------------- | ----------------- | --------- | -------------------------- |
| Canvas         | `--canvas`        | `#0c1016` | App background             |
| Shell          | `--shell`         | `#121820` | Nav, truth rail housing    |
| Surface        | `--surface`       | `#171e28` | Panels / modules           |
| Surface raised | `--surface-2`     | `#1d2632` | Nested fields, table head  |
| Line           | `--line`          | `#2a3544` | Hairline rules             |
| Ink            | `--ink`           | `#e8edf4` | Primary text               |
| Muted          | `--muted`         | `#8b97a8` | Secondary labels           |
| Action         | `--action`        | `#5b7cfa` | Primary buttons, selection |
| Action soft    | `--action-soft`   | `#1a2440` | Selected chip fill         |
| Observed       | `--observed`      | `#3dba8c` | Connected / verified       |
| Observed soft  | `--observed-soft` | `#122820` | Status chip                |
| Danger         | `--danger`        | `#e05a52` | Destructive                |
| Warn           | `--warn`          | `#d4a017` | Unknown / partial          |
| Focus          | `--focus`         | `#8eb0ff` | Focus ring                 |

Seed influence: observed teal sits near moss/signal green (hue ~150–160).
Action stays on a cool indigo axis so “I commanded” and “I observed” never share a color.

## Typography

| Role       | Face                | Notes                                   |
| ---------- | ------------------- | --------------------------------------- |
| Brand only | Syne                | “3RR” lockup and page titles only       |
| UI / body  | Inter / system sans | Labels, buttons, body, tables           |
| Data       | JetBrains Mono      | Endpoints, RCON, timestamps, player IDs |

Scale: tight product ratio (~1.15). No fluid hero type. Mono never for prose labels.

## Layout concept

```text
┌─ shell nav: 3RR Operate · Fleet · Add · Settings · [operator] ─┐
├─ truth rail (manage only): identity · endpoint · rcon · map · n ─┤
│                                                                   │
│  workbench                                                        │
│  ┌ requested setup ┐  ┌ observed status ┐  ┌ guarded controls ┐  │
│  │ type / mode / map│  │ players / age   │  │ match · practice │  │
│  │ apply / restart  │  │ refresh         │  │ rcon transcript  │  │
│  └──────────────────┘  └─────────────────┘  └──────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

Fleet inventory stays an **open table**, not a card grid.
Login is a **credential gate**, not a marketing hero.

## Signature element

**Truth rail** — a continuous instrument strip under the shell that binds:

`server identity · host:port · rcon state · last observed map · players · observation age`

Everything below the rail is work. The rail is orientation. It never animates for decoration.

## Component principles

1. **State chips always include text** (Connected / Unknown / Disconnected).
2. **Selection chips** use indigo fill only after an explicit operator choice.
3. **Unknown controls stay neutral** until a value is observed or confirmed.
4. **Destructive actions** use coral outline or solid only for confirmed danger.
5. **Modules** are ruled surfaces with 1px hairlines — not floating soft cards.
6. **Motion** is 150–200 ms state feedback only; `prefers-reduced-motion` respected.
7. **Density** favors laptop operators; 44px targets at narrow breakpoints.

## Anti-references

- Steam / Faceit / esports landing pages (neon, hero metrics, game art)
- Generic dark admin (purple gradients, glass cards, chart wallpaper)
- Soft cream productivity dashboards
- Ornamental numbered eyebrows, gradient text, side-stripe callouts

## Information architecture (unchanged)

`/` → `/servers` → `/manage/:id`  
Peers: `/add-server`, `/settings`, admin `/admin/users`  
Public: login + health only.

## Mockup deliverable

Interactive static file:

`apps/operate/panel/docs/mockups/night-desk-instrument.html`

Screens: Login · Fleet · Manage (workbench with truth rail).  
No backend. Fixture copy only. Existing EJS contracts are not changed by this file.

## Implementation notes (if later adopted)

- Keep behavioral IDs / `data-*` contracts and E2E selectors.
- Prefer retokenizing `panel.css` + partial class renames over a framework rewrite.
- Offer optional light theme later via `color-scheme` tokens; night desk is the proposed default for evening ops density.
- Do not add icon libraries, chart widgets, or entrance choreography.
