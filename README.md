# server-active-indicator

> A tiny, framework-agnostic client-side status indicator for backends that sleep — tells users your app is waking up instead of looking broken.

**Your frontend loads instantly from a CDN. Your free-tier backend doesn't. Tell the user why.**

[![npm version](https://img.shields.io/npm/v/server-active-indicator.svg)](https://www.npmjs.com/package/server-active-indicator) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Kashif-Rezwi/server-active-indicator/blob/main/LICENSE)

- **Zero runtime dependencies** — core **~3.1 KB** gzipped, React adapter **~6.2 KB** gzipped.
- **Framework-agnostic core** + first-class React adapter (`useServerStatus`, `ServerStatusProvider`, `<ServerStatus>`).
- **Honest by design** — never claims a server state the browser cannot actually observe.
- **Accessible out of the box** — `role="status"`, `aria-live="polite"`, dark mode, reduced motion, themeable via CSS custom properties.
- **Modern runtimes** — requires `AbortSignal.timeout` / `AbortSignal.any` (all evergreen browsers since 2023–24; Node ≥ 20.3 for SSR health checks).

![Demo: silence on a warm backend, a "starting up" banner with a live elapsed timer during a cold start, a brief "The server is ready" confirmation, and offline banners with a Retry button for server errors and network drops — dark theme](https://raw.githubusercontent.com/Kashif-Rezwi/server-active-indicator/main/docs/assets/demo.gif)

> Recorded from the live interactive demo — play with all four scenarios yourself at **[server-active-indicator.vercel.app](https://server-active-indicator.vercel.app/)**.

---

## The problem

Free-tier hosts (Render, Railway, Fly.io, Koyeb) spin your backend down after a few minutes without traffic. The next visitor's browser gets your frontend instantly from a CDN — but the first API request hangs for up to a minute while the service wakes. Nothing on screen explains why. Users assume your app is broken and leave.

`server-active-indicator` watches a lightweight `/health` endpoint and, only when a request is taking suspiciously long, shows a calm, honest message: _"The server is starting up. This can take up to a minute on first visit."_ When the backend responds, it confirms briefly and disappears.

**When the backend is warm, it renders nothing. Silence on success is the product.**

---

## Features

- **5-State Finite State Machine:** Predictable progression across `unknown`, `checking`, `waking`, `active`, and `offline`.
- **Silence on Success:** Zero DOM footprint and zero visual noise for warm backends or fast requests under the reveal threshold.
- **Shared Monitor Registry:** Components and hooks sharing the same configuration share a single ref-counted engine loop, eliminating duplicate polling.
- **Honest Copy & State Semantics:** Never claims a server is "sleeping" (undetectable from a browser); displays "starting up", which is always technically truthful.
- **Adaptive Backoff with Jitter:** Exponential backoff (1.5×, capped at 15s) with ±20% randomization to prevent thundering herds on waking instances.
- **Tab Visibility Awareness:** Pauses health checks when document visibility is hidden (`visibilitychange`) and resumes immediately on focus.
- **Network Disconnect Detection:** Distinguishes browser offline events (`navigator.onLine === false`) from backend server unreachability and auto-recovers via window `online` events.
- **Configuration Error Fast-Path:** HTTP 4xx responses fast-path immediately to `offline` with `reason: "http-error"` rather than polling fruitlessly.
- **Drop-in React Adapter:** Includes `<ServerStatus>` with zero-config CSS injection, light/dark themes, accessible markup, and a headless `useServerStatus` hook.
- **Zero Runtime Dependencies:** Built strictly on native web APIs (`fetch`, `AbortSignal.timeout`, `AbortSignal.any`).

---

## Tech Stack

- **Core Runtime:** TypeScript (Strict Mode), native Fetch API, AbortController/AbortSignal
- **React Adapter:** React (`^17.0.0 || ^18.0.0 || ^19.0.0` optional peer dependency), `useSyncExternalStore`
- **Build System:** `tsup` (dual ESM + CJS emission with `.d.ts` declarations and sourcemaps)
- **Testing:** Vitest, React Testing Library, `jsdom`, `axe-core` (WCAG accessibility verification)
- **Quality Gates:** ESLint 10 (flat config), Prettier, `publint` (package exports validation), bundle-size gate (`check-size.mjs`)
- **Release Pipeline:** Changesets, GitHub Actions CI, npm OIDC trusted publishing with provenance

---

## Architecture

The library is organized into three distinct layers. Every layer depends only on the layer below it; the core engine has zero knowledge of React.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ APPLICATION LAYER                                                      │
│                                                                        │
│   Vanilla JS / Framework-Agnostic            React Application         │
│   ┌─────────────────────────────┐      ┌─────────────────────────────┐ │
│   │ const monitor =             │      │ <ServerStatusProvider>      │ │
│   │   createMonitor(config);    │      │   <ServerStatus />          │ │
│   │ monitor.subscribe(listener) │      │   useServerStatus()         │ │
│   └──────────────┬──────────────┘      └──────────────┬──────────────┘ │
└──────────────────┼────────────────────────────────────┼────────────────┘
                   │                                    │
                   │                                    ▼
                   │                     ┌─────────────────────────────┐
                   │                     │ ADAPTER LAYER (src/react/)  │
                   │                     │                             │
                   │                     │ • ServerStatusProvider      │
                   │                     │ • useServerStatus()         │
                   │  acquires /         │ • <ServerStatus> UI         │
                   │  releases           │   (styles, icons, a11y)     │
                   │  Monitor handle     └──────────────┬──────────────┘
                   │                                    │
                   │ ┌──────────────────────────────────┘
                   ▼ ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CORE ENGINE & REGISTRY LAYER (src/core/ — zero dependencies)           │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Shared Registry (registry.ts)                                  │   │
│   │ Maps serialized config to shared Engine instances (ref-counted)│   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ State Machine Engine (engine.ts)                               │   │
│   │ • 5-state machine (unknown, checking, waking, active, offline) │   │
│   │ • Timers: revealDelay (3s) | backoff (1.5x) | offlineAfter (60s)│  │
│   │ • Listeners: document visibilitychange | window "online"       │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Network Strategy (check.ts)                                    │   │
│   │ fetch GET (cache: no-store) + AbortSignal.timeout / .any       │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │ HTTP GET /health
                                    ▼
                         🌐 Remote Backend Host
```

### State Machine Lifecycle

```text
                     createEngine() / refresh()
                                │
                                ▼
                  ┌───────────────────────────┐
                  │         checking          │  Attempt in flight;
                  │   (Default UI: silent)    │  revealTimer (3s) armed
                  └─────┬───────────────┬─────┘
   2xx OK in < 3s       │               │  Unresolved after 3s
   (fast warm start)    │               │  (revealTimer fires)
                        │               │
                        ▼               ▼
           ┌─────────────────┐     ┌──────────────────────────────────┐
           │     active      │◄────┤              waking              │
           │  warm: silent;  │ 2xx │  (amber banner + live timer;     │
           │  cold: confirms │ OK  │   jittered backoff polling)      │
           │  then auto-hides│     └─────┬──────────────┬─────────────┘
           └────────┬────────┘           │              │
                    │                    │              │
      Re-check fail │      offlineAfter  │              │ HTTP 4xx error
      opt-in active │      budget (60s)  │              │ (misconfiguration)
      check interval│      exhausted     │              │ or browser offline
                    ▼                    ▼              ▼
           ┌──────────────────────────────────────────────────────────┐
           │                         offline                          │
           │  • "server": backend unreachable (red banner + Retry)    │
           │  • "browser": client disconnected (auto-online recovery) │
           └─────────────────────────────┬────────────────────────────┘
                                         │
                   Manual Retry button / │ Window "online" event
                   refresh()             │ (browser offline recovery)
                                         ▼
                             (re-enters checking)
```

---

## How it works

The monitor polls your health endpoint and moves through five states:

| State | Meaning | Default UI renders |
| --- | --- | --- |
| `unknown` | No check has completed yet | nothing |
| `checking` | A request is in flight | nothing until `revealDelay` (3s) |
| `waking` | Responses are slow or failing — the service is starting | "starting up" banner + live elapsed timer |
| `active` | The backend responded healthy | brief confirmation, then nothing¹ |
| `offline` | `offlineAfter` (60s) elapsed without success, an HTTP 4xx, or browser offline | red banner + Retry button |

¹ After a cold start this instance witnessed. A warm first load stays silent.

`offline` is stable — polling stops and the monitor waits. Browser-offline recovers automatically when the browser fires `online`; server-offline recovers via the Retry button or `refresh()`.

Two timings are deliberately separate:

- **`revealDelay`** (3s) — how long a check may stay unresolved before any UI appears. Fast responses never flash a banner.
- **`timeout`** (10s) — the ceiling for a single attempt. A Render cold start takes ~60s, far beyond one attempt, so these must not be conflated.

Other built-in behaviors: exponential backoff with jitter between attempts (1.5×, capped at 15s), pausing while the tab is hidden, detecting when the _browser_ itself goes offline, and a shared registry — any number of components using the same config share **one** health loop and one set of timers.

There is deliberately **no `sleeping` state**. A browser cannot distinguish a sleeping server from a slow or unreachable one — so the indicator says "starting up", which is always true, instead of guessing.

---

## Project Structure

```text
server-active-indicator/
├── src/
│   ├── index.ts                     # Framework-free core barrel (".")
│   ├── core/                        # Zero-dependency monitoring engine
│   │   ├── check.ts                 # Fetch strategy, signal fusion, HTTP validation
│   │   ├── defaults.ts              # Canonical timing & polling defaults
│   │   ├── engine.ts                # 5-state machine, timer loops, backoff & events
│   │   ├── monitor.ts               # Public createMonitor() factory
│   │   ├── registry.ts              # Ref-counted engine instance cache & dedup
│   │   └── types.ts                 # Core TypeScript interfaces & status unions
│   └── react/                       # React adapter barrel ("./react")
│       ├── icons.tsx                # Inline SVGs (spinner, check, offline, wifi-off)
│       ├── index.ts                 # React adapter export barrel
│       ├── server-status.tsx        # <ServerStatus> default UI & render prop
│       ├── server-status-provider.tsx # Context provider for centralized configuration
│       ├── styles.ts                # Self-contained injected CSS & custom properties
│       ├── use-server-status.ts     # Headless hook for React components
│       └── use-sync-external-store.ts # React 17/18/19 subscription compatibility shim
├── demo/                            # Interactive Vite + React 19 demo application
├── docs/                            # Deep architecture, research, and backlog guides
│   ├── ARCHITECTURE.md              # In-depth architectural breakdown and code map
│   ├── BACKLOG.md                   # Audit log and deliberate design considerations
│   ├── development.md               # Quick & full gear workflows, definition of done
│   └── research/                    # Platform cold-start benchmark research
├── scripts/                         # Bundle size and guarded npm publishing scripts
└── tests/                           # Vitest test suite and axe-core a11y assertions
```

---

## Quick start

```bash
pnpm add server-active-indicator   # or: npm install / yarn add / bun add
```

### React (3 lines)

```tsx
import { ServerStatus } from "server-active-indicator/react";

<ServerStatus healthUrl="https://api.example.com/health" />;
```

That's it — the banner appears only during a cold start, confirms, and hides itself.

### Vanilla JS / any framework

```js
import { createMonitor } from "server-active-indicator";

const el = document.getElementById("status-banner");
const monitor = createMonitor({ healthUrl: "https://api.example.com/health" });

monitor.subscribe(({ status, elapsedSeconds, offlineKind }) => {
  if (status === "checking" || status === "unknown") {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (status === "waking") {
    el.textContent = `Server starting up\u2026 (${elapsedSeconds}s)`;
    el.className = "status waking";
  } else if (status === "active") {
    el.textContent = "Server ready.";
    el.className = "status active";
    setTimeout(() => {
      el.hidden = true;
    }, 2_500);
  } else {
    el.textContent =
      offlineKind === "browser" ? "You appear to be offline." : "Server unavailable.";
    el.className = "status offline";
  }
});

// When the page/component tears down:
// monitor.destroy();
```

---

## React usage

### `<ServerStatus>` — default UI

Drop-in banner (or pill) with built-in styling, icons, and accessibility:

```tsx
import { ServerStatus } from "server-active-indicator/react";

// Full-width banner (default)
<ServerStatus healthUrl="https://api.example.com/health" />

// Compact pill
<ServerStatus healthUrl="https://api.example.com/health" variant="pill" />

// Custom copy / i18n
<ServerStatus
  healthUrl="https://api.example.com/health"
  messages={{
    waking: "Le serveur démarre — cela peut prendre jusqu'à une minute.",
    active: "Le serveur est prêt.",
    offline: "Le serveur semble indisponible.",
    browserOffline: "Vous semblez hors ligne.",
    retry: "Réessayer",
  }}
/>

// Full control — render prop replaces the default UI entirely
<ServerStatus healthUrl="https://api.example.com/health">
  {({ status, elapsedSeconds, refresh }) =>
    status === "waking" ? <MySpinner elapsed={elapsedSeconds} /> : null
  }
</ServerStatus>
```

The default UI injects a tiny `sai-`-prefixed stylesheet once per document (SSR-safe) and follows light/dark mode automatically. Theme it with CSS custom properties:

```css
:root {
  --sai-font-size: 0.8125rem;
  --sai-waking-bg: #fff8e1;
  --sai-waking-border: #f3d9a4;
  --sai-waking-text: #6d4c00;
  --sai-waking-accent: #b45309;
  --sai-active-bg: #e8f5e9;
  --sai-active-border: #b9e6cb;
  --sai-active-text: #14532d;
  --sai-active-accent: #15803d;
  --sai-offline-bg: #fee2e2;
  --sai-offline-border: #f6c6c6;
  --sai-offline-text: #7f1d1d;
  --sai-offline-accent: #b91c1c;
}
```

The component announces state changes via `role="status"` + `aria-live="polite"`, honors `prefers-reduced-motion`, and includes a Retry button when `offline`.

### `ServerStatusProvider` — configure once, read anywhere

```tsx
import { ServerStatusProvider, ServerStatus } from "server-active-indicator/react";

function App() {
  return (
    <ServerStatusProvider healthUrl="https://api.example.com/health">
      <ServerStatus /> {/* reads the provider's monitor — no props needed */}
      <RestOfApp />
    </ServerStatusProvider>
  );
}
```

### `useServerStatus` — headless hook

```tsx
import { useServerStatus } from "server-active-indicator/react";

function SaveButton() {
  const { status, wasCold, refresh } = useServerStatus(); // provider config…
  // …or: useServerStatus({ healthUrl: "https://api.example.com/health" })
  return (
    <button disabled={status !== "active"} onClick={refresh}>
      {status === "waking" ? "Waiting for server…" : "Save"}
    </button>
  );
}
```

Notes:

- **Next.js App Router:** The `react` subpath is built with a `"use client"` banner — import it from client components without adding your own directive. It renders nothing on the server, so there is no hydration mismatch.
- **Config is captured on mount.** To change options at runtime, remount with a `key`: `<ServerStatus key={url} healthUrl={url} />`.
- **Components sharing the same config share one engine.** Render `<ServerStatus>` and call `useServerStatus` in ten places; you still get one health loop.

---

## Headless / vanilla usage

The core works with any framework (Vue, Svelte, Angular) or none:

```js
import { createMonitor } from "server-active-indicator";

const monitor = createMonitor({ healthUrl: "https://api.example.com/health" });

monitor.subscribe((snapshot) => {
  console.log(snapshot.status, snapshot.elapsedSeconds);
});

monitor.refresh(); // trigger an immediate check
monitor.destroy(); // release this consumer (engine stops when its last consumer releases it)
```

### Custom health checks

Bring your own check function — the engine keeps its timing, backoff, and state machine:

```js
const monitor = createMonitor({
  key: "my-api", // required to share an engine across consumers of a custom check
  check: async () => {
    const res = await fetch("/api/health");
    if (!res.ok) return { ok: false, reason: "http-error", status: res.status };
    const body = await res.json();
    return { ok: body.status === "ok" };
  },
});
```

Without a `key`, each custom-`check` monitor gets its own engine (functions cannot be serialized, so configs cannot be deduped automatically).

---

## Backend recipes

The indicator needs one lightweight, unauthenticated `GET` endpoint that returns 2xx quickly. Keep it free of database queries — it must answer even while the rest of the app is still booting.

### Express

```js
app.get("/health", (_req, res) => res.json({ status: "ok" }));
```

### Fastify

```js
fastify.get("/health", async () => ({ status: "ok" }));
```

### NestJS

```ts
@Get("health")
health() {
  return { status: "ok" };
}
```

### CORS

If your frontend and API are on different origins, allow the health endpoint cross-origin. No credentials are sent by default, so a simple origin allowance is enough:

```js
// Express
import cors from "cors";
app.use("/health", cors({ origin: "https://your-frontend.com" }));
```

Only reach for `headers` / `credentials` options if your health endpoint genuinely requires them — both are explicit opt-ins.

---

## Platform guides

Verified behavior per platform (sources: [research report](https://github.com/Kashif-Rezwi/server-active-indicator/blob/main/docs/research/research-report.md)):

### Render

Free web services sleep after **15 minutes** without inbound traffic; the next request spins the service up in **~1 minute**. Point the indicator at the same path you give Render:

```yaml
# render.yaml
services:
  - type: web
    healthCheckPath: /health
```

### Railway

With "Serverless" (opt-in) enabled, services sleep after **10 minutes** with no outbound packets. Important caveat: **the first request to a waking service may return `502 Bad Gateway`**. The indicator already treats 5xx as "still waking", not as a hard failure — no special handling needed on your side.

### Fly.io

`auto_stop_machines` with `min_machines_running = 0` is the `fly launch` **default** — your machines stop when idle and the Fly Proxy autostarts them on incoming requests. `suspend` resumes faster than `stop`; either way the indicator covers the gap.

### Koyeb

The Scale-to-Zero feature (available on the free instance) cold-starts a microVM on incoming traffic. Same pattern: point the indicator at a cheap `/health` route.

---

## API reference

### `createMonitor(config)` → `Monitor`

Creates or acquires a handle to a shared monitoring engine.

| Method | Description |
| --- | --- |
| `getSnapshot()` | Current immutable `MonitorSnapshot`. |
| `subscribe(listener)` | Called with the new snapshot on every change. Returns an unsubscribe function. |
| `refresh()` | Trigger an immediate health check. Single-flight: a no-op while a check is already in flight. |
| `destroy()` | Release this consumer. The shared engine stops when its last consumer releases it. |

### `MonitorConfig`

Core options accepted by `createMonitor()`, `ServerStatusProvider`, and `useServerStatus()`:

| Option | Default | Description |
| --- | --- | --- |
| `healthUrl` | — | Lightweight health endpoint URL. Required unless `check` is given. |
| `check` | — | Custom `() => Promise<boolean \| CheckResult>`; overrides `healthUrl`. |
| `timeout` | `10000` | Per-attempt ceiling (ms) — bounds `healthUrl` requests and custom `check` calls alike. |
| `revealDelay` | `3000` | Show `waking` only if unresolved this long (ms). Prevents UI flicker on fast loads. |
| `pollInterval` | `5000` | Base interval between attempts while `waking` (ms). |
| `offlineAfter` | `60000` | Give up on `waking` → `offline` after this elapsed duration (ms). |
| `activeCheckInterval` | `0` | Opt-in periodic re-check while `active` (re-sleep detection). `0` = off. |
| `pauseWhenHidden` | `true` | Pause checks while the tab is hidden; re-check on visible. |
| `backoffFactor` | `1.5` | Multiplier applied to retry delay per failure. `1` = flat polling. |
| `backoffCap` | `15000` | Upper bound for the retry delay (ms). |
| `headers` | none | Extra request headers (opt-in; none sent by default). |
| `credentials` | omitted | Fetch credentials mode (opt-in). |
| `validate` | `res.ok` | Custom response validator, e.g. to reject a degraded 200 body. |
| `key` | — | Explicit registry key; required to share an engine across consumers of a custom `check` or `validate`. |

### `MonitorSnapshot`

Immutable state snapshot emitted to subscribers:

| Field | Type | Description |
| --- | --- | --- |
| `status` | `ServerStatus` | `unknown \| checking \| waking \| active \| offline`. |
| `reason` | `FailureReason?` | `slow-response \| request-failed \| http-error` (developer-facing). |
| `elapsedSeconds` | `number` | Seconds since the current `waking` episode began. |
| `lastCheckedAt` | `number \| null` | Epoch ms of the last completed check. |
| `attempts` | `number` | Attempts made in the current episode. |
| `wasCold` | `boolean` | Whether this episode passed through `waking` (drives confirmation UI). |
| `lastLatencyMs` | `number \| null` | Latency of the last completed attempt in milliseconds. |
| `offlineKind` | `"server" \| "browser" \| undefined` | Distinguishes "backend unreachable" from "your browser is offline". |

### React exports (`server-active-indicator/react`)

#### `<ServerStatus {...props} />`

Drop-in UI banner or pill. Accepts all `MonitorConfig` options plus component-specific presentation props:

| Prop | Default | Description |
| --- | --- | --- |
| `variant` | `"banner"` | Visual appearance: `"banner"` (full-width strip) or `"pill"` (compact badge). |
| `successDisplayMs` | `2500` | Duration (ms) the green `active` confirmation stays visible before hiding. |
| `messages` | English defaults | Override copy for `waking`, `active`, `offline`, `browserOffline`, `retry`. |
| `className` | — | Additional CSS class names on the root status element. |
| `children` | — | Render prop escape hatch: `({ status, elapsedSeconds, refresh, ... }) => ReactNode`. |

#### `<ServerStatusProvider {...config}>`

Accepts `MonitorConfig` options and a `children` element. Owns one monitor instance and shares it with all parameterless `useServerStatus()` and `<ServerStatus />` invocations in its subtree.

#### `useServerStatus(config?)`

Returns the current `MonitorSnapshot` merged with `{ refresh: () => void }`. Without arguments, reads the nearest `ServerStatusProvider`. With arguments, acquires its own monitor handle.

All core types (`MonitorConfig`, `MonitorSnapshot`, `CheckResult`, `FailureReason`, `ServerStatus`) are re-exported from `server-active-indicator/react`.

---

## FAQ

**Can it detect that the server is sleeping?** No — and that is honest. A browser cannot distinguish "server is spun down" from "server is slow" or "network is flaky". So the indicator never claims the server is asleep; it says "starting up", which is true in every one of those cases. You get truthful UX instead of a confident guess.

**Why is nothing rendering?** Probably because it's working. The indicator renders nothing while checks are fast (`< revealDelay`) and nothing after a warm start. You'll only ever see it during a cold start, a slow backend, or an outage.

**Does it send cookies or auth headers?** No. Requests are plain `GET`s with no credentials. `headers` and `credentials` are explicit opt-ins.

**Is it SSR-safe?** Yes. Monitors are created in effects (never during render), the stylesheet injects client-side only, and server HTML matches the client's first render — no hydration mismatch.

**Will ten components polling the same URL hammer my backend?** No. Monitors with identical config share one engine via a module-level registry — one health loop, one timer set, regardless of consumer count.

**Does it keep polling forever?** While `waking`, attempts back off (1.5×, capped at 15s) and stop at `offlineAfter` (default 60s) → `offline` with a Retry button. While `active`, polling stops entirely unless you opt into `activeCheckInterval` for re-sleep detection. While the tab is hidden, checks pause.

**What happens when my laptop goes offline and comes back?** The next attempt observes `navigator.onLine === false` and reports `offline` with `offlineKind: "browser"` ("You appear to be offline"). When the browser fires `online`, the monitor re-checks immediately and recovers on its own. Server-side `offline` is different — the monitor cannot observe the server coming back without polling, so recovery there is manual (Retry button or `refresh()`).

---

## Troubleshooting

**The banner never appears, even during a cold start.**

- Open devtools → Network: is the `/health` request failing CORS? Allow the origin (see [CORS](#cors)).
- Is the endpoint responding in under `revealDelay` (3s)? Then the wake already finished before the UI threshold — lower `revealDelay` if you want to see it in dev.

**The banner appears, then vanishes on its own.**

- That is the design: the green confirmation auto-hides after `successDisplayMs` (2.5s). Silence on success.

**It says "offline" but the server came up at 65 seconds.**

- `offlineAfter` defaults to 60s. Raise it (`offlineAfter: 120_000`) if your platform boots slower — or hit the Retry button, which triggers an immediate check. Note that `offline` is terminal: once declared, the monitor stops polling on its own. Only browser-offline (`offlineKind: "browser"`) recovers automatically, via the window `online` event.

**It went straight to "offline" without ever showing "starting up".**

- Your health endpoint answered 4xx (404, 401, …). A 4xx means the server itself is up and responding — the indicator treats it as a configuration problem (wrong URL, missing route, unexpected auth), not a cold start, and fast-paths to `offline` so you notice. Check that `healthUrl` returns 2xx. If your endpoint legitimately answers non-2xx while healthy, provide a custom `validate` (e.g. `validate: (r) => r.status < 500`).

**My custom `check` takes a long time — which option bounds it?**

- `timeout` (default 10s) bounds every attempt, including custom `check` calls: a check that has not settled by then counts as `request-failed`, and the episode still converges to `offline` at `offlineAfter`. A hung check can never leave the indicator stuck in "starting up" forever.

**Changing props/options at runtime does nothing.**

- Config is captured on mount (it keys the shared registry). Remount with a `key`: `<ServerStatus key={url} healthUrl={url} />`.

**Two components with the same custom `check` each run their own loop.**

- Functions are not serializable, so custom checks cannot be deduped automatically. Pass the same explicit `key` to both: `<ServerStatus check={myCheck} key="my-check" />`.

**TypeScript cannot find the module.**

- The package ships `.d.ts` via subpath exports; ensure your `tsconfig` uses `"moduleResolution": "bundler"` (or `"node16"` / `"nodenext"`).

---

## Development

```bash
# Install dependencies
pnpm install

# Full verification suite (Definition of Done)
pnpm verify

# Run development watcher (rebuilds dist/ on change)
pnpm dev

# Run Vitest unit & integration test suite
pnpm test

# Run tests with coverage (enforces 90/90/90/85 gate on src/core/**)
pnpm test:coverage

# Start the interactive demo application locally
pnpm demo:dev
```

Contributing guidelines and boundaries: see [AGENTS.md](https://github.com/Kashif-Rezwi/server-active-indicator/blob/main/AGENTS.md) (locked decisions & agent constraints), [docs/development.md](https://github.com/Kashif-Rezwi/server-active-indicator/blob/main/docs/development.md) (two-gear workflow), and [docs/research/](https://github.com/Kashif-Rezwi/server-active-indicator/tree/main/docs/research/) (verified platform benchmarks).

---

## License

[MIT](https://github.com/Kashif-Rezwi/server-active-indicator/blob/main/LICENSE) © [Kashif Rezwi](https://github.com/Kashif-Rezwi)
