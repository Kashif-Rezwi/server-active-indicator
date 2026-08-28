/**
 * server-active-indicator/react — React adapter (package.json "./react"). Built with
 * a `'use client'` banner for Next.js; the framework-free core subpath carries none.
 */

export { useServerStatus } from "./use-server-status";
export type { UseServerStatusOptions, UseServerStatusResult } from "./use-server-status";
export { ServerStatusProvider } from "./server-status-provider";
export type { ServerStatusProviderProps } from "./server-status-provider";
export { ServerStatus } from "./server-status";
export type { ServerStatusMessages, ServerStatusProps } from "./server-status";
export type { CheckResult, FailureReason, MonitorConfig, MonitorSnapshot } from "../core/types";
