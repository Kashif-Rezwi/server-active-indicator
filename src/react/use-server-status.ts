import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { createMonitor } from "../core/monitor";
import type { Monitor } from "../core/monitor";
import type { MonitorConfig, MonitorSnapshot } from "../core/types";
import { ServerStatusContext } from "./server-status-provider";
import { useSyncExternalStoreCompat } from "./use-sync-external-store";

export type UseServerStatusOptions = MonitorConfig;

export interface UseServerStatusResult extends MonitorSnapshot {
  /** Trigger an immediate health check. */
  refresh: () => void;
}

/**
 * Snapshot while no monitor exists (first commit / SSR): `unknown` honestly means
 * "no check has started". Module-level constant → no hydration mismatch.
 */
const INITIAL_SNAPSHOT: MonitorSnapshot = {
  status: "unknown",
  elapsedSeconds: 0,
  lastCheckedAt: null,
  attempts: 0,
  wasCold: false,
  lastLatencyMs: null,
};

const noop = (): void => {};

/**
 * Headless React binding: with `options` an own monitor, without the nearest
 * provider's. Created in an effect, destroyed on unmount; options captured on mount.
 */
export function useServerStatus(options?: UseServerStatusOptions): UseServerStatusResult {
  const contextValue = useContext(ServerStatusContext);
  if (options === undefined && contextValue === null) {
    throw new Error(
      "server-active-indicator: useServerStatus() requires either options (healthUrl or check) or a <ServerStatusProvider> ancestor.",
    );
  }

  // Own monitor, when options were provided.
  const [ownMonitor, setOwnMonitor] = useState<Monitor | null>(null);

  useEffect(() => {
    if (options === undefined) return; // reading the provider's monitor instead
    const monitor = createMonitor(options);
    setOwnMonitor(monitor);
    return () => {
      monitor.destroy();
    };
    // Capture-on-mount is deliberate — see docs/specs/phase-4-react-layer.md §3.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monitor = options === undefined ? (contextValue?.monitor ?? null) : ownMonitor;

  const subscribe = useCallback(
    (onStoreChange: () => void) => (monitor ? monitor.subscribe(onStoreChange) : noop),
    [monitor],
  );
  const getSnapshot = useCallback(
    () => (monitor ? monitor.getSnapshot() : INITIAL_SNAPSHOT),
    [monitor],
  );

  // The same closure serves as getServerSnapshot: before the effect runs, the
  // monitor is null on both the server and the hydrating client.
  const snapshot = useSyncExternalStoreCompat(subscribe, getSnapshot, getSnapshot);

  const refresh = monitor ? monitor.refresh : noop;
  return useMemo(() => ({ ...snapshot, refresh }), [snapshot, refresh]);
}
