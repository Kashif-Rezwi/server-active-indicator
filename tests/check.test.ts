import { afterEach, describe, expect, it, vi } from "vitest";

import { ABORTED, defaultCheck } from "../src/core/check";
import type { CheckOutcome } from "../src/core/check";

const URL = "https://api.example.com/health";

/** A minimal `Response`-shaped object the engine actually inspects. */
function res(status: number, ok = status >= 200 && status < 300) {
  return { ok, status } as Response;
}

/**
 * A fetch stub that resolves only when its `signal` is aborted. Used to
 * exercise the per-attempt timeout path portably across timer backends.
 */
function fetchThatOnlyResolvesOnAbort() {
  return vi.fn(
    (_url: string, init: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const reason = init.signal?.reason as { name?: string } | undefined;
          // Mirror what a real fetch does on timeout: DOMException with name
          // "TimeoutError" or a plain AbortError depending on the runtime.
          reject(new DOMException("aborted", reason?.name ?? "AbortError"));
        });
      }),
  );
}

describe("defaultCheck (HTTP contract)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("2xx → ok with status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(200)));
    const out = await defaultCheck({ healthUrl: URL, timeout: 5_000 });
    expect(out).toEqual({ ok: true, status: 200 });
  });

  it("204 No Content is also ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(204, true)));
    const out = await defaultCheck({ healthUrl: URL, timeout: 5_000 });
    expect(out).toEqual({ ok: true, status: 204 });
  });

  it("200 with a malformed body is still ok — we never parse the body", async () => {
    // The body would throw if anyone tried to read it; that's the point:
    // defaultCheck must succeed on res.ok alone.
    const malformed = Object.assign(res(200), {
      text: () => Promise.reject(new Error("not utf-8")),
      json: () => Promise.reject(new Error("not json")),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(malformed as Response));
    const out = await defaultCheck({ healthUrl: URL, timeout: 5_000 });
    expect(out).toEqual({ ok: true, status: 200 });
  });

  it.each([400, 401, 403, 404, 418])(
    "4xx %i → http-error (fast-path, misconfiguration)",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(status, false)));
      const out = await defaultCheck({ healthUrl: URL, timeout: 5_000 });
      expect(out).toEqual({ ok: false, reason: "http-error", status });
    },
  );

  it.each([500, 502, 503, 504])("5xx %i → request-failed (could be cold-start)", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(status, false)));
    const out = await defaultCheck({ healthUrl: URL, timeout: 5_000 });
    expect(out).toEqual({ ok: false, reason: "request-failed", status });
  });

  it("TypeError rejection → request-failed (DNS, CORS, offline — indistinguishable to a browser)", async () => {
    // Honesty constraint: a browser cannot tell these apart at the fetch
    // layer. Documenting the absence of a `sleeping` state.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const out = await defaultCheck({ healthUrl: URL, timeout: 5_000 });
    expect(out).toEqual({ ok: false, reason: "request-failed" });
  });
  it("caller-abort mid-flight → ABORTED sentinel (NOT a failure result)", async () => {
    const fetchMock = vi.fn((_url: string, init: { signal?: AbortSignal }) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const promise = defaultCheck({ healthUrl: URL, timeout: 60_000 }, controller.signal);
    queueMicrotask(() => controller.abort());

    const out: CheckOutcome = await promise;
    expect(out).toBe(ABORTED);
  });

  it("per-attempt timeout exceeded → request-failed (AbortSignal.timeout integration)", async () => {
    vi.stubGlobal("fetch", fetchThatOnlyResolvesOnAbort());
    const out = await defaultCheck({ healthUrl: URL, timeout: 1 });
    expect(out).toEqual({ ok: false, reason: "request-failed" });
  });

  it("custom validate returning false on a 200 → request-failed (degraded body)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(200)));
    const out = await defaultCheck({
      healthUrl: URL,
      timeout: 5_000,
      validate: () => false,
    });
    expect(out).toEqual({ ok: false, reason: "request-failed", status: 200 });
  });

  it("custom validate THROWING on a 200 → request-failed (safeValidate path)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(200)));
    const out = await defaultCheck({
      healthUrl: URL,
      timeout: 5_000,
      validate: () => {
        throw new Error("validator blew up");
      },
    });
    expect(out).toEqual({ ok: false, reason: "request-failed", status: 200 });
  });

  it("custom validate accepting a 200 → ok (override default res.ok)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(200)));
    const out = await defaultCheck({
      healthUrl: URL,
      timeout: 5_000,
      validate: () => true,
    });
    expect(out).toEqual({ ok: true, status: 200 });
  });

  it("passes headers and credentials to the fetch call (opt-in, not sent by default)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    await defaultCheck({
      healthUrl: URL,
      timeout: 5_000,
      headers: { authorization: "Bearer x" },
      credentials: "include",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: { authorization: "Bearer x" },
        credentials: "include",
      }),
    );
  });

  it("omits headers/credentials when not provided (no implicit cookies/auth)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    await defaultCheck({ healthUrl: URL, timeout: 5_000 });
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const init = call![1] as Record<string, unknown>;
    expect(init.headers).toBeUndefined();
    expect(init.credentials).toBeUndefined();
  });

  it("missing global fetch → request-failed (degraded environments, SSR Node < 18)", async () => {
    vi.stubGlobal("fetch", undefined as unknown as typeof fetch);
    const out = await defaultCheck({ healthUrl: URL, timeout: 5_000 });
    expect(out).toEqual({ ok: false, reason: "request-failed" });
  });
});
