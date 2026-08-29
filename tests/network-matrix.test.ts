import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMonitor } from "../src/core/monitor";
import {
  HEALTH_URL,
  fetchAbortedOnly,
  fetchRejecting,
  fetchResolving,
  pinJitter,
  resetBrowserState,
  res,
} from "./helpers";

/**
 * Engine-level network-condition matrix (sibling to monitor/check tests): locked
 * decision 4 independence, honesty constraints, browser-offline, 4xx fast-path.
 */

let testUrlCounter = 0;
let testUrl = "";

describe("network matrix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pinJitter();
    testUrl = `${HEALTH_URL}?nm=${testUrlCounter++}`;
  });
  afterEach(() => {
    vi.useRealTimers();
    // Restore jsdom's defaults so the next test starts from a clean slate.
    resetBrowserState();
  });

  // ─── Locked decision 4: revealDelay vs timeout are independent ─────────

  it("locked decision 4: slow response UNDER revealDelay never enters waking", async () => {
    // 2s request, 3s reveal. Engine should NOT promote checking → waking,
    // because the request resolved before the reveal threshold.
    vi.stubGlobal("fetch", fetchResolving(2_000, 200));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 3_000, timeout: 10_000 });
    await vi.advanceTimersByTimeAsync(2_100);
    const s = m.getSnapshot();
    expect(s.status).toBe("active");
    expect(s.wasCold).toBe(false); // no waking emission ever — the cold flag stays unset
    m.destroy();
  });

  it("locked decision 4: slow response OVER revealDelay → waking(reason=slow-response) → active", async () => {
    // 4s request, 3s reveal, 10s timeout: resolves within the timeout, but the
    // reveal timer already fired → waking with reason slow-response.
    vi.stubGlobal("fetch", fetchResolving(4_000, 200));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 3_000, timeout: 10_000 });
    await vi.advanceTimersByTimeAsync(3_100);
    expect(m.getSnapshot().status).toBe("waking");
    expect(m.getSnapshot().reason).toBe("slow-response");
    await vi.advanceTimersByTimeAsync(1_100); // request resolves at t≈4000
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });

  it("locked decision 4: per-attempt timeout is honored by the underlying check (verify via the check path)", async () => {
    // The per-attempt `timeout` is exercised in check.test.ts; fake timers can't
    // drive AbortSignal.timeout, so simulate the outcome and assert classification.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "TimeoutError")));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 5_000, timeout: 1_000 });
    await vi.advanceTimersByTimeAsync(60);
    const s = m.getSnapshot();
    expect(s.status).toBe("waking");
    // TimeoutError carries no `reason` → defaultCheck falls back to
    // request-failed (same bucket as DNS / CORS / network failures).
    expect(s.reason).toBe("request-failed");
    m.destroy();
  });

  // ─── Honesty constraint: DNS / CORS / network are indistinguishable ────

  it("honesty: continuous DNS/CORS failure → waking → active on recovery (no sleeping state)", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            call += 1;
            setTimeout(
              () => (call < 3 ? reject(new TypeError("Failed to fetch")) : resolve(res(200))),
              50,
            );
          }),
      ),
    );
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 5_000,
      backoffFactor: 1,
    });
    await vi.advanceTimersByTimeAsync(60);
    expect(m.getSnapshot().status).toBe("waking");
    expect(m.getSnapshot().reason).toBe("request-failed");
    await vi.advanceTimersByTimeAsync(5_100);
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(5_100);
    const s = m.getSnapshot();
    expect(s.status).toBe("active");
    expect(s.wasCold).toBe(true);
    m.destroy();
  });

  it("honesty: CORS-block and DNS-fail collapse to the same outcome (no `sleeping` state exists)", async () => {
    // Two engines, one rejecting a CORS-shaped error, one a DNS-shaped error:
    // both end up in the same place (locked decision 2 — a browser can't tell).
    const urlCors = `${testUrl}-cors`;
    const urlDns = `${testUrl}-dns`;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("CORS preflight failed")));
    const mCors = createMonitor({
      healthUrl: urlCors,
      revealDelay: 10,
      pollInterval: 5_000,
      backoffFactor: 1,
    });
    await vi.advanceTimersByTimeAsync(60);
    const corsState = mCors.getSnapshot();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("getaddrinfo ENOTFOUND")));
    const mDns = createMonitor({
      healthUrl: urlDns,
      revealDelay: 10,
      pollInterval: 5_000,
      backoffFactor: 1,
    });
    await vi.advanceTimersByTimeAsync(60);
    const dnsState = mDns.getSnapshot();

    expect(corsState.status).toBe(dnsState.status);
    expect(corsState.reason).toBe(dnsState.reason);
    expect(corsState.reason).toBe("request-failed");

    mCors.destroy();
    mDns.destroy();
  });

  // ─── Browser-offline: navigator.onLine is polled at attempt/result time,
  // ─── never via an `offline` event (that's the documented contract) ─────

  it("browser-offline: navigator.onLine=false at construction → offline(browser) without making a fetch", async () => {
    const fetchMock = fetchResolving(50, 200);
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
    await vi.advanceTimersByTimeAsync(60);
    const s = m.getSnapshot();
    expect(s.status).toBe("offline");
    expect(s.offlineKind).toBe("browser");
    expect(fetchMock).not.toHaveBeenCalled(); // dispatch-time check short-circuits
    m.destroy();
  });

  it("browser-offline: navigator flips to offline mid-warm → nothing happens until an attempt", async () => {
    // No event subscription: the engine only learns about connectivity when it
    // next attempts. With activeCheckInterval=0 (default) that's never.
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("active");

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    // Status unchanged: engine hasn't tried again, so it doesn't know.
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });

  it("browser-offline mid-episode: the next scheduled attempt short-circuits to offline(browser)", async () => {
    // Dispatch-time check again, now during a waking episode: fail once, flip
    // the browser offline, and the next poll must not even dispatch a fetch.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 1_000,
      backoffFactor: 1,
      offlineAfter: 60_000,
    });
    await vi.advanceTimersByTimeAsync(60); // first attempt fails → waking
    expect(m.getSnapshot().status).toBe("waking");
    expect(m.getSnapshot().reason).toBe("request-failed");

    const calls = vi.mocked(fetch).mock.calls.length;
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await vi.advanceTimersByTimeAsync(1_100);
    const s = m.getSnapshot();
    expect(s.status).toBe("offline");
    expect(s.offlineKind).toBe("browser");
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls); // short-circuited: no fetch dispatched
    m.destroy();
  });

  it("browser-offline mid-flight: the failure classifies as offline(browser) at result time", async () => {
    // Result-time check (the `isBrowserOffline()` branch inside onResult): the
    // attempt was dispatched while online, but the browser dropped connectivity
    // before the fetch settled — offline(browser), not waking.
    vi.stubGlobal("fetch", fetchRejecting(200));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10_000 });
    await vi.advanceTimersByTimeAsync(50); // attempt dispatched, still in flight
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await vi.advanceTimersByTimeAsync(300); // fetch rejects at t=200; offline at result time
    expect(m.getSnapshot().status).toBe("offline");
    expect(m.getSnapshot().offlineKind).toBe("browser");
    m.destroy();
  });

  // ─── 4xx is a fast-path (no waking limbo) ─────────────────────────────

  it("4xx on the health endpoint is a misconfiguration, not a cold start: → offline immediately", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 404));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
    await vi.advanceTimersByTimeAsync(100);
    const s = m.getSnapshot();
    expect(s.status).toBe("offline");
    expect(s.reason).toBe("http-error");
    expect(s.offlineKind).toBe("server");
    m.destroy();
  });

  // ─── Locked decision 5: waking is time-bounded ────────────────────────

  it("locked decision 5: waking is bounded by offlineAfter → offline(server)", async () => {
    // Failure for the full duration: after offlineAfter elapses, the
    // engine gives up. No `sleeping` limbo, ever.
    vi.stubGlobal("fetch", fetchRejecting(50));
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 1_000,
      offlineAfter: 2_000,
      backoffFactor: 1,
    });
    await vi.advanceTimersByTimeAsync(60);
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(3_000); // cross offlineAfter
    const s = m.getSnapshot();
    expect(s.status).toBe("offline");
    expect(s.offlineKind).toBe("server");
    m.destroy();
  });

  // ─── Legacy browsers: the engine must settle without modern AbortSignal APIs ───

  it("legacy browser without AbortSignal.any: checks still work and reach active", async () => {
    // Chrome <116 / Safari <17.4 / Firefox <124 lack AbortSignal.any; the
    // fallback must never leave the engine stuck in-flight.
    const originalAny = AbortSignal.any;
    // @ts-expect-error — simulating a legacy runtime
    delete AbortSignal.any;
    try {
      vi.stubGlobal("fetch", fetchResolving(50, 200));
      const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
      await vi.advanceTimersByTimeAsync(100);
      expect(m.getSnapshot().status).toBe("active");
      m.destroy();
    } finally {
      AbortSignal.any = originalAny;
    }
  });

  it("legacy browser without AbortSignal.timeout: the per-attempt timeout still bounds requests", async () => {
    const originalTimeout = AbortSignal.timeout;
    // @ts-expect-error — simulating a legacy runtime
    delete AbortSignal.timeout;
    try {
      vi.stubGlobal("fetch", fetchAbortedOnly());
      const m = createMonitor({
        healthUrl: testUrl,
        revealDelay: 10,
        timeout: 500,
        pollInterval: 1_000,
        backoffFactor: 1,
      });
      await vi.advanceTimersByTimeAsync(600); // manual fallback timer fires at t=500
      expect(m.getSnapshot().status).toBe("waking");
      expect(m.getSnapshot().reason).toBe("request-failed");
      m.destroy();
    } finally {
      AbortSignal.timeout = originalTimeout;
    }
  });

  it("worst case: no usable AbortController at all — attempts degrade to unsignaled fetches", async () => {
    // Degraded environment: even `new AbortController()` throws. The engine
    // must still settle every attempt — here it reaches active without a signal.
    const originalTimeout = AbortSignal.timeout;
    const originalAny = AbortSignal.any;
    // @ts-expect-error — simulating the worst-case runtime
    delete AbortSignal.timeout;
    // @ts-expect-error — simulating the worst-case runtime
    delete AbortSignal.any;
    vi.stubGlobal(
      "AbortController",
      class {
        constructor() {
          throw new Error("no abort machinery");
        }
      },
    );
    try {
      vi.stubGlobal("fetch", fetchResolving(50, 200));
      const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
      await vi.advanceTimersByTimeAsync(100);
      expect(m.getSnapshot().status).toBe("active");
      m.destroy();
    } finally {
      AbortSignal.timeout = originalTimeout;
      AbortSignal.any = originalAny;
      vi.unstubAllGlobals();
    }
  });

  // ─── Browser-offline recovery via the window `online` event ────────────

  it("browser-offline recovers automatically on the window online event", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
    await vi.advanceTimersByTimeAsync(60);
    expect(m.getSnapshot().status).toBe("offline");
    expect(m.getSnapshot().offlineKind).toBe("browser");

    // Reconnect: the browser fires `online`; the engine re-checks immediately.
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    window.dispatchEvent(new Event("online"));
    expect(m.getSnapshot().status).toBe("checking");
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });

  it("server-offline ignores the online event (recovery stays manual)", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 404)); // 4xx → offline(server)
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("offline");
    expect(m.getSnapshot().offlineKind).toBe("server");

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(500);
    expect(m.getSnapshot().status).toBe("offline"); // unchanged: manual Retry only
    m.destroy();
  });
});
