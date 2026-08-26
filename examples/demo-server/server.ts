/**
 * Demo API for the Phase 8 live demo.
 *
 * Deployable counterpart of the `sleeping-server` test fixture: same
 * sleep/wake semantics (first request after boot or `/reset` sleeps, then
 * instant), plus the two things a cross-origin demo needs:
 *
 *  - Real CORS headers (the frontend is a static site on another origin).
 *  - A "real app" endpoint (`GET /api/message`) that shares the cold start,
 *    so the demo can show app-level latency next to the indicator banner.
 *
 * Routes:
 *   GET  /health       → { ok: true, sleptForMs }   (the indicator's target)
 *   GET  /api/message  → { message, servedAt }      (demo data fetch)
 *   POST /reset        → re-arm the sleep           ("simulate idle timeout")
 *
 * Environment:
 *   PORT           default 4100
 *   SLEEP_MS       default 20 000 (Render free-tier wake is ~60s; 20s demos well)
 *   ALLOWED_ORIGIN default "*"  (health/message are public, credential-free)
 *
 * This is a devDependency-only example. Nothing here ships to consumers.
 */

import express, { type Express, type NextFunction, type Request, type Response } from "express";

export interface StartDemoServerOptions {
  /** Port to bind. Default: `PORT` env or 4100. Use `0` for ephemeral. */
  port?: number;
  /** Cold-start sleep duration in ms. Default: `SLEEP_MS` env or 20 000. */
  sleepMs?: number;
  /** Value for `Access-Control-Allow-Origin`. Default: `ALLOWED_ORIGIN` env or "*". */
  allowedOrigin?: string;
}

export interface DemoServerHandle {
  /** Base URL of the server, e.g. `http://127.0.0.1:4100`. */
  url: string;
  /** `GET <url>/health` — point the indicator at this. */
  healthUrl: string;
  /** `GET <url>/api/message` — the demo's data endpoint. */
  apiUrl: string;
  /** Re-arm the sleep so the next request cold-starts again. */
  reset(): Promise<void>;
  /** Stop the server. */
  close(): Promise<void>;
  /** Configured sleep duration in ms. */
  readonly sleepMs: number;
}

export async function startDemoServer(
  opts: StartDemoServerOptions = {},
): Promise<DemoServerHandle> {
  const sleepMs = opts.sleepMs ?? Number(process.env.SLEEP_MS ?? 20_000);
  const allowedOrigin = opts.allowedOrigin ?? process.env.ALLOWED_ORIGIN ?? "*";

  // Arm-on-first-request semantics: a freshly-spun-up container takes time to
  // serve its first request, not just to bind a port. `reset()` re-arms.
  let arm: Promise<void> | null = null;

  function ensureArmed(): Promise<void> {
    if (arm === null) {
      arm = new Promise<void>((resolve) => setTimeout(resolve, sleepMs));
    }
    return arm;
  }

  const app: Express = express();

  // CORS for the cross-origin static frontend. Public GET/POST, no credentials.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/health", async (_req: Request, res: Response) => {
    const start = Date.now();
    await ensureArmed();
    res.status(200).json({ ok: true, sleptForMs: Date.now() - start });
  });

  app.get("/api/message", async (_req: Request, res: Response) => {
    await ensureArmed();
    res.status(200).json({
      message: "Hello from the demo API — the server is awake.",
      servedAt: new Date().toISOString(),
    });
  });

  app.post("/reset", (_req: Request, res: Response) => {
    arm = null; // next request re-arms with sleepMs
    res.status(200).json({ reset: true, sleepMs });
  });

  const port = opts.port ?? Number(process.env.PORT ?? 4100);
  const host = process.env.HOST ?? "0.0.0.0"; // Render requires binding 0.0.0.0
  const server = await new Promise<import("http").Server>((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("demo-server: could not bind to a port");
  }
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    healthUrl: `${url}/health`,
    apiUrl: `${url}/api/message`,
    get sleepMs() {
      return sleepMs;
    },
    async reset() {
      arm = null;
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
