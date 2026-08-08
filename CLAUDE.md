# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A frontend UI client for the **Apache Unomi** REST API (a customer data platform / CDP),
built with **OpenUI5 + TypeScript** (`ui5-tooling`). The API contract lives at
`docs/openapi.json` (OpenAPI 3.0.1, 121 endpoints, 73 schemas). The implementation plan
and its decisions are in `docs/plan.md` — read it before building; it defines scope,
phases, and the deliberate simplifications.

As of this writing the repo contains only these docs; the UI5 app is not scaffolded yet.

## The API it talks to

- Base URL: `http://localhost:8181/cxs` (Apache Unomi default).
- Auth: **HTTP Basic** (`karaf`/`karaf` by default). The OpenAPI spec declares no
  `securitySchemes` — do not trust it for auth; Basic is what Unomi actually uses.
- Not OData, not REST-by-resource. Most reads are `POST .../search` or `.../query` with a
  `Query`/`Condition` object in the body, returning a `PartialList*` envelope
  (`{ list, totalSize, offset, pageSize }`). Pagination is server-side — never load full
  result sets client-side.
- Segments, Rules, and Scoring are defined by trees of typed `Condition` objects whose
  shapes come from `GET /definitions/conditions`. This is the hard part of the domain.
- **The OpenAPI spec is not ground truth.** Runtime `Condition` JSON uses `type`, not the
  spec's `conditionTypeId` — sending the latter is a 500. Verify request shapes against the
  live container before trusting a schema field.

## Architecture (target)

- **JSONModel + a single `service/UnomiClient.ts`**, not `ODataModel`. The client owns
  baseURL, Basic Auth header, error handling, and the `POST query → PartialList` pattern.
  Everything that talks to `/cxs` goes through it.
- One XML view + controller per screen; `manifest.json` holds routing, models, and the
  dev proxy datasource.
- Condition editing starts as **raw JSON in a CodeEditor**, not a visual tree builder
  (see plan, phase 3). Marked with a `ponytail:` comment where it lives.

## Design / style (SAP Horizon)

Align UI to the **SAP Horizon** design system (the current Fiori generation).
`sap.com/design-system` 403s bots and the Fiori guideline pages redirect there, so
follow these codified conventions instead of re-fetching:

- **Theme**: `sap_horizon` (set in `index.html` bootstrap). It brings the **72** font
  and Horizon icons automatically — use stock controls so they inherit; don't hardcode
  fonts/colors. Prefer semantic controls/props (`type="Emphasized"`, `ObjectStatus`
  states) over inline styling.
- **Content density**: `Component.getContentDensityClass()` returns `sapUiSizeCompact`
  on desktop / `sapUiSizeCozy` on touch, applied to the root view in `App.onInit`. New
  screens inherit it — don't override per-view.
- **Shell**: `sap.tnt.ToolPage` with `ToolHeader` (hamburger + centered title) and
  `SideNavigation`; side nav is collapsed when logged out (gated on
  `UnomiClient.isAuthenticated()`), expanded once authenticated.
- **Home / landing**: Launchpad look — neutral page background + white `GenericTile`s
  (icon + header + subheader) in a wrapping `FlexBox`, **not** colored
  `BlockLayoutCell`s (that's the older Belize demo style). Tiles carry their target
  route in custom data `app:nav` and navigate via a single `onNav` handler.
- **Spacing**: use UI5 margin/padding classes (`sapUiSmallMargin`, `sapUiTinyMargin…`),
  never pixel styles.
- **BRM editor**: the visual condition/action editor (`control/brm/conditionEditor.ts`)
  is the standard for every typed `Condition` tree (segments, rules, scoring elements,
  goals, campaigns); the raw JSON tree is only the per-node "advanced" fallback.

## CORS

The UI dev server and Unomi run on different ports, so the browser blocks direct calls.
Dev uses `ui5-middleware-simpleproxy` to proxy `/cxs`; prod needs a reverse proxy. Nothing
runs against a live Unomi without this.

## Commands

- `npm start` — dev server (`ui5 serve`) on :8080 with TS transpile + `/cxs` proxy.
  Pass `--port N` if 8080 is taken.
- `npm run build` — production bundle to `dist/`.
- `npm run typecheck` — `tsc --noEmit` (UI5 module paths mapped in tsconfig `paths`).

TypeScript is transpiled on the fly by `ui5-tooling-transpile-middleware` (dev) and the
matching build task — no separate compile step to serve. The `@namespace` JSDoc on each
class drives the `sap.ui.define` wrapper generation, so keep it accurate.

Verified in phase 0: proxy forwards `/cxs/*` to Unomi at :8181 (simpleproxy strips the
mountPath, so `baseUri` in `ui5.yaml` includes `/cxs`). `GET /cxs/test/ping` returns
`pong` (200) with `karaf:karaf`, 401 without — this is the login flow's health check.
