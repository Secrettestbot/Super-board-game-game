import { useEffect, useRef } from 'react'

export interface GameKeysOptions {
  /** N — new game / restart. */
  onNew?: () => void
  /** ? or / — toggle the rules modal. */
  onToggleRules?: () => void
  /** Esc — close/cancel/deselect. */
  onEscape?: () => void
  /**
   * Game-specific keys (Space = roll, R = rotate, …). Runs first; return true to
   * mark the event handled and skip the standard shortcuts.
   */
  extra?: (e: KeyboardEvent) => boolean | void
}

/**
 * The shared keyboard contract for every game page: N = new, ? = rules, Esc = close,
 * plus an `extra` hook for per-game keys. Replaces the keydown useEffect each
 * prototype re-rolled.
 */
export function useGameKeys(opts: GameKeysOptions) {
  const ref = useRef(opts)
  ref.current = opts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const o = ref.current
      if (o.extra && o.extra(e)) return
      if (e.key === '?' || e.key === '/') o.onToggleRules?.()
      else if (e.key === 'Escape') o.onEscape?.()
      else if (e.key === 'n' || e.key === 'N') o.onNew?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
