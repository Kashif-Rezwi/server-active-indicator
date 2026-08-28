import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMonitor } from "../src/core/monitor";
import { __engineCount } from "../src/core/registry";
import type { MonitorSnapshot } from "../src/core/types";

const URL = "https://api.example.com/health";
let testUrlCounter = 0;

/** Collect every snapshot a monitor emits. */
function track(m: ReturnType<typeof createMonitor>) {
  const seen: MonitorSnapshot[] = [];
  m.subscribe((s) => seen.push(s));
  return seen;
}

function res(status: number, ok = status >= 200 && status < 300) {
  return { ok, status } as Response;
}

/** A fetch mock that resolves after `ms` with the given status. */
function fetchResolving(ms: number, status: number) {
  return vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(res(status)), ms);
      }),
  );
}

/** A fetch mock that rejects after `ms` (network/CORS/DNS failure). */
function fetchRejecting(ms: number) {
  return vi.fn(
    () =>
      new Promise<Response>((_r, reject) => {
        setTimeout(() => reject(new TypeError("fetch failed")), ms);
      }),
  );
}

describe("createMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Deterministic jitter: 0.8 + 0.5 * 0.4 = 1.0 exactly.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws without healthUrl or check", () => {
    expect(() => createMonitor({})).toThrow(/healthUrl.*check/);
    expect(__engineCount()).toBe(0); // the throw must not leak an engine
  });

  it("warm first ping: unknown → checking → active, wasCold=false", async () => {
    vi.stubGlobal("fetch", fetchResolving(100, 200));
    const m = createMonitor({ healthUrl: URL });
    const seen = track(m);

    expect(m.getSnapshot().status).toBe("checking");
    await vi.advanceTimersByTimeAsync(150);

    const s = m.getSnapshot();
    expect(s.status).toBe("active");
    expect(s.wasCold).toBe(false);
    expect(s.attempts).toBe(1);
    expect(s.lastLatencyMs).toBeGreaterThanOrEqual(100);
    // Never passed through waking.
    expect(seen.some((x) => x.status === "waking")).toBe(false);
    m.destroy();
  });

  it("cold start: checking → waking (after revealDelay) → active on recovery, wasCold=true", async () => {
    // Fail the first two attempts, succeed on the third.
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            call += 1;
            setTimeout(() => (call < 3 ? reject(new TypeError("down")) : resolve(res(200))), 50);
          }),
      ),
    );
    const m = createMonitor({
      healthUrl: URL,
      revealDelay: 3_000,
      pollInterval: 5_000,
      backoffFactor: 1,
    });
    const seen = track(m);

    await vi.advanceTimersByTimeAsync(60); // first attempt fails
    expect(m.getSnapshot().status).toBe("waking");
    expect(m.getSnapshot().wasCold).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000 + 60); // second attempt fails
    expect(m.getSnapshot().status).toBe("waking");

    await vi.advanceTimersByTimeAsync(5_000 + 60); // third attempt succeeds
    const s = m.getSnapshot();
    expect(s.status).toBe("active");
    expect(s.wasCold).toBe(true);
    expect(seen.some((x) => x.status === "waking")).toBe(true);
    m.destroy();
  });

  it("shows waking only after revealDelay, not before", async () => {
    vi.stubGlobal("fetch", fetchResolving(2_000, 200)); // slower than nothing, faster than 3s reveal
    const m = createMonitor({ healthUrl: URL, revealDelay: 3_000 });
    const seen = track(m);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.getSnapshot().status).toBe("checking"); // still within revealDelay
    await vi.advanceTimersByTimeAsync(1_500);
    expect(m.getSnapshot().status).toBe("active");
    expect(seen.some((x) => x.status === "waking")).toBe(false); // resolved before reveal
    m.destroy();
  });

  it("4xx fast-paths to offline with reason http-error", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 404));
    const m = createMonitor({ healthUrl: URL });
    await vi.advanceTimersByTimeAsync(100);

    const s = m.getSnapshot();
    expect(s.status).toBe("offline");
    expect(s.reason).toBe("http-error");
    expect(s.offlineKind).toBe("server");
    m.destroy();
  });

  it("5xx keeps polling (Railway 502-on-wake), recovers on success", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            call += 1;
            setTimeout(() => resolve(call === 1 ? res(502, false) : res(200)), 50);
          }),
      ),
    );
    const m = createMonitor({
      healthUrl: URL,
      revealDelay: 10,
      pollInterval: 5_000,
      backoffFactor: 1,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("waking"); // 502 is request-failed → waking
    await vi.advanceTimersByTimeAsync(5_000 + 100);
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });

  it("bounds waking by offlineAfter → offline", async () => {
    vi.stubGlobal("fetch", fetchRejecting(50));
    const m = createMonitor({
      healthUrl: URL,
      revealDelay: 100,
      pollInterval: 1_000,
      offlineAfter: 3_000,
      backoffFactor: 1,
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(4_000); // exceed offlineAfter
    expect(m.getSnapshot().status).toBe("offline");
    expect(m.getSnapshot().offlineKind).toBe("server");
    m.destroy();
  });

  it("browser offline → offline with offlineKind browser", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const m = createMonitor({ healthUrl: URL });
    await vi.advanceTimersByTimeAsync(10);
    expect(m.getSnapshot().status).toBe("offline");
    expect(m.getSnapshot().offlineKind).toBe("browser");
    onLine.mockRestore();
    m.destroy();
  });

  it("refresh() recovers from offline", async () => {
    vi.stubGlobal("fetch", fetchRejecting(50));
    const m = createMonitor({
      healthUrl: URL,
      revealDelay: 100,
      pollInterval: 500,
      offlineAfter: 1_000,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(m.getSnapshot().status).toBe("offline");

    vi.stubGlobal("fetch", fetchResolving(50, 200));
    m.refresh();
    expect(m.getSnapshot().status).toBe("checking");
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });

  it("elapsedSeconds ticks while waking and stops after active", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            call += 1;
            setTimeout(() => (call < 3 ? reject(new TypeError("down")) : resolve(res(200))), 50);
          }),
      ),
    );
    const m = createMonitor({
      healthUrl: URL,
      revealDelay: 100,
      pollInterval: 5_000,
      backoffFactor: 1,
    });
    await vi.advanceTimersByTimeAsync(200); // first fail → waking (episode clock starts at t=50)
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(3_000); // ~3s of ticking (clock started at t=50 → 2 full s)
    expect(m.getSnapshot().elapsedSeconds).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(2_000); // reach the second poll (t≈5050) → still waking
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(5_000 + 100); // third poll (t≈10050) → active
    expect(m.getSnapshot().status).toBe("active");
    // The ticker is cleared on the transition to active; confirm elapsed stops advancing.
    await vi.advanceTimersByTimeAsync(1_100);
    const frozen = m.getSnapshot().elapsedSeconds;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(m.getSnapshot().elapsedSeconds).toBe(frozen); // stopped after active
    m.destroy();
  });

  it("destroy() mid-flight stops everything and notifies no more", async () => {
    vi.stubGlobal("fetch", fetchResolving(5_000, 200));
    const m = createMonitor({ healthUrl: URL });
    const seen = track(m);
    const countBefore = seen.length;
    m.destroy();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen.length).toBe(countBefore); // no emissions after destroy
    expect(m.getSnapshot().status).not.toBe("active");
  });

  it("uses a custom check() when provided (overrides healthUrl)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let call = 0;
    const check = vi.fn(async () => {
      call += 1;
      return call < 2 ? false : true;
    });
    const m = createMonitor({ check, healthUrl: URL, revealDelay: 50, pollInterval: 500 });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(600);
    expect(m.getSnapshot().status).toBe("active");
    expect(check).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled(); // custom check won over healthUrl
    m.destroy();
  });

  it("a custom check that never resolves is bounded by timeout → waking → offline", async () => {
    const check = vi.fn(() => new Promise<boolean>(() => {})); // hangs forever
    const m = createMonitor({
      check,
      timeout: 500,
      revealDelay: 100,
      pollInterval: 1_000,
      offlineAfter: 2_000,
      backoffFactor: 1,
    });
    await vi.advanceTimersByTimeAsync(600); // attempt hangs; timeout fires at t=500 → request-failed
    expect(m.getSnapshot().status).toBe("waking");
    expect(m.getSnapshot().reason).toBe("request-failed");
    await vi.advanceTimersByTimeAsync(3_000); // retries keep timing out; offlineAfter bounds the episode
    expect(m.getSnapshot().status).toBe("offline");
    expect(m.getSnapshot().offlineKind).toBe("server");
    expect(check.mock.calls.length).toBeGreaterThanOrEqual(2); // it retried, then gave up
    m.destroy();
  });

  it("a custom check that throws synchronously fails the attempt but never wedges the engine", async () => {
    let call = 0;
    const check = vi.fn(() => {
      call += 1;
      if (call < 3) throw new Error("boom");
      return Promise.resolve(true);
    });
    const m = createMonitor({ check, revealDelay: 10, pollInterval: 500, backoffFactor: 1 });
    await vi.advanceTimersByTimeAsync(60); // first attempt throws → request-failed → waking
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(1_200); // attempts 2 (throws) and 3 (succeeds)
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });
});

describe("phase 3 policies", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Deterministic jitter: 0.8 + 0.5 * 0.4 = 1.0 exactly.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  // Unique healthUrl per test → a fresh, isolated engine (no cross-test sharing).
  // Generated AFTER the random spy so it doesn't consume the pinned 0.5 sequence.
  let testUrl = "";
  beforeEach(() => {
    testUrl = `${URL}?t=${testUrlCounter++}`;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    // Restore jsdom's default visibility if a test overrode it.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    if (__engineCount() !== 0) {
      throw new Error(`leaked ${__engineCount()} engine(s) into the registry`);
    }
  });

  const setVisibility = (state: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("backs off retries by backoffFactor (jitter pinned to 1.0)", async () => {
    vi.stubGlobal("fetch", fetchRejecting(50));
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 1_000,
      backoffFactor: 2,
      backoffCap: 100_000,
      offlineAfter: 60_000,
    });
    const calls = () => vi.mocked(fetch).mock.calls.length;

    await vi.advanceTimersByTimeAsync(60); // attempt 1 fails at t=50; cf=1 → +1000
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_060); // attempt 2 at t≈1050 fails at t≈1100; cf=2 → +2000
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1_000); // t≈2120: attempt 3 not due until t≈3100
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1_000); // t≈3120: attempt 3 fired; cf=3 → +4000
    expect(calls()).toBe(3);
    await vi.advanceTimersByTimeAsync(4_100); // t≈7220: attempt 4 fired at t≈7150
    expect(calls()).toBe(4);
    m.destroy();
  });

  it("caps the retry delay at backoffCap", async () => {
    vi.stubGlobal("fetch", fetchRejecting(50));
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 1_000,
      backoffFactor: 2,
      backoffCap: 1_500,
      offlineAfter: 60_000,
    });
    const calls = () => vi.mocked(fetch).mock.calls.length;

    await vi.advanceTimersByTimeAsync(60); // attempt 1 fails; +1000
    await vi.advanceTimersByTimeAsync(1_060); // attempt 2 fails at t≈1100; min(2000, 1500) → +1500
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1_560); // attempt 3 at t≈2600 (would be 3100 uncapped)
    expect(calls()).toBe(3);
    m.destroy();
  });

  it("still bounds waking by offlineAfter despite backoff", async () => {
    vi.stubGlobal("fetch", fetchRejecting(50));
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 1_000,
      backoffFactor: 2,
      offlineAfter: 3_000,
    });
    await vi.advanceTimersByTimeAsync(60); // episode starts at t=50
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(4_500); // next retry is backoff-delayed; it observes the bound
    expect(m.getSnapshot().status).toBe("offline");
    m.destroy();
  });

  it("pauses polling while the tab is hidden and re-checks immediately on visible", async () => {
    vi.stubGlobal("fetch", fetchRejecting(50));
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 1_000,
      backoffFactor: 1,
      offlineAfter: 60_000,
    });
    const calls = () => vi.mocked(fetch).mock.calls.length;

    await vi.advanceTimersByTimeAsync(60); // attempt 1 fails → waking, poll scheduled
    expect(calls()).toBe(1);

    setVisibility("hidden"); // cancels the pending poll
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls()).toBe(1); // no attempts while hidden

    setVisibility("visible"); // immediate fresh attempt
    await vi.advanceTimersByTimeAsync(60);
    expect(calls()).toBe(2);
    expect(m.getSnapshot().status).toBe("waking");
    m.destroy();
  });

  it("pauseWhenHidden: false keeps polling in a hidden tab", async () => {
    vi.stubGlobal("fetch", fetchRejecting(50));
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 1_000,
      backoffFactor: 1,
      offlineAfter: 60_000,
      pauseWhenHidden: false,
    });
    const calls = () => vi.mocked(fetch).mock.calls.length;

    await vi.advanceTimersByTimeAsync(60);
    expect(calls()).toBe(1);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(2_200); // two more polls fire while hidden
    expect(calls()).toBeGreaterThanOrEqual(3);
    m.destroy();
  });

  it("activeCheckInterval detects re-sleep: active → waking → active", async () => {
    let mode: "ok" | "down" = "ok";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            setTimeout(
              () => (mode === "ok" ? resolve(res(200)) : reject(new TypeError("down"))),
              50,
            );
          }),
      ),
    );
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 1_000,
      backoffFactor: 1,
      activeCheckInterval: 2_000,
    });

    await vi.advanceTimersByTimeAsync(100); // warm → active at t=50
    expect(m.getSnapshot().status).toBe("active");

    mode = "down";
    await vi.advanceTimersByTimeAsync(2_100); // interval re-check at t≈2050 fails at t≈2100
    expect(m.getSnapshot().status).toBe("waking");
    expect(m.getSnapshot().wasCold).toBe(true);

    mode = "ok";
    await vi.advanceTimersByTimeAsync(1_100); // next poll recovers
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });

  it("does not re-check on an interval when activeCheckInterval is 0 (default)", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("active");
    const calls = vi.mocked(fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls); // silent while active
    m.destroy();
  });

  it("silence on success: a warm engine leaves no elapsed ticker running", async () => {
    // Fake timers coarsely merge the reveal timer and fetch resolution, so
    // "ticker was never created" isn't expressible; drive a waking→active cycle.
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            call += 1;
            setTimeout(() => (call < 2 ? reject(new TypeError("down")) : resolve(res(200))), 50);
          }),
      ),
    );
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const m = createMonitor({
      healthUrl: testUrl,
      revealDelay: 10,
      pollInterval: 500,
      backoffFactor: 1,
    });
    await vi.advanceTimersByTimeAsync(100); // fail → waking (ticker starts)
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(600); // recover → active
    expect(m.getSnapshot().status).toBe("active");
    // The elapsed ticker's interval was explicitly cleared on recovery —
    // nothing keeps firing at 1 Hz for a warm backend.
    expect(clearIntervalSpy).toHaveBeenCalled();
    const tickValue = m.getSnapshot().elapsedSeconds;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(m.getSnapshot().elapsedSeconds).toBe(tickValue); // frozen: no ticker running
    m.destroy();
    expect(__engineCount()).toBe(0);
  });

  it("is SSR-safe: no document/navigator globals → policies no-op, engine still works", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("navigator", undefined);
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 10 });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });
});
