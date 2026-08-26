import { createContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { createMonitor } from "../core/monitor";
import type { Monitor } from "../core/monitor";
import type { MonitorConfig } from "../core/types";

export interface ServerStatusProviderProps extends MonitorConfig {
  children: ReactNode;
}

/**
 * Context payload. A `null` context means *no provider*; `{ monitor: null }` means
 * a provider is present but its monitor hasn't been created yet (first commit / SSR,
 * where effects don't run). Keeping those apart is what lets `useServerStatus()`
 * throw only for genuine misuse.
 */
interface ServerStatusContextValue {
  monitor: Monitor | null;
}

export const ServerStatusContext = createContext<ServerStatusContextValue | null>(null);

/**
 * App-level server status config in one place: acquires a single monitor on mount
 * and shares it with every no-argument `useServerStatus()` below it. The monitor
 * is released on unmount; via the core registry, anything using the same
 * behavioral config shares the same engine.
 *
 * Config is captured on first mount — changing props later has no effect. To
 * change config, remount the provider with a `key`:
 * `<ServerStatusProvider key={url} healthUrl={url}>`.
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
