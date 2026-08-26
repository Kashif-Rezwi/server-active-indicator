/**
 * server-active-indicator/react — React adapter.
 *
 * Subpath export `server-active-indicator/react` (package.json "./react").
 * Requires react as a peer dependency. Built with a `'use client'` banner for the
 * Next.js App Router; the framework-free core subpath carries no directive.
 */

export { useServerStatus } from "./use-server-status";
export type { UseServerStatusOptions, UseServerStatusResult } from "./use-server-status";
export { ServerStatusProvider } from "./server-status-provider";
export type { ServerStatusProviderProps } from "./server-status-provider";
export { ServerStatus } from "./server-status";
export type { ServerStatusMessages, ServerStatusProps } from "./server-status";
export type { CheckResult, FailureReason, MonitorConfig, MonitorSnapshot } from "../core/types";
