import { useState } from "react";
import type { ServerStatusMessages } from "server-active-indicator/react";
import type { SimulatedBackendHandle } from "../simulation/types";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ClockIcon,
  GlobeIcon,
  ServerIcon,
  SlidersIcon,
  SnowflakeIcon,
  WifiOffIcon,
  ZapIcon,
} from "./Icons";

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
      {/* 1. Server Sandbox Card */}
      <div className="control-card">
        <div className="card-title-bar">
          <div className="card-title-row">
            <ServerIcon className="card-title-icon" />
            <span className="card-title-heading">Server Sandbox</span>
          </div>
          <span className="card-title-sub">Playground</span>
        </div>

        <div className="card-body">
          <div className="scenario-grid" role="group" aria-label="Backend simulation scenarios">
            <button
              type="button"
              className={`scenario-btn cold ${backend.config.mode === "cold-start" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerColdStart)}
              aria-pressed={backend.config.mode === "cold-start"}
            >
              <SnowflakeIcon className="scenario-icon cold" />
              <div className="scenario-btn-text">
                <span className="scenario-title">Cold Start</span>
                <span className="scenario-desc">Simulate waking server</span>
              </div>
            </button>

            <button
              type="button"
              className={`scenario-btn warm ${backend.config.mode === "warm-start" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerWarmStart)}
              aria-pressed={backend.config.mode === "warm-start"}
            >
              <ZapIcon className="scenario-icon warm" />
              <div className="scenario-btn-text">
                <span className="scenario-title">Warm Start</span>
                <span className="scenario-desc">Instant 200 OK (silent)</span>
              </div>
            </button>

            <button
              type="button"
              className={`scenario-btn error ${backend.config.mode === "server-error" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerServerError)}
              aria-pressed={backend.config.mode === "server-error"}
            >
              <AlertTriangleIcon className="scenario-icon error" />
              <div className="scenario-btn-text">
                <span className="scenario-title">Server 503</span>
                <span className="scenario-desc">Host crash with retry</span>
              </div>
            </button>

            <button
              type="button"
              className={`scenario-btn offline ${backend.config.mode === "browser-offline" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerBrowserOffline)}
              aria-pressed={backend.config.mode === "browser-offline"}
            >
              <WifiOffIcon className="scenario-icon offline" />
              <div className="scenario-btn-text">
                <span className="scenario-title">Client Offline</span>
                <span className="scenario-desc">Network disconnected</span>
              </div>
            </button>
          </div>

          <div className="card-divider" />

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="wake-duration-slider">Wake Duration</label>
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
              aria-label="Wake Duration in seconds"
            />
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="latency-slider">Network Latency</label>
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
              aria-label="Network latency in milliseconds"
            />
          </div>
        </div>
      </div>

      {/* 2. Component Config */}
      <div className="control-card">
        <div className="card-title-bar">
          <div className="card-title-row">
            <SlidersIcon className="card-title-icon" />
            <span className="card-title-heading">Component Config</span>
          </div>
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
              <label htmlFor="reveal-delay-slider">
                Reveal Threshold <span className="prop-code">revealDelay</span>
              </label>
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
              Suppresses UI on fast responses so warm starts stay silent.
            </span>
          </div>

          <div className="control-group">
            <div className="control-label-row">
              <label htmlFor="poll-interval-slider">
                Poll Interval <span className="prop-code">pollInterval</span>
              </label>
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
          <div className={`disclosure-section ${showAdvanced ? "open" : ""}`}>
            <button
              type="button"
              className="disclosure-trigger"
              onClick={() => setShowAdvanced((prev) => !prev)}
              aria-expanded={showAdvanced}
              aria-controls="advanced-policies-body"
            >
              <div className="disclosure-trigger-left">
                <ClockIcon className="disclosure-icon" />
                <span>Advanced Timing & Policies</span>
              </div>
              <div className="disclosure-trigger-right">
                {config.useRenderProp && <span className="disclosure-badge">render-prop</span>}
                <span
                  className={`disclosure-chevron ${showAdvanced ? "open" : ""}`}
                  aria-hidden="true"
                >
                  <ChevronDownIcon />
                </span>
              </div>
            </button>

            <div
              id="advanced-policies-body"
              className={`disclosure-wrapper ${showAdvanced ? "open" : ""}`}
            >
              <div className="disclosure-body">
                <div className="control-group">
                  <div className="control-label-row">
                    <label htmlFor="offline-after-slider">
                      Offline Cutoff <span className="prop-code">offlineAfter</span>
                    </label>
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
                    Max waking duration before transitioning to offline.
                  </span>
                </div>

                <div className="control-group">
                  <div className="control-label-row">
                    <label htmlFor="success-display-slider">
                      Active Toast <span className="prop-code">successDisplayMs</span>
                    </label>
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

                <div className="toggle-row">
                  <div className="toggle-info">
                    <span className="toggle-label">Headless Mode</span>
                    <span className="toggle-desc">
                      Render prop via <code>children=&#123;fn&#125;</code>
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.useRenderProp}
                    className={`toggle-switch ${config.useRenderProp ? "active" : ""}`}
                    onClick={() => onConfigChange({ useRenderProp: !config.useRenderProp })}
                    aria-label="Toggle headless render prop mode"
                  >
                    <span className="toggle-slider" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Copy & Localization (Collapsible Accordion) */}
          <div className={`disclosure-section ${showCopy ? "open" : ""}`}>
            <button
              type="button"
              className="disclosure-trigger"
              onClick={() => setShowCopy((prev) => !prev)}
              aria-expanded={showCopy}
              aria-controls="custom-copy-body"
            >
              <div className="disclosure-trigger-left">
                <GlobeIcon className="disclosure-icon" />
                <span>Custom Text & Localization</span>
              </div>
              <div className="disclosure-trigger-right">
                {Object.values(config.messages).some(Boolean) && (
                  <span className="disclosure-badge">custom</span>
                )}
                <span className={`disclosure-chevron ${showCopy ? "open" : ""}`} aria-hidden="true">
                  <ChevronDownIcon />
                </span>
              </div>
            </button>

            <div id="custom-copy-body" className={`disclosure-wrapper ${showCopy ? "open" : ""}`}>
              <div className="disclosure-body">
                <div className="custom-text-stack">
                  <div className="custom-text-field">
                    <label className="input-mini-label" htmlFor="msg-waking">
                      Waking Message
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

                  <div className="custom-text-field">
                    <label className="input-mini-label" htmlFor="msg-active">
                      Active Confirmation
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

                  <div className="custom-text-field">
                    <label className="input-mini-label" htmlFor="msg-offline">
                      Offline Alert
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

                  <div className="custom-text-field">
                    <label className="input-mini-label" htmlFor="msg-retry">
                      Retry Button Text
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
    </div>
  );
}
