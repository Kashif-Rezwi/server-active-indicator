# Live demo (Phase 8)

Vite + React frontend for the `server-active-indicator` live demo. It talks to
the [demo API](../demo-server/) — a free-tier service that genuinely sleeps —
and shows the indicator doing its job: banner during the cold start, brief
confirmation, then silence.

## Run locally

Terminal 1 — the API (sleeps 20s on first hit, re-arm with `POST /reset`):

```bash
# from the repo root
node --import tsx examples/demo-server/run.ts
```

Terminal 2 — the frontend:

```bash
cd examples/demo
pnpm install    # standalone install — the demo is its own pnpm project root
pnpm dev        # http://localhost:5173
```

Local dev **aliases `server-active-indicator` to the library source**
(`../../src`), so you're dogfooding the real code — no build or publish step
needed. See [`vite.config.ts`](vite.config.ts).

Environment: `VITE_API_URL` (default `http://127.0.0.1:4100`). Example:

```bash
VITE_API_URL=http://127.0.0.1:4100 pnpm dev
```

## Deploy

1. **API → Render (free tier):** follow
   [`examples/demo-server/README.md`](../demo-server/README.md). Note the URL,
   e.g. `https://sai-demo-api.onrender.com`.
2. **Frontend → any static host** (GitHub Pages / Netlify / Vercel):

   ```bash
   cd examples/demo
   VITE_API_URL=https://sai-demo-api.onrender.com pnpm build
   # deploy the dist/ directory
   ```

3. Tighten `ALLOWED_ORIGIN` on the API to the frontend's origin.
4. **After the package is published (Phase 11+):** replace the source alias
   with the real dependency — `pnpm add server-active-indicator` and delete
   the `resolve.alias` block in `vite.config.ts`.

## Recording the README GIF

Goal: a ~15–20s clip showing the honest cold-start story.

1. Re-arm the sleep (the demo's "Re-arm the sleep" button, or
   `curl -X POST $API_URL/reset`).
2. Start a screen recording (macOS: **Cmd-Shift-5** → record selected portion,
   or [Kap](https://getkap.co/) for direct GIF export).
3. Hard-reload the page. Capture: banner appears (~3s in) → elapsed counter
   ticks → green "server is ready" confirmation → banner disappears.
4. Optional second clip: click "Fetch data from the API" during a cold start
   to show app-level latency alongside the banner.
5. Export as GIF ≤ ~2 MB, save to `docs/assets/demo.gif`, and update the image
   path + add the live-demo link in the root `README.md` (search for the
   `TODO(phase-8)` comment).
