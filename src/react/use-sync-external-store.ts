import * as React from "react";

/**
 * Internal: `useSyncExternalStore` with a React 17 fallback.
 *
 * `useSyncExternalStore` shipped in React 18, but the locked peer range includes
 * `^17` (AGENTS.md). Rather than take a runtime dependency on the official shim
 * package, we use React's implementation when present and fall back to a small
 * legacy subscription pattern otherwise. The fallback is only correct on legacy
 * (non-concurrent) React — which is exactly and only where it runs.
 *
 * `useSyncExternalStore` is accessed through the namespace import: a named import
 * of a missing export can throw at link time under bundler-less ESM interop with
 * CJS React 17, before any fallback could execute.
 */

/** The classic `useState` + `useEffect` external-store subscription (React ≤17). */
export function useSyncExternalStoreLegacy<Value>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Value,
  // Present for signature parity with React's hook; on the legacy path there is no
  // server rendering, so the client snapshot is all there is.
  _getServerSnapshot?: () => Value,
): Value {
  const [snapshot, setSnapshot] = React.useState(() => getSnapshot());

  React.useEffect(() => {
    const handleChange = () => setSnapshot(getSnapshot());
    // Converge if the store changed between render and subscribe.
    handleChange();
    const unsubscribe = subscribe(handleChange);
    return unsubscribe;
  }, [subscribe, getSnapshot]);

  return snapshot;
}

const useSyncExternalStoreCompat: <Value>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Value,
  getServerSnapshot?: () => Value,
) => Value = React.useSyncExternalStore ?? useSyncExternalStoreLegacy;

export { useSyncExternalStoreCompat };
