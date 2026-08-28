import * as React from "react";

/**
 * Internal: `useSyncExternalStore` with a React 17 fallback (locked peer range includes
 * `^17`); namespace import avoids link-time throws under CJS React 17 interop.
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
