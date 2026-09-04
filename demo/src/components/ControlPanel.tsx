import { useState } from "react";
import type { ServerStatusMessages } from "server-active-indicator/react";
import type { SimulatedBackendHandle } from "../simulation/types";
import {
  AlertTriangleIcon,
  CheckIcon,
  CodeIcon,
  GlobeIcon,
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

export type ControlTab = "options" | "i18n" | "code";

interface ControlPanelProps {
  config: DemoIndicatorConfig;
  onConfigChange: (patch: Partial<DemoIndicatorConfig>) => void;
  backend: SimulatedBackendHandle;
  onRemountRequired: () => void;
  activeTab: ControlTab;
  onTabChange: (tab: ControlTab) => void;
}

export function ControlPanel({
  config,
  onConfigChange,
  backend,
  onRemountRequired,
  activeTab,
  onTabChange,
}: ControlPanelProps) {
  const [copied, setCopied] = useState(false);
  const [codeType, setCodeType] = useState<"react" | "vanilla">("react");

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

  const generateReactCode = () => {
    const props: string[] = ['healthUrl="https://api.example.com/health"'];
    if (config.variant !== "banner") props.push(`variant="${config.variant}"`);
    if (config.revealDelay !== 3000) props.push(`revealDelay={${config.revealDelay}}`);
    if (config.pollInterval !== 5000) props.push(`pollInterval={${config.pollInterval}}`);
    if (config.offlineAfter !== 60000) props.push(`offlineAfter={${config.offlineAfter}}`);
    if (config.successDisplayMs !== 2500)
      props.push(`successDisplayMs={${config.successDisplayMs}}`);

    const hasMessages = Object.values(config.messages).some(Boolean);
    if (hasMessages) {
      props.push(`messages={${JSON.stringify(config.messages, null, 2)}}`);
    }

    if (config.useRenderProp) {
      return `import { ServerStatus } from "server-active-indicator/react";

export function App() {
  return (
    <ServerStatus
      ${props.join("\n      ")}
    >
      {({ status, elapsedSeconds, refresh }) => (
        status === "waking" ? (
          <div className="custom-banner">
            Waking up... ({elapsedSeconds}s)
          </div>
        ) : null
      )}
    </ServerStatus>
  );
}`;
    }

    return `import { ServerStatus } from "server-active-indicator/react";

export function App() {
  return (
    <ServerStatus
      ${props.join("\n      ")}
    />
  );
}`;
  };

  const generateVanillaCode = () => {
    return `import { createMonitor } from "server-active-indicator";

const monitor = createMonitor({
  healthUrl: "https://api.example.com/health",
  revealDelay: ${config.revealDelay},
  pollInterval: ${config.pollInterval},
  offlineAfter: ${config.offlineAfter},
});

const unsubscribe = monitor.subscribe(({ status, elapsedSeconds }) => {
  console.log("Server status:", status, "Elapsed:", elapsedSeconds);
  if (status === "waking") {
    // Show custom waking UI
  } else if (status === "active") {
    // Backend is ready
  }
});

// Teardown when component/page unmounts:
// unsubscribe();
// monitor.destroy();`;
  };

  const handleCopyCode = async () => {
    const text = codeType === "react" ? generateReactCode() : generateVanillaCode();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="demo-sidebar">
      {/* 1. Dedicated Simulation Card */}
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
                <span className="scenario-icon-wrapper cold">
                  <SnowflakeIcon />
                </span>
                <span className="scenario-title">Cold Start</span>
              </div>
              <span className="scenario-desc">
                Simulates sleeping host waking up with countdown.
              </span>
            </button>

            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "warm-start" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerWarmStart)}
            >
              <div className="scenario-btn-top">
                <span className="scenario-icon-wrapper warm">
                  <ZapIcon />
                </span>
                <span className="scenario-title">Warm Start</span>
              </div>
              <span className="scenario-desc">Instant 200 OK. Completely silent on success.</span>
            </button>

            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "server-error" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerServerError)}
            >
              <div className="scenario-btn-top">
                <span className="scenario-icon-wrapper error">
                  <AlertTriangleIcon />
                </span>
                <span className="scenario-title">Server 503</span>
              </div>
              <span className="scenario-desc">Host failure. Shows offline banner + Retry.</span>
            </button>

            <button
              type="button"
              className={`scenario-btn ${backend.config.mode === "browser-offline" ? "active" : ""}`}
              onClick={() => handleScenarioClick(backend.triggerBrowserOffline)}
            >
              <div className="scenario-btn-top">
                <span className="scenario-icon-wrapper offline">
                  <WifiOffIcon />
                </span>
                <span className="scenario-title">Client Offline</span>
              </div>
              <span className="scenario-desc">
                Network disconnected. Auto-recovers on reconnect.
              </span>
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

      {/* 2. Indicator Configuration & Code Export Card */}
      <div className="control-card">
        <div className="control-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === "options" ? "active" : ""}`}
            onClick={() => onTabChange("options")}
          >
            <SlidersIcon />
            <span>Options</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "i18n" ? "active" : ""}`}
            onClick={() => onTabChange("i18n")}
          >
            <GlobeIcon />
            <span>Copy & i18n</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "code" ? "active" : ""}`}
            onClick={() => onTabChange("code")}
          >
            <CodeIcon />
            <span>Generated Code</span>
          </button>
        </div>

        <div className="card-body">
          {/* Options Tab */}
          {activeTab === "options" && (
            <>
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
                  <span>Placement In Layout</span>
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
                  Suppresses UI during fast responses so warm starts stay silent.
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
                  Maximum elapsed waking time before concluding the backend is offline.
                </span>
              </div>

              <div className="control-group">
                <div className="control-label-row">
                  <span>Confirmation Duration (successDisplayMs)</span>
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
                    Use custom render prop (<code>children=&#123;fn&#125;</code>)
                  </span>
                </label>
              </div>
            </>
          )}

          {/* Copy & i18n Tab */}
          {activeTab === "i18n" && (
            <>
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

          {/* Generated Code Tab */}
          {activeTab === "code" && (
            <div>
              <div className="code-header-row">
                <span className="code-title">Integration Code</span>
                <div className="segmented-control" style={{ maxWidth: 140 }}>
                  <button
                    type="button"
                    className={`segment-btn ${codeType === "react" ? "active" : ""}`}
                    onClick={() => setCodeType("react")}
                  >
                    React
                  </button>
                  <button
                    type="button"
                    className={`segment-btn ${codeType === "vanilla" ? "active" : ""}`}
                    onClick={() => setCodeType("vanilla")}
                  >
                    JS Core
                  </button>
                </div>
              </div>

              <div className="code-snippet-box">
                <button
                  type="button"
                  className="copy-code-btn"
                  onClick={handleCopyCode}
                  title="Copy code to clipboard"
                >
                  {copied ? (
                    <>
                      <CheckIcon /> Copied
                    </>
                  ) : (
                    "Copy"
                  )}
                </button>
                <pre>{codeType === "react" ? generateReactCode() : generateVanillaCode()}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
