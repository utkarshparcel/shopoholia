# WORN — Design System

Premium **editorial e-commerce**: light, warm-paper base, gold accent. Brand identity carried
from the product spec — DM Serif Display headlines, DM Sans body, DM Mono micro-labels — with
component patterns drawn from premium commerce surfaces (Net-a-Porter, SSENSE, Aritzia, Everlane),
adapted to WORN's coin economy and cinematic reveal.

## Files
- **`tokens.css`** — canonical design tokens (color, type, spacing, radius, elevation, motion).
  Single source of truth.
- **`index.html`** — living style guide: foundations + core component kit. Open in a browser.

## Tokens → app
`tokens.css` variable names are the contract. In the Expo app, mirror them 1:1 in a `theme.ts`
so design and code never drift. **Change a value here first**, then propagate.

## Core kit (v0.1)
Section header · Buttons · Chips & tags · Form controls · Listing card · Coin wallet ·
Order tracker · Reveal deck · Paywall sheet · Bottom nav.

## Pushing to claude.ai/design
DesignSync requires an interactive claude.ai login (`/login`) — the current API-token session
(`CLAUDE_CODE_OAUTH_TOKEN`) can't be granted design scopes. Once logged in, this guide is split
into per-component preview files (each carrying a `<!-- @dsCard group="…" -->` marker) and pushed
to a new "WORN" design-system project.
