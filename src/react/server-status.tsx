import type { ReactNode } from "react";
import type { MonitorConfig, MonitorSnapshot } from "../core/types";

export interface ServerStatusMessages {
  waking?: string;
  active?: string;
  offline?: string;
  browserOffline?: string;
  retry?: string;
}

export interface ServerStatusProps extends MonitorConfig {
  /** Visual variant. Default: "banner". */
  variant?: "banner" | "pill";
  /** Override any user-facing copy (i18n). */
  messages?: ServerStatusMessages;
  /** Extra class name on the root element. */
  className?: string;
  /** Render prop escape hatch — replaces the default UI entirely. */
  children?: (snapshot: MonitorSnapshot & { refresh: () => void }) => ReactNode;
}

/**
 * Default UI for the server status monitor (banner / pill variants).
 *
 * Implemented in Phase 5 — injected `sai-`-prefixed CSS, CSS custom properties
 * for theming, `role="status"` + `aria-live="polite"`, elapsed counter, retry.
 */
export function ServerStatus(_props: ServerStatusProps): ReactNode {
  throw new Error("server-active-indicator: <ServerStatus> is not implemented yet (Phase 5)");
}
