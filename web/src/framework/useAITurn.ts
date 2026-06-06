import { useEffect, useRef } from 'react'

export interface AITurnOptions {
  /** How long to wait before the AI acts, so the opponent appears to "think". */
  delayMs?: number
  /**
   * Optional value that re-arms the timer when it changes even if `active` stayed
   * true. Use for games whose AI takes several steps while it's still its turn
   * (pass e.g. a step/phase counter). Single-call AIs (like Yahtzee's whole-turn
   * aiTurn) can omit it.
   */
  tick?: unknown
}

/**
 * Drives the AI opponent on a timer — the shared replacement for the inline
 * `useEffect(() => { if (turn === 'ai') setTimeout(...) }, [...])` every prototype
 * hand-rolled. While `active` is true it calls `onStep` once after `delayMs`,
 * cleaning up the timer on unmount or when the turn ends.
 */
export function useAITurn(active: boolean, onStep: () => void, opts: AITurnOptions = {}) {
  const { delayMs = 700, tick } = opts
  const cb = useRef(onStep)
  cb.current = onStep
  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => cb.current(), delayMs)
    return () => clearTimeout(id)
  }, [active, delayMs, tick])
}
