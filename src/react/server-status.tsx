import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { DEFAULT_CONFIG } from "../core/defaults";
import type { MonitorConfig, MonitorSnapshot } from "../core/types";
import { CheckIcon, OfflineIcon, SpinnerIcon, WifiOffIcon } from "./icons";
import { injectServerStatusStyles } from "./styles";
import { useServerStatus } from "./use-server-status";

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

/** Locked English defaults — research §5 copy for `waking` (never "asleep"). */
const DEFAULT_MESSAGES: Required<ServerStatusMessages> = {
  waking: "The server is starting up — this can take up to a minute on first visit.",
  active: "The server is ready.",
  offline: "The server appears to be unavailable.",
  browserOffline: "You appear to be offline — check your connection.",
  retry: "Retry",
};

/** Language-neutral elapsed readout: `45s` under a minute, then `1m 5s` (dossier parity). */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Default UI for the monitor: silence on success; amber "starting up" banner with a
 * live counter while `waking`; red offline banner with Retry. See README for details.
 */
export function ServerStatus(props: ServerStatusProps): ReactNode {
  const { variant = "banner", messages, className, children, ...config } = props;

  // A check source on the props means "own monitor"; without one, read the
  // nearest provider (the hook throws its usage error if that's missing too).
  const hasCheckSource = config.healthUrl !== undefined || config.check !== undefined;
  const snapshot = useServerStatus(hasCheckSource ? config : undefined);
  const usesDefaultUi = children === undefined;

  // Stylesheet for the default UI: injected once per document (effect-only, so
  // SSR-safe), skipped for render-prop usage where we render no sai- markup.
  useEffect(() => {
    if (usesDefaultUi) injectServerStatusStyles();
  }, [usesDefaultUi]);

  // Silence-on-success presentation policy: the confirmation shows only after a
  // waking/offline episode this instance witnessed, then auto-hides.
  const [dismissed, setDismissed] = useState(true);
  const hasSeenWakeOrOfflineRef = useRef(false);

  // A new wake episode re-arms the confirmation (re-sleep recovery re-announces).
  useEffect(() => {
    if (snapshot.status === "waking" || snapshot.status === "offline") {
      hasSeenWakeOrOfflineRef.current = true;
      setDismissed(false);
    }
  }, [snapshot.status]);

  const successDisplayMs = config.successDisplayMs ?? DEFAULT_CONFIG.successDisplayMs;

  useEffect(() => {
    if (snapshot.status !== "active" || !snapshot.wasCold || dismissed) return;
    if (!hasSeenWakeOrOfflineRef.current) return; // late-mounter; never saw the wake
    const timer = setTimeout(() => setDismissed(true), successDisplayMs);
    return () => clearTimeout(timer);
  }, [snapshot.status, snapshot.wasCold, dismissed, successDisplayMs]);

  // Headless escape hatch: full delegation, raw snapshot (including `unknown`).
  if (!usesDefaultUi) return children(snapshot);

  // Silence: nothing before the reveal; nothing for a warm success.
  if (snapshot.status === "unknown" || snapshot.status === "checking") return null;
  if (snapshot.status === "active" && (!snapshot.wasCold || dismissed)) return null;

  const copy: Required<ServerStatusMessages> = { ...DEFAULT_MESSAGES, ...messages };
  const rootClass = variant === "pill" ? "sai-pill" : "sai-banner";
  const { status, offlineKind, elapsedSeconds, refresh } = snapshot;

  return (
    <div
      role="status"
      aria-live="polite"
      data-state={status}
      data-offline-kind={offlineKind}
      className={className ? `${rootClass} ${className}` : rootClass}
    >
      {status === "waking" ? (
        <SpinnerIcon />
      ) : status === "active" ? (
        <CheckIcon />
      ) : offlineKind === "browser" ? (
        <WifiOffIcon />
      ) : (
        <OfflineIcon />
      )}
      <span className="sai-message">
        {status === "waking"
          ? copy.waking
          : status === "active"
            ? copy.active
            : offlineKind === "browser"
              ? copy.browserOffline
              : copy.offline}
      </span>
      {status === "waking" && (
        <span className="sai-elapsed" aria-hidden="true">
          {formatElapsed(elapsedSeconds)}
        </span>
      )}
      {status === "offline" && (
        <button type="button" className="sai-retry" onClick={refresh}>
          {copy.retry}
        </button>
      )}
    </div>
  );
}
