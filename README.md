# server-active-indicator

> A tiny, framework-agnostic client-side status indicator for backends that sleep — tells users your app is waking up instead of looking broken.

**Your frontend loads instantly from a CDN. Your free-tier backend doesn't. Tell the user why.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

- **Zero runtime dependencies** — core is **2.9 KB** gzipped, React adapter **6 KB** gzipped.
- **Framework-agnostic core** + first-class React adapter (`useServerStatus`, `<ServerStatus>`).
- **Honest by design** — never claims a server state the browser can't actually observe.
- **Accessible out of the box** — `role="status"`, dark mode, reduced motion, themeable via CSS custom properties.

<!-- TODO(phase-8): replace with the real demo GIF captured from the live demo app -->

![Demo: the indicator appears while a cold backend starts up, then confirms and disappears](docs/assets/demo-placeholder.gif)

> **Pre-release note:** the package is not on npm yet (see the [roadmap](docs/ROADMAP.md) — publishing is Phase 11). Everything below documents the finished, fully tested API.

---

## The problem

Free-tier hosts (Render, Railway, Fly.io, Koyeb) spin your backend down after a few minutes without traffic. The next visitor's browser gets your frontend instantly — but the first API request hangs for up to a minute while the service wakes. Nothing on screen explains why. Users assume your app is broken and leave.

`server-active-indicator` watches a lightweight `/health` endpoint and, only when a request is taking suspiciously long, shows a calm, honest message: _"The server is starting up — this can take up to a minute on first visit."_ When the backend responds, it confirms briefly and disappears.

**When the backend is warm, it renders nothing. Silence on success is the product.**

## Quick start

```bash
pnpm add server-active-indicator   # or: npm install / yarn add
```

### React (3 lines)

```tsx
import { ServerStatus } from "server-active-indicator/react";

<ServerStatus healthUrl="https://api.example.com/health" />;
```

That's it — banner appears only during a cold start, confirms, and hides itself.

### Vanilla JS / any framework

```js
import { createMonitor } from "server-active-indicator";

const monitor = createMonitor({ healthUrl: "https://api.example.com/health" });
const unsubscribe = monitor.subscribe((snapshot) => {
  // snapshot.status: "unknown" | "checking" | "waking" | "active" | "offline"
  renderYourOwnUi(snapshot);
});
// later: unsubscribe(); monitor.destroy();
```

## How it works

The monitor polls your health endpoint and moves through five states:

| State      | Meaning                                                        | Default UI renders                |
| ---------- | -------------------------------------------------------------- | --------------------------------- |
| `unknown`  | No check has completed yet                                     | nothing                           |
| `checking` | A request is in flight                                         | nothing until `revealDelay` (3s)  |
| `waking`   | Responses are slow or failing — the service is likely starting | "starting up" banner + timer      |
| `active`   | The backend responded healthy                                  | brief confirmation, then nothing¹ |
| `offline`  | `offlineAfter` (60s) elapsed without success                   | red banner + Retry button         |

¹ After a cold start this instance witnessed. A warm first load stays silent.

Two timings are deliberately separate:

- **`revealDelay`** (3s) — how long a check may stay unresolved before any UI appears. Fast responses never flash a banner.
- **`timeout`** (10s) — the ceiling for a single attempt. A Render cold start takes ~60s, far beyond one attempt, so these must not be conflated.

Other built-in behaviors: exponential backoff with jitter between attempts (1.5×, capped at 15s), pausing while the tab is hidden, detecting when the _browser_ itself goes offline, and a shared registry — any number of components using the same config share **one** health loop, one set of timers.

There is deliberately **no `sleeping` state**. A browser cannot distinguish a sleeping server from a slow or unreachable one — so the indicator says "starting up", which is always true, instead of guessing.

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
  --sai-waking-bg: #fff8e1;
  --sai-waking-text: #6d4c00;
  --sai-active-bg: #e8f5e9;
  /* …and border/text/accent variants for waking, active, offline */
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

- **Next.js App Router:** the `react` subpath is built with a `"use client"` banner — import it from client components without adding your own directive. It renders nothing on the server, so there's no hydration mismatch.
- **Config is captured on mount.** To change options at runtime, remount with a `key`: `<ServerStatus key={url} healthUrl={url} />`.
- Components sharing the same config share one engine — render `<ServerStatus>` and call `useServerStatus` in ten places, you still get one health loop.

## Headless / vanilla usage

The core works with any framework (Vue, Svelte, Angular) or none:

```js
import { createMonitor } from "server-active-indicator";

const monitor = createMonitor({ healthUrl: "https://api.example.com/health" });

monitor.subscribe((snapshot) => {
  console.log(snapshot.status, snapshot.elapsedSeconds);
});

monitor.refresh(); // trigger an immediate check
monitor.destroy(); // release this consumer (engine dies with its last consumer)
```

### Custom health checks

Bring your own logic — the engine keeps its timing, backoff, and state machine:

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

Without a `key`, each custom-`check` monitor gets its own engine (functions aren't serializable, so configs can't be deduped automatically).

### Via CDN (no bundler)

```html
<script src="https://unpkg.com/server-active-indicator/dist/server-active-indicator.iife.global.js"></script>
<script>
  const monitor = ServerActiveIndicator.createMonitor({
    healthUrl: "https://api.example.com/health",
  });
  monitor.subscribe((s) => console.log(s.status));
</script>
```

(Also available on jsDelivr at the same path.)

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

If your frontend and API are on different origins, allow the health endpoint cross-origin. No credentials are sent by default, so a simple allowance is enough:

```js
// Express
import cors from "cors";
app.use("/health", cors({ origin: "https://your-frontend.com" }));
```

Only reach for `headers` / `credentials` options if your health endpoint genuinely requires them — both are explicit opt-ins.

## Platform guides

Verified behavior per platform (sources: [research report](docs/research/research-report.md)):

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

## API reference

### `createMonitor(config)` → `Monitor`

| Method                | Description                                                                        |
| --------------------- | ---------------------------------------------------------------------------------- |
| `getSnapshot()`       | Current immutable `MonitorSnapshot`.                                               |
| `subscribe(listener)` | Called with the new snapshot on every change. Returns an unsubscribe.              |
| `refresh()`           | Trigger an immediate health check (single-flight; safe to spam).                   |
| `destroy()`           | Release this consumer. The shared engine stops when its last consumer releases it. |

### `MonitorConfig`

| Option                | Default  | Description                                                                              |
| --------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `healthUrl`           | —        | Lightweight health endpoint. Required unless `check` is given.                           |
| `check`               | —        | Custom `() => Promise<boolean \| CheckResult>`; overrides `healthUrl`.                   |
| `timeout`             | `10000`  | Per-attempt ceiling (ms).                                                                |
| `revealDelay`         | `3000`   | Show `waking` only if unresolved this long (ms).                                         |
| `pollInterval`        | `5000`   | Base interval between attempts while `waking` (ms).                                      |
| `offlineAfter`        | `60000`  | Give up on `waking` → `offline` after this elapsed (ms).                                 |
| `successDisplayMs`    | `2500`   | Post-cold-start confirmation visibility (ms).                                            |
| `activeCheckInterval` | `0`      | Opt-in periodic re-check while `active` (re-sleep detection). `0` = off.                 |
| `pauseWhenHidden`     | `true`   | Pause checks while the tab is hidden; re-check on visible.                               |
| `backoffFactor`       | `1.5`    | Retry-delay multiplier per failure. `1` = flat polling.                                  |
| `backoffCap`          | `15000`  | Upper bound for the retry delay (ms).                                                    |
| `headers`             | none     | Extra request headers (opt-in; none sent by default).                                    |
| `credentials`         | omitted  | Fetch credentials mode (opt-in).                                                         |
| `validate`            | `res.ok` | Custom response validator, e.g. reject a degraded 200 body.                              |
| `key`                 | —        | Explicit registry key; required to share an engine across consumers of a custom `check`. |

### `MonitorSnapshot`

| Field            | Type                                 | Description                                                                |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `status`         | `ServerStatus`                       | `unknown \| checking \| waking \| active \| offline`.                      |
| `reason`         | `FailureReason?`                     | `slow-response \| request-failed \| http-error` (developer-facing).        |
| `elapsedSeconds` | `number`                             | Seconds since the current `waking` episode began.                          |
| `lastCheckedAt`  | `number \| null`                     | Epoch ms of the last completed check.                                      |
| `attempts`       | `number`                             | Attempts made in the current episode.                                      |
| `wasCold`        | `boolean`                            | Whether this episode passed through `waking` (drives the confirmation UI). |
| `lastLatencyMs`  | `number \| null`                     | Latency of the last completed attempt.                                     |
| `offlineKind`    | `"server" \| "browser" \| undefined` | Distinguishes "backend unreachable" from "your browser is offline".        |

### React exports (`server-active-indicator/react`)

| Export                               | Description                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `<ServerStatus {...config} />`       | Default UI. Extra props: `variant` (`"banner" \| "pill"`), `messages`, `className`, render-prop `children`. |
| `<ServerStatusProvider {...config}>` | Owns one monitor and shares it with all no-arg `useServerStatus()` calls below.                             |
| `useServerStatus(config?)`           | Returns the snapshot plus `refresh()`. Without args, reads the nearest provider.                            |

All core types (`MonitorConfig`, `MonitorSnapshot`, `CheckResult`, `FailureReason`) are re-exported from the `react` subpath.

## FAQ

**Can it detect that the server is sleeping?**
No — and that's honest. A browser cannot distinguish "server is spun down" from "server is slow" or "network is flaky". So the indicator never claims the server is asleep; it says "starting up", which is true in every one of those cases. You get truthful UX instead of a confident guess.

**Why is nothing rendering?**
Probably because it's working. The indicator renders nothing while checks are fast (`< revealDelay`) and nothing after a warm start. You'll only ever see it during a cold start, a slow backend, or an outage.

**Does it send cookies or auth headers?**
No. Requests are plain `GET`s with no credentials. `headers` and `credentials` are explicit opt-ins.

**Is it SSR-safe?**
Yes. Monitors are created in effects (never during render), the stylesheet injects client-side only, and server HTML matches the client's first render — no hydration mismatch.

**Will ten components polling the same URL hammer my backend?**
No. Monitors with identical config share one engine via a module-level registry — one health loop, one timer set, regardless of consumer count.

**Does it keep polling forever?**
While `waking`, attempts back off (1.5×, capped at 15s) and stop at `offlineAfter` (default 60s) → `offline` with a Retry button. While `active`, polling stops entirely unless you opt into `activeCheckInterval` for re-sleep detection. While the tab is hidden, checks pause.

## Troubleshooting

**The banner never appears, even during a cold start.**

- Open devtools → Network: is the `/health` request failing CORS? Allow the origin (see [CORS](#cors)).
- Is the endpoint responding in under `revealDelay` (3s)? Then the wake already finished before the UI threshold — lower `revealDelay` if you want to see it in dev.
- Test against the bundled fixture: `pnpm fixture:sleep-server` sleeps for real on first hit.

**The banner appears, then vanishes on its own.**
That's the design: the green confirmation auto-hides after `successDisplayMs` (2.5s). Silence on success.

**It says "offline" but the server came up at 65 seconds.**
`offlineAfter` defaults to 60s. Raise it (`offlineAfter: 120_000`) if your platform boots slower — or hit the Retry button, which triggers an immediate check.

**Changing props/options at runtime does nothing.**
Config is captured on mount (it keys the shared registry). Remount with a `key`: `<ServerStatus key={url} healthUrl={url} />`.

**Two components with the same custom `check` each run their own loop.**
Functions aren't serializable, so custom checks can't be deduped automatically. Pass the same explicit `key` to both.

**TypeScript can't find the module.**
The package ships `.d.ts` via subpath exports; ensure your `tsconfig` uses `"moduleResolution": "bundler"` (or `"node16"`/`"nodenext"`).

## Development

```bash
pnpm install
pnpm verify                 # format → lint → typecheck → tests (coverage gate) → build
pnpm fixture:sleep-server   # standalone fake-sleeping backend for manual testing
```

Contributing: see [AGENTS.md](AGENTS.md) (locked decisions & boundaries), [docs/development.md](docs/development.md) (workflow), [docs/ROADMAP.md](docs/ROADMAP.md) (phased plan), and [docs/research/](docs/research/) (verified platform behavior behind the defaults).

## License

[MIT](LICENSE)
