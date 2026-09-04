import { useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { CheckIcon, CopyIcon, GitHubIcon, MoonIcon, NpmIcon, SlidersIcon, SunIcon } from "./Icons";

interface HeaderNavProps {
  controlsOpen: boolean;
  onToggleControls: () => void;
}

export function HeaderNav({ controlsOpen, onToggleControls }: HeaderNavProps) {
  const [copied, setCopied] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleCopyInstall = async () => {
    await navigator.clipboard.writeText("npm i server-active-indicator");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="demo-header">
      <div className="demo-header-inner">
        <div className="brand-section" title="server-active-indicator">
          <svg
            className="brand-icon"
            width="20"
            height="20"
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

          <div className="brand-title">
            <span>server-active-indicator</span>
            <span className="brand-badge">v{__PKG_VERSION__}</span>
          </div>
        </div>

        <div className="header-actions">
          {/* Quick Install Pill */}
          <button
            type="button"
            className="install-cmd-pill"
            onClick={handleCopyInstall}
            title="Click to copy npm install command"
            aria-label="Copy install command: npm i server-active-indicator"
          >
            <span className="install-cmd-prefix">$</span>
            <code className="install-cmd-code">npm i server-active-indicator</code>
            <span className="install-cmd-icon">{copied ? <CheckIcon /> : <CopyIcon />}</span>
            {copied && <span className="install-copied-tooltip">Copied!</span>}
          </button>

          {/* Light/Dark theme toggle */}
          <button
            type="button"
            className="header-icon-link"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-pressed={theme === "light"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Icon-only social/external links without background or text labels */}
          <a
            href="https://www.npmjs.com/package/server-active-indicator"
            target="_blank"
            rel="noreferrer"
            className="header-icon-link"
            title="View package on npm"
            aria-label="View package on npm"
          >
            <NpmIcon />
          </a>

          <a
            href="https://github.com/Kashif-Rezwi/server-active-indicator"
            target="_blank"
            rel="noreferrer"
            className="header-icon-link"
            title="View repository on GitHub"
            aria-label="View repository on GitHub"
          >
            <GitHubIcon />
          </a>

          {/* Controls drawer toggle — only visible on small screens (CSS-gated) */}
          <button
            type="button"
            className="header-icon-link controls-toggle"
            onClick={onToggleControls}
            title={controlsOpen ? "Close controls panel" : "Open controls panel"}
            aria-label={controlsOpen ? "Close controls panel" : "Open controls panel"}
            aria-expanded={controlsOpen}
            aria-controls="demo-sidebar"
          >
            <SlidersIcon width={20} height={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
