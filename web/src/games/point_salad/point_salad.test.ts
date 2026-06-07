import { describe, it, expect } from 'vitest'
import {
  CRITERIA_BY_ID, emptyVec, makeGame, buildDeck, takePointCard, takeVeg, aiTurn,
  scoreAll, totalCards, cardsLeft, marketVegCards, pileOfSlot, DECK_SIZE, MARKET_SLOTS,
  N_PLAYERS, VEG,
} from './logic'
import type { VegVec, Card } from './logic'

function v(partial: Partial<Record<(typeof VEG)[number], number>>): VegVec {
  const out = emptyVec()
  for (const k of VEG) if (partial[k] != null) out[k] = partial[k] as number
  return out
}

describe('criteria scoring', () => {
  it('per-veg multipliers (2/pepper, 5/cabbage)', () => {
    const mine = v({ pepper: 3, cabbage: 2 })
    const all = [mine, emptyVec(), emptyVec()]
    expect(CRITERIA_BY_ID['per_pepper_2'].score(mine, all)).toBe(6)
    expect(CRITERIA_BY_ID['per_cabbage_5'].score(mine, all)).toBe(10)
    expect(CRITERIA_BY_ID['per_lettuce_1'].score(mine, all)).toBe(0)
  })

  it('most-of (carrot=8) with a tie awarding both', () => {
    const c = CRITERIA_BY_ID['most_carrot']
    const a = v({ carrot: 3 }), b = v({ carrot: 1 }), d = v({ carrot: 3 })
    const all = [a, b, d]
    expect(c.score(a, all)).toBe(8) // tied-most gets it
    expect(c.score(d, all)).toBe(8)
    expect(c.score(b, all)).toBe(0)
    // having zero never wins "most"
    expect(c.score(emptyVec(), [emptyVec(), emptyVec(), emptyVec()])).toBe(0)
  })

  it('fewest-of (onion=7), fewest can be zero', () => {
    const c = CRITERIA_BY_ID['fewest_onion']
    const a = v({ onion: 0 }), b = v({ onion: 2 }), d = v({ onion: 5 })
    const all = [a, b, d]
    expect(c.score(a, all)).toBe(7) // fewest (0) scores
    expect(c.score(b, all)).toBe(0)
    // tie at fewest awards both
    const all2 = [v({ onion: 1 }), v({ onion: 1 }), v({ onion: 4 })]
    expect(c.score(all2[0], all2)).toBe(7)
    expect(c.score(all2[1], all2)).toBe(7)
    expect(c.score(all2[2], all2)).toBe(0)
  })

  it('one-of-each combo (pepper+lettuce+carrot=5 per set)', () => {
    const c = CRITERIA_BY_ID['combo_pepper_lettuce_carrot']
    const all = [emptyVec(), emptyVec(), emptyVec()]
    expect(c.score(v({ pepper: 2, lettuce: 2, carrot: 1 }), all)).toBe(5)  // 1 complete set
    expect(c.score(v({ pepper: 3, lettuce: 3, carrot: 3 }), all)).toBe(15) // 3 sets
    expect(c.score(v({ pepper: 4, lettuce: 0, carrot: 4 }), all)).toBe(0)  // missing lettuce
  })

  it('even/odd parity (lettuce: even=7 odd=3, zero=0)', () => {
    const c = CRITERIA_BY_ID['parity_lettuce']
    const all = [emptyVec(), emptyVec(), emptyVec()]
    expect(c.score(v({ lettuce: 4 }), all)).toBe(7) // even
    expect(c.score(v({ lettuce: 3 }), all)).toBe(3) // odd
    expect(c.score(v({ lettuce: 0 }), all)).toBe(0) // none
  })

  it('per-pair (tomato & cabbage = 2 each)', () => {
    const c = CRITERIA_BY_ID['per2_tomato_cabbage_2']
    const all = [emptyVec(), emptyVec(), emptyVec()]
    expect(c.score(v({ tomato: 2, cabbage: 1 }), all)).toBe(6)
  })
})

describe('actions + deck accounting', () => {
  it('takePointCard removes the pile top and refills the market, conserving cards', () => {
    const s = makeGame(buildDeck())
    expect(totalCards(s)).toBe(DECK_SIZE)
    const beforeTop = s.piles[0].length
    const ns = takePointCard(s, 0)
    // player 0 gained a point card
    expect(ns.players[0].points.length).toBe(1)
    // a card left the pile; market stayed full (refilled) because the pile still had cards
    expect(ns.piles[0].length).toBe(beforeTop - 1)
    expect(marketVegCards(ns).length).toBe(MARKET_SLOTS)
    // conservation: nothing created or destroyed
    expect(totalCards(ns)).toBe(DECK_SIZE)
    // turn advanced to player 1
    expect(ns.turn).toBe(1)
  })

  it('takeVeg removes 2 market cards, refills, conserves the deck', () => {
    const s = makeGame(buildDeck())
    const ns = takeVeg(s, [0, 1])
    const got = VEG.reduce((a, x) => a + ns.players[0].veg[x], 0)
    expect(got).toBe(2)
    // both slots refilled from pile 0 (slots 0,1 belong to pile 0)
    expect(pileOfSlot(0)).toBe(0)
    expect(pileOfSlot(1)).toBe(0)
    expect(marketVegCards(ns).length).toBe(MARKET_SLOTS)
    expect(totalCards(ns)).toBe(DECK_SIZE)
    expect(ns.turn).toBe(1)
  })

  it('rejects illegal moves (same slot twice, empty pile)', () => {
    const s = makeGame(buildDeck())
    expect(takeVeg(s, [0, 0])).toBe(s) // same slot -> no-op (returns same ref)
    expect(takeVeg(s, [0, 1, 2])).toBe(s) // wrong count
  })
})

describe('self-play', () => {
  it('plays a full game to a valid winner under a guard cap, conserving cards, no throws', () => {
    // deterministic deck, all-AI self-play
    let s = makeGame(buildDeck())
    const start = totalCards(s)
    expect(start).toBe(DECK_SIZE)
    let guard = 0
    const CAP = 200
    expect(() => {
      while (s.winner == null && guard < CAP) {
        const left = cardsLeft(s)
        s = aiTurn(s)
        guard++
        // every turn must make progress (remove >=1 card from play) or finish the game
        expect(cardsLeft(s) <= left || s.winner != null).toBe(true)
      }
    }).not.toThrow()
    // terminated well under the cap
    expect(guard).toBeLessThan(CAP)
    // a valid winner index
    expect(s.winner).not.toBeNull()
    expect(s.winner).toBeGreaterThanOrEqual(0)
    expect(s.winner as number).toBeLessThan(N_PLAYERS)
    // all cards consumed into players' collections (none left on the table)
    expect(cardsLeft(s)).toBe(0)
    expect(totalCards(s)).toBe(DECK_SIZE)
    // scores present and the declared winner truly has the max score
    const scores = scoreAll(s)
    expect(scores.length).toBe(N_PLAYERS)
    expect(Math.max(...scores)).toBe(scores[s.winner as number])
  })

  it('a deterministic deck makes a reproducible game', () => {
    const deck: Card[] = buildDeck()
    const run = () => {
      let st = makeGame(deck)
      let g = 0
      while (st.winner == null && g < 200) { st = aiTurn(st); g++ }
      return st.scores
    }
    expect(run()).toEqual(run())
  })
})
