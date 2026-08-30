import type { ServerStatusMessages } from "server-active-indicator/react";
import type { SimulatedBackendHandle } from "../simulation/types";

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
  activeTab: "scenarios" | "config" | "i18n" | "theme" | "telemetry";
  onTabChange: (tab: "scenarios" | "config" | "i18n" | "theme" | "telemetry") => void;
}

export function ControlPanel({
  config,
  onConfigChange,
  backend,
  onRemountRequired,
  activeTab,
  onTabChange,
}: ControlPanelProps) {
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
    <div className="control-center-card">
      <div className="control-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === "scenarios" ? "active" : ""}`}
          onClick={() => onTabChange("scenarios")}
        >
          🕹️ Scenarios
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "config" ? "active" : ""}`}
          onClick={() => onTabChange("config")}
        >
          ⚙️ Options
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "i18n" ? "active" : ""}`}
          onClick={() => onTabChange("i18n")}
        >
          🌐 Copy & i18n
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "telemetry" ? "active" : ""}`}
          onClick={() => onTabChange("telemetry")}
        >
          💻 DevTools & Code
        </button>
      </div>

      <div className="tab-content">
        {/* Scenarios Tab */}
        {activeTab === "scenarios" && (
          <>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Test how <code>server-active-indicator</code> handles real-world cloud deployment
              states:
            </div>

            <div className="scenario-grid">
              <button
                type="button"
                className={`scenario-btn ${backend.config.mode === "cold-start" ? "active" : ""}`}
                onClick={() => handleScenarioClick(backend.triggerColdStart)}
              >
                <span className="scenario-title">❄️ Cold Start</span>
                <span className="scenario-desc">
                  Simulates backend waking from sleep. Shows starting up banner + timer.
                </span>
              </button>

              <button
                type="button"
                className={`scenario-btn ${backend.config.mode === "warm-start" ? "active" : ""}`}
                onClick={() => handleScenarioClick(backend.triggerWarmStart)}
              >
                <span className="scenario-title">⚡ Warm Start</span>
                <span className="scenario-desc">
                  Instant response. Renders nothing (Silence on success policy).
                </span>
              </button>

              <button
                type="button"
                className={`scenario-btn ${backend.config.mode === "server-error" ? "active" : ""}`}
                onClick={() => handleScenarioClick(backend.triggerServerError)}
              >
                <span className="scenario-title">🔴 Server 503</span>
                <span className="scenario-desc">
                  Simulates backend failure. Shows red offline banner + Retry button.
                </span>
              </button>

              <button
                type="button"
                className={`scenario-btn ${backend.config.mode === "browser-offline" ? "active" : ""}`}
                onClick={() => handleScenarioClick(backend.triggerBrowserOffline)}
              >
                <span className="scenario-title">📶 Client Offline</span>
                <span className="scenario-desc">
                  Simulates browser network loss. Auto-recovers when connection restores.
                </span>
              </button>
            </div>

            <div className="control-group" style={{ marginTop: 6 }}>
              <div className="control-label-row">
                <span>Simulated Wake Duration</span>
                <span className="control-val-badge">{backend.config.wakeDuration / 1000}s</span>
              </div>
              <input
                type="range"
                className="range-input"
                min="2000"
                max="25000"
                step="500"
                value={backend.config.wakeDuration}
                onChange={(e) => {
                  backend.updateConfig({ wakeDuration: Number(e.target.value) });
                }}
              />
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Network Latency Simulation</span>
                <span className="control-val-badge">{backend.config.latency}ms</span>
              </div>
              <input
                type="range"
                className="range-input"
                min="50"
                max="1500"
                step="50"
                value={backend.config.latency}
                onChange={(e) => {
                  backend.updateConfig({ latency: Number(e.target.value) });
                }}
              />
            </div>
          </>
        )}

        {/* Indicator Configuration Tab */}
        {activeTab === "config" && (
          <>
            <div className="control-group">
              <div className="control-label-row">
                <span>Indicator Visual Variant</span>
              </div>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${config.variant === "banner" ? "active" : ""}`}
                  onClick={() => onConfigChange({ variant: "banner" })}
                >
                  Banner (Full Width)
                </button>
                <button
                  type="button"
                  className={`segment-btn ${config.variant === "pill" ? "active" : ""}`}
                  onClick={() => onConfigChange({ variant: "pill" })}
                >
                  Pill (Badge)
                </button>
              </div>
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Placement In App</span>
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
                <option value="top-bar">Fixed Top of App</option>
                <option value="inside-header">Embedded Inside App Body</option>
                <option value="floating-bottom">Floating Bottom-Right Badge</option>
              </select>
            </div>

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
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Delays showing indicator so fast responses stay silent.
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

            <div className="control-group">
              <div className="control-label-row">
                <span>Active Confirmation (successDisplayMs)</span>
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
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                How long the green &quot;Server is ready&quot; confirmation stays visible before
                auto-hiding.
              </span>
            </div>

            <div className="control-group">
              <div className="control-label-row">
                <span>Render Prop Escape Hatch</span>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={config.useRenderProp}
                  onChange={(e) => onConfigChange({ useRenderProp: e.target.checked })}
                />
                <span>
                  Use custom render-prop UI (<code>children=&#123;fn&#125;</code>)
                </span>
              </label>
            </div>
          </>
        )}

        {/* Copy & i18n Tab */}
        {activeTab === "i18n" && (
          <>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Customize user-facing text for internationalization or custom brand voice:
            </div>

            <div className="control-group">
              <label className="control-label-row">
                <span>Waking Message</span>
              </label>
              <input
                type="text"
                className="text-input"
                placeholder="The server is starting up — this can take up to a minute on first visit."
                value={config.messages.waking || ""}
                onChange={(e) => handleMessageChange("waking", e.target.value)}
              />
            </div>

            <div className="control-group">
              <label className="control-label-row">
                <span>Active / Ready Message</span>
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
                <span>Server Offline Message</span>
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
                placeholder="You appear to be offline — check your connection."
                value={config.messages.browserOffline || ""}
                onChange={(e) => handleMessageChange("browserOffline", e.target.value)}
              />
            </div>

            <div className="control-group">
              <label className="control-label-row">
                <span>Retry Button Label</span>
              </label>
              <input
                type="text"
                className="text-input"
                placeholder="Retry"
                value={config.messages.retry || ""}
                onChange={(e) => handleMessageChange("retry", e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
