import type { MonitorConfig, MonitorSnapshot } from "./types";

/** A running monitor instance returned by `createMonitor`. */
export interface Monitor {
  /** Current state snapshot. */
  getSnapshot(): MonitorSnapshot;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: (snapshot: MonitorSnapshot) => void): () => void;
  /** Trigger an immediate check (single-flight: concurrent calls share one request). */
  refresh(): void;
  /** Stop all timers/requests and release the shared engine. */
  destroy(): void;
}

/**
 * Creates (or shares) the health monitor for a given config.
 *
 * Implemented in Phase 3 — the state engine, dedup registry, backoff,
 * visibility handling and abort lifecycle all live behind this factory.
 */
export function createMonitor(_config: MonitorConfig): Monitor {
  throw new Error("server-active-indicator: createMonitor is not implemented yet (Phase 3)");
}
