import { useCallback, useState } from 'react'

/**
 * Single source of truth for tweak values. Ported from the prototype's tweaks-panel.jsx
 * but with the design-tool host protocol removed (no `window.parent.postMessage`) — in
 * a standalone app the values just live in component state.
 *
 * setTweak accepts either setTweak('key', value) or setTweak({ key: value, ... }).
 */
export function useTweaks<T extends Record<string, unknown>>(
  defaults: T,
): [T, (keyOrEdits: keyof T | Partial<T>, val?: unknown) => void] {
  const [values, setValues] = useState<T>(defaults)
  const setTweak = useCallback((keyOrEdits: keyof T | Partial<T>, val?: unknown) => {
    const edits = (typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits
      : { [keyOrEdits as string]: val }) as Partial<T>
    setValues(prev => ({ ...prev, ...edits }))
  }, [])
  return [values, setTweak]
}
