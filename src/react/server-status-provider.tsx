import { createContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { createMonitor } from "../core/monitor";
import type { Monitor } from "../core/monitor";
import type { MonitorConfig } from "../core/types";

export interface ServerStatusProviderProps extends MonitorConfig {
  children: ReactNode;
}

/**
 * Context payload. `null` = no provider; `{ monitor: null }` = provider present but
 * monitor not yet created (first commit / SSR) — keeps `useServerStatus()` honest.
 */
interface ServerStatusContextValue {
  monitor: Monitor | null;
}

export const ServerStatusContext = createContext<ServerStatusContextValue | null>(null);

/**
 * App-level server status config in one place: shares a single monitor with every
 * no-argument `useServerStatus()` below it. Config is captured on first mount.
 */
export function ServerStatusProvider({ children, ...config }: ServerStatusProviderProps) {
  const [monitor, setMonitor] = useState<Monitor | null>(null);

  useEffect(() => {
    // Created in an effect, never during render, so that abandoned concurrent
    // renders can't leak engines (docs/specs/phase-4-react-layer.md §1–§2).
    const m = createMonitor(config);
    setMonitor(m);
    return () => {
      m.destroy();
    };
    // Capture-on-mount is deliberate — see docs/specs/phase-4-react-layer.md §3.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ monitor }), [monitor]);
  return <ServerStatusContext.Provider value={value}>{children}</ServerStatusContext.Provider>;
}
