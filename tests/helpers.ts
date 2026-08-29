import { vi } from "vitest";

import type { Monitor } from "../src/core/monitor";
import type { MonitorSnapshot } from "../src/core/types";

/**
 * Shared test helpers for the monitor suites: fetch mocks with controllable
 * timing (driven by fake timers), a pinned-jitter helper, and small snapshot/
 * browser-state utilities. One source of truth — do not copy these into suites.
 */

/** Canonical health endpoint used across suites. */
export const HEALTH_URL = "https://api.example.com/health";

/** A minimal `Response`-shaped object the engine actually inspects. */
export function res(status: number, ok = status >= 200 && status < 300): Response {
  return { ok, status } as Response;
}

/** A fetch mock that resolves after `ms` (fake timers) with the given status. */
export function fetchResolving(ms: number, status: number) {
  return vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(res(status)), ms);
      }),
  );
}

/** A fetch mock that rejects after `ms` (network/CORS/DNS failure). */
export function fetchRejecting(ms: number) {
  return vi.fn(
    () =>
      new Promise<Response>((_resolve, reject) => {
        setTimeout(() => reject(new TypeError("fetch failed")), ms);
      }),
  );
}

/**
 * A fetch stub that settles only when its `signal` is aborted (drives the
 * per-attempt timeout path portably across timer backends).
 */
export function fetchAbortedOnly() {
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

/** Collect every snapshot a monitor emits. */
export function trackSnapshots(m: Monitor): MonitorSnapshot[] {
  const seen: MonitorSnapshot[] = [];
  m.subscribe((s) => seen.push(s));
  return seen;
}

/**
 * Deterministic backoff: `nextDelay()` = base * (0.8 + random() * 0.4), so
 * pinning random() to 0.5 makes every delay exactly `base`. Call in
 * beforeEach alongside `vi.useFakeTimers()`.
 */
export function pinJitter(): void {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
}

/** Flip document visibility and fire `visibilitychange` (engine policies listen). */
export function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

/**
 * Restore jsdom defaults after tests that overrode browser state: visibility
 * back to visible, and any instance-level `navigator.onLine` override removed
 * so the prototype getter (and future spies) apply again.
 */
export function resetBrowserState(): void {
  // Defensive: suites like the SSR-safety test stub document/navigator away;
  // vitest's unstubGlobals restores them before the next test, not in afterEach.
  if (typeof document !== "undefined") {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  }
  if (
    typeof navigator !== "undefined" &&
    Object.prototype.hasOwnProperty.call(navigator, "onLine")
  ) {
    delete (navigator as unknown as Record<string, unknown>).onLine;
  }
}
