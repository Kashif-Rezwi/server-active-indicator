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
    <div className="demo-sidebar">
      {/* 1. Backend Simulation Card */}
      <div className="control-card">
        <div className="card-title-bar">
          <span className="card-title-heading">Backend Simulation</span>
        </div>

        <div className="card-body">
          <div className="scenario-grid">
            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "cold-start" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerColdStart)}
            >
              <div className="scenario-btn-top">
                <SnowflakeIcon className="scenario-icon cold" />
                <span className="scenario-title">Cold Start</span>
              </div>
              <span className="scenario-desc">Sleeping backend wakes with countdown.</span>
            </button>

            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "warm-start" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerWarmStart)}
            >
              <div className="scenario-btn-top">
                <ZapIcon className="scenario-icon warm" />
                <span className="scenario-title">Warm Start</span>
              </div>
              <span className="scenario-desc">Fast 200 OK. Completely silent UI.</span>
            </button>

            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "server-error" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerServerError)}
            >
              <div className="scenario-btn-top">
                <AlertTriangleIcon className="scenario-icon error" />
                <span className="scenario-title">Server 503</span>
              </div>
              <span className="scenario-desc">Host failure with Retry button.</span>
            </button>

            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "browser-offline" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerBrowserOffline)}
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
              <span>Wake Duration</span>
              <span className="control-val-badge">{backend.config.wakeDuration / 1000}s</span>
            </div>
            <input
              type="range"
              className="range-input"
              min="2000"
              max="25000"
              step="500"
              value={backend.config.wakeDuration}
              onChange={(e) => backend.updateConfig({ wakeDuration: Number(e.target.value) })}
            />
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <span>Simulated Latency</span>
              <span className="control-val-badge">{backend.config.latency}ms</span>
            </div>
            <input
              type="range"
              className="range-input"
              min="50"
              max="1500"
              step="50"
              value={backend.config.latency}
              onChange={(e) => backend.updateConfig({ latency: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* 2. Indicator Configuration (Single Natural Flow with Progressive Disclosure) */}
      <div className="control-card">
        <div className="card-title-bar">
          <span className="card-title-heading">Indicator Options</span>
        </div>

        <div className="card-body">
          {/* Tier 1: Primary Essentials */}
          <div className="control-group">
            <div className="control-label-row">
              <span>Visual Variant</span>
            </div>
            <div className="segmented-control">
              <button
                type="button"
                className={`segment-btn ${config.variant === "banner" ? "active" : ""}`}
                onClick={() => onConfigChange({ variant: "banner" })}
              >
                Banner
              </button>
              <button
                type="button"
                className={`segment-btn ${config.variant === "pill" ? "active" : ""}`}
                onClick={() => onConfigChange({ variant: "pill" })}
              >
                Pill
              </button>
            </div>
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <span>Placement</span>
            </div>
            <select
              className="select-input"
              value={config.position}
              onChange={(e) =>
                onConfigChange({
                  position: e.target.value as DemoIndicatorConfig["position"],
                })
              }
            >
              <option value="top-bar">Fixed Top of Page</option>
              <option value="inside-header">Embedded Above App Card</option>
              <option value="floating-bottom">Floating Bottom-Right Badge</option>
            </select>
          </div>

          {/* Tier 2: Timing Thresholds */}
          <div className="control-group">
            <div className="control-label-row">
              <span>Reveal Delay (revealDelay)</span>
              <span className="control-val-badge">{config.revealDelay / 1000}s</span>
            </div>
            <input
              type="range"
              className="range-input"
              min="500"
              max="10000"
              step="500"
              value={config.revealDelay}
              onChange={(e) => handleTimingChange("revealDelay", Number(e.target.value))}
            />
            <span className="control-helper-text">
              Suppresses UI on fast responses so warm starts stay silent.
            </span>
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <span>Poll Interval (pollInterval)</span>
              <span className="control-val-badge">{config.pollInterval / 1000}s</span>
            </div>
            <input
              type="range"
              className="range-input"
              min="1000"
              max="15000"
              step="500"
              value={config.pollInterval}
              onChange={(e) => handleTimingChange("pollInterval", Number(e.target.value))}
            />
          </div>

          {/* Tier 3: Advanced Options (Collapsible) */}
          <div className="disclosure-section">
            <button
              type="button"
              className="disclosure-trigger"
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              <span>Advanced Policies</span>
              <span className={`disclosure-chevron ${showAdvanced ? "open" : ""}`}>
                <ChevronDownIcon />
              </span>
            </button>

            {showAdvanced && (
              <div className="disclosure-body">
                <div className="control-group">
                  <div className="control-label-row">
                    <span>Offline Cutoff (offlineAfter)</span>
                    <span className="control-val-badge">{config.offlineAfter / 1000}s</span>
                  </div>
                  <input
                    type="range"
                    className="range-input"
                    min="10000"
                    max="120000"
                    step="5000"
                    value={config.offlineAfter}
                    onChange={(e) => handleTimingChange("offlineAfter", Number(e.target.value))}
                  />
                  <span className="control-helper-text">
                    Max waking elapsed time before failing over to offline.
                  </span>
                </div>

                <div className="control-group">
                  <div className="control-label-row">
                    <span>Active Toast Duration</span>
                    <span className="control-val-badge">{config.successDisplayMs / 1000}s</span>
                  </div>
                  <input
                    type="range"
                    className="range-input"
                    min="500"
                    max="8000"
                    step="500"
                    value={config.successDisplayMs}
                    onChange={(e) => onConfigChange({ successDisplayMs: Number(e.target.value) })}
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
                      Custom render prop (<code>children=&#123;fn&#125;</code>)
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Tier 4: Copy & Localization (Collapsible) */}
          <div className="disclosure-section">
            <button
              type="button"
              className="disclosure-trigger"
              onClick={() => setShowCopy((prev) => !prev)}
            >
              <span>Custom Text & i18n</span>
              <span className={`disclosure-chevron ${showCopy ? "open" : ""}`}>
                <ChevronDownIcon />
              </span>
            </button>

            {showCopy && (
              <div className="disclosure-body">
                <div className="control-group">
                  <label className="control-label-row">
                    <span>Waking Message</span>
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="The server is starting up..."
                    value={config.messages.waking || ""}
                    onChange={(e) => handleMessageChange("waking", e.target.value)}
                  />
                </div>

                <div className="control-group">
                  <label className="control-label-row">
                    <span>Active Message</span>
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="The server is ready."
                    value={config.messages.active || ""}
                    onChange={(e) => handleMessageChange("active", e.target.value)}
                  />
                </div>

                <div className="control-group">
                  <label className="control-label-row">
                    <span>Offline Message</span>
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="The server appears to be unavailable."
                    value={config.messages.offline || ""}
                    onChange={(e) => handleMessageChange("offline", e.target.value)}
                  />
                </div>

                <div className="control-group">
                  <label className="control-label-row">
                    <span>Browser Offline Message</span>
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="You appear to be offline..."
                    value={config.messages.browserOffline || ""}
                    onChange={(e) => handleMessageChange("browserOffline", e.target.value)}
                  />
                </div>

                <div className="control-group">
                  <label className="control-label-row">
                    <span>Retry Label</span>
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="Retry"
                    value={config.messages.retry || ""}
                    onChange={(e) => handleMessageChange("retry", e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
