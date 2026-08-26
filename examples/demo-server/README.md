# Demo API (Phase 8)

A tiny Express API that genuinely "sleeps" and wakes, deployable to Render's
free tier as the backend for the [live demo](../demo/). It is the deployable
counterpart of the [`sleeping-server`](../sleeping-server/) test fixture, with
real CORS and a data endpoint added.

## Endpoints

| Method | Path           | Behavior                                                           |
| ------ | -------------- | ------------------------------------------------------------------ |
| GET    | `/health`      | First call after boot/reset sleeps `SLEEP_MS`, then 200 instantly. |
| GET    | `/api/message` | Demo payload; shares the cold start (blocks until awake).          |
| POST   | `/reset`       | Re-arms the sleep — the demo's "simulate idle timeout" button.     |

All routes send `Access-Control-Allow-Origin` (default `*`) and answer
preflight `OPTIONS`. No credentials are used or needed.

## Run locally

```bash
# from the repo root (express/tsx are root devDependencies)
node --import tsx examples/demo-server/run.ts

# custom sleep / port / origin
SLEEP_MS=5000 PORT=4100 ALLOWED_ORIGIN=http://localhost:5173 \
  node --import tsx examples/demo-server/run.ts
```

Then in another shell:

```bash
time curl http://127.0.0.1:4100/health        # ~20s (cold start)
time curl http://127.0.0.1:4100/health        # instant
curl -X POST http://127.0.0.1:4100/reset      # re-arm
```

## Deploy to Render (free tier)

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. Render picks up
   [`render.yaml`](render.yaml) (free web service, `healthCheckPath: /health`).
3. After deploy, note the URL (e.g. `https://sai-demo-api.onrender.com`) and
   set it as `VITE_API_URL`/`VITE_HEALTH_URL` when building the
   [demo frontend](../demo/README.md).
4. Once the frontend is live, tighten `ALLOWED_ORIGIN` to its origin in the
   Render dashboard (Environment → env vars).

> Render's free plan sleeps after 15 minutes without inbound traffic and takes
> ~1 minute to wake — that genuine cold start is what the demo demonstrates.
> The `SLEEP_MS` arming is an additional, controllable simulation on top.
