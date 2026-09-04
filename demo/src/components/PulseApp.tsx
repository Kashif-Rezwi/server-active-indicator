import type { SimulatedBackendHandle } from "../simulation/types";
import { ActivityIcon, InfoIcon, RefreshIcon } from "./Icons";

interface PulseAppProps {
  backend: SimulatedBackendHandle;
  onRefreshTriggered: () => void;
}

export function PulseApp({ backend, onRefreshTriggered }: PulseAppProps) {
  const { telemetry } = backend;

  const isColdOrBooting =
    telemetry.serverState === "sleeping" || telemetry.serverState === "booting";

  const getHostStateInfo = () => {
    switch (telemetry.serverState) {
      case "sleeping":
        return {
          badge: "Asleep",
          badgeClass: "neutral",
          value: "Sleeping (Idle)",
          subtext: "Spins down after 20s idle",
        };
      case "booting":
        return {
          badge: "Starting Up",
          badgeClass: "warning",
          value: `Waking (${telemetry.bootProgress}%)`,
          subtext: `Elapsed: ${telemetry.elapsedBootSeconds}s / ${backend.config.wakeDuration / 1000}s`,
        };
      case "ready":
        return {
          badge: "Warm",
          badgeClass: "positive",
          value: "Ready (Online)",
          subtext: "Auto-sleeps after 20s idle",
        };
      case "crashed":
        return {
          badge: "503 Error",
          badgeClass: "danger",
          value: "Service Unavailable",
          subtext: "Simulated server crash",
        };
      case "disconnected":
        return {
          badge: "Offline",
          badgeClass: "danger",
          value: "Network Disconnected",
          subtext: "Browser offline simulation",
        };
    }
  };

  const hostInfo = getHostStateInfo();

  return (
    <div className="mock-app-card">
      <div className="mock-app-topbar">
        <div className="mock-app-brand">
          <ActivityIcon className="app-brand-icon" />
          <span>Client Application</span>
          <span className="mock-app-env">render-free-tier</span>
        </div>

        <div className="mock-app-actions">
          <button
            type="button"
            className="refresh-trigger-btn"
            onClick={onRefreshTriggered}
            title="Send an API request to test backend responsiveness"
          >
            <RefreshIcon />
            <span>Query API</span>
          </button>
        </div>
      </div>

      <div className="mock-app-body">
        {/* Metric Cards Grid: Dynamic & Contextual to Backend Health */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <span>Host Container</span>
              <span className={`metric-badge ${hostInfo.badgeClass}`}>{hostInfo.badge}</span>
            </div>
            <div className="metric-value">{hostInfo.value}</div>
            <span className="metric-subtext">{hostInfo.subtext}</span>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span>Health Probe</span>
              <span
                className={`metric-badge ${
                  telemetry.serverState === "ready"
                    ? "positive"
                    : isColdOrBooting
                      ? "warning"
                      : "danger"
                }`}
              >
                {telemetry.serverState === "ready"
                  ? "200 OK"
                  : isColdOrBooting
                    ? "Probing"
                    : "Failed"}
              </span>
            </div>
            {isColdOrBooting ? (
              <div className="skeleton skeleton-metric" />
            ) : (
              <div className="metric-value">
                {telemetry.serverState === "ready"
                  ? `${telemetry.lastResponseMs ?? 42} ms`
                  : telemetry.serverState === "crashed"
                    ? "503 Error"
                    : "No Connection"}
              </div>
            )}
            <span className="metric-subtext">Probe target: /api/health</span>
          </div>
        </div>

        {/* Silence on Success Explainer Card */}
        <div className="silence-explainer-card">
          <div className="silence-explainer-header">
            <div className="silence-title-row">
              <InfoIcon />
              <span>Silence on Success</span>
            </div>
            <span className="silence-badge">Core Principle</span>
          </div>

          <p className="silence-desc">
            A warm backend renders no indicator UI. If your API responds within the{" "}
            <code>revealDelay</code> threshold (default 3s), users experience zero layout shifts or
            unnecessary notifications. Status banners only appear when cold starts or delays
            actually happen.
          </p>

          <div className="silence-flow-box">
            <div className="silence-flow-step">
              <span className="silence-flow-title">1. Health Probe</span>
              <span className="silence-flow-value">GET /health</span>
            </div>
            <div className="silence-flow-step">
              <span className="silence-flow-title">2. Response Time</span>
              <span className="silence-flow-value">&lt; revealDelay</span>
            </div>
            <div className="silence-flow-step">
              <span className="silence-flow-title">3. UI Presentation</span>
              <span className="silence-flow-value">100% Silent</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
