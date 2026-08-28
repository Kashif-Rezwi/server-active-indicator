import { acquireMonitor } from "./registry";
import type { Monitor } from "./registry";
import type { MonitorConfig } from "./types";

export type { Monitor } from "./registry";

/**
 * Creates (or shares) the monitor for a given config: identical effective configs
 * share one engine via the registry; each handle's destroy() releases its reference.
 */
export function createMonitor(config: MonitorConfig): Monitor {
  return acquireMonitor(config);
}
