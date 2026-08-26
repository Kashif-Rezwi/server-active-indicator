import type { MonitorConfig, MonitorSnapshot } from "../core/types";

export type UseServerStatusOptions = MonitorConfig;

export interface UseServerStatusResult extends MonitorSnapshot {
  /** Trigger an immediate health check. */
  refresh: () => void;
}

/**
 * Headless React binding for the server status monitor.
 *
 * Implemented in Phase 4 (useSyncExternalStore over the core monitor,
 * StrictMode-safe, full cleanup on unmount).
 */
export function useServerStatus(_options: UseServerStatusOptions): UseServerStatusResult {
  throw new Error("server-active-indicator: useServerStatus is not implemented yet (Phase 4)");
}
