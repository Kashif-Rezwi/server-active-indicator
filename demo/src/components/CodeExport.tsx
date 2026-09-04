import { useState } from "react";
import type { DemoIndicatorConfig } from "./ControlPanel";
import { CheckIcon, CodeIcon } from "./Icons";

export type SupportedFramework = "react" | "next" | "vue" | "vanilla";

interface CodeExportProps {
  config: DemoIndicatorConfig;
}

export function CodeExport({ config }: CodeExportProps) {
  const [framework, setFramework] = useState<SupportedFramework>("react");
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

    switch (framework) {
      case "react": {
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

      case "vue": {
        return `<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { createMonitor } from "server-active-indicator";

const status = ref("checking");
const elapsed = ref(0);
let monitor;

onMounted(() => {
  monitor = createMonitor({
    healthUrl: "https://api.example.com/health",
    revealDelay: ${config.revealDelay},
    pollInterval: ${config.pollInterval},
    offlineAfter: ${config.offlineAfter},
  });

  monitor.subscribe((snap) => {
    status.value = snap.status;
    elapsed.value = snap.elapsedSeconds;
  });
});

onUnmounted(() => {
  monitor?.destroy();
});
</script>

<template>
  <div v-if="status === 'waking'" class="waking-banner">
    Starting up... ({{ elapsed }}s)
  </div>
</template>`;
      }

      case "vanilla": {
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
    // Reveal waking notification
  } else if (status === "active") {
    // Backend is ready
  }
});

// Teardown when unmounting / navigating:
// unsubscribe();
// monitor.destroy();`;
      }
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(generateCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="control-card code-export-card">
      <div className="code-export-header">
        <div className="code-export-title-row">
          <CodeIcon />
          <span className="card-title-heading">Integration Code</span>
        </div>

        <div className="framework-segmented-bar">
          <button
            type="button"
            className={`framework-pill ${framework === "react" ? "active" : ""}`}
            onClick={() => setFramework("react")}
          >
            React
          </button>
          <button
            type="button"
            className={`framework-pill ${framework === "next" ? "active" : ""}`}
            onClick={() => setFramework("next")}
          >
            Next.js
          </button>
          <button
            type="button"
            className={`framework-pill ${framework === "vue" ? "active" : ""}`}
            onClick={() => setFramework("vue")}
          >
            Vue 3
          </button>
          <button
            type="button"
            className={`framework-pill ${framework === "vanilla" ? "active" : ""}`}
            onClick={() => setFramework("vanilla")}
          >
            Vanilla JS
          </button>
        </div>
      </div>

      <div className="code-snippet-box">
        <button
          type="button"
          className="copy-code-btn"
          onClick={handleCopyCode}
          title="Copy code snippet to clipboard"
        >
          {copied ? (
            <>
              <CheckIcon /> Copied
            </>
          ) : (
            "Copy Code"
          )}
        </button>
        <pre>{generateCode()}</pre>
      </div>
    </div>
  );
}
