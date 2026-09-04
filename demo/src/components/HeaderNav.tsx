import { GitHubIcon } from "./Icons";

export function HeaderNav() {
  return (
    <header className="demo-header">
      <div className="brand-section">
        <div className="brand-logo" title="server-active-indicator">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
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
          <span className="brand-badge">v0.2.3</span>
        </div>
      </div>

      <div className="header-actions">
        <a
          href="https://github.com/Kashif-Rezwi/server-active-indicator"
          target="_blank"
          rel="noreferrer"
          className="header-btn"
          title="View on GitHub"
        >
          <GitHubIcon />
          GitHub
        </a>
      </div>
    </header>
  );
}
