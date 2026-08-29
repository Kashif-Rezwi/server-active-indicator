import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMonitor } from "../src/core/monitor";
import { __engineCount } from "../src/core/registry";
import { HEALTH_URL, pinJitter, res } from "./helpers";

describe("shared monitor registry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pinJitter();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(res(200))),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one engine for identical configs (one health loop)", async () => {
    const a = createMonitor({ healthUrl: HEALTH_URL });
    const b = createMonitor({ healthUrl: HEALTH_URL });
    expect(__engineCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(50);
    // One engine → exactly one fetch despite two consumers.
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
    expect(a.getSnapshot().status).toBe("active");
    expect(b.getSnapshot().status).toBe("active");

    a.destroy();
    b.destroy();
    expect(__engineCount()).toBe(0);
  });

  it("separates engines when behavioral config differs", () => {
    const a = createMonitor({ healthUrl: HEALTH_URL });
    const b = createMonitor({ healthUrl: HEALTH_URL, revealDelay: 1_000 });
    expect(__engineCount()).toBe(2);
    a.destroy();
    b.destroy();
    expect(__engineCount()).toBe(0);
  });

  it("keeps the engine alive until the last consumer releases it", async () => {
    const a = createMonitor({ healthUrl: HEALTH_URL });
    const b = createMonitor({ healthUrl: HEALTH_URL });
    await vi.advanceTimersByTimeAsync(50);

    a.destroy();
    expect(__engineCount()).toBe(1);
    // b still receives updates from the live engine.
    const seen: string[] = [];
    b.subscribe((s) => seen.push(s.status));
    b.refresh();
    await vi.advanceTimersByTimeAsync(50);
    expect(seen.length).toBeGreaterThan(0);

    b.destroy();
    expect(__engineCount()).toBe(0);
  });

  it("never shares custom checks without an explicit key", () => {
    const check = () => Promise.resolve(true);
    const a = createMonitor({ check });
    const b = createMonitor({ check });
    expect(__engineCount()).toBe(2);
    a.destroy();
    b.destroy();
  });

  it("shares custom checks that opt in via the same key", () => {
    const a = createMonitor({ check: () => Promise.resolve(true), key: "api" });
    const b = createMonitor({ check: () => Promise.resolve(false), key: "api" });
    expect(__engineCount()).toBe(1);
    a.destroy();
    b.destroy();
    expect(__engineCount()).toBe(0);
  });

  it("destroy() detaches the handle's listeners from the shared engine", async () => {
    const a = createMonitor({ healthUrl: HEALTH_URL });
    const b = createMonitor({ healthUrl: HEALTH_URL });
    const aSeen: string[] = [];
    const bSeen: string[] = [];
    a.subscribe((s) => aSeen.push(s.status));
    b.subscribe((s) => bSeen.push(s.status));

    a.destroy(); // a's listeners must go with the handle
    b.refresh();
    await vi.advanceTimersByTimeAsync(50);

    expect(aSeen.length).toBe(0);
    expect(bSeen.length).toBeGreaterThan(0);
    b.destroy();
  });

  it("destroy() is idempotent (second call is a no-op)", () => {
    const a = createMonitor({ healthUrl: HEALTH_URL });
    a.destroy();
    expect(() => a.destroy()).not.toThrow();
    expect(__engineCount()).toBe(0);
  });

  it("stops sharing once one of the differing options changes (e.g. headers)", () => {
    const a = createMonitor({ healthUrl: HEALTH_URL });
    const b = createMonitor({ healthUrl: HEALTH_URL, headers: { authorization: "Bearer x" } });
    expect(__engineCount()).toBe(2);
    a.destroy();
    b.destroy();
  });

  it("never shares different validate functions without an explicit key", () => {
    const validateA = () => true;
    const validateB = () => false;
    const a = createMonitor({ healthUrl: HEALTH_URL, validate: validateA });
    const b = createMonitor({ healthUrl: HEALTH_URL, validate: validateB });
    expect(__engineCount()).toBe(2);
    a.destroy();
    b.destroy();
    expect(__engineCount()).toBe(0);
  });

  it("shares validate functions that opt in via the same key", () => {
    const a = createMonitor({ healthUrl: HEALTH_URL, validate: () => true, key: "v1" });
    const b = createMonitor({ healthUrl: HEALTH_URL, validate: () => false, key: "v1" });
    expect(__engineCount()).toBe(1);
    a.destroy();
    b.destroy();
    expect(__engineCount()).toBe(0);
  });

  it("keys apart configs whose behavioral fields carry null/array values (JS callers)", () => {
    // `headers` is typed as a Record, but a plain-JS caller can pass anything;
    // stableStringify must tolerate null and array shapes without crashing and
    // simply produce distinct keys (a robustness pin, not an endorsement).
    const a = createMonitor({
      healthUrl: HEALTH_URL,
      headers: null as unknown as Record<string, string>,
    });
    const b = createMonitor({
      healthUrl: HEALTH_URL,
      headers: ["x"] as unknown as Record<string, string>,
    });
    expect(__engineCount()).toBe(2);
    a.destroy();
    b.destroy();
    expect(__engineCount()).toBe(0);
  });
});
