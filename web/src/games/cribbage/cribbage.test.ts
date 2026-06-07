import { describe, it, expect } from 'vitest'
import * as C from './logic'
import type { Card, CribbageState, Side } from './logic'

// Pure-logic tests (no DOM). The centrepiece is scoreHand on famous known hands
// (the perfect 29, double runs, fifteens, flush, nobs), plus pegging points and a
// guarded full self-play game to a valid winner with no throws.

const card = (r: number, s: Card['s']): Card => ({ r, s })

describe('cribbage scoreHand', () => {
  it('scores the famous PERFECT 29 hand', () => {
    // Hand: J♥ 5♥ 5♠ 5♣ + starter 5♦ ... nobs needs the Jack's suit to match the
    // starter. Make the starter a 5 and the Jack share its suit.
    // Classic 29: three fives + J of the cut-card suit, starter the 4th five.
    const hand = [card(5, 'H'), card(5, 'S'), card(5, 'C'), card(11, 'D')] // J♦
    const starter = card(5, 'D') // starter 5♦ — matches the Jack's suit → nobs
    const b = C.scoreHand(hand, starter, false)
    // 8 fifteens (16) + four-of-a-kind fives (12) + nobs (1) = 29
    expect(b.total).toBe(29)
  })

  it('scores a double run with fifteens (4,4,5,6 + starter 6)', () => {
    const hand = [card(4, 'S'), card(4, 'H'), card(5, 'C'), card(6, 'D')]
    const starter = card(6, 'S')
    const b = C.scoreHand(hand, starter, false)
    // fifteens: 4+5+6 twice (using each 4) and 4+5+6 with the other 6 ... enumerate:
    //   pairs: two 4s (2) + two 6s (2) = 4
    //   runs: 4-5-6 with two 4s and two 6s = double-double run = 4 runs of 3 = 12
    //   fifteens: 4+5+6 → choose a 4 (2) × a 6 (2) = 4 combos = 8
    // total = 8 + 4 + 12 = 24
    expect(b.total).toBe(24)
  })

  it('scores fifteens-only (no pairs/runs/flush)', () => {
    // 10,5 makes 15; J,5 makes 15; mixed suits so no flush.
    const hand = [card(10, 'S'), card(5, 'H'), card(11, 'C'), card(2, 'D')]
    const starter = card(3, 'H')
    const b = C.scoreHand(hand, starter, false)
    // fifteens summing to 15: 10+5, J+5, 10+2+3, J+2+3 = 4 combos = 8. no run≥3, no pair.
    expect(b.total).toBe(8)
    expect(b.items.some((i) => i.label.startsWith('Fifteens'))).toBe(true)
    expect(b.items.some((i) => i.label === 'Runs')).toBe(false)
  })

  it('handles flush: 4 in hand vs 5 with starter, and the strict crib rule', () => {
    const fourFlush = [card(2, 'H'), card(4, 'H'), card(7, 'H'), card(9, 'H')]
    const offSuitStarter = card(11, 'S')
    const onSuitStarter = card(11, 'H')

    // 4-card hand flush (starter off-suit) = 4 points of flush.
    const a = C.scoreHand(fourFlush, offSuitStarter, false)
    expect(a.items.find((i) => i.label.startsWith('Flush'))?.points).toBe(4)

    // 5-card flush in hand = 5.
    const bb = C.scoreHand(fourFlush, onSuitStarter, false)
    expect(bb.items.find((i) => i.label.startsWith('Flush'))?.points).toBe(5)

    // In the CRIB the same 4 hand cards + off-suit starter score NO flush.
    const crib = C.scoreHand(fourFlush, offSuitStarter, true)
    expect(crib.items.find((i) => i.label.startsWith('Flush'))).toBeUndefined()
    // But all 5 of one suit in the crib does score 5.
    const cribAll5 = C.scoreHand(fourFlush, onSuitStarter, true)
    expect(cribAll5.items.find((i) => i.label.startsWith('Flush'))?.points).toBe(5)
  })

  it('scores nobs only when the Jack suit matches the starter', () => {
    const hand = [card(11, 'C'), card(2, 'S'), card(7, 'D'), card(9, 'H')]
    const match = C.scoreHand(hand, card(4, 'C'), false) // starter ♣ matches J♣
    expect(match.items.find((i) => i.label === 'Nobs')?.points).toBe(1)
    const noMatch = C.scoreHand(hand, card(4, 'D'), false)
    expect(noMatch.items.find((i) => i.label === 'Nobs')).toBeUndefined()
  })

  it('a legitimately scoreless hand returns total 0, not a falsy bug', () => {
    // No fifteens, no pairs, no runs, no flush; Jack suit ≠ starter so no nobs.
    const hand = [card(1, 'S'), card(3, 'H'), card(7, 'C'), card(11, 'D')]
    const b = C.scoreHand(hand, card(13, 'S'), false)
    expect(b.total).toBe(0)
    expect(b.items.length).toBe(0)
  })
})

describe('cribbage pegging', () => {
  const p = (cards: [number, Card['s']][]): C.PlayedCard[] =>
    cards.map(([r, s]) => ({ card: card(r, s), by: 'you' as Side }))

  it('scores fifteen in the play', () => {
    const pile = p([[7, 'S'], [8, 'H']])
    expect(C.pegPoints(pile, 15).total).toBe(2)
  })

  it('scores thirty-one in the play', () => {
    const pile = p([[10, 'S'], [10, 'H'], [10, 'C'], [1, 'D']]) // 10+10+10+1 = 31
    expect(C.pegPoints(pile, 31).items.some((i) => i.label === 'Thirty-one')).toBe(true)
  })

  it('scores a pair and a pair royal in the play', () => {
    expect(C.pegPoints(p([[6, 'S'], [6, 'H']]), 12).items.find((i) => i.label === 'Pair')?.points).toBe(2)
    expect(C.pegPoints(p([[6, 'S'], [6, 'H'], [6, 'C']]), 18).items.find((i) => i.label === 'Pair royal')?.points).toBe(6)
  })

  it('scores a run of 3 in the play (order-independent)', () => {
    // played 5, 7, 6 → last three form a run of 3
    const pile = p([[5, 'S'], [7, 'H'], [6, 'C']])
    expect(C.pegPoints(pile, 18).items.find((i) => i.label === 'Run of 3')?.points).toBe(3)
    // a duplicate breaks the run
    const broken = p([[5, 'S'], [5, 'H'], [6, 'C']])
    expect(broken.find ? C.pegPoints(broken, 16).items.some((i) => i.label.startsWith('Run')) : false).toBe(false)
  })

  it('his heels: Jack starter pegs 2 for the dealer immediately', () => {
    // Construct a deck whose 13th card (first of the undealt rest, the starter) is a Jack.
    const deck = buildDeckWithStarter(card(11, 'S'))
    const s = C.makeGame(deck, 'you')
    // Both discard to trigger the cut.
    let g = C.discardToCrib(s, 'you', [4, 5])
    g = C.discardToCrib(g, 'ai', [4, 5])
    expect(g.starter).toEqual(card(11, 'S'))
    expect(g.scores.you).toBeGreaterThanOrEqual(2) // dealer (you) pegged his heels
  })
})

describe('cribbage self-play', () => {
  it('plays full games to a valid winner under a guard cap, scores monotonic, no throws', () => {
    for (let game = 0; game < 8; game++) {
      let s: CribbageState = C.makeGame()
      let guard = 0
      let prevYou = 0, prevAi = 0
      while (s.winner == null && guard++ < 20000) {
        // monotonic non-decreasing scores
        expect(s.scores.you).toBeGreaterThanOrEqual(prevYou)
        expect(s.scores.ai).toBeGreaterThanOrEqual(prevAi)
        prevYou = s.scores.you; prevAi = s.scores.ai

        if (s.phase === 'discard') {
          if (s.full.you.length === 0) s = C.discardToCrib(s, 'you', C.aiDiscard(s, 'you'))
          else s = C.aiStep(s)
        } else if (s.phase === 'play') {
          if (s.turn === 'you') {
            if (C.youMustPass(s)) s = C.passGo(s, 'you')
            else {
              const idx = C.aiPlay(s, 'you')
              s = idx < 0 ? C.passGo(s, 'you') : C.playCard(s, 'you', idx)
            }
          } else {
            s = C.aiStep(s)
          }
        } else if (s.phase === 'show') {
          // show resolves synchronously inside the engine; deal the next hand.
          if (s.winner == null) s = C.nextHand(s)
        } else {
          break
        }
      }
      expect(guard).toBeLessThan(20000)        // terminated under the cap
      expect(s.winner === 'you' || s.winner === 'ai').toBe(true)
      expect(s.scores[s.winner as Side]).toBe(C.TARGET)
    }
  })
})

// Build a 52-card deck arranged so that cards[12] (the first undealt card = starter)
// is the given card, with the first 12 being 6 cards each for you/ai.
function buildDeckWithStarter(starter: Card): Card[] {
  const full = C.freshDeck()
  // remove the starter, place it at index 12.
  const rest = full.filter((c) => !(c.r === starter.r && c.s === starter.s))
  const head = rest.slice(0, 12)
  const tail = rest.slice(12)
  return head.concat([starter], tail)
}
