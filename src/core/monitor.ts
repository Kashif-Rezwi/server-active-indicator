import { acquireMonitor } from "./registry";
import type { Monitor } from "./registry";
import type { MonitorConfig } from "./types";

export type { Monitor } from "./registry";

/**
 * Creates (or shares) the health monitor for a given config.
 *
 * Consumers with identical effective config share one underlying engine — one
 * health loop, one set of timers — via the module-level registry. Each call
 * returns an independent handle: its `subscribe`/`getSnapshot`/`refresh` proxy to
 * the shared engine, and its `destroy()` releases only that consumer's reference
 * (the engine is torn down when the last consumer releases it).
 */
export function createMonitor(config: MonitorConfig): Monitor {
  return acquireMonitor(config);
}
