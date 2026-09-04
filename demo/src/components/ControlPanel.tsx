import { useState } from "react";
import type { ServerStatusMessages } from "server-active-indicator/react";
import type { SimulatedBackendHandle } from "../simulation/types";
import { AlertTriangleIcon, ChevronDownIcon, SnowflakeIcon, WifiOffIcon, ZapIcon } from "./Icons";

export interface DemoIndicatorConfig {
  variant: "banner" | "pill";
  position: "top-bar" | "inside-header" | "floating-bottom";
  revealDelay: number;
  pollInterval: number;
  offlineAfter: number;
  successDisplayMs: number;
  useRenderProp: boolean;
  messages: ServerStatusMessages;
}

interface ControlPanelProps {
  config: DemoIndicatorConfig;
  onConfigChange: (patch: Partial<DemoIndicatorConfig>) => void;
  backend: SimulatedBackendHandle;
  onRemountRequired: () => void;
}

export function ControlPanel({
  config,
  onConfigChange,
  backend,
  onRemountRequired,
}: ControlPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCopy, setShowCopy] = useState(false);

  const handleScenarioClick = (action: () => void) => {
    action();
    onRemountRequired();
  };

  const handleTimingChange = (field: keyof DemoIndicatorConfig, value: number) => {
    onConfigChange({ [field]: value });
  };

  const handleTimingCommit = () => {
    onRemountRequired();
  };

  const handleMessageChange = (key: keyof ServerStatusMessages, value: string) => {
    onConfigChange({
      messages: {
        ...config.messages,
        [key]: value || undefined,
      },
    });
  };

  return (
    <div className="control-panel-stack">
      {/* 1. Backend Simulation Card */}
      <div className="control-card">
        <div className="card-title-bar">
          <span className="card-title-heading">Backend Simulation</span>
          <span className="card-title-sub">Host Sandbox</span>
        </div>

        <div className="card-body">
          <div className="scenario-grid" role="group" aria-label="Backend simulation scenarios">
            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "cold-start" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerColdStart)}
              aria-pressed={backend.config.mode === "cold-start"}
            >
              <div className="scenario-btn-top">
                <SnowflakeIcon className="scenario-icon cold" />
                <span className="scenario-title">Cold Start</span>
              </div>
              <span className="scenario-desc">Simulates sleeping container waking up.</span>
            </button>

            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "warm-start" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerWarmStart)}
              aria-pressed={backend.config.mode === "warm-start"}
            >
              <div className="scenario-btn-top">
                <ZapIcon className="scenario-icon warm" />
                <span className="scenario-title">Warm Start</span>
              </div>
              <span className="scenario-desc">Instant 200 OK. UI stays 100% silent.</span>
            </button>

            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "server-error" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerServerError)}
              aria-pressed={backend.config.mode === "server-error"}
            >
              <div className="scenario-btn-top">
                <AlertTriangleIcon className="scenario-icon error" />
                <span className="scenario-title">Server 503</span>
              </div>
              <span className="scenario-desc">Simulates host crash with Retry action.</span>
            </button>

            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "browser-offline" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerBrowserOffline)}
              aria-pressed={backend.config.mode === "browser-offline"}
            >
              <div className="scenario-btn-top">
                <WifiOffIcon className="scenario-icon offline" />
                <span className="scenario-title">Client Offline</span>
              </div>
              <span className="scenario-desc">Browser connection lost; auto-recovers.</span>
            </button>
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="wake-duration-slider">Wake Cycle Duration</label>
              <span className="control-val-badge">{backend.config.wakeDuration / 1000}s</span>
            </div>
            <input
              id="wake-duration-slider"
              type="range"
              className="range-input"
              min="2000"
              max="25000"
              step="500"
              value={backend.config.wakeDuration}
              onChange={(e) => backend.updateConfig({ wakeDuration: Number(e.target.value) })}
              aria-label="Wake Cycle Duration in seconds"
            />
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="latency-slider">Network Roundtrip Latency</label>
              <span className="control-val-badge">{backend.config.latency}ms</span>
            </div>
            <input
              id="latency-slider"
              type="range"
              className="range-input"
              min="30"
              max="1500"
              step="30"
              value={backend.config.latency}
              onChange={(e) => backend.updateConfig({ latency: Number(e.target.value) })}
              aria-label="Network roundtrip latency in milliseconds"
            />
          </div>
        </div>
      </div>

      {/* 2. Indicator Configuration */}
      <div className="control-card">
        <div className="card-title-bar">
          <span className="card-title-heading">Indicator Options</span>
          <span className="card-title-sub">Props Config</span>
        </div>

        <div className="card-body">
          {/* Primary Controls */}
          <div className="control-group">
            <div className="control-label-row">
              <span>Visual Variant</span>
            </div>
            <div className="segmented-control" role="tablist" aria-label="Visual Variant">
              <button
                type="button"
                role="tab"
                aria-selected={config.variant === "banner"}
                className={`segment-btn ${config.variant === "banner" ? "active" : ""}`}
                onClick={() => onConfigChange({ variant: "banner" })}
              >
                Banner
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={config.variant === "pill"}
                className={`segment-btn ${config.variant === "pill" ? "active" : ""}`}
                onClick={() => onConfigChange({ variant: "pill" })}
              >
                Pill
              </button>
            </div>
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="placement-select">Placement Mode</label>
            </div>
            <select
              id="placement-select"
              className="select-input"
              value={config.position}
              onChange={(e) =>
                onConfigChange({
                  position: e.target.value as DemoIndicatorConfig["position"],
                })
              }
            >
              <option value="top-bar">Fixed Top of Page</option>
              <option value="inside-header">Embedded in App Console Header</option>
              <option value="floating-bottom">Floating Bottom-Right Badge</option>
            </select>
          </div>

          {/* Timing Thresholds with commit-on-release */}
          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="reveal-delay-slider">Reveal Threshold (revealDelay)</label>
              <span className="control-val-badge">{config.revealDelay / 1000}s</span>
            </div>
            <input
              id="reveal-delay-slider"
              type="range"
              className="range-input"
              min="500"
              max="8000"
              step="250"
              value={config.revealDelay}
              onChange={(e) => handleTimingChange("revealDelay", Number(e.target.value))}
              onPointerUp={handleTimingCommit}
              onKeyUp={handleTimingCommit}
              aria-label="Reveal threshold in seconds"
            />
            <span className="control-helper-text">
              Suppresses UI on fast responses so warm starts stay completely silent.
            </span>
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="poll-interval-slider">Poll Interval (pollInterval)</label>
              <span className="control-val-badge">{config.pollInterval / 1000}s</span>
            </div>
            <input
              id="poll-interval-slider"
              type="range"
              className="range-input"
              min="1000"
              max="15000"
              step="500"
              value={config.pollInterval}
              onChange={(e) => handleTimingChange("pollInterval", Number(e.target.value))}
              onPointerUp={handleTimingCommit}
              onKeyUp={handleTimingCommit}
              aria-label="Poll interval in seconds"
            />
          </div>

          {/* Advanced Policies (Collapsible Accordion) */}
          <div className="disclosure-section">
            <button
              type="button"
              className="disclosure-trigger"
              onClick={() => setShowAdvanced((prev) => !prev)}
              aria-expanded={showAdvanced}
              aria-controls="advanced-policies-body"
            >
              <span>Advanced Timing & Policies</span>
              <span
                className={`disclosure-chevron ${showAdvanced ? "open" : ""}`}
                aria-hidden="true"
              >
                <ChevronDownIcon />
              </span>
            </button>

            <div
              id="advanced-policies-body"
              className={`disclosure-wrapper ${showAdvanced ? "open" : ""}`}
            >
              <div className="disclosure-body">
                <div className="control-group">
                  <div className="control-label-row">
                    <label htmlFor="offline-after-slider">Offline Cutoff (offlineAfter)</label>
                    <span className="control-val-badge">{config.offlineAfter / 1000}s</span>
                  </div>
                  <input
                    id="offline-after-slider"
                    type="range"
                    className="range-input"
                    min="10000"
                    max="120000"
                    step="5000"
                    value={config.offlineAfter}
                    onChange={(e) => handleTimingChange("offlineAfter", Number(e.target.value))}
                    onPointerUp={handleTimingCommit}
                    onKeyUp={handleTimingCommit}
                    aria-label="Offline cutoff threshold in seconds"
                  />
                  <span className="control-helper-text">
                    Max waking duration before automatically transitioning to offline.
                  </span>
                </div>

                <div className="control-group">
                  <div className="control-label-row">
                    <label htmlFor="success-display-slider">Active Toast Duration</label>
                    <span className="control-val-badge">{config.successDisplayMs / 1000}s</span>
                  </div>
                  <input
                    id="success-display-slider"
                    type="range"
                    className="range-input"
                    min="500"
                    max="8000"
                    step="500"
                    value={config.successDisplayMs}
                    onChange={(e) => onConfigChange({ successDisplayMs: Number(e.target.value) })}
                    aria-label="Active toast duration in seconds"
                  />
                </div>

                <div className="control-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={config.useRenderProp}
                      onChange={(e) => onConfigChange({ useRenderProp: e.target.checked })}
                    />
                    <span>
                      Headless render prop (<code>children=&#123;fn&#125;</code>)
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Copy & Localization (Collapsible Accordion) */}
          <div className="disclosure-section">
            <button
              type="button"
              className="disclosure-trigger"
              onClick={() => setShowCopy((prev) => !prev)}
              aria-expanded={showCopy}
              aria-controls="custom-copy-body"
            >
              <span>Custom Text & Localization</span>
              <span className={`disclosure-chevron ${showCopy ? "open" : ""}`} aria-hidden="true">
                <ChevronDownIcon />
              </span>
            </button>

            <div id="custom-copy-body" className={`disclosure-wrapper ${showCopy ? "open" : ""}`}>
              <div className="disclosure-body">
                <div className="control-group">
                  <label className="control-label-row" htmlFor="msg-waking">
                    <span>Waking Message</span>
                  </label>
                  <input
                    id="msg-waking"
                    type="text"
                    className="text-input"
                    placeholder="The server is starting up..."
                    value={config.messages.waking || ""}
                    onChange={(e) => handleMessageChange("waking", e.target.value)}
                  />
                </div>

                <div className="control-group">
                  <label className="control-label-row" htmlFor="msg-active">
                    <span>Active Confirmation</span>
                  </label>
                  <input
                    id="msg-active"
                    type="text"
                    className="text-input"
                    placeholder="The server is ready."
                    value={config.messages.active || ""}
                    onChange={(e) => handleMessageChange("active", e.target.value)}
                  />
                </div>

                <div className="control-group">
                  <label className="control-label-row" htmlFor="msg-offline">
                    <span>Offline Alert</span>
                  </label>
                  <input
                    id="msg-offline"
                    type="text"
                    className="text-input"
                    placeholder="The server appears to be unavailable."
                    value={config.messages.offline || ""}
                    onChange={(e) => handleMessageChange("offline", e.target.value)}
                  />
                </div>

                <div className="control-group">
                  <label className="control-label-row" htmlFor="msg-retry">
                    <span>Retry Button Text</span>
                  </label>
                  <input
                    id="msg-retry"
                    type="text"
                    className="text-input"
                    placeholder="Retry"
                    value={config.messages.retry || ""}
                    onChange={(e) => handleMessageChange("retry", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
