import { describe, it, expect } from 'vitest'
import * as NT from './logic'
import type { NoThanksState, Who } from './logic'

// Pure logic test (no DOM). Checks the dealt game shape, run-aware scoring, the take/pass
// transitions, and plays a few full games to random termination against the real AI.

describe('no thanks! logic', () => {
  it('deals a valid game — 24-card deck from 3..35 with 9 removed, 11 chips each, a card up, a player to act', () => {
    const s = NT.makeGame()
    // 24 cards remain in collection: deck + the one face-up card
    expect(s.deck.length).toBe(23)
    expect(s.card).not.toBeNull()
    const all = s.deck.concat([s.card!])
    expect(all.length).toBe(NT.HIGH - NT.LOW + 1 - NT.REMOVED) // 33 - 9 = 24
    // every card is in range and unique
    for (const c of all) { expect(c).toBeGreaterThanOrEqual(NT.LOW); expect(c).toBeLessThanOrEqual(NT.HIGH) }
    expect(new Set(all).size).toBe(all.length)
    expect(s.chips.you).toBe(11)
    expect(s.chips.ai).toBe(11)
    expect(s.pot).toBe(0)
    expect(s.winner).toBeNull()
    expect(['you', 'ai']).toContain(s.turn)
  })

  it('scores a run by its lowest card, and chips subtract', () => {
    // {7,8,9} is one run -> counts 7; minus 0 chips
    expect(NT.scoreHand([7, 8, 9], 0)).toBe(7)
    // {3,9} are two separate runs -> 3 + 9 = 12
    expect(NT.scoreHand([3, 9], 0)).toBe(12)
    // chips each subtract 1
    expect(NT.scoreHand([7, 8, 9], 5)).toBe(2)
    expect(NT.scoreHand([10], 11)).toBe(-1)
    // order independence
    expect(NT.scoreHand([9, 7, 8], 0)).toBe(7)
  })

  it('runs() groups consecutive numbers', () => {
    expect(NT.runs([3, 4, 5, 9, 20, 21])).toEqual([[3, 4, 5], [9], [20, 21]])
  })

  it('taking a card transfers the card + its chips and flips the next', () => {
    const base = NT.makeGame()
    const who = base.turn as Who
    // seed a pot so we can verify the chip transfer
    const s: NoThanksState = Object.assign({}, base, { pot: 3 })
    const card = s.card!
    const deckBefore = s.deck.length
    const chipsBefore = s.chips[who]
    const n = NT.take(s, who)
    expect(n.taken[who]).toContain(card)
    expect(n.chips[who]).toBe(chipsBefore + 3)        // gained the 3 chips on the card
    expect(n.deck.length).toBe(deckBefore - 1)         // one card flipped
    expect(n.pot).toBe(0)                              // pot reset
    expect(n.turn).toBe(who)                           // taker keeps deciding
    expect(n.card).not.toBe(card)                      // a fresh card is up
  })

  it('passing moves one chip onto the card and hands over the turn', () => {
    const s = NT.makeGame()
    const who = s.turn as Who
    const other: Who = who === 'you' ? 'ai' : 'you'
    const n = NT.pass(s, who)
    expect(n.chips[who]).toBe(s.chips[who] - 1)
    expect(n.pot).toBe(s.pot + 1)
    expect(n.card).toBe(s.card)        // same card still face-up
    expect(n.turn).toBe(other)         // passed to the rival
  })

  it('a player with 0 chips cannot pass', () => {
    const s0 = NT.makeGame()
    const who = s0.turn as Who
    const s: NoThanksState = Object.assign({}, s0, { chips: Object.assign({}, s0.chips, { [who]: 0 }) })
    const n = NT.pass(s, who)
    expect(n).toBe(s) // unchanged
  })

  it('plays full games to a valid lower-score winner and always terminates', () => {
    for (let game = 0; game < 4; game++) {
      let s = NT.makeGame()
      let guard = 0
      const startCards = s.deck.length + 1
      while (!s.winner) {
        expect(guard++).toBeLessThan(2000) // strictly shrinking deck guarantees termination
        if (s.turn === 'you') {
          // random legal human action
          const canPass = s.chips.you > 0
          if (canPass && Math.random() < 0.5) s = NT.pass(s, 'you')
          else s = NT.take(s, 'you')
        } else {
          s = NT.aiStep(s)
        }
      }
      // game ended cleanly
      expect(s.card).toBeNull()
      expect(s.deck.length).toBe(0)
      expect(['you', 'ai', 'tie']).toContain(s.winner)
      // every dealt card ended up in exactly one collection
      expect(s.taken.you.length + s.taken.ai.length).toBe(startCards)
      // the declared winner truly has the lower score
      const sc = NT.scores(s)
      if (s.winner === 'you') expect(sc.you).toBeLessThan(sc.ai)
      else if (s.winner === 'ai') expect(sc.ai).toBeLessThan(sc.you)
      else expect(sc.you).toBe(sc.ai)
    }
  })
})
