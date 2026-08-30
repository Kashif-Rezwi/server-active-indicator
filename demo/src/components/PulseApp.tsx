import { useState } from "react";
import type { SimulatedBackendHandle } from "../simulation/types";

interface PulseAppProps {
  backend: SimulatedBackendHandle;
  onRefreshTriggered: () => void;
}

export function PulseApp({ backend, onRefreshTriggered }: PulseAppProps) {
  const { telemetry } = backend;
  const [activeTab, setActiveTab] = useState<"overview" | "metrics" | "logs">("overview");

  const isColdOrBooting =
    telemetry.serverState === "sleeping" || telemetry.serverState === "booting";
  const isCrashed = telemetry.serverState === "crashed";
  const isDisconnected = telemetry.serverState === "disconnected";

  return (
    <div className="mock-app-card">
      <div className="mock-app-topbar">
        <div className="mock-app-brand">
          <div className="pulse-icon">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <span>Pulse Analytics</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>
            prod-cluster-us-east
          </span>
        </div>

        <div className="mock-app-actions">
          <div className="segmented-control" style={{ maxWidth: 220 }}>
            <button
              type="button"
              className={`segment-btn ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={`segment-btn ${activeTab === "metrics" ? "active" : ""}`}
              onClick={() => setActiveTab("metrics")}
            >
              Metrics
            </button>
            <button
              type="button"
              className={`segment-btn ${activeTab === "logs" ? "active" : ""}`}
              onClick={() => setActiveTab("logs")}
            >
              Logs
            </button>
          </div>

          <button
            type="button"
            className="refresh-trigger-btn"
            onClick={onRefreshTriggered}
            title="Dispatch a client API request to the backend"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            Query API
          </button>
        </div>
      </div>

      <div className="mock-app-body">
        {/* Metric Cards Grid */}
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
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Across 24 endpoints</span>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span>Throughput</span>
              <span className="metric-badge positive">Live</span>
            </div>
            {isColdOrBooting ? (
              <div className="skeleton skeleton-metric" />
            ) : (
              <div className="metric-value">
                492 <span style={{ fontSize: 12, fontWeight: 500 }}>req/s</span>
              </div>
            )}
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Peak: 610 req/s</span>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span>P95 Latency</span>
              <span className="metric-badge neutral">
                {telemetry.lastResponseMs ? `${telemetry.lastResponseMs}ms` : "36ms"}
              </span>
            </div>
            {isColdOrBooting ? (
              <div className="skeleton skeleton-metric" />
            ) : (
              <div className="metric-value">
                38.4 <span style={{ fontSize: 12, fontWeight: 500 }}>ms</span>
              </div>
            )}
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Edge optimized</span>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span>Health Score</span>
              <span className="metric-badge positive">
                {isCrashed || isDisconnected ? "Degraded" : "99.98%"}
              </span>
            </div>
            {isColdOrBooting ? (
              <div className="skeleton skeleton-metric" />
            ) : (
              <div
                className="metric-value"
                style={{ color: isCrashed ? "var(--color-danger)" : "var(--color-success)" }}
              >
                {isCrashed ? "503 Error" : isDisconnected ? "Offline" : "Healthy"}
              </div>
            )}
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>SLO: 99.9% target</span>
          </div>
        </div>

        {/* Real-time Traffic Graph */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Realtime Request Traffic (RPS)</div>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="brand-badge">Simulated Feed</span>
            </div>
          </div>

          {isColdOrBooting ? (
            <div className="skeleton skeleton-chart" />
          ) : (
            <div className="chart-svg-container">
              <svg width="100%" height="140" viewBox="0 0 600 140" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
                {/* Background Grid Lines */}
                <line
                  x1="0"
                  y1="35"
                  x2="600"
                  y2="35"
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="3 3"
                />
                <line
                  x1="0"
                  y1="70"
                  x2="600"
                  y2="70"
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="3 3"
                />
                <line
                  x1="0"
                  y1="105"
                  x2="600"
                  y2="105"
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="3 3"
                />

                {/* Area Fill */}
                <path
                  d="M0,90 Q50,40 100,75 T200,45 T300,60 T400,30 T500,65 T600,35 L600,140 L0,140 Z"
                  fill="url(#trafficGradient)"
                />
                {/* Wave Stroke */}
                <path
                  d="M0,90 Q50,40 100,75 T200,45 T300,60 T400,30 T500,65 T600,35"
                  fill="none"
                  stroke="url(#lineGlow)"
                  strokeWidth="2.5"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Microservices & Activity Grid */}
        <div className="details-grid">
          <div className="service-card">
            <div className="card-heading">Upstream Microservices</div>
            {isColdOrBooting ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="skeleton skeleton-text" style={{ width: "100%", height: 32 }} />
                <div className="skeleton skeleton-text" style={{ width: "100%", height: 32 }} />
                <div className="skeleton skeleton-text" style={{ width: "100%", height: 32 }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="service-item">
                  <span className="service-name">auth-gateway</span>
                  <span className="service-status-tag">🟢 100% Up</span>
                </div>
                <div className="service-item">
                  <span className="service-name">api-worker-pool</span>
                  <span className="service-status-tag">🟢 99.98% Up</span>
                </div>
                <div className="service-item">
                  <span className="service-name">redis-cache-cluster</span>
                  <span className="service-status-tag">🟢 100% Up</span>
                </div>
              </div>
            )}
          </div>

          <div className="logs-card">
            <div className="card-heading">API Interaction Log</div>
            {isColdOrBooting ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="skeleton skeleton-text" style={{ width: "90%" }} />
                <div className="skeleton skeleton-text" style={{ width: "80%" }} />
                <div className="skeleton skeleton-text" style={{ width: "70%" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                <div style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-muted)", marginRight: 6 }}>16:12:04</span>
                  GET /api/v1/metrics →{" "}
                  <span style={{ color: "var(--color-success)" }}>200 OK</span> (38ms)
                </div>
                <div style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-muted)", marginRight: 6 }}>16:12:01</span>
                  GET /api/v1/cluster/health →{" "}
                  <span style={{ color: "var(--color-success)" }}>200 OK</span> (24ms)
                </div>
                <div style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-muted)", marginRight: 6 }}>16:11:58</span>
                  POST /api/v1/auth/session →{" "}
                  <span style={{ color: "var(--color-success)" }}>200 OK</span> (45ms)
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
