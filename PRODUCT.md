# Product principles

## Who it is for

3RR is for people who run Counter-Strike 2 community servers: technical
operators, scrim organizers, and server administrators. It is designed for
regular use from a desktop browser. Operators need to move quickly while staying certain about
which server they selected and whether the screen shows a requested or observed
state.

## Purpose

3RR provides authenticated tools for operating self-hosted CS2 servers. The
control plane shows fleet health, separates requested settings from observed
server state, runs match and player controls, sends RCON commands within its
safety policy, and configures maps or Workshop content.

An operator should always be able to see which server is active, understand
what an action will do, and check the result without mistaking a submitted
request for a live observation.

## Character

The interface is precise, technical, and calm. It should feel like a dependable
operations desk: compact enough for experienced users, clear under pressure,
and visually restrained so status information stands out.

## Interface guidance

Use a compact workspace rather than a grid of oversized tiles, decorative
terminal effects, or layers of cards and accordions. Use status colors only for
status, keep connection information in one predictable place, and avoid large
type or unusual interactions that slow down routine work.

## Design principles

- Clearly separate what the operator requested from what the server reported.
- Keep the active server and current context visible and unmistakable.
- Put frequent actions within easy reach and reveal advanced or destructive
  controls only when needed.
- Make repeated workflows efficient from the keyboard while keeping pointer
  interactions straightforward.
- Use the same controls and language across the fleet and server views.

## Accessibility and inclusion

Preserve semantic landmarks, skip links, keyboard navigation, visible focus,
screen-reader labels, status cues that do not depend on color, and the dark
and light themes. Respect reduced-motion preferences, keep touch targets usable
on narrow screens, and maintain WCAG AA contrast for body, placeholder, and
status text.

These principles apply to the control-plane frontend and the static
`design-preview` demo. For implementation details, see the [frontend
guide](control-plane/docs/FRONTEND.md). The [API reference](control-plane/docs/API.md)
defines HTTP behavior and operational state.
