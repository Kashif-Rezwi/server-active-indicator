import { useState } from "react";
import type { DemoIndicatorConfig } from "./ControlPanel";
import { CheckIcon, CodeIcon, CopyIcon } from "./Icons";

export type IntegrationMode = "react-component" | "react-hook" | "next" | "vanilla";

interface CodeExportProps {
  config: DemoIndicatorConfig;
}

export function CodeExport({ config }: CodeExportProps) {
  const [mode, setMode] = useState<IntegrationMode>("react-component");
  const [copied, setCopied] = useState(false);

  const generateCode = (): string => {
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

    const hookOptions: string[] = [];
    if (config.revealDelay !== 3000) hookOptions.push(`revealDelay: ${config.revealDelay},`);
    if (config.pollInterval !== 5000) hookOptions.push(`pollInterval: ${config.pollInterval},`);
    if (config.offlineAfter !== 60000) hookOptions.push(`offlineAfter: ${config.offlineAfter},`);

    switch (mode) {
      case "react-component": {
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
      }

      case "react-hook": {
        const optionsBlock = hookOptions.length > 0 ? `\n  ${hookOptions.join("\n  ")}` : "";

        return `import { useServerStatus } from "server-active-indicator/react";

export function CustomServerIndicator() {
  const { status, elapsedSeconds, refresh } = useServerStatus({
    healthUrl: "https://api.example.com/health",${optionsBlock}
  });

  if (status === "waking") {
    return (
      <div className="custom-waking-ui">
        Server is spinning up... ({elapsedSeconds}s)
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div className="custom-offline-ui">
        <span>Server appears to be offline</span>
        <button type="button" onClick={refresh}>Retry</button>
      </div>
    );
  }

  // Silence on success: renders nothing when active or warm
  return null;
}`;
      }

      case "next": {
        return `'use client';

import { ServerStatus } from "server-active-indicator/react";

export function GlobalServerStatus() {
  return (
    <ServerStatus
      ${props.join("\n      ")}
    />
  );
}`;
      }

      case "vanilla": {
        return `import { createMonitor } from "server-active-indicator";

const monitor = createMonitor({
  healthUrl: "https://api.example.com/health",
  revealDelay: ${config.revealDelay},
  pollInterval: ${config.pollInterval},
  offlineAfter: ${config.offlineAfter},
});

// Subscribe to state machine transitions:
const unsubscribe = monitor.subscribe(({ status, elapsedSeconds }) => {
  console.log("Status:", status, "Elapsed:", elapsedSeconds);

  if (status === "waking") {
    // Show custom waking UI
  } else if (status === "active") {
    // Backend is ready (silence on success)
  } else if (status === "offline") {
    // Show offline notification
  }
});

// Immediate manual recheck (e.g. on Retry click):
// monitor.refresh();

// Teardown when unmounting:
// unsubscribe();
// monitor.destroy();`;
      }
    }
  };

  const codeText = generateCode();

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple token highlighter that wraps keywords, strings, comments, and tags
  const renderHighlightedCode = (rawCode: string) => {
    const lines = rawCode.split("\n");
    return lines.map((line, lineIdx) => {
      // Check for comments
      if (line.trim().startsWith("//")) {
        return (
          <div key={lineIdx} className="code-line">
            <span className="token-comment">{line}</span>
          </div>
        );
      }

      // Tokenize line with basic regex
      const parts = line.split(
        /(\bimport\b|\bfrom\b|\bexport\b|\bfunction\b|\bconst\b|\breturn\b|\bif\b|\bnull\b|\btype\b|'use client'|"[^"]*"|'[^']*'|`[^`]*`|<[A-Za-z0-9_]+|<\/[A-Za-z0-9_]+|\/>|>)/g,
      );

      return (
        <div key={lineIdx} className="code-line">
          {parts.map((part, partIdx) => {
            if (!part) return null;
            if (
              [
                "import",
                "from",
                "export",
                "function",
                "const",
                "return",
                "if",
                "null",
                "type",
                "'use client'",
              ].includes(part)
            ) {
              return (
                <span key={partIdx} className="token-keyword">
                  {part}
                </span>
              );
            }
            if (
              (part.startsWith('"') && part.endsWith('"')) ||
              (part.startsWith("'") && part.endsWith("'")) ||
              (part.startsWith("`") && part.endsWith("`"))
            ) {
              return (
                <span key={partIdx} className="token-string">
                  {part}
                </span>
              );
            }
            if (part.startsWith("<") || part === "/>" || part === ">") {
              return (
                <span key={partIdx} className="token-tag">
                  {part}
                </span>
              );
            }
            return <span key={partIdx}>{part}</span>;
          })}
        </div>
      );
    });
  };

  return (
    <div className="control-card code-export-card">
      <div className="code-export-header">
        <div className="code-export-title-row">
          <CodeIcon />
          <span className="card-title-heading">Integration Code</span>
        </div>

        <button
          type="button"
          className="copy-code-btn"
          onClick={handleCopyCode}
          title="Copy code snippet to clipboard"
          aria-label="Copy code snippet"
        >
          {copied ? (
            <>
              <CheckIcon />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <CopyIcon />
              <span>Copy Code</span>
            </>
          )}
        </button>
      </div>

      <div className="framework-tabs-bar" role="tablist" aria-label="Integration Framework">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "react-component"}
          className={`framework-pill ${mode === "react-component" ? "active" : ""}`}
          onClick={() => setMode("react-component")}
        >
          React Component
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "react-hook"}
          className={`framework-pill ${mode === "react-hook" ? "active" : ""}`}
          onClick={() => setMode("react-hook")}
        >
          useServerStatus Hook
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "next"}
          className={`framework-pill ${mode === "next" ? "active" : ""}`}
          onClick={() => setMode("next")}
        >
          Next.js
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "vanilla"}
          className={`framework-pill ${mode === "vanilla" ? "active" : ""}`}
          onClick={() => setMode("vanilla")}
        >
          Vanilla JS
        </button>
      </div>

      <div className="code-snippet-box">
        <pre className="code-snippet-pre">{renderHighlightedCode(codeText)}</pre>
      </div>
    </div>
  );
}
