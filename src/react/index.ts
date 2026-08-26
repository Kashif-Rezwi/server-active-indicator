/**
 * server-active-indicator/react — React adapter.
 *
 * Subpath export `server-active-indicator/react` (package.json "./react").
 * Requires react as a peer dependency.
 */

export { useServerStatus } from "./use-server-status";
export type { UseServerStatusOptions, UseServerStatusResult } from "./use-server-status";
export { ServerStatus } from "./server-status";
export type { ServerStatusMessages, ServerStatusProps } from "./server-status";
export type { CheckResult, FailureReason, MonitorConfig, MonitorSnapshot } from "../core/types";
