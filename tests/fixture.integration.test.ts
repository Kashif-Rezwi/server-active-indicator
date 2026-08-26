/**
 * Real-network integration test (Phase 6).
 *
 * This is the *only* suite in the repo that does NOT mock `fetch`. It boots
 * the sleeping-server fixture on an ephemeral port and drives a real
 * `createMonitor` through a real cold start: real TCP, real DNS (well,
 * localhost), real `AbortSignal.timeout`. The point is to prove the full
 * stack works end-to-end at least once, because every other test stubs
 * the network.
 *
 * Real timers. Real network. No fake clock.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startServer } from "../examples/sleeping-server/server";
import type { SleepingServerHandle } from "../examples/sleeping-server/server";

import { createMonitor } from "../src/core/monitor";
import { __engineCount } from "../src/core/registry";

/** Hard per-test wall-clock cap so a wedged fixture can't hang the suite. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ]);
}

describe("sleeping-server fixture (real fetch)", () => {
  let server: SleepingServerHandle | null = null;

  beforeEach(async () => {
    // Sleep is shorter than the engine's revealDelay (3s) so the engine
    // actually enters `waking` before the request resolves. 1.2s gives
    // us ~1.8s of `waking` time, plenty of margin for CI.
    server = await withTimeout(startServer({ port: 0, sleepMs: 1_200 }), 5_000, "startServer");
  });

  afterEach(async () => {
    if (__engineCount() !== 0) {
      // Help debugging by listing the leaked URL-equivalents via a quick sweep.
      throw new Error(`leaked ${__engineCount()} engine(s) into the registry`);
    }
    if (server) {
      await server.close();
      server = null;
    }
  });

  it("cold start: checking → waking (after revealDelay) → active on real wakeup", async () => {
    expect(server).not.toBeNull();
    const m = createMonitor({
      healthUrl: server!.healthUrl,
      revealDelay: 300,
      pollInterval: 1_000,
      backoffFactor: 1,
      successDisplayMs: 1_000,
      timeout: 5_000,
    });
    try {
      // The initial `checking` emission happens synchronously inside
      // createEngine, before any subscribe() can attach, so capture the
      // starting status directly from the snapshot.
      const seen: string[] = [m.getSnapshot().status];
      m.subscribe((s) => seen.push(s.status));

      // Wait for active (or up to 6s).
      await withTimeout(
        new Promise<void>((resolve) => {
          const start = Date.now();
          const tick = setInterval(() => {
            if (m.getSnapshot().status === "active" || Date.now() - start > 6_000) {
              clearInterval(tick);
              resolve();
            }
          }, 20);
        }),
        8_000,
        "cold start",
      );

      const s = m.getSnapshot();
      expect(s.status).toBe("active");
      expect(s.wasCold).toBe(true);
      expect(seen).toContain("checking");
      expect(seen).toContain("waking");
      expect(seen).toContain("active");
      // Waking must come *before* active, in the order observed.
      expect(seen.indexOf("waking")).toBeLessThan(seen.indexOf("active"));
    } finally {
      m.destroy();
    }
  });

  it("warm ping: server is already awake → checking → active, no waking", async () => {
    expect(server).not.toBeNull();
    // Prime the server: the first /health wakes it; subsequent ones are instant.
    await withTimeout(fetch(server!.healthUrl), 5_000, "prime");

    const m = createMonitor({
      healthUrl: server!.healthUrl,
      revealDelay: 300,
      pollInterval: 1_000,
      backoffFactor: 1,
      timeout: 5_000,
    });
    try {
      // Capture the synchronous initial state.
      const seen: string[] = [m.getSnapshot().status];
      m.subscribe((s) => seen.push(s.status));

      await withTimeout(
        new Promise<void>((resolve) => {
          const start = Date.now();
          const tick = setInterval(() => {
            if (m.getSnapshot().status === "active" || Date.now() - start > 4_000) {
              clearInterval(tick);
              resolve();
            }
          }, 20);
        }),
        6_000,
        "warm ping",
      );

      expect(m.getSnapshot().status).toBe("active");
      expect(m.getSnapshot().wasCold).toBe(false);
      // The warm path must NOT have shown waking. This is the
      // "silence on success" product rule, observed against a real network.
      expect(seen).not.toContain("waking");
    } finally {
      m.destroy();
    }
  });

  it("re-sleep: /reset re-arms the server; the next /health sleeps again", async () => {
    expect(server).not.toBeNull();
    // Wake the server.
    await withTimeout(fetch(server!.healthUrl), 5_000, "wake");

    // Confirm warm.
    const warmStart = Date.now();
    await withTimeout(fetch(server!.healthUrl), 2_000, "warm probe");
    expect(Date.now() - warmStart).toBeLessThan(500);

    // Reset → server should sleep again.
    await withTimeout(fetch(`${server!.url}/reset`, { method: "POST" }), 2_000, "reset");
    const coldStart = Date.now();
    const res = await withTimeout(fetch(server!.healthUrl), 5_000, "post-reset probe");
    const elapsed = Date.now() - coldStart;
    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThan(800); // should have slept the full 1200ms
  });
});
