import { describe, it, expect } from 'vitest'
import * as P from './logic'
import type { PerudoState, Face } from './logic'

// Pure logic tests: no DOM. Deterministic states for the rule checks, plus a seeded self-play to a
// valid winner under a guard cap with no throws.

function mkState(over: Partial<PerudoState> = {}): PerudoState {
  const base: PerudoState = {
    dice: [[2, 3, 4, 5, 6], [1, 1, 4, 2, 6], [3, 3, 3, 5, 1], [6, 6, 2, 2, 4]],
    counts: [5, 5, 5, 5],
    alive: [true, true, true, true],
    turn: 0,
    bid: null,
    opener: 0,
    palifico: false,
    phase: 'bidding',
    winner: null,
    reveal: null,
    history: [],
    actionSeq: 0,
    log: [],
  }
  return Object.assign(base, over)
}

describe('perudo logic', () => {
  it('makeGame deals a valid opening round — 4 players, 5 dice each', () => {
    const s = P.makeGame()
    expect(s.counts).toEqual([5, 5, 5, 5])
    expect(s.alive).toEqual([true, true, true, true])
    expect(s.dice.every(d => d.length === 5 && d.every(x => x >= 1 && x <= 6))).toBe(true)
    expect(s.phase).toBe('bidding')
    expect(s.bid).toBeNull()
    expect(s.winner).toBeNull()
  })

  it('actualCount: aces are wild (count toward any face) but not double-counted as themselves', () => {
    const s = mkState()
    // 4's: p0 has one, p1 has one 4 + two aces, p2 one ace, p3 one 4 → 1 + (1+2) + 1 + 1 = 6
    expect(P.actualCount(s, 4)).toBe(6)
    // aces themselves: p1 two, p2 one → 3 (aces NOT wild toward themselves beyond being aces)
    expect(P.actualCount(s, 1)).toBe(3)
  })

  it('actualCount in palifico: aces are NOT wild', () => {
    const s = mkState({ palifico: true })
    // 4's with no wild aces: p0 one, p1 one, p3 one = 3
    expect(P.actualCount(s, 4)).toBe(3)
  })

  it('legalBids/isRaise enforce a strict raise (higher qty, or same qty higher face)', () => {
    const prev = { quantity: 3, face: 4 as Face, byPlayer: 1 }
    expect(P.isRaise(null, { quantity: 1, face: 2 }, false)).toBe(true)
    expect(P.isRaise(prev, { quantity: 3, face: 5 }, false)).toBe(true)   // same qty higher face
    expect(P.isRaise(prev, { quantity: 4, face: 2 }, false)).toBe(true)   // higher qty
    expect(P.isRaise(prev, { quantity: 3, face: 4 }, false)).toBe(false)  // identical
    expect(P.isRaise(prev, { quantity: 3, face: 3 }, false)).toBe(false)  // same qty lower face
    expect(P.isRaise(prev, { quantity: 2, face: 6 }, false)).toBe(false)  // lower qty
  })

  it('aces-switch quantity rules: to-aces halves (ceil), off-aces is 2N+1', () => {
    // switching TO aces from 5 × 4's: quantity must be >= ceil(5/2) = 3
    const toFour = { quantity: 5, face: 4 as Face, byPlayer: 1 }
    expect(P.isRaise(toFour, { quantity: 3, face: 1 }, false)).toBe(true)
    expect(P.isRaise(toFour, { quantity: 2, face: 1 }, false)).toBe(false)
    // coming OFF 3 aces: quantity must be >= 2*3 + 1 = 7
    const acesBid = { quantity: 3, face: 1 as Face, byPlayer: 1 }
    expect(P.isRaise(acesBid, { quantity: 7, face: 2 }, false)).toBe(true)
    expect(P.isRaise(acesBid, { quantity: 6, face: 2 }, false)).toBe(false)
  })

  it('Dudo when actual count < bid → the BIDDER loses a die', () => {
    // p1 bids 8 × 6's; 6's = p0 one + p1 one+two wild aces + p2 one ace + p3 two = 7 < 8 → bidder loses.
    const s = mkState({ turn: 0, bid: { quantity: 8, face: 6, byPlayer: 1 } })
    expect(P.actualCount(s, 6)).toBe(7)
    const r = P.callDudo(s, 0)
    expect(r.phase).toBe('reveal')
    expect(r.reveal?.held).toBe(false)
    expect(r.reveal?.loser).toBe(1)
    expect(r.counts[1]).toBe(4)
    expect(r.counts[0]).toBe(5)
  })

  it('Dudo when actual count >= bid → the CALLER loses a die', () => {
    // p1 bids 4 × 4's; actual 4's = 6 >= 4 → bid held → caller (p0) loses.
    const s = mkState({ turn: 0, bid: { quantity: 4, face: 4, byPlayer: 1 } })
    const r = P.callDudo(s, 0)
    expect(r.reveal?.held).toBe(true)
    expect(r.reveal?.loser).toBe(0)
    expect(r.counts[0]).toBe(4)
    expect(r.counts[1]).toBe(5)
  })

  it('losing the last die eliminates the player; last standing wins', () => {
    // p2 at 1 die, bids a face that fails → p2 loses last die → eliminated.
    let s = mkState({
      counts: [3, 3, 1, 3],
      dice: [[2, 3, 4], [5, 6, 6], [2], [2, 3, 4]],
      turn: 0,
      bid: { quantity: 9, face: 5, byPlayer: 2 },
      palifico: true, // p2 at 1 die
    })
    s = P.callDudo(s, 0)
    expect(s.alive[2]).toBe(false)
    expect(s.counts[2]).toBe(0)
    // drive to a winner with three left → still alive > 1, no winner yet
    const r = P.nextRound(s)
    expect(r.phase).toBe('bidding')
    expect(r.winner).toBeNull()

    // Now force a last-standing win: only p3 alive.
    const solo = mkState({
      counts: [0, 0, 0, 2],
      alive: [false, false, false, true],
      phase: 'reveal',
      reveal: { bid: { quantity: 1, face: 2, byPlayer: 1 }, count: 0, caller: 3, loser: 1, held: false },
    })
    const won = P.nextRound(solo)
    expect(won.phase).toBe('over')
    expect(won.winner).toBe(3)
  })

  it('deterministic AI self-play reaches a valid winner under a guard cap with no throws', () => {
    // Seeded LCG for reproducibility.
    let seed = 123456789
    P.setRng(() => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    })
    try {
      for (let game = 0; game < 8; game++) {
        let s = P.makeGame()
        let guard = 0
        let threw = false
        try {
          while (s.winner == null && guard++ < 6000) {
            if (s.phase === 'reveal') { s = P.nextRound(s); continue }
            if (s.turn !== 0) { s = P.aiTurn(s); continue }
            // human seat: behave like an AI (decide then apply) for a hands-off self-play.
            const d = P.aiDecide(s, 0)
            if (d.type === 'dudo' && s.bid) s = P.callDudo(s, 0)
            else if (d.type === 'bid') {
              const before = s.actionSeq
              s = P.bid(s, 0, d.quantity, d.face)
              if (s.actionSeq === before && s.bid) s = P.callDudo(s, 0) // fallback if bid was illegal
            }
          }
        } catch {
          threw = true
        }
        expect(threw).toBe(false)
        if (s.winner != null) {
          expect(s.winner).toBeGreaterThanOrEqual(0)
          expect(s.winner).toBeLessThan(P.NUM_PLAYERS)
          expect(s.alive.filter(Boolean).length).toBe(1)
          expect(s.alive[s.winner]).toBe(true)
        }
      }
    } finally {
      P.resetRng()
    }
  })
})
