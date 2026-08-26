import { createEngine } from "./engine";
import type { Engine } from "./engine";
import type { MonitorConfig, MonitorSnapshot } from "./types";

/** Per-consumer handle onto a shared engine. This is the public `Monitor`. */
export interface Monitor {
  getSnapshot(): MonitorSnapshot;
  subscribe(listener: (snapshot: MonitorSnapshot) => void): () => void;
  refresh(): void;
  destroy(): void;
}

interface EngineEntry {
  engine: Engine;
  refs: number;
}

const registry = new Map<string, EngineEntry>();

/**
 * Stable key for the *behavioral* config. Consumers with identical effective
 * behavior share one engine. A custom `check` is not serializable, so it shares
 * only when the user supplies an explicit `key`; otherwise it gets a unique engine.
 */
function registryKey(config: MonitorConfig): string {
  if (config.check) {
    // Custom check: explicit key shares; absent key → unique (never shared).
    return config.key ? `check:${config.key}` : `check:unique:${uniqueId()}`;
  }
  const behavioral: Record<string, unknown> = {
    url: config.healthUrl,
    timeout: config.timeout,
    revealDelay: config.revealDelay,
    pollInterval: config.pollInterval,
    offlineAfter: config.offlineAfter,
    activeCheckInterval: config.activeCheckInterval,
    pauseWhenHidden: config.pauseWhenHidden,
    backoffFactor: config.backoffFactor,
    backoffCap: config.backoffCap,
    credentials: config.credentials,
    headers: config.headers,
  };
  return `url:${stableStringify(behavioral)}`;
}

let counter = 0;
function uniqueId(): string {
  counter += 1;
  return `${counter}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Acquires a per-consumer handle to the shared engine for `config`, creating the
 * engine on first use. The handle's `destroy()` releases the reference; the engine
 * is torn down when its last consumer releases it.
 */
export function acquireMonitor(config: MonitorConfig): Monitor {
  const key = registryKey(config);
  let entry = registry.get(key);
  if (!entry) {
    entry = { engine: createEngine(config), refs: 0 };
    registry.set(key, entry);
  }
  entry.refs += 1;

  let released = false;
  const { engine } = entry;
  const unsubs = new Set<() => void>();

  return {
    getSnapshot: () => engine.getSnapshot(),
    subscribe(listener) {
      const unsub = engine.subscribe(listener);
      unsubs.add(unsub);
      return () => {
        unsubs.delete(unsub);
        unsub();
      };
    },
    refresh: () => engine.refresh(),
    destroy() {
      if (released) return;
      released = true;
      for (const unsub of unsubs) unsub();
      unsubs.clear();
      entry.refs -= 1;
      if (entry.refs <= 0) {
        registry.delete(key);
        engine.destroy();
      }
    },
  };
}

/** Test introspection: number of live shared engines. */
export function __engineCount(): number {
  return registry.size;
}
