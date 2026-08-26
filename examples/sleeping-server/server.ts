/**
 * Simulated-sleeping-server fixture.
 *
 * A small Express server that mimics the cold-start behaviour of a free-tier
 * Render / Railway / Fly deployment:
 *
 *  - The first `GET /health` after boot (and after every `POST /reset`)
 *    intentionally sleeps for `SLEEP_MS` ms before responding 200. This
 *    simulates the wakeup of a sleeping container.
 *  - Every subsequent `GET /health` is instant.
 *  - `POST /reset` re-arms the sleep, so a test can iterate: wake → reset →
 *    wake again.
 *
 * USAGE (programmatic, for tests):
 *
 *   import { startServer } from "../examples/sleeping-server/server";
 *   const handle = await startServer({ port: 0, sleepMs: 250 });
 *   const m = createMonitor({ healthUrl: handle.healthUrl });
 *   // ... drive the engine ...
 *   await handle.close();
 *
 * USAGE (standalone, for the Phase 8 demo seed and manual exploration):
 *
 *   SLEEP_MS=3000 pnpm fixture:sleep-server
 *   # in another shell:
 *   time curl http://127.0.0.1:<port>/health   # ~3s, 200
 *   time curl http://127.0.0.1:<port>/health   # instant
 *   curl -X POST http://127.0.0.1:<port>/reset # re-arm
 *   time curl http://127.0.0.1:<port>/health   # ~3s, 200
 *
 * This is a devDependency-only fixture. Nothing here ships to consumers.
 */

import express, { type Express, type Request, type Response } from "express";

export interface StartServerOptions {
  /** Port to bind. Use `0` for an ephemeral port (the default). */
  port?: number;
  /** Initial sleep duration in ms. Default 20 000. */
  sleepMs?: number;
}

export interface SleepingServerHandle {
  /** Base URL of the server, e.g. `http://127.0.0.1:54321`. */
  url: string;
  /** `GET <url>/health` — the URL the monitor should point at. */
  healthUrl: string;
  /** Re-arm the sleep so the next `/health` call sleeps again. */
  reset(): Promise<void>;
  /** Stop the server. */
  close(): Promise<void>;
  /** Sleep duration in ms (read-only; mutated by `reset`). */
  readonly sleepMs: number;
}

export async function startServer(opts: StartServerOptions = {}): Promise<SleepingServerHandle> {
  const initialSleepMs = opts.sleepMs ?? Number(process.env.SLEEP_MS ?? 20_000);
  // Start disarmed: the first /health request arms the sleep. This is
  // closer to a real cold-start (a freshly-spun-up container takes time
  // to serve its first request, not just to bind a port). `reset()` and
  // the per-request "wake" re-arm with the same delay.
  let arm: Promise<void> | null = null;

  function ensureArmed(ms: number): Promise<void> {
    arm = new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
    return arm;
  }

  const app: Express = express();
  app.get("/health", async (_req: Request, res: Response) => {
    const start = Date.now();
    // Arm on first call; subsequent calls (until the next /reset) are instant.
    if (arm === null) {
      ensureArmed(initialSleepMs);
    }
    await arm;
    const elapsed = Date.now() - start;
    res.status(200).json({ ok: true, sleptForMs: elapsed });
  });

  app.post("/reset", async (_req: Request, res: Response) => {
    arm = null; // next /health will re-arm
    res.status(200).json({ reset: true, sleepMs: initialSleepMs });
  });

  const port = opts.port ?? Number(process.env.PORT ?? 0);
  const server = await new Promise<import("http").Server>((resolve, reject) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
    s.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("sleeping-server: could not bind to a port");
  }
  const url = `http://127.0.0.1:${address.port}`;

  const handle: SleepingServerHandle = {
    url,
    healthUrl: `${url}/health`,
    get sleepMs() {
      return initialSleepMs;
    },
    async reset() {
      arm = null; // next /health will re-arm with initialSleepMs
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };

  return handle;
}
