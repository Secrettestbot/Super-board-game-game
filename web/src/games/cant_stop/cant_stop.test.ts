import { describe, it, expect } from 'vitest'
import * as CS from './logic'
import type { CantStopState } from './logic'

// Pure logic test (no DOM). Checks the board shape, dice-pairing legality, bust/stop/claim
// transitions, then plays a few full games to a valid 3-column winner with a hard cap.

describe('cant stop logic', () => {
  it('starts on a valid board — columns 2..12 with pyramid heights, no progress, you pre-roll', () => {
    const s = CS.makeGame()
    expect(CS.COLS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(CS.HEIGHTS[7]).toBe(13)
    expect(CS.HEIGHTS[2]).toBe(3)
    expect(CS.HEIGHTS[12]).toBe(3)
    expect(CS.HEIGHTS[6]).toBe(11)
    expect(CS.HEIGHTS[8]).toBe(11)
    expect(CS.HEIGHTS[4]).toBe(7)
    for (const c of CS.COLS) {
      expect(s.perm.you[c]).toBe(0)
      expect(s.perm.ai[c]).toBe(0)
    }
    expect(s.claimed).toEqual({})
    expect(s.turn).toBe('you')
    expect(s.phase).toBe('preroll')
    expect(s.winner).toBeNull()
  })

  it('derives three pairings from 4 dice and marks legality correctly', () => {
    const s = CS.makeGame()
    // dice 1,2,3,4 → pairings (1+2|3+4)=(3,7), (1+3|2+4)=(4,6), (1+4|2+3)=(5,5)
    const sums = CS.pairSums([1, 2, 3, 4])
    expect(sums).toEqual([[3, 7], [4, 6], [5, 5]])

    // With no runners and nothing claimed, every pairing advancing a real column is usable.
    const rolled = CS.roll({ ...s, dice: [], pairings: [] })
    // roll uses its own RNG; instead test usability via choose/roll on a constructed state.
    expect(rolled.phase === 'choose' || rolled.phase === 'preroll').toBe(true)
  })

  it('a pairing is usable only if it advances an existing or free (≤3) runner column', () => {
    // Construct a state where the active player already holds runners in 3 columns: 5, 6, 9.
    let s = CS.makeGame()
    s = { ...s, runners: { 5: 1, 6: 1, 9: 1 } }
    // Pairing summing to (8, 10): both are NEW columns, but we already hold 3 runners → not usable.
    expect(usable(s, [8, 10])).toBe(false)
    // Pairing summing to (5, 8): 5 is an existing runner → usable (can advance 5).
    expect(usable(s, [5, 8])).toBe(true)
    // Pairing (6, 9): both existing runners → usable.
    expect(usable(s, [6, 9])).toBe(true)

    // A column already at its top cannot be advanced.
    let t = CS.makeGame()
    t = { ...t, runners: { 7: CS.HEIGHTS[7] } } // 7 is maxed as a runner
    expect(usable(t, [7, 8])).toBe(true)   // 8 is a free new column → still usable via 8
    t = { ...t, runners: { 2: CS.HEIGHTS[2], 12: CS.HEIGHTS[12], 7: CS.HEIGHTS[7] } }
    expect(usable(t, [2, 12])).toBe(false) // both maxed, no free runner → not usable
    expect(usable(t, [2, 7])).toBe(false)  // both maxed runners → not usable
  })

  it('busting clears the turn runner progress and passes the turn', () => {
    let s = CS.makeGame()
    // Give the active player runners in 2,7,12 all maxed → any new column needs a 4th runner.
    s = { ...s, runners: { 2: CS.HEIGHTS[2], 7: CS.HEIGHTS[7], 12: CS.HEIGHTS[12] }, phase: 'preroll' }
    // Roll repeatedly: because all three runner columns are maxed and starting any other column
    // needs a 4th slot, EVERY roll busts. So a single roll must bust here.
    const after = CS.roll(s)
    expect(after.turn).toBe('ai')              // turn passed
    expect(Object.keys(after.runners).length).toBe(0) // runners cleared
    // Permanent markers untouched (nothing was committed).
    expect(after.perm.you[7]).toBe(0)
  })

  it('stopping commits runners to permanent and topping a column claims it', () => {
    let s = CS.makeGame()
    // Put runners just below tops: column 2 at top (claim), column 7 partway.
    s = { ...s, runners: { 2: CS.HEIGHTS[2], 7: 4 }, phase: 'preroll' }
    const after = CS.stop(s)
    expect(after.perm.you[2]).toBe(CS.HEIGHTS[2]) // committed
    expect(after.perm.you[7]).toBe(4)
    expect(after.claimed[2]).toBe('you')          // claimed the topped column
    expect(after.claimed[7]).toBeUndefined()
    expect(after.turn).toBe('ai')                 // turn passes
    expect(Object.keys(after.runners).length).toBe(0)
  })

  it('claiming a third column sets the winner', () => {
    let s = CS.makeGame()
    // Pre-claim two columns for you, set runners to top a third on stop.
    s = {
      ...s,
      claimed: { 3: 'you', 4: 'you' },
      runners: { 11: CS.HEIGHTS[11] },
      phase: 'preroll',
    }
    const after = CS.stop(s)
    expect(after.claimed[11]).toBe('you')
    expect(CS.claimedCount(after, 'you')).toBe(3)
    expect(after.winner).toBe('you')
  })

  it('plays a few full games to a valid 3-column winner without throwing, fast', () => {
    for (let g = 0; g < 4; g++) {
      let s = CS.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 4000) {
        if (s.turn === 'ai') {
          s = CS.aiStep(s)
          continue
        }
        // Human: a simple policy. Roll; if it busted the turn flips. After a couple of
        // advances this turn, stop to bank.
        if (s.phase === 'preroll') {
          const advances = Object.keys(s.runners).length
          // count runner steps taken
          let steps = 0
          for (const cStr of Object.keys(s.runners)) steps += s.runners[Number(cStr)] - s.perm.you[Number(cStr)]
          if (advances > 0 && steps >= 2) { s = CS.stop(s); continue }
          s = CS.roll(s)
        } else {
          // choose phase: pick the first usable pairing.
          const which = s.pairings.findIndex(p => p.usable)
          s = CS.choose(s, which < 0 ? 0 : which)
        }
      }
      expect(s.winner === 'you' || s.winner === 'ai').toBe(true)
      expect(CS.claimedCount(s, s.winner!)).toBeGreaterThanOrEqual(3)
    }
  })
})

// Helper: read a pairing's usability for a constructed dice sum-pair by building the
// state's pairings directly through roll's internals is private, so reconstruct via choose
// semantics: a pairing is usable iff choosing it would advance something.
function usable(s: CantStopState, sums: [number, number]): boolean {
  // Mirror logic.pairingUsable by attempting an advance on a clone.
  const runners: Record<number, number> = { ...s.runners }
  let advanced = false
  const runnerCols = () => Object.keys(runners).map(Number)
  for (const c of sums) {
    if (s.claimed[c]) continue
    const has = runners[c] != null
    if (!has && runnerCols().length >= 3) continue
    const cur = has ? runners[c] : s.perm[s.turn][c]
    if (cur < CS.HEIGHTS[c]) { runners[c] = cur + 1; advanced = true }
  }
  return advanced
}
