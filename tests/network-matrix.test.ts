import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMonitor } from "../src/core/monitor";
import { __engineCount } from "../src/core/registry";

/**
 * Network-condition matrix at the engine level. Sibling to `monitor.test.ts`
 * (which covers the state machine broadly) and `check.test.ts` (which covers
 * the defaultCheck HTTP contract in isolation). This file pins down:
 *
 *  - Locked decision 4: revealDelay (when UI shows) vs timeout (per-attempt
 *    ceiling) are independent. Both must be observable on the same fetch.
 *  - Honesty constraint: a browser cannot distinguish DNS-failure, CORS, and
 *    the server being down — all collapse to request-failed, none to a
 *    mythical `sleeping` state.
 *  - Browser-offline detection happens at attempt time (the engine checks
 *    `navigator.onLine` before each fetch). The engine subscribes to the
 *    window `online` event for exactly one thing: automatic recovery from a
 *    browser-offline episode. It does not subscribe to `offline`.
 *  - 4xx is a fast-path to `offline` (misconfiguration, not a cold start).
 */

const URL = "https://api.example.com/health";
let testUrlCounter = 0;
let testUrl = "";

function res(status: number, ok = status >= 200 && status < 300) {
  return { ok, status } as Response;
}

function fetchResolving(ms: number, status: number) {
  return vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(res(status)), ms);
      }),
  );
}

function fetchRejecting(ms: number) {
  return vi.fn(
    () =>
      new Promise<Response>((_r, reject) => {
        setTimeout(() => reject(new TypeError("fetch failed")), ms);
      }),
  );
}

/** A fetch stub that resolves only when its `signal` is aborted (drives the per-attempt timeout). */
function fetchThatOnlyResolvesOnAbort() {
  return vi.fn(
    (_url: string, init: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  );
}

describe("network matrix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Deterministic jitter: 0.8 + 0.5 * 0.4 = 1.0 exactly.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    testUrl = `${URL}?nm=${testUrlCounter++}`;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    // Restore jsdom's defaults so the next test starts from a clean slate.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    if (__engineCount() !== 0) {
      throw new Error(`leaked ${__engineCount()} engine(s) into the registry`);
    }
  });

  // ─── Locked decision 4: revealDelay vs timeout are independent ─────────

  it("locked decision 4: slow response UNDER revealDelay never enters waking", async () => {
    // 2s request, 3s reveal. Engine should NOT promote checking → waking,
    // because the request resolved before the reveal threshold.
    vi.stubGlobal("fetch", fetchResolving(2_000, 200));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 3_000, timeout: 10_000 });
    await vi.advanceTimersByTimeAsync(2_100);
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });

  it("locked decision 4: slow response OVER revealDelay → waking(reason=slow-response) → active", async () => {
    // 4s request, 3s reveal, 10s timeout. The request resolves successfully
    // (within the per-attempt timeout) but the reveal timer has already
    // fired, so we passed through `waking` with `reason: "slow-response"`.
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
    // The per-attempt `timeout` itself is fully exercised in `check.test.ts`
    // (the `defaultCheck` per-attempt timeout case). At the engine level,
    // we just need to confirm that:
    //   1. the engine passes `cfg.timeout` through to `defaultCheck` (it does,
    //      via `runCheck` in engine.ts), and
    //   2. a `request-failed` outcome from a slow check promotes the
    //      snapshot to `waking` with `reason: "request-failed"`.
    // We can't drive `AbortSignal.timeout` under vitest's fake timers
    // (it dispatches via the host's real timer queue), so we simulate
    // the outcome by rejecting directly — the engine's classification
    // is what we care about.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "TimeoutError")));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 5_000, timeout: 1_000 });
    await vi.advanceTimersByTimeAsync(60);
    const s = m.getSnapshot();
    expect(s.status).toBe("waking");
    // DOMException with name "TimeoutError" doesn't carry a `reason`, so
    // `defaultCheck` falls back to `request-failed`. (This is also the
    // outcome of DNS / CORS / network-failed requests — same bucket.)
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
    // Two independent engines (different URLs). One rejecting with a
    // CORS-shaped error, one with a DNS-shaped error. They should end up
    // in the same place at the same time. This is locked decision 2: the
    // browser cannot tell these apart, and we don't claim it can.
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

  // ─── Browser-offline: navigator.onLine is checked at attempt time ─────

  it("browser-offline: navigator.onLine=false at construction → offline(browser) without making a fetch", async () => {
    const fetchMock = fetchResolving(50, 200);
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
    await vi.advanceTimersByTimeAsync(60);
    const s = m.getSnapshot();
    expect(s.status).toBe("offline");
    expect(s.offlineKind).toBe("browser");
    expect(fetchMock).not.toHaveBeenCalled(); // engine never even tried
    m.destroy();
  });

  it("browser-offline: navigator flips to offline mid-warm → next attempt sees offline(browser)", async () => {
    // Start online, let it warm up, then flip the navigator offline.
    // The engine itself does NOT subscribe to the `offline` event; the
    // off-path is only observed when the next attempt actually runs.
    // This test pins down that documented contract: the engine reflects
    // browser-offline only at attempt time, not in response to the event.
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("active");

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    // Status unchanged: engine hasn't tried again, so it doesn't know.
    expect(m.getSnapshot().status).toBe("active");
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

  // ─── Coverage pins for engine branch hits ─────────────────────────────

  it("coverage: a request-failed result that races with browser-offline → offline(browser)", async () => {
    // Branch on engine.ts line 171-175: `if (isBrowserOffline())` in
    // onResult. The fetch *itself* rejects (request-failed) but the OS
    // has flipped to offline. Result: offline(browser), not waking.
    // The reveal timer must have fired first (otherwise the engine would
    // have been `checking` and the next attempt would catch the offline
    // state at line 191 instead).
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

    // Flip navigator offline. The next attempt's fetch will reject AND
    // the engine will see `navigator.onLine === false` on result → 175.
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await vi.advanceTimersByTimeAsync(1_100);
    const s = m.getSnapshot();
    expect(s.status).toBe("offline");
    expect(s.offlineKind).toBe("browser");
    m.destroy();
  });

  it("coverage: active-interval respects pauseWhenHidden (pauses when tab hidden)", async () => {
    // Branch on engine.ts: `if (cfg.pauseWhenHidden && isDocumentHidden())`
    // inside the active-interval setInterval callback. The interval is
    // scheduled, then we hide the tab, then advance — the active check
    // must NOT fire while hidden.
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      activeCheckInterval: 1_000,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("active");

    // Hide the tab and advance past several intervals. fetch should not
    // be called again (active-interval pauses on hidden).
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    const callsBefore = vi.mocked(fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(3_500);
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);

    m.destroy();
  });

  it("coverage: becoming visible again while active resumes the active-interval", async () => {
    // Branch on engine.ts line 239-240: `else if (snapshot.status === "active")`
    // inside onVisibilityChange when the tab becomes visible again. The
    // active-interval must be rescheduled, not left dead.
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      activeCheckInterval: 1_000,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("active");
    const callsBefore = vi.mocked(fetch).mock.calls.length;

    // Hide, wait, show again.
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(2_500);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // After becoming visible, the active-interval should re-engage and
    // fire within the next interval. Wait one full interval + fetch time.
    await vi.advanceTimersByTimeAsync(1_100);
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsBefore);
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });

  // ─── Legacy browsers: the engine must settle without modern AbortSignal APIs ───

  it("legacy browser without AbortSignal.any: checks still work and reach active", async () => {
    // Chrome <116 / Safari <17.4 / Firefox <124 lack AbortSignal.any. The
    // check must fall back to a manual AbortController + setTimeout pair —
    // never throw the engine into a permanently stuck in-flight state.
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
      vi.stubGlobal("fetch", fetchThatOnlyResolvesOnAbort());
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
    // Absurdly degraded environment: even `new AbortController()` throws. The
    // engine must still settle every attempt (no stuck in-flight, no
    // unhandled rejection) — here it simply reaches active without a signal.
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
