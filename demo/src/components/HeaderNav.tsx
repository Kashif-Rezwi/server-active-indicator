import type { SimulatedBackendHandle } from "../simulation/types";

interface HeaderNavProps {
  backend: SimulatedBackendHandle;
  onRemount: () => void;
}

export function HeaderNav({ backend, onRemount }: HeaderNavProps) {
  const { telemetry } = backend;

  const handleQuickCold = () => {
    backend.triggerColdStart();
    onRemount();
  };

  const handleQuickWarm = () => {
    backend.triggerWarmStart();
    onRemount();
  };

  const getDotClass = () => {
    switch (telemetry.serverState) {
      case "sleeping":
        return "sleeping";
      case "booting":
        return "booting";
      case "ready":
        return "ready";
      case "crashed":
        return "crashed";
      case "disconnected":
        return "disconnected";
    }
  };

  const getStateLabel = () => {
    switch (telemetry.serverState) {
      case "sleeping":
        return "Simulated Host: Asleep (Cold)";
      case "booting":
        return `Simulated Host: Starting Up (${telemetry.bootProgress}%)`;
      case "ready":
        return "Simulated Host: Ready (Warm)";
      case "crashed":
        return "Simulated Host: Error (503)";
      case "disconnected":
        return "Simulated Host: Browser Offline";
    }
  };

  return (
    <header className="demo-header">
      <div className="brand-section">
        <div className="brand-logo" title="server-active-indicator">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v4" />
            <path d="m4.93 4.93 2.83 2.83" />
            <path d="M2 12h4" />
            <path d="m4.93 19.07 2.83-2.83" />
            <path d="M12 18v4" />
            <path d="m19.07 19.07-2.83-2.83" />
            <path d="M20 12h4" />
            <path d="m19.07 4.93-2.83 2.83" />
          </svg>
        </div>
        <div className="brand-title">
          server-active-indicator
          <span className="brand-badge">v0.3.0</span>
        </div>
      </div>

      <div className="header-actions">
        <div className="server-state-pill" title="Live state of the simulated host container">
          <span className={`status-dot ${getDotClass()}`} />
          <span>{getStateLabel()}</span>
        </div>

        <button
          type="button"
          className="header-btn"
          onClick={handleQuickCold}
          title="Trigger a cold start simulation"
        >
          ❄️ Simulate Cold
        </button>

        <button
          type="button"
          className="header-btn"
          onClick={handleQuickWarm}
          title="Trigger a warm start (silence on success)"
        >
          ⚡ Simulate Warm
        </button>

        <a
          href="https://github.com/Kashif-Rezwi/server-active-indicator"
          target="_blank"
          rel="noreferrer"
          className="header-btn"
          title="GitHub Repository"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            />
          </svg>
          GitHub
        </a>
      </div>
    </header>
  );
}
