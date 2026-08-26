/**
 * server-active-indicator — framework-free core.
 *
 * Subpath export `server-active-indicator` (package.json "."). Zero runtime
 * dependencies; safe to import without React installed.
 */

export { DEFAULT_CONFIG } from "./core/defaults";
export { createMonitor } from "./core/monitor";
export type { Monitor } from "./core/monitor";
export type {
  CheckResult,
  FailureReason,
  MonitorConfig,
  MonitorSnapshot,
  ServerStatus,
} from "./core/types";
