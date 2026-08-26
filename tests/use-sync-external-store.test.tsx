import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSyncExternalStoreLegacy } from "../src/react/use-sync-external-store";

interface Store {
  get: () => number;
  set: (next: number) => void;
  subscribe: (listener: () => void) => () => void;
  listenerCount: () => number;
}

function createStore(initial: number): Store {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: number) {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount: () => listeners.size,
  };
}

describe("useSyncExternalStoreLegacy (React 17 fallback)", () => {
  it("subscribes on mount and renders store updates", () => {
    const store = createStore(0);
    const { result } = renderHook(() => useSyncExternalStoreLegacy(store.subscribe, store.get));

    expect(result.current).toBe(0);
    expect(store.listenerCount()).toBe(1);

    act(() => store.set(5));
    expect(result.current).toBe(5);
  });

  it("unsubscribes on unmount — no updates leak", () => {
    const store = createStore(0);
    const { result, unmount } = renderHook(() =>
      useSyncExternalStoreLegacy(store.subscribe, store.get),
    );

    unmount();
    expect(store.listenerCount()).toBe(0);

    act(() => store.set(9)); // no crash, no update on an unmounted component
    expect(result.current).toBe(0);
  });

  it("converges when the store changed between render and subscribe", () => {
    const store = createStore(0);
    // Render reads 0 (useState initializer); by the time the effect runs, the
    // store has moved to 2 without notifying — the shim must converge, not stay stale.
    const get = vi.fn(() => 2).mockReturnValueOnce(0);
    const { result } = renderHook(() => useSyncExternalStoreLegacy(store.subscribe, get));

    expect(result.current).toBe(2);
  });

  it("re-subscribes when the store identity changes", () => {
    const a = createStore(0);
    const b = createStore(100);
    const { result, rerender } = renderHook(
      ({ store }: { store: Store }) => useSyncExternalStoreLegacy(store.subscribe, store.get),
      { initialProps: { store: a } },
    );

    expect(result.current).toBe(0);

    rerender({ store: b });
    expect(result.current).toBe(100); // converged to the new store
    expect(a.listenerCount()).toBe(0); // old subscription cleaned up
    expect(b.listenerCount()).toBe(1);

    act(() => b.set(200));
    expect(result.current).toBe(200);
  });

  it("selects React's useSyncExternalStore when available (React ≥18)", async () => {
    const React = await import("react");
    const { useSyncExternalStoreCompat } = await import("../src/react/use-sync-external-store");
    expect(useSyncExternalStoreCompat).toBe(React.useSyncExternalStore);
  });
});
