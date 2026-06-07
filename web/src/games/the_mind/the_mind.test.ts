import { describe, it, expect } from 'vitest'
import {
  makeGame,
  playLowest,
  useShuriken,
  advanceLevel,
  tick,
  gameStatus,
  totalCardsLeft,
  lowestOutstanding,
  MAX_LEVEL,
  START_LIVES,
} from './logic'
import type { Timing, MindState, PlayerId } from './logic'

// A deterministic deal: identity-ish deck. We pass explicit permutations per test.
function identityDeck(n = 100): number[] {
  return Array.from({ length: n }, (_, i) => i + 1)
}

// Deterministic timing where AIs never fire on their own (huge delay), so tests
// control play order explicitly. deal returns a fixed permutation.
const inertTiming = (deck: number[]): Timing => ({
  deal: () => deck.slice(),
  aiDelay: () => 1_000_000,
})

describe('The Mind — dealing', () => {
  it('deals each player exactly `level` cards, all distinct, from 1..100', () => {
    for (const level of [1, 2, 5, 8]) {
      const s = makeGame(level, identityDeck(), inertTiming(identityDeck()))
      expect(s.hands).toHaveLength(3)
      for (const h of s.hands) expect(h).toHaveLength(level)
      const all = s.hands.flat()
      expect(new Set(all).size).toBe(all.length) // distinct
      for (const v of all) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(100) }
      // hands sorted ascending
      for (const h of s.hands) expect(h).toEqual([...h].sort((a, b) => a - b))
    }
  })
})

describe('The Mind — playLowest correctness', () => {
  it('succeeds when the played card IS the lowest held across all hands', () => {
    // hands: p0=[1], p1=[2], p2=[3]
    const s = makeGame(1, [1, 2, 3], inertTiming([1, 2, 3]))
    expect(s.hands).toEqual([[1], [2], [3]])
    const s1 = playLowest(s, 0, inertTiming([1, 2, 3]))
    expect(s1.lives).toBe(START_LIVES)
    expect(s1.pileTop).toBe(1)
    expect(s1.hands[0]).toEqual([])
    expect(s1.lastRevealed).toEqual([])
  })

  it('loses a life and reveals lowers when a lower card is still held', () => {
    // p0 holds 5, but p1 holds 2 and 3 (lower). Playing p0's 5 is a mistake.
    // deal order with level 2: round-robin -> p0 gets deck[0],deck[3]; p1 deck[1],deck[4]; p2 deck[2],deck[5]
    // Use explicit small deck so p0 lowest is high and others lower.
    // deck=[5,2,9,8,3,10] => p0=[5,8], p1=[2,3], p2=[9,10]
    const deck = [5, 2, 9, 8, 3, 10]
    const s = makeGame(2, deck, inertTiming(deck))
    expect(s.hands[0][0]).toBe(5)
    const s1 = playLowest(s, 0, inertTiming(deck))
    expect(s1.lives).toBe(START_LIVES - 1)
    expect(s1.pileTop).toBe(5)
    // p1's 2 and 3 are lower than 5 -> revealed & discarded
    expect(s1.lastRevealed).toEqual([2, 3])
    expect(s1.hands[1]).toEqual([]) // both 2 and 3 removed
  })
})

describe('The Mind — level progression and end states', () => {
  it('advances when a level is completed with no cards left', () => {
    const s = makeGame(1, [1, 2, 3], inertTiming([1, 2, 3]))
    let g: MindState = s
    g = playLowest(g, 0, inertTiming([1, 2, 3])) // play 1
    g = playLowest(g, 1, inertTiming([1, 2, 3])) // play 2
    g = playLowest(g, 2, inertTiming([1, 2, 3])) // play 3
    expect(totalCardsLeft(g)).toBe(0)
    expect(gameStatus(g)).toBe('playing') // level complete, not yet advanced
    const lvl2 = advanceLevel(g, [10, 20, 30, 40, 50, 60], inertTiming([10, 20, 30, 40, 50, 60]))
    expect(lvl2.level).toBe(2)
    expect(lvl2.pileTop).toBe(0)
    for (const h of lvl2.hands) expect(h).toHaveLength(2)
  })

  it('finishing the last level = won', () => {
    const s = makeGame(MAX_LEVEL, undefined, inertTiming(identityDeck()))
    // Force a near-final state: empty all but the single highest card, then play it.
    const g: MindState = { ...s, hands: [[100], [], []], lives: START_LIVES, level: MAX_LEVEL }
    const done = playLowest(g, 0, inertTiming(identityDeck()))
    expect(gameStatus(done)).toBe('won')
  })

  it('running out of lives = lost', () => {
    // p0 plays a too-early card with only 1 life left -> lost.
    const deck = [5, 2, 9, 8, 3, 10]
    const base = makeGame(2, deck, inertTiming(deck))
    const g: MindState = { ...base, lives: 1 }
    const done = playLowest(g, 0, inertTiming(deck))
    expect(done.lives).toBe(0)
    expect(gameStatus(done)).toBe('lost')
  })
})

describe('The Mind — shuriken', () => {
  it('discards each player lowest face up without costing a life', () => {
    const deck = [5, 2, 9, 8, 3, 10]
    const s = makeGame(2, deck, inertTiming(deck)) // p0=[5,8] p1=[2,3] p2=[9,10]
    const s1 = useShuriken(s, inertTiming(deck))
    expect(s1.lives).toBe(START_LIVES)
    expect(s1.shuriken).toBe(s.shuriken - 1)
    expect(s1.lastRevealed).toEqual([2, 5, 9].sort((a, b) => a - b))
    expect(s1.hands[0]).toEqual([8])
    expect(s1.hands[1]).toEqual([3])
    expect(s1.hands[2]).toEqual([10])
  })
})

describe('The Mind — deterministic self-play terminates', () => {
  it('reaches a terminal status under a guard cap with no throws', () => {
    // Deterministic timing: each AI fires after `gap` ticks based on its lowest card.
    // The human is auto-played by a simple strategy: play when your lowest equals the
    // global lowest outstanding (perfect play) to keep it bounded but exercise ticks.
    const timing: Timing = {
      deal: () => identityDeck(),
      aiDelay: (cardValue, pileTop) => Math.max(1, cardValue - pileTop),
    }
    let s = makeGame(1, undefined, timing)
    let guard = 0
    expect(() => {
      while (gameStatus(s) === 'playing' && guard < 100_000) {
        guard++
        // Human plays only when truly lowest (perfect) — otherwise let the clock tick.
        const lo = lowestOutstanding(s)
        if (lo != null && lo.player === 0 && s.clock >= 1) {
          s = playLowest(s, 0, timing)
          continue
        }
        // Advance level if cleared.
        if (totalCardsLeft(s) === 0 && s.level < MAX_LEVEL) {
          s = advanceLevel(s, undefined, timing)
          continue
        }
        s = tick(s, timing)
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(100_000)
    expect(['won', 'lost']).toContain(gameStatus(s))
  })

  it('a self-play that always plays the global lowest reaches won', () => {
    const timing: Timing = {
      deal: () => identityDeck(),
      aiDelay: () => 1, // irrelevant; we drive plays manually
    }
    let s = makeGame(1, undefined, timing)
    let guard = 0
    while (gameStatus(s) === 'playing' && guard < 100_000) {
      guard++
      if (totalCardsLeft(s) === 0) {
        s = advanceLevel(s, undefined, timing)
        continue
      }
      const lo = lowestOutstanding(s)
      if (lo == null) break
      s = playLowest(s, lo.player as PlayerId, timing)
    }
    expect(gameStatus(s)).toBe('won')
    expect(s.lives).toBe(START_LIVES) // perfect play loses no lives
  })
})
