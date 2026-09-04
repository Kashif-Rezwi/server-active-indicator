import type { ReactNode } from "react";
import type { MonitorSnapshot } from "server-active-indicator";
import type { SimulatedBackendHandle } from "../simulation/types";
import { ActivityIcon, RefreshIcon } from "./Icons";

interface PulseAppProps {
  backend: SimulatedBackendHandle;
  snapshot: MonitorSnapshot;
  onRefreshTriggered: () => void;
  headerSlot?: ReactNode;
  revealDelay?: number;
}

export function PulseApp({
  backend,
  snapshot,
  onRefreshTriggered,
  headerSlot,
  revealDelay = 3000,
}: PulseAppProps) {
  const { telemetry } = backend;

  const getHostStateInfo = () => {
    // If the browser is still waking or the backend is booting, keep host state consistently in "Starting Up"
    if (snapshot.status === "waking" || telemetry.serverState === "booting") {
      const progress = telemetry.serverState === "booting" ? telemetry.bootProgress : 100;
      const elapsed =
        telemetry.serverState === "booting"
          ? telemetry.elapsedBootSeconds
          : snapshot.elapsedSeconds;
      return {
        badge: "Starting Up",
        badgeClass: "warning",
        value: `Waking (${progress}%)`,
        subtext: `Booting: ${elapsed}s of ~${backend.config.wakeDuration / 1000}s`,
      };
    }

    if (snapshot.status === "offline") {
      return {
        badge: "Error",
        badgeClass: "danger",
        value: "Service Unavailable",
        subtext: "Simulated server failure (HTTP 503)",
      };
    }

    switch (telemetry.serverState) {
      case "sleeping":
        return {
          badge: "Idle",
          badgeClass: "neutral",
          value: "Idle (Standby)",
          subtext: "Server pauses when idle to save resources",
        };
      case "crashed":
        return {
          badge: "Error",
          badgeClass: "danger",
          value: "Service Unavailable",
          subtext: "Simulated server failure (HTTP 503)",
        };
      case "disconnected":
        return {
          badge: "Offline",
          badgeClass: "danger",
          value: "Network Disconnected",
          subtext: "Browser connection is offline",
        };
      case "ready":
      default:
        return {
          badge: "Ready",
          badgeClass: "positive",
          value: "Active & Ready",
          subtext: "HTTP 200 OK • Inactive after 20s idle",
        };
    }
  };

  const hostInfo = getHostStateInfo();
  const revealSec = revealDelay / 1000;
  const isWakingOrBooting = snapshot.status === "waking" || telemetry.serverState === "booting";

  return (
    <div className="mock-app-card">
      {/* SaaS Application Header */}
      <div className="card-title-bar mock-app-topbar">
        <div className="card-title-row">
          <ActivityIcon className="card-title-icon" />
          <span className="card-title-heading">Pulse Cloud Console</span>
          <span className="mock-app-env">free-tier</span>
        </div>

        {/* Embedded indicator slot if placed inside app header */}
        {headerSlot && <div className="mock-app-header-slot">{headerSlot}</div>}

        <div className="mock-app-actions">
          <button
            type="button"
            className="card-header-btn refresh-trigger-btn"
            onClick={onRefreshTriggered}
            title="Restart cold boot cycle to test indicator"
            aria-label="Restart cold-start cycle"
          >
            <RefreshIcon />
            <span>Restart Cold Cycle</span>
          </button>
        </div>
      </div>

      <div className="mock-app-body">
        {/* Metrics Grid */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <span>Server State</span>
              <span className={`metric-badge ${hostInfo.badgeClass}`}>{hostInfo.badge}</span>
            </div>
            <div className="metric-value">{hostInfo.value}</div>
            {isWakingOrBooting && (
              <div className="metric-progress-bar" aria-hidden="true">
                <div
                  className="metric-progress-fill"
                  style={{
                    width: `${telemetry.serverState === "booting" ? telemetry.bootProgress : 100}%`,
                  }}
                />
              </div>
            )}
            <span className="metric-subtext">{hostInfo.subtext}</span>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span>Health Check</span>
              <span
                className={`metric-badge ${
                  snapshot.status === "active"
                    ? "positive"
                    : snapshot.status === "waking" || snapshot.status === "checking"
                      ? "warning"
                      : "danger"
                }`}
              >
                {snapshot.status === "active"
                  ? "200 OK"
                  : snapshot.status === "waking" || snapshot.status === "checking"
                    ? "Checking..."
                    : "Failed"}
              </span>
            </div>
            {snapshot.status === "waking" || snapshot.status === "checking" ? (
              <div className="metric-value checking">
                <span className="checking-dot" />
                <span>
                  {snapshot.status === "waking"
                    ? `Waiting for response... (${snapshot.elapsedSeconds}s)`
                    : "Connecting..."}
                </span>
              </div>
            ) : (
              <div className="metric-value">
                {snapshot.status === "active"
                  ? `${snapshot.lastLatencyMs ?? telemetry.lastResponseMs ?? 42} ms`
                  : telemetry.serverState === "crashed" || snapshot.status === "offline"
                    ? "503 Error"
                    : telemetry.serverState === "disconnected"
                      ? "Disconnected"
                      : "Standby"}
              </div>
            )}
            <span className="metric-subtext">
              {snapshot.status === "waking"
                ? `GET /api/health • Attempt ${snapshot.attempts}`
                : "GET /api/health"}
            </span>
          </div>
        </div>

        {/* Current State & Behavior Card */}
        <div
          className={`silence-demonstrator ${
            snapshot.status === "active"
              ? "ready"
              : snapshot.status === "waking"
                ? "booting"
                : snapshot.status === "offline"
                  ? "crashed"
                  : "idle"
          }`}
        >
          <div className="silence-demo-header">
            <div className="silence-demo-title">
              <span>Indicator Behavior</span>
            </div>

            <span
              className={`metric-badge ${
                snapshot.status === "active"
                  ? "positive"
                  : snapshot.status === "waking"
                    ? "warning"
                    : snapshot.status === "offline"
                      ? "danger"
                      : "neutral"
              }`}
            >
              {snapshot.status === "active"
                ? "Silent Mode"
                : snapshot.status === "waking"
                  ? "Banner Visible"
                  : snapshot.status === "offline"
                    ? "Offline Alert"
                    : "Standby"}
            </span>
          </div>

          <p className="silence-demo-body">
            {snapshot.status === "active" && (
              <>
                <strong>Server is active:</strong> Health check responded in{" "}
                <code>{snapshot.lastLatencyMs ?? telemetry.lastResponseMs ?? 42}ms</code>, well
                under the <code>{revealSec}s</code> threshold. The indicator renders{" "}
                <strong>
                  nothing (<code>null</code>)
                </strong>{" "}
                to avoid layout shifts and unnecessary badges.
              </>
            )}
            {snapshot.status === "waking" && (
              <>
                <strong>Cold start detected:</strong> Response time passed the{" "}
                <code>{revealSec}s</code> threshold. The wake banner is now visible with an elapsed
                timer (<code>{snapshot.elapsedSeconds}s</code>) so users know the server is starting
                up.
              </>
            )}
            {snapshot.status === "offline" && (
              <>
                <strong>Service unavailable:</strong> The server is unreachable (
                <code>{snapshot.offlineKind || snapshot.reason || "HTTP 503"}</code>). The indicator
                displays an alert banner with a Retry button.
              </>
            )}
            {(snapshot.status === "unknown" || snapshot.status === "checking") && (
              <>
                <strong>Server is idle:</strong> The server will spin up on the next request. If
                starting up takes longer than <code>{revealSec}s</code>, the wake banner will appear
                automatically.
              </>
            )}
          </p>

          {/* Current State Metadata Strip */}
          <div className="current-state-strip">
            <div className="state-strip-item">
              <span className="strip-item-label">Indicator UI</span>
              <span
                className={`strip-item-val ${
                  snapshot.status === "active"
                    ? "positive"
                    : snapshot.status === "waking"
                      ? "warning"
                      : snapshot.status === "offline"
                        ? "danger"
                        : "neutral"
                }`}
              >
                {snapshot.status === "active"
                  ? "Hidden (null)"
                  : snapshot.status === "waking"
                    ? "Visible (Banner)"
                    : snapshot.status === "offline"
                      ? "Visible (Alert)"
                      : "Hidden (Standby)"}
              </span>
            </div>

            <div className="state-strip-item">
              <span className="strip-item-label">Response Time</span>
              <span className="strip-item-val">
                {snapshot.status === "active"
                  ? `${snapshot.lastLatencyMs ?? telemetry.lastResponseMs ?? 42} ms`
                  : snapshot.status === "waking"
                    ? `> ${revealSec}s (${snapshot.elapsedSeconds}s elapsed)`
                    : snapshot.status === "offline"
                      ? "Connection Failed"
                      : "Waiting for request"}
              </span>
            </div>

            <div className="state-strip-item">
              <span className="strip-item-label">Reveal Delay</span>
              <span className="strip-item-val">{revealSec}s threshold</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
