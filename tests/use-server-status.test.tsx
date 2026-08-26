import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __engineCount } from "../src/core/registry";
import { ServerStatusProvider, useServerStatus } from "../src/react/index";

const URL = "https://api.example.com/health";
const OTHER_URL = "https://other.example.com/health";

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
      new Promise<Response>((_resolve, reject) => {
        setTimeout(() => reject(new TypeError("fetch failed")), ms);
      }),
  );
}

/** Wrapper that mounts the hook inside a provider configured for `URL`. */
function ProviderWrapper({ children }: { children: ReactNode }) {
  return <ServerStatusProvider healthUrl={URL}>{children}</ServerStatusProvider>;
}

describe("useServerStatus", () => {
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

  it("throws a usage error with no options and no provider", () => {
    expect(() => renderHook(() => useServerStatus())).toThrow(/options.*ServerStatusProvider/s);
  });

  it("first commit is `unknown`, then checking → active on a warm backend", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const statuses: string[] = [];
    const { result } = renderHook(() => {
      const status = useServerStatus({ healthUrl: URL });
      statuses.push(status.status);
      return status;
    });

    expect(statuses[0]).toBe("unknown"); // monitor created in an effect, not render
    expect(statuses[1]).toBe("checking");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("active");
    expect(result.current.wasCold).toBe(false);
    expect(result.current.attempts).toBe(1);
    expect(statuses[statuses.length - 1]).toBe("active");
    expect(statuses).not.toContain("waking");
  });

  it("cold start passes through waking and reports wasCold", async () => {
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
    const { result } = renderHook(() =>
      useServerStatus({ healthUrl: URL, revealDelay: 10, pollInterval: 5_000, backoffFactor: 1 }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60); // first attempt fails
    });
    expect(result.current.status).toBe("waking");
    expect(result.current.wasCold).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_060); // second attempt fails
    });
    expect(result.current.status).toBe("waking");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_060); // third attempt succeeds
    });
    expect(result.current.status).toBe("active");
    expect(result.current.wasCold).toBe(true);
    expect(result.current.attempts).toBe(3);
  });

  it("refresh() triggers an immediate re-check", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const { result } = renderHook(() => useServerStatus({ healthUrl: URL }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("active");
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);

    act(() => {
      result.current.refresh();
    });
    expect(result.current.status).toBe("checking");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("active");
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
    expect(result.current.attempts).toBe(2);
  });

  it("destroys the engine on unmount and stops checking", async () => {
    const fetchMock = fetchResolving(50, 200);
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useServerStatus({ healthUrl: URL }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("active");
    expect(__engineCount()).toBe(1);

    unmount();
    expect(__engineCount()).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock.mock.calls.length).toBe(1); // no further attempts
    expect(result.current.status).toBe("active"); // frozen at the last snapshot
  });

  it("two hooks with identical config share one engine and one health loop", async () => {
    const fetchMock = fetchResolving(50, 200);
    vi.stubGlobal("fetch", fetchMock);
    const first = renderHook(() => useServerStatus({ healthUrl: URL }));
    const second = renderHook(() => useServerStatus({ healthUrl: URL }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(__engineCount()).toBe(1);
    expect(fetchMock.mock.calls.length).toBe(1); // one loop, one fetch
    expect(first.result.current.status).toBe("active");
    expect(second.result.current.status).toBe("active");
  });

  it("StrictMode (warm): one engine after mount, silent while active, none after unmount", async () => {
    const fetchMock = fetchResolving(50, 200);
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useServerStatus({ healthUrl: URL }), {
      wrapper: StrictMode,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.status).toBe("active");
    expect(__engineCount()).toBe(1); // create → destroy → create leaves exactly one

    const callsAfterSettle = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterSettle); // single loop, silent
    expect(__engineCount()).toBe(1);

    unmount();
    expect(__engineCount()).toBe(0);
  });

  it("StrictMode (cold): exactly one fetch per poll interval — no duplicate loop", async () => {
    const fetchMock = fetchRejecting(50);
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(
      () =>
        useServerStatus({
          healthUrl: URL,
          revealDelay: 10,
          pollInterval: 5_000,
          backoffFactor: 1,
        }),
      { wrapper: StrictMode },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60); // first attempts settle (remount aborted one)
    });
    expect(result.current.status).toBe("waking");
    expect(__engineCount()).toBe(1);

    const baseline = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_060); // exactly one poll tick
    });
    // A leaked engine from the aborted first mount would poll too — doubling this.
    expect(fetchMock.mock.calls.length).toBe(baseline + 1);
    expect(__engineCount()).toBe(1);

    unmount();
    expect(__engineCount()).toBe(0);
  });
});

describe("ServerStatusProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("no-arg hooks use the provider's monitor", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const statuses: string[] = [];
    const { result } = renderHook(
      () => {
        const status = useServerStatus();
        statuses.push(status.status);
        return status;
      },
      { wrapper: ProviderWrapper },
    );

    expect(statuses[0]).toBe("unknown"); // provider monitor lands one commit later
    expect(statuses[1]).toBe("checking");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("active");
    expect(typeof result.current.refresh).toBe("function");
    expect(__engineCount()).toBe(1);
  });

  it("explicit options ignore the provider config (separate engine)", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const { result } = renderHook(() => useServerStatus({ healthUrl: OTHER_URL }), {
      wrapper: ProviderWrapper,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("active");
    expect(__engineCount()).toBe(2); // provider's + the hook's
  });

  it("options matching the provider config share its engine (registry dedup)", async () => {
    const fetchMock = fetchResolving(50, 200);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useServerStatus({ healthUrl: URL }), {
      wrapper: ProviderWrapper,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("active");
    expect(__engineCount()).toBe(1);
    expect(fetchMock.mock.calls.length).toBe(1); // one shared health loop
  });

  it("StrictMode: one engine for provider + consumers, one fetch per tick, none after unmount", async () => {
    const fetchMock = fetchRejecting(50);
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useServerStatus(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>
          <ServerStatusProvider healthUrl={URL} pollInterval={5_000} backoffFactor={1}>
            {children}
          </ServerStatusProvider>
        </StrictMode>
      ),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(result.current.status).toBe("waking");
    expect(__engineCount()).toBe(1);

    const baseline = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_060);
    });
    expect(fetchMock.mock.calls.length).toBe(baseline + 1); // no duplicate loop
    expect(__engineCount()).toBe(1);

    unmount();
    expect(__engineCount()).toBe(0);
  });
});
