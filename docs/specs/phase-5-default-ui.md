# Spec: Phase 5 — Default UI (`<ServerStatus>`)

**Status:** implemented
**Phase:** 5 — Default UI (docs/ROADMAP.md)
**Date:** 2026-08-26

## Goal

Replace the `<ServerStatus>` stub with the polished default presentation of the
monitor: a full-width `banner` and a compact `pill` variant; self-contained,
themeable, `sai-`-prefixed styling; the elapsed-time counter; an offline retry
button; `role="status"` + `aria-live="polite"` announcements; internationalizable
copy; `prefers-reduced-motion` support — all while keeping the product's core
behavior: **silence on success** and the headless render-prop escape hatch.

## Non-goals

- No `position` prop (it isn't in the roadmap Phase 5 task list) — the banner is
  in-flow where rendered and the pill is placed by the consumer. No floating/fixed
  positioning, no portals.
- No separate default copy per variant — one canonical English default set; both
  variants share `messages` overrides.
- No `onStatusChange`-style callbacks (deferred, research §8).
- No `storageKey` / sessionStorage memory (v1.x, research §8).
- No public stylesheet export — the `<style>` tag is an implementation detail of
  the default UI; render-prop consumers own their styling.
- No confirmation banner after a _fast_ manual retry: `refresh()` resets `wasCold`,
  and the confirmation is driven solely by `wasCold` (the documented contract on
  `MonitorSnapshot.wasCold`). A retry that re-passes through `waking` does re-arm
  the confirmation. A fast retry's success shows as the offline banner disappearing
  (silence on success).
- No live visual 320px render check: jsdom has no layout engine, so the viewport
  guarantee is enforced by asserting responsive properties in the stylesheet
  (`flex-wrap`, `max-width: 100%`, no fixed widths); true visual verification lands
  with the Phase 8 demo app.

## Background

- Research §4 state→UI table (locked): `unknown`/`checking` → render nothing;
  `waking` → amber "starting up… (12s)"; `active` → green confirmation for
  `successDisplayMs` (2.5s) then auto-hide; `offline` → red "appears to be
  unavailable" + retry button.
- Research §5 (technical honesty, locked decision 2): default copy is "The server
  is starting up — this can take up to a minute on first visit." Never "asleep".
- Research §9: `navigator.onLine === false` → `offline` with a **distinct** "you
  appear to be offline" message → `snapshot.offlineKind`.
- Feature dossier §6.3/§11 (original battle-tested UI): live-region strip with
  icon + message + elapsed counter; `role="status"` + `aria-live="polite"`; elapsed
  format `Ns` under 60s, `Mm Ss` at/above; timed 2.5s dismissal; tabular-num
  counter; color transition between states. All re-implemented dependency-free
  (AGENTS.md locked decision 7: prefixed CSS + custom properties, inline SVG icons,
  no Tailwind / CSS-in-JS runtime / icon library).
- Phase 2 spec: the engine stays truthful — `successDisplayMs` is a **UI
  presentation policy**, and `wasCold` is the sanctioned signal for "recovery
  confirmation only after a cold start, silence on warm start" (see
  `MonitorSnapshot.wasCold` doc).
- Phase 4 spec: `<ServerStatus>` props extend `MonitorConfig`; options captured on
  mount; SSR-safe `unknown` first snapshot.
- Engine facts (Phase 3): `elapsedSeconds` ticks 1s only while `waking`;
  `refresh()` resets `wasCold`/`elapsedSeconds` and enters `checking`;
  `offlineAfter` bounds a waking episode.

## Approach

### Alternatives considered — where does the 2.5s success dismissal live?

| Option                                     | Pros                                                                                   | Cons                                                                                                                                         | Verdict    |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A. Engine adds a "hidden" state/flag       | UI stays a pure function of the snapshot                                               | violates the locked 5-state machine; presentation policy leaks into the truthful core                                                        | rejected   |
| B. Dismissal shared via provider/context   | one timer per app                                                                      | phase 4's API is config-sharing only; couples presentation to sharing; config-less `<ServerStatus healthUrl>` would need its own copy anyway | rejected   |
| C. Local state + timer in `<ServerStatus>` | presentation policy lives in the presentation layer (Phase 2 intent); engine untouched | each instance carries its own (tiny) timer, active only while a confirmation shows                                                           | **chosen** |

### Alternatives considered — stylesheet delivery

| Option                                                                               | Pros                                                                    | Cons                                                                                                                                           | Verdict    |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A. Inject at module import time                                                      | ready before first paint                                                | side effect under `sideEffects: false` (false packaging claim); needs `typeof document` guards in the import path                              | rejected   |
| B. Ship `styles.css` for consumers to import                                         | zero per-instance JS                                                    | breaks the "install → `<ServerStatus healthUrl>` in under 3 minutes" DX (research §8); requires consumer build config                          | rejected   |
| C. Inject once in `useEffect` on first default-UI render, idempotent by element `id` | SSR-safe, tree-shake-safe, one tag across instances/remounts/StrictMode | theoretically one unstyled frame — unreachable: the default UI is never visible until ≥ `revealDelay` after mount (mount frames render `null`) | **chosen** |

### Alternatives considered — messages API shape

| Option                          | Pros                                                                                                     | Cons                                                                                    | Verdict    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| Strings only                    | matches the exported stub interface (`ServerStatusMessages`, already public API); trivially translatable | no inline interpolation                                                                 | **chosen** |
| `string \| (data) => ReactNode` | interpolation power                                                                                      | larger API surface before any demand; the render prop already covers full customization | rejected   |

The elapsed counter is language-neutral (`12s`, `1m 5s`) and renders as its own
`sai-elapsed` span, so `waking` stays a plain string.

## Design

### 1. Data source — Phase 4's `useServerStatus`

```tsx
<ServerStatus healthUrl={…} />                 // own monitor (check source on props)
<ServerStatus variant="pill" />                // nearest <ServerStatusProvider>'s monitor
<ServerStatus>{(snapshot) => …}</ServerStatus> // same rules; children fully delegates
```

Rule: `hasCheckSource = healthUrl !== undefined || check !== undefined` →
`useServerStatus(config)`; otherwise `useServerStatus()` (the hook throws its usage
error when no provider exists — same contract as calling the hook directly).
Presentation props (`variant`, `messages`, `className`, `successDisplayMs`) stay
reactive; the monitor config is captured on mount (phase 4 spec §3).

### 2. State → UI mapping

| Snapshot state                      | Rendered                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `unknown`, `checking`               | `null` (silence; also covers the `checking` gap during retry/re-check)                                  |
| `waking`                            | amber: locked waking copy + live `s`/`Mm Ss` counter (counter `aria-hidden`) + spinner icon             |
| `active`                            | green `active` copy + check icon _only if_ `wasCold && !dismissed`; auto-hides after `successDisplayMs` |
| `offline`, `offlineKind: "server"`  | red `offline` copy + x-circle icon + Retry button (`refresh()`)                                         |
| `offline`, `offlineKind: "browser"` | red `browserOffline` copy + wifi-off icon + Retry button                                                |

Dismissal policy (all component-local):

- `useState(true)` always-dismissed initializer + `hasSeenWakeOrOfflineRef` guard — a consumer that
  mounts after the wake already resolved starts dismissed (no stale confirmation;
  silence-on-success holds even for late mounters like navigated-to pages). The ref
  flips to `true` on first witnessed `waking`/`offline`, re-arming the confirmation.
- Entering `waking`/`offline` → `hasSeenWakeOrOfflineRef.current = true; setDismissed(false)` — re-arms the confirmation for the next
  recovery (including opt-in `activeCheckInterval` re-sleep detection).
- While `active && wasCold && !dismissed && hasSeenWakeOrOfflineRef.current` → `setTimeout(setDismissed(true),
successDisplayMs)`, cleaned up on any change / unmount.
- Warm `active` (`wasCold=false`: fast first ping, fast manual retry, fast periodic
  re-check) → always `null`. Late-mounters that never saw a wake stay dismissed via the ref guard.

### 3. Styling — `src/react/styles.ts`

- `<style id="server-active-indicator-styles">` injected once per document, guarded
  by `document.getElementById` (idempotent across instances/remounts/StrictMode) and
  `typeof document === "undefined"` (SSR no-op). Injection lives in a `useEffect`
  and is skipped for render-prop usage (no default UI → no stylesheet).
- Class names, all `sai-` prefixed: roots `.sai-banner` / `.sai-pill`; descendants
  `.sai-message`, `.sai-elapsed`, `.sai-retry`, `.sai-icon`, `.sai-spinner`.
- State is carried by `data-state="waking|active|offline"` (+ `data-offline-kind`)
  attributes instead of state-specific classes: the root element survives
  transitions, so the live region persists across announcements and color
  transitions animate.
- Theme tokens (all overridable): `--sai-font-size`; per state
  `--sai-{waking,active,offline}-{bg,border,text,accent}`; plus `--sai-icon-color`
  set by each state rule and consumed by the icons.
- Defaults: light palette on `:where(:root)` (zero specificity — any user rule at
  `:root`, on an ancestor, or on the element wins) with a `prefers-color-scheme:
dark` flip (dark palette mirrors the original banner's amber/green/red hues).
- Layout: `flex` + `flex-wrap: wrap` + `max-width: 100%` + `box-sizing: border-box`
  (320px-safe — long messages wrap instead of overflowing); banner = full-width
  strip with tinted background + bottom border (the original's shape); pill =
  compact bordered pill with `border-radius: 9999px`.
- Type: `font-family: inherit` (host typeface), `font-size: var(--sai-font-size)`
  (13px default), weight 500, `line-height: 1.45`.
- Motion: `.sai-spinner` rotates via `@keyframes sai-spin`; 300ms color/background
  transitions; `@media (prefers-reduced-motion: reduce)` disables both.

### 4. Inline SVG icons — `src/react/icons.tsx`

Four decorative icons, all `aria-hidden="true"`, `focusable="false"`, sized `1em`,
stroked with `currentColor`: `SpinnerIcon` (¾ arc, spins), `CheckIcon` (check in a
circle), `OfflineIcon` (x-circle), `WifiOffIcon` (arcs + dot + slash). No icon
library (locked decision 7).

### 5. Accessibility

- Root: `role="status"` + explicit `aria-live="polite"` (dossier-proven pattern;
  roadmap-mandated even though `status` implies polite).
- The elapsed counter is `aria-hidden="true"`: its text mutates every second inside
  a live region — announced per tick it would spam screen readers. The message
  carries the semantic announcement; the counter is visual urgency.
- State announcements ride on the persistent live region (content change); a newly
  appearing banner announces on insertion.
- Verification: axe-core over jsdom (RTL `container`) — zero violations for waking,
  active-confirm, offline (server + browser), and pill renders.

### 6. i18n — `messages` prop

`ServerStatusMessages` (exported, untouched public API): `waking | active | offline
| browserOffline | retry`, all optional strings, shallow-merged over the locked
English defaults (`DEFAULT_MESSAGES`):

| key              | default                                                                    | source                                       |
| ---------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| `waking`         | "The server is starting up — this can take up to a minute on first visit." | research §5 (locked copy)                    |
| `active`         | "The server is ready."                                                     | dossier parity, sentence style               |
| `offline`        | "The server appears to be unavailable."                                    | research §4/§9 ("appears to be unavailable") |
| `browserOffline` | "You appear to be offline — check your connection."                        | research §9 distinct message                 |
| `retry`          | "Retry"                                                                    | —                                            |

### Files

```
src/react/styles.ts              → NEW: stylesheet string + idempotent injector
src/react/icons.tsx              → NEW: 4 inline SVG icons (all aria-hidden)
src/react/server-status.tsx      → REWRITE: default UI (state mapping, dismissal, a11y,
                                     render-prop delegation)
tests/server-status.test.tsx     → NEW: RTL + axe-core suites
tests/smoke.test.ts              → UPDATE: ServerStatus no longer a stub
package.json                     → + axe-core devDep (locked test stack, AGENTS.md)
docs/specs/phase-5-default-ui.md → NEW: this spec
docs/ROADMAP.md                  → Phase 5 ✅ + validation notes
```

No changes: `src/react/index.ts` (already exports everything), core engine,
tsup / vitest / eslint configs.

## Edge cases & failure modes

| Case                                                        | Behavior                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| No check-source props and no provider                       | hook usage error surfaces through `ServerStatus` render                                 |
| Presentation-only props (`variant="pill"`) under a provider | uses provider's monitor; variant/messages reactive                                      |
| Check source + provider ancestor                            | own monitor (hook semantics — no merge)                                                 |
| Warm first ping                                             | nothing renders at all (silence on success)                                             |
| Late mount into an already-`active` monitor                 | dismissed initializer → renders nothing                                                 |
| Fast manual retry success                                   | offline banner disappears; no confirmation (documented non-goal)                        |
| Retry that hangs                                            | red banner clears during `checking`; amber returns at `revealDelay` (research §4 table) |
| Re-sleep (`activeCheckInterval`)                            | `waking` re-shows the banner and re-arms the confirmation on recovery                   |
| Elapsed ≥ 60s                                               | `1m 5s` format (dossier parity)                                                         |
| StrictMode double mount                                     | still one stylesheet tag; dismissal timers cleanly torn down                            |
| SSR                                                         | first snapshot `unknown` → `null`; injector `typeof document`-guarded, effect-only      |
| Render-prop children                                        | fully delegated (raw snapshot incl. `unknown`); no stylesheet injection                 |
| Unmount mid-`waking`/`offline`                              | handle destroyed; engine torn down at zero refs                                         |
| className collision                                         | merged after variant class: `"sai-banner user-class"`                                   |
| Two instances, one config                                   | one shared engine (registry), two independent dismiss states                            |

## Acceptance criteria

- [x] Warm backend: `<ServerStatus>` renders nothing through `checking → active`
- [x] Cold start: banner with locked waking copy, `role="status"`,
      `aria-live="polite"`, `data-state="waking"`, spinner icon, live `aria-hidden`
      counter ticking (`0s → 1s → …`, `1m 5s` formatting beyond 60s)
- [x] Recovery after waking: `active` copy renders, auto-hides after
      `successDisplayMs` (prop-overridable); warm `active` never renders
- [x] A second instance mounting into an already-active monitor renders nothing
- [x] Offline: copy + Retry button; click triggers a fresh attempt;
      `offlineKind="browser"` renders `browserOffline` + `data-offline-kind="browser"`
- [x] Pill variant: same content under `sai-pill`; `className` merged onto root
- [x] i18n: each of the five messages individually overridable
- [x] Render prop: children replaces the UI (no `sai-` markup) and no stylesheet is
      injected by that render
- [x] Stylesheet: exactly one `<style id="server-active-indicator-styles">` across
      instances/remounts; contains `sai-` rules, `flex-wrap` + `max-width: 100%`
      (320px), `prefers-reduced-motion` block, light/dark token sets
- [x] axe: zero violations for waking / active / offline / browser-offline / pill
- [x] Registry hygiene: own-config mount → exactly one engine; unmount → zero;
      provider sharing → one engine
- [x] `pnpm verify` green (format → lint → typecheck → test:coverage → build → size → lint:pkg)

## Validation gate

The suites in `tests/server-status.test.tsx` (RTL fake-timer + real-timer/axe
groups) and the updated smoke test pass; `pnpm verify` green end-to-end;
`dist/react/index.js` measured at 6.04 KB gzip (delta over Phase 4: 2.39 KB
gzip — the 2 KB layer _delta_ budget slips by ~0.4 KB primarily because the
injected stylesheet carries 3 named color tokens × light/dark × 3 states
plus motion/transition rules; the absolute core stays under 3 KB gzip);
roadmap Phase 5 marked done; then Phase 6 (testing hardening).
