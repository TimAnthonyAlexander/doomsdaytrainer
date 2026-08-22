import { useEffect, useState } from 'react';

/**
 * A local edit that gives way to the stored value once the store catches up.
 *
 * Sliders and text fields have to move under the finger before the write to
 * IndexedDB resolves. Holding the draft until `committed` changes covers both
 * ends: the control never lags the user, and an import or a reset — which
 * changes the setting from somewhere else entirely — still lands on screen.
 */
export function useDraft<T>(committed: T): [T, (next: T) => void] {
  const [draft, setDraft] = useState<T | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [committed]);

  return [draft === null ? committed : draft, setDraft];
}
