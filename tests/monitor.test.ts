import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMonitor } from "../src/core/monitor";
import type { MonitorSnapshot } from "../src/core/types";

const URL = "https://api.example.com/health";

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
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("throws without healthUrl or check", () => {
    expect(() => createMonitor({})).toThrow(/healthUrl.*check/);
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
    const m = createMonitor({ healthUrl: URL, revealDelay: 3_000, pollInterval: 5_000 });
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
    const m = createMonitor({ healthUrl: URL, revealDelay: 10, pollInterval: 5_000 });
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
    const m = createMonitor({ healthUrl: URL, revealDelay: 100, pollInterval: 5_000 });
    await vi.advanceTimersByTimeAsync(200); // first fail → waking (episode clock starts at t=50)
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(3_000); // ~3s of ticking (clock started at t=50 → 2 full s)
    expect(m.getSnapshot().elapsedSeconds).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(2_000); // reach the second poll (t≈5050) → still waking
    expect(m.getSnapshot().status).toBe("waking");
    await vi.advanceTimersByTimeAsync(5_000 + 100); // third poll (t≈10050) → active
    expect(m.getSnapshot().status).toBe("active");
    // Let the ticker fire once more (it self-clears on the next tick after active),
    // then confirm elapsed stops advancing.
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
});
