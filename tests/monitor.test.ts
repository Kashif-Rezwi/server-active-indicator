import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMonitor } from "../src/core/monitor";
import { __engineCount } from "../src/core/registry";
import {
  HEALTH_URL,
  fetchRejecting,
  fetchResolving,
  pinJitter,
  resetBrowserState,
  res,
  setVisibility,
  trackSnapshots,
} from "./helpers";

let testUrlCounter = 0;

describe("createMonitor", () => {
  // These basics share HEALTH_URL safely: setup.ts's uniform leak guard
  // guarantees an empty registry before each test, so no cross-test engine
  // sharing can occur (the policies describe below still uses unique URLs
  // as belt-and-braces isolation).
  beforeEach(() => {
    vi.useFakeTimers();
    pinJitter();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws without healthUrl or check", () => {
    expect(() => createMonitor({})).toThrow(/healthUrl.*check/);
    expect(__engineCount()).toBe(0); // the throw must not leak an engine
  });

  it("warm first ping: unknown → checking → active, wasCold=false", async () => {
    vi.stubGlobal("fetch", fetchResolving(100, 200));
    const m = createMonitor({ healthUrl: HEALTH_URL });
    const seen = trackSnapshots(m);

    expect(m.getSnapshot().status).toBe("checking");
    await vi.advanceTimersByTimeAsync(150);

    const s = m.getSnapshot();
    expect(s.status).toBe("active");
    expect(s.wasCold).toBe(false);
    expect(s.attempts).toBe(1);
    // Fake timers make Date.now deterministic: dispatch at t=0, resolve at t=100.
    expect(s.lastLatencyMs).toBe(100);
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
      healthUrl: HEALTH_URL,
      revealDelay: 3_000,
      pollInterval: 5_000,
      backoffFactor: 1,
    });
    const seen = trackSnapshots(m);

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
      healthUrl: HEALTH_URL,
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

  it("refresh() recovers from offline", async () => {
    vi.stubGlobal("fetch", fetchRejecting(50));
    const m = createMonitor({
      healthUrl: HEALTH_URL,
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
      healthUrl: HEALTH_URL,
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
    const m = createMonitor({ healthUrl: HEALTH_URL });
    const seen = trackSnapshots(m);
    const countBefore = seen.length;
    m.destroy();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen.length).toBe(countBefore); // no emissions after destroy
    expect(m.getSnapshot().status).not.toBe("active");
  });

  it("refresh() after destroy() is a silent no-op", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const m = createMonitor({ healthUrl: HEALTH_URL });
    await vi.advanceTimersByTimeAsync(100);
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
    const calls = vi.mocked(fetch).mock.calls.length;
    expect(() => m.refresh()).not.toThrow();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls); // no attempt dispatched
    expect(m.getSnapshot().status).toBe("active"); // snapshot frozen
  });

  it("uses a custom check() when provided (overrides healthUrl)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let call = 0;
    const check = vi.fn(async () => {
      call += 1;
      return call < 2 ? false : true;
    });
    const m = createMonitor({ check, healthUrl: HEALTH_URL, revealDelay: 50, pollInterval: 500 });
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

  it("refresh() while an attempt is in flight is a no-op (single-flight)", async () => {
    vi.stubGlobal("fetch", fetchResolving(5_000, 200)); // attempt 1 stays in flight
    const m = createMonitor({ healthUrl: HEALTH_URL, revealDelay: 10_000 });
    await vi.advanceTimersByTimeAsync(50);

    expect(m.getSnapshot().status).toBe("checking");
    m.refresh();
    m.refresh();
    // The in-flight attempt's result lands imminently — refresh must not stack
    // a duplicate attempt or reset the episode underneath it.
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
    expect(m.getSnapshot().status).toBe("checking");
    m.destroy();
  });

  it("getSnapshot() returns a stable reference between emissions (useSyncExternalStore contract)", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const m = createMonitor({ healthUrl: HEALTH_URL });

    const initial = m.getSnapshot();
    expect(m.getSnapshot()).toBe(initial); // no emission → same object
    await vi.advanceTimersByTimeAsync(100); // resolves → active emission
    const active = m.getSnapshot();
    expect(active).not.toBe(initial);
    expect(active.status).toBe("active");
    expect(m.getSnapshot()).toBe(active);
    m.destroy();
  });

  it("a throwing subscriber does not corrupt engine state (notification isolation is not yet guaranteed)", async () => {
    // Pinned current behavior, deliberately: setSnapshot updates the snapshot
    // before notifying listeners, and a listener exception propagates out of
    // the synchronous refresh() call. Per-listener error isolation is a flagged
    // follow-up — a throwing consumer can break the notification loop today.
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const m = createMonitor({ healthUrl: HEALTH_URL });
    // Let the auto-started attempt settle first: while an attempt is in flight
    // refresh() single-flight no-ops and would never reach the listeners.
    await vi.advanceTimersByTimeAsync(100);
    m.subscribe(() => {
      throw new Error("bad subscriber");
    });

    expect(() => m.refresh()).toThrow("bad subscriber");
    expect(m.getSnapshot().status).toBe("checking"); // state advanced before listeners ran
    m.destroy();
  });
});

describe("monitor policies — pauseWhenHidden, backoff, offlineAfter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pinJitter();
  });
  // Unique healthUrl per test → a fresh, isolated engine (no cross-test sharing).
  // Generated AFTER the random pin so it doesn't consume the pinned sequence.
  let testUrl = "";
  beforeEach(() => {
    testUrl = `${HEALTH_URL}?t=${testUrlCounter++}`;
  });
  afterEach(() => {
    vi.useRealTimers();
    // Restore jsdom's default visibility if a test overrode it.
    resetBrowserState();
  });

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

  it("cancels the reveal timer while hidden: no checking → waking promotion off-tab", async () => {
    // A fetch slow enough to cross revealDelay must not promote the engine to
    // waking while the tab is hidden — the reveal timer is cleared on hide.
    vi.stubGlobal("fetch", fetchResolving(5_000, 200));
    setVisibility("hidden");
    const m = createMonitor({ healthUrl: testUrl, revealDelay: 1_000 });
    expect(m.getSnapshot().status).toBe("checking");
    await vi.advanceTimersByTimeAsync(2_000);
    // The reveal threshold (t=1000) passed while hidden → still checking.
    expect(m.getSnapshot().status).toBe("checking");

    setVisibility("visible"); // resume: a fresh attempt, not the stale reveal
    await vi.advanceTimersByTimeAsync(5_100);
    expect(m.getSnapshot().status).toBe("active");
    m.destroy();
  });

  it("pauses the active-check interval while hidden and resumes it on visible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(200)));
    const m = createMonitor({ healthUrl: testUrl, activeCheckInterval: 1_000 });
    await vi.advanceTimersByTimeAsync(50);
    expect(m.getSnapshot().status).toBe("active");
    const callsWhileActive = vi.mocked(fetch).mock.calls.length;

    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(5_000);
    // Interval cleared while hidden → no additional fetches.
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsWhileActive);

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(1_100);
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsWhileActive);
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
    // "ticker was never created" isn't expressible; drive a waking→active cycle
    // and assert behaviorally that the elapsed counter freezes after recovery.
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
    const tickValue = m.getSnapshot().elapsedSeconds;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(m.getSnapshot().elapsedSeconds).toBe(tickValue); // frozen: no ticker running
    m.destroy();
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
