import { describe, it, expect } from 'vitest'
import * as LD from './logic'
import type { LiarsState, Face, Bid } from './logic'

// Pure logic test: no DOM. Constructs deterministic states for the rule checks, then plays
// several full self-play games (random human, real aiStep) to a winner under a cap.

describe('liars dice logic', () => {
  it('makeGame deals a valid opening round — 5 dice each, a round set up', () => {
    const s = LD.makeGame()
    expect(s.youCount).toBe(LD.START_DICE)
    expect(s.foeCount).toBe(LD.START_DICE)
    expect(s.youDice).toHaveLength(5)
    expect(s.foeDice).toHaveLength(5)
    expect(s.youDice.every(d => d >= 1 && d <= 6)).toBe(true)
    expect(s.foeDice.every(d => d >= 1 && d <= 6)).toBe(true)
    expect(s.phase).toBe('bidding')
    expect(s.bid).toBeNull()
    expect(s.winner).toBeNull()
    expect(s.history).toEqual([])
  })

  it('tally counts a face INCLUDING wild 1s', () => {
    const dice: Face[] = [4, 4, 1, 2, 1]
    expect(LD.tally(dice, 4)).toBe(4)   // two 4s + two wild 1s
    expect(LD.tally(dice, 2)).toBe(3)   // one 2 + two wild 1s
    expect(LD.tally(dice, 6)).toBe(2)   // no 6s + two wild 1s
    expect(LD.tally(dice, 1)).toBe(2)   // 1s count only as 1s (not doubled)
    expect(LD.tally([], 5)).toBe(0)
  })

  it('bid-legality ordering: a raise must be strictly higher', () => {
    const b: Bid = { qty: 3, face: 4 }
    expect(LD.isRaise(null, { qty: 1, face: 2 })).toBe(true)          // any opener is legal
    expect(LD.isRaise(b, { qty: 3, face: 5 })).toBe(true)             // same qty, higher face
    expect(LD.isRaise(b, { qty: 4, face: 2 })).toBe(true)             // higher qty, lower face still wins
    expect(LD.isRaise(b, { qty: 3, face: 4 })).toBe(false)            // identical
    expect(LD.isRaise(b, { qty: 3, face: 3 })).toBe(false)            // same qty, lower face
    expect(LD.isRaise(b, { qty: 2, face: 6 })).toBe(false)            // lower qty
    expect(LD.isRaise(b, { qty: 3, face: 1 as Face })).toBe(false)    // 1 is not a biddable face
    // minRaise is always a legal raise and is minimal
    expect(LD.minRaise(b)).toEqual({ qty: 3, face: 5 })
    expect(LD.minRaise({ qty: 3, face: 6 })).toEqual({ qty: 4, face: 2 })
    expect(LD.isRaise(b, LD.minRaise(b))).toBe(true)
  })

  it('resolving a challenge removes a die from the correct player', () => {
    const base: LiarsState = {
      youDice: [4, 4, 2, 5, 6], foeDice: [1, 4, 3, 2, 6],
      youCount: 5, foeCount: 5, turn: 'you', opener: 'foe',
      bid: { qty: 3, face: 4 }, phase: 'bidding', winner: null,
      reveal: null, history: [{ qty: 3, face: 4 }], log: [],
    }
    // true 4s = two 4s (you) + one 4 + one wild 1 (foe) = 4 >= 3 -> bid HELD, challenger (you) loses.
    expect(LD.trueCount(base, 4)).toBe(4)
    const held = LD.challenge(base, 'you')
    expect(held.phase).toBe('reveal')
    expect(held.reveal?.held).toBe(true)
    expect(held.reveal?.loser).toBe('you')
    expect(held.youCount).toBe(4)
    expect(held.foeCount).toBe(5)

    // Now an over-bid: claim 6 of a face that isn't there -> bid FAILS, bidder (foe) loses.
    const big: LiarsState = Object.assign({}, base, { turn: 'you' as const, bid: { qty: 6, face: 5 as Face } })
    // 5s: one 5 (you) + one wild 1 (foe) = 2 < 6 -> fails
    expect(LD.trueCount(big, 5)).toBe(2)
    const failed = LD.challenge(big, 'you')
    expect(failed.reveal?.held).toBe(false)
    expect(failed.reveal?.loser).toBe('foe')
    expect(failed.foeCount).toBe(4)
    expect(failed.youCount).toBe(5)
  })

  it('aiStep opens with a self-supported bid and never returns an illegal raise', () => {
    // foe to open with three 6s already in hand -> should bid at least a 6-ish claim, legal.
    const s: LiarsState = {
      youDice: [2, 3, 4, 5, 6], foeDice: [6, 6, 6, 1, 2],
      youCount: 5, foeCount: 5, turn: 'foe', opener: 'foe',
      bid: null, phase: 'bidding', winner: null, reveal: null, history: [], log: [],
    }
    const next = LD.aiStep(s)
    expect(next.bid).not.toBeNull()
    expect(LD.isRaise(null, next.bid!)).toBe(true)
  })

  it('plays several full games to a winner with no throws (random human + real AI)', () => {
    for (let game = 0; game < 12; game++) {
      let s = LD.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 4000) {
        if (s.phase === 'reveal') { s = LD.nextRound(s); continue }
        if (s.turn === 'foe') { s = LD.aiStep(s); continue }
        // human: challenge an implausibly high bid, otherwise make a simple legal raise.
        const total = s.youCount + s.foeCount
        if (s.bid && (s.bid.qty > total || s.bid.qty > Math.ceil(total * 0.7))) {
          s = LD.challenge(s, 'you')
        } else {
          const raise = LD.minRaise(s.bid)
          if (raise.qty > total) { s = LD.challenge(s, 'you') }
          else { s = LD.makeBid(s, 'you', raise) }
        }
      }
      expect(s.winner).not.toBeNull()                      // always terminates
      expect(['you', 'foe']).toContain(s.winner)
      expect(s.youCount === 0 || s.foeCount === 0).toBe(true)  // someone hit zero dice
      expect(s.youCount).toBeGreaterThanOrEqual(0)
      expect(s.foeCount).toBeGreaterThanOrEqual(0)
    }
  })
})
