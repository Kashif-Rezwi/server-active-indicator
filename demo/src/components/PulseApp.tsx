import type { SimulatedBackendHandle } from "../simulation/types";
import { InfoIcon, RefreshIcon } from "./Icons";

interface PulseAppProps {
  backend: SimulatedBackendHandle;
  onRefreshTriggered: () => void;
}

export function PulseApp({ backend, onRefreshTriggered }: PulseAppProps) {
  const { telemetry } = backend;

  const isColdOrBooting =
    telemetry.serverState === "sleeping" || telemetry.serverState === "booting";

  return (
    <div className="mock-app-card">
      <div className="mock-app-topbar">
        <div className="mock-app-brand">
          <div className="pulse-icon">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <span>Pulse Analytics</span>
          <span className="mock-app-env">prod-us-east</span>
        </div>

        <div className="mock-app-actions">
          <button
            type="button"
            className="refresh-trigger-btn"
            onClick={onRefreshTriggered}
            title="Dispatch a client API request to the backend"
          >
            <RefreshIcon />
            <span>Query API</span>
          </button>
        </div>
      </div>

      <div className="mock-app-body">
        {/* Metric Cards Grid: 2 essential cards */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <span>Total Requests</span>
              <span className="metric-badge positive">+14.2%</span>
            </div>
            {isColdOrBooting ? (
              <div className="skeleton skeleton-metric" />
            ) : (
              <div className="metric-value">1,482,920</div>
            )}
            <span className="metric-subtext">Across 24 endpoints</span>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span>P95 Latency</span>
              <span className="metric-badge neutral">
                {telemetry.lastResponseMs ? `${telemetry.lastResponseMs}ms` : "38ms"}
              </span>
            </div>
            {isColdOrBooting ? (
              <div className="skeleton skeleton-metric" />
            ) : (
              <div className="metric-value">
                {telemetry.lastResponseMs ? `${telemetry.lastResponseMs}` : "38.4"} ms
              </div>
            )}
            <span className="metric-subtext">Edge-optimized probe</span>
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
