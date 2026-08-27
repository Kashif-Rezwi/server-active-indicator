# Research Report — server-active-indicator

Distilled findings and decisions from the pre-implementation research phase (Phase 0).
Full companion document: `Server-Active-Indicator-Feature-Dossier.md` (analysis of the
original "Server Wakeup" implementation in `Kashif-Rezwi/code-review-agent`).

Labels: **[verified]** = official documentation / registry data (checked 2026-08-26) ·
**[analysis]** = technical reasoning · **[decision]** = locked for this project.

---

## 1. Problem definition

Sleeping backends create a specific UX failure: the frontend is a static asset on a CDN
and always loads fast; the backend may be spun down; in-page API calls to a sleeping
backend simply hang with no platform-provided feedback. Unlike a browser navigation —
where Render shows its own loading page **[verified]** — an XHR/fetch from an
already-loaded SPA gets nothing. The app looks broken.

This is a **frontend UX problem built on an API health-check mechanism** — not a
server-monitoring problem. Monitoring (restarts, uptime probes, alerting) is already
solved by platforms and third-party tools. The unsolved layer is communicating system
state to the user inside the app.

## 2. Platform behavior (verified from official docs, 2026-08-26)

| Platform                                                  | Sleeps?                                                                              | Idle trigger                           | Wake behavior                                                                                                                                                     | Indicator useful?               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Render** (Free web services)                            | ✅ after **15 min** without inbound traffic                                          | inbound HTTP/WebSocket only            | next inbound request spins it up; takes **~1 minute**; Render shows a loading page to navigating browsers only; `/robots.txt` answered by platform without waking | **Primary target**              |
| **Railway** ("Serverless", opt-in, formerly App Sleeping) | ✅ after **10 min** with no **outbound** packets (incl. DB pools, telemetry)         | first inbound request wakes it         | "cold boot time"; **first request may return 502 Bad Gateway**                                                                                                    | Yes — must tolerate 502-on-wake |
| **Fly.io**                                                | ✅ `auto_stop_machines` + `min_machines_running = 0` is the `fly launch` **default** | Fly Proxy stops/suspends idle machines | Fly Proxy autostarts on incoming requests; `suspend` resumes faster than `stop`                                                                                   | Yes                             |
| **Koyeb**                                                 | ✅ Scale-to-Zero feature (free instance: 512MB / 0.1 vCPU)                           | no incoming traffic                    | microVM cold start on traffic                                                                                                                                     | Yes                             |
| **Vercel / Netlify**                                      | serverless function cold starts (Lambda-style)                                       | per-function idle                      | typically sub-second to low-seconds                                                                                                                               | Marginal                        |
| **Cloudflare Workers**                                    | V8 isolates, ~100× faster startup than containers                                    | —                                      | negligible cold start                                                                                                                                             | No                              |

Platform features usable by this package **[verified]**:

- **Render health-check path** (`healthCheckPath` in `render.yaml`): HTTP GET, 2xx/3xx =
  healthy, 5s probe timeout. The same `/health` endpoint the indicator pings can be
  registered there (zero-downtime deploys + auto-restart for free).
- **Inbound traffic is the wake signal** on Render, Railway, Fly, and Koyeb — the
  indicator's ping is not passive monitoring, it _is_ the wake-up call.
- Render's own uptime best-practices doc recommends external probes and client-side
  retry logic — this package formalizes exactly that.

## 3. Lessons from the existing implementation

Source: feature dossier (analysis of `code-review-agent` "Server Wakeup").

**Transfers well:** silently check first and only show UI when the check is slow (the
key design decision); hook → context → UI layering; `role="status"` + `aria-live`;
elapsed-time counter.

**Gaps fixed in this package:**

1. No `offline` state — every failure mode collapsed to "waking up" forever. **Fixed
   via time-bounded `waking` + `offlineAfter`.**
2. No re-sleep detection (polling stopped permanently after first success). **Fixed via
   opt-in `activeCheckInterval`.**
3. Flat 5s polling, no backoff/jitter, no retry cap.
4. No `navigator.onLine` / tab-visibility awareness.
5. No request deduplication (masked by single-provider usage in the app).
6. App coupling: hardcoded `API_URL` import, Tailwind tokens, `lucide-react`, `cn()`.
   **Fixed via config injection + self-contained prefixed CSS + inline SVG icons.**
7. Per-attempt timeout (3s) conflated with the reveal threshold. **Fixed by separating
   `revealDelay` (UX: when to show "waking") from `timeout` (per-attempt ceiling,
   default 10s).**

## 4. State model — [decision]

Five states (cut down from a brainstormed nine):

```
unknown → checking → active           (warm backend: user never sees UI)
unknown → checking → waking → active  (cold backend: the main path)
unknown → checking → waking → offline (dead/misconfigured backend)
offline → checking → active           (manual retry)
active  → checking → waking           (re-check detects re-sleep)
```

| State      | UI                                                                 |
| ---------- | ------------------------------------------------------------------ |
| `unknown`  | render nothing                                                     |
| `checking` | render nothing until `revealDelay` (3s default) elapses unresolved |
| `waking`   | amber: "The server is starting up… (12s)"                          |
| `active`   | green confirmation for `successDisplayMs` (2.5s), then auto-hide   |
| `offline`  | red: "appears to be unavailable" + retry button                    |

**Cut states and why:** `sleeping` is _undetectable_ from a browser; `timeout`/`error`
are inputs to the machine, not user-facing states; `degraded` is deferred to an opt-in
response-validation contract, not a core state.

Each state carries a developer-facing `reason` field
(`slow-response | request-failed | http-error`).

## 5. Technical honesty — [decision]

From the browser, sleeping vs. waking vs. healthy-but-slow vs. packet loss vs. CORS
misconfiguration are **indistinguishable** — the only observables are response time and
final status. Therefore:

- Default copy: **"The server is starting up — this can take up to a minute on first
  visit."** Never "the server is asleep."
- `waking` is acceptable internally (user mental model); UI copy says "starting up".
- CORS-blocked responses reject identically to dead servers — documented as the #1
  troubleshooting item.

## 6. Health-check strategy — [decision]

- **Default:** `GET <healthUrl>` with `cache: 'no-store'`, `AbortSignal.timeout`,
  success = `res.ok` (any 2xx), body not parsed.
- **Escape hatch:** user-provided `check(): Promise<boolean | CheckResult>` (auth
  headers, body validation, non-HTTP transports).
- **Rejected as defaults:** HEAD (framework support inconsistent, no body option),
  OPTIONS (CORS preflight — servers may auto-answer without touching the app → false
  positives), existing app endpoints (auth/heavy/cached).
- Endpoint convention (`/health` vs `/healthz` vs `/ping`) is documentation, not code.

## 7. Architecture — [decision]

Headless core + framework adapter in **one package with subpath exports** (no monorepo
for v1 — premature tooling cost; the `src/core` boundary keeps a future split
mechanical):

```
server-active-indicator ("." export — framework-free core, zero deps)
    └── server-active-indicator/react ("./react" export)
            ├── useServerStatus()        (headless hook)
            ├── ServerStatusProvider     (optional, app-level sharing)
            └── <ServerStatus>           (default UI: banner + pill variants)
```

React/react-dom are **peer dependencies** (`^17 || ^18 || ^19`). Works in Next.js
(App Router with `'use client'`), Vite, Remix, CRA; core usable from plain JS.

## 8. API surface — [decision]

Required: `healthUrl` (or `check`). Everything else defaulted:

| Option                                                             | Default                    | Notes                                                                    |
| ------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| `timeout`                                                          | `10_000`                   | per-attempt ceiling (Render spin-up is ~60s; don't conflate with reveal) |
| `revealDelay`                                                      | `3_000`                    | show `waking` only if unresolved this long (proven value from dossier)   |
| `pollInterval`                                                     | `5_000`                    | while `waking` (proven value)                                            |
| `offlineAfter`                                                     | `60_000` elapsed           | bound on `waking` before declaring `offline`                             |
| `backoffFactor` / `backoffCap`                                     | 1.5×, cap 15s, ±20% jitter | applies after repeated failures (`backoffFactor: 1` = flat polling)      |
| `successDisplayMs`                                                 | `2_500`                    | green confirmation duration (proven value)                               |
| `activeCheckInterval`                                              | `0` (off)                  | opt-in re-sleep detection                                                |
| `pauseWhenHidden`                                                  | `true`                     | `document.visibilitychange`                                              |
| `headers` / `credentials`                                          | none                       | explicit opt-in only                                                     |
| `validate`                                                         | —                          | `(res: Response) => boolean` for body/degraded inspection                |
| `onStatusChange` / `onActive` / `onOffline`                        | —                          | callbacks                                                                |
| `storageKey`                                                       | —                          | opt-in `sessionStorage` cache (not localStorage — staleness)             |
| UI: `variant`, `position`, `messages`, `className`, theme CSS vars | —                          |                                                                          |

DX target: install → `<ServerStatus healthUrl="…" />` working in under 3 minutes.

## 9. Error → state mapping — [decision]

| Condition                                           | State                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| 2xx within threshold                                | `active`                                                                     |
| 2xx slower than `revealDelay`                       | `waking` during wait → `active`                                              |
| timeout / DNS / refused / CORS block                | `waking` (reason set) → `offline` after `offlineAfter`                       |
| HTTP 5xx (incl. Railway 502-on-wake **[verified]**) | `waking` → `offline` after `offlineAfter`                                    |
| HTTP 4xx on health endpoint                         | fast path to `offline` (`reason: 'http-error'`) — won't fix itself by waking |
| `navigator.onLine === false`                        | `offline` with distinct "you appear to be offline" message                   |
| malformed body                                      | ignored by default (body not parsed)                                         |
| abort (unmount/navigation)                          | cleanup only, no state change                                                |

## 10. Performance — [decision]

Module-level monitor registry keyed by config → N components share **one** health loop;
single-flight refresh; `AbortController` on unmount/transition/superseded attempts; no
polling while `active` unless opted in; pause in hidden tabs (including `revealTimer` + `active`/`elapsed` intervals); elapsed counter runs a
single 1s interval only while `waking` and visible (paused when hidden). Bundle budgets (per-export, post-Phase 5 UI): core ≤3.5 KB gzip, react ≤7 KB gzip, IIFE ≤3 KB gzip (actuals: core 2.86 KB, react 5.90 KB, IIFE 2.23 KB). Zero runtime deps.

## 11. Security — [decision]

Public minimal `/health` (`{"status":"ok"}`) is standard practice (Render requires one
for its own health checks **[verified]**); docs recommend: minimal body (no dependency
names/versions), permissive or origin-listed CORS on the health route only, light
server-side rate limiting. Package sends no credentials by default.

## 12. Competition & naming — [verified 2026-08-26]

npm registry searches (`server status indicator`, `react health check backend`,
`cold start server wake`) found **no package in this niche**. Closest:
`react-server-status` (dead 2018 SSR HTTP-status library, unrelated),
`vue-status-indicator` (animated dot, no health logic). Uptime Kuma / Better Stack etc.
are server-side monitoring, not embeddable UX.

Name availability: `server-active-indicator` ✅, `server-status-indicator` ✅,
`cold-start-indicator` ✅, `server-wakeup` ✅; `react-server-status` ❌ taken.

**Chosen: `server-active-indicator`.**

Positioning: _"A tiny, framework-agnostic client-side status indicator for backends
that sleep — tells users your app is waking up instead of looking broken."_

## 13. Tooling — [decision]

pnpm · TypeScript (strict) · **tsup 8.5.x** (ESM+CJS+DTS+IIFE in one step) ·
**Vitest 4** + React Testing Library + axe · ESLint 9 flat + Prettier ·
**changesets 3** for versioning/changelogs · GitHub Actions with npm OIDC trusted
publishing + provenance. Deliberately excluded: Turborepo/monorepo, Storybook,
Playwright in the library (demo app only).

## 14. Scope — [decision]

**MVP→v1.0:** the state machine, GET health check + custom `check`, dedup, visibility
pause, banner + pill, headless hook, i18n messages, theming.
**v1.x:** re-sleep detection interval, sessionStorage cache, `validate`/degraded,
response-time display.
**Roadmap (only if adopted):** multi-service status, latency history, Vue/Svelte
adapters, WebSocket/SSE transports, platform auto-detection, React Native.
**Explicitly out:** dashboards, uptime history, analytics — that's monitoring, a
different product.
