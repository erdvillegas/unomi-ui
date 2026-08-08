# Test plan — 90% coverage (OpenUI5 standard)

Goal: automated tests reaching **90% line coverage**, using the standard OpenUI5
toolchain (QUnit for unit, OPA5 for integration), run headless via `karma-ui5`.
Starting point: **zero tests, no infra**.

## 1. Toolchain

Dev dependencies (all within the official UI5 ecosystem):

```
karma  karma-ui5  karma-chrome-launcher  karma-coverage  @types/qunit
```

- **QUnit 2** — unit tests (provided at runtime by the UI5 Test Starter).
- **OPA5** (`sap.ui.test`, ships with OpenUI5) — integration/journey tests over
  views + routing.
- **karma-ui5** — boots the real app through the `ui5-tooling-transpile`
  middleware, so `.ts` is transpiled exactly as in `ui5 serve`.
- **Coverage** — instrument at the transpile step (`babel-plugin-istanbul`) and
  report with `karma-coverage`; gate with `check: { global: { lines: 90 } }` so
  the run fails below target.
- `fetch` / `localStorage` are stubbed by swapping the global in
  `beforeEach`/`afterEach` — no extra mocking dependency.

Scripts: `test` = `karma start --single-run`, `test:watch` = `karma start`.

## 2. Folder layout (standard UI5 Test Starter)

```
webapp/test/
  testsuite.qunit.html / .ts        entry discovered by karma-ui5
  unit/unitTests.qunit.ts           aggregates every *.qunit unit module
  unit/service/UnomiClient.qunit.ts
  unit/service/Settings.qunit.ts
  unit/model/forms.qunit.ts
  unit/control/sourceBuilder.qunit.ts
  unit/control/brm/conditionEditor.qunit.ts
  integration/opaTests.qunit.ts     journeys
  integration/pages/*.ts            Page Objects (one per view)
  integration/*Journey.ts
```

## 3. What gets tested, and how

The risky logic is **pure** — most coverage comes cheaply from QUnit; OPA5 is
reserved for wiring/routing.

| Layer | Files | Technique | ~Weight |
|-------|-------|-----------|---------|
| Pure logic | `sourceBuilder` (`buildSource`/`parseSource` round-trip), `conditionEditor` (`summarize`, `readGroup`, `setGroupMode`, `rowType`, `valueSlot`, `clearValues`, `friendly`, `category`, `isMulti`/`noValue`) | QUnit, no DOM, case tables | ~35% |
| Services | `UnomiClient` (query→`PartialList`, Basic header, error handling, baseUrl), `Settings` (defaults, load/save, `applyTheme`/`applyLanguage`) | QUnit + global stubs (`fetch`, `Theming`, `Localization`, `localStorage`) | ~15% |
| Model | `forms.ts` field mappers | QUnit | ~5% |
| Control builders | `builders` panels, `exportPropsBuilder`, `sourceBuilder()`, `FormEngine`, render fns of `conditionEditor` | QUnit: instantiate → assert on returned control tree → invoke the `attachChange` handlers to cover closures | ~25% |
| Controllers + routing + views | `App` (nav gating logged-out, logout), `Login`, `Home`, `Settings`, `Info`, `ProfileList/Detail`, `EventList/Detail`, `ConfigIO`, `ItemDetail`, `DefinitionCatalog`, `MetadataList` | OPA5 journeys with `UnomiClient` stubbed (fixtures) | ~15% |
| Excluded from denominator | `model/types.ts` (interfaces only → 0 runtime lines), `webapp/test/**` | coverage `exclude` | — |

## 4. Phases (each leaves the suite green; one commit per phase)

1. **Infra** ✅ — karma config, Test Starter, `npm test` running with a sanity test.
2. **Services + pure logic** ✅ (`UnomiClient`, `Settings`, `sourceBuilder`, `forms`).
3. **conditionEditor** ✅ — pure fns + a render pass that fires every control's handler
   via `findAggregatedObjects` (covers rows, membership/scoring, generic params, groups,
   advanced-wrap). Took the file from 51% → **92.7%** lines.
4. **Remaining control builders** ✅ (`FormEngine`, `exportPropsBuilder`, `builders`).
5. **OPA5 journey** ✅ — one logged-out boot/auth-gating journey.
6. **Gate enabled** ✅ — `check: { global: { lines: 90 } }` in `karma.conf.js`.
   Coverage instrumented via `ui5-tooling-transpile` `coverage` option
   (`babel-plugin-istanbul`) and bridged with `karma-ui5/helper.configureIframeCoverage`.

### Result (as built)

| Scope | Lines |
|---|---|
| **Global (loaded files)** | **91.7%** ✅ |
| Logic (`service` + `model` + `control`) | 93.7% |
| `service/UnomiClient` | 100% · `service/Catalog` 91.7% · `service/Settings` 100% |
| `control/conditionEditor` | 92.7% · `builders` 98.2% · `FormEngine`/`refSelect`/`refMap`/`forms` 100% |
| `sourceBuilder` | 83.2% (the remaining tail) |

78 tests, `npm test` green with the gate on. Instrumentation runs only via the transpile
*middleware* (dev/karma) — the production BUILD uses the transpile *task* (no coverage),
so `dist/` ships clean. `coverage/` is git-ignored. Only **lines** is gated (the plan's
target); branches (77%) / functions (82%) are reported, not enforced.

## 5. Mocking strategy (one shared approach)

- `UnomiClient`: swap `window.fetch` with a stub returning JSON fixtures
  (`/cluster`, `/profiles/properties`, `/segments`, search `PartialList`). Shared
  `fixtures.ts`.
- `localStorage` / `Theming` / `Localization`: stub and restore in `afterEach`.
- i18n in OPA: load the real bundle, assert by key (not translated text) so tests
  survive language changes.

## 6. Honest note on 90%

60–70% comes cheaply from QUnit over pure functions. The expensive tail is the
`attachChange`/`attachSelectionChange` closures inside the `conditionEditor`
builders (the six value-slots, each `renderParam`/`valueField` branch): covering
them means instantiating the control and invoking the handler with a simulated
event — tedious but mechanical. If the cost stops being worth it, the lever is to
exclude the pure-render UI files from the denominator and require 90% only over
`service/`, `model/`, and `control/` logic — covering the real risk without
writing an OPA journey per pixel.
