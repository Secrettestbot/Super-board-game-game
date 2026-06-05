import { describe, it, expect } from 'vitest'
import * as JP from './logic'
import type { JaipurState, Good, Side } from './logic'

// Pure logic test: no DOM. Verifies the deck/market/token setup, the core actions
// (sell with bonus + token depletion, take single / camels / refill, the end condition),
// then plays a few full games (random legal human play + the real AI) to a valid winner.

describe('jaipur logic', () => {
  it('makeGame builds a valid bazaar', () => {
    const s = JP.makeGame()
    // deck + market must contain the full composition: 6/6/6/8/8/10 goods + 11 camels = 55
    const all = s.deck.concat(s.market)
    const tally = (c: string) => all.filter(x => x === c).length
    expect(tally('diamond')).toBe(6)
    expect(tally('gold')).toBe(6)
    expect(tally('silver')).toBe(6)
    expect(tally('cloth')).toBe(8)
    expect(tally('spice')).toBe(8)
    expect(tally('leather')).toBe(10)
    expect(tally('camel')).toBe(11)
    expect(all).toHaveLength(55)

    // market: 5 slots, exactly 3 camels + 2 goods at the start
    expect(s.market).toHaveLength(JP.MARKET_SIZE)
    expect(JP.marketCamels(s)).toBe(3)
    expect(JP.marketGoods(s)).toHaveLength(2)

    // empty hands + herds
    expect(s.hand.you).toHaveLength(0)
    expect(s.hand.foe).toHaveLength(0)
    expect(s.herd.you).toBe(0)
    expect(s.herd.foe).toBe(0)

    // token stacks present for all six goods, none empty yet
    for (const g of JP.GOODS) expect(s.tokens[g].length).toBeGreaterThan(0)
    expect(JP.emptyStacks(s)).toBe(0)

    // a player to act
    expect(s.turn).toBe('you')
    expect(s.winner).toBeNull()
  })

  it('selling a set awards the top N tokens + correct size bonus and depletes them', () => {
    let s = JP.makeGame()
    // hand-place three cloth in your hand; cloth tokens are [5,3,3,2,2,1,1]
    s = Object.assign({}, s, { hand: { ...s.hand, you: ['cloth', 'cloth', 'cloth'] as Good[] } })
    const stackBefore = s.tokens.cloth.slice()
    const bonus3Before = s.bonus[3][0]

    s = JP.sell(s, 'you', 'cloth')

    // top 3 cloth tokens (5+3+3) collected, plus the first 3-set bonus token
    expect(s.scoreTokens.you).toEqual([5, 3, 3])
    expect(s.bonusTokens.you).toEqual([bonus3Before])
    // stack shrank by 3 from the top
    expect(s.tokens.cloth).toEqual(stackBefore.slice(3))
    // hand cleared of cloth, turn passed
    expect(s.hand.you.filter(x => x === 'cloth')).toHaveLength(0)
    expect(s.turn).toBe('foe')

    // expensive goods need a pair: a single silver cannot be sold
    let s2 = JP.makeGame()
    s2 = Object.assign({}, s2, { hand: { ...s2.hand, you: ['silver'] as Good[] } })
    expect(JP.canSell(s2, 'you', 'silver')).toBe(false)
    const blocked = JP.sell(s2, 'you', 'silver')
    expect(blocked.turn).toBe('you')        // no-op, still your turn
    expect(blocked.scoreTokens.you).toHaveLength(0)
  })

  it('takeGood pulls a market good into hand and refills the market', () => {
    let s = JP.makeGame()
    const gi = JP.marketGoods(s)[0]
    const good = s.market[gi] as Good
    const deckBefore = s.deck.length
    s = JP.takeGood(s, 'you', gi)
    expect(s.hand.you).toContain(good)
    expect(s.market).toHaveLength(JP.MARKET_SIZE)   // refilled
    expect(s.deck.length).toBe(deckBefore - 1)      // one card drawn to refill
    expect(s.turn).toBe('foe')
  })

  it('takeCamels moves every market camel into the herd and refills', () => {
    let s = JP.makeGame()
    const n = JP.marketCamels(s)
    expect(n).toBe(3)
    const deckBefore = s.deck.length
    s = JP.takeCamels(s, 'you')
    expect(s.herd.you).toBe(n)
    // the n market camels moved to the herd; the n empty slots are refilled from the deck
    // (a refilled card could itself be a camel, so marketCamels is not necessarily 0).
    expect(s.market).toHaveLength(JP.MARKET_SIZE)
    expect(s.deck.length).toBe(deckBefore - n)
    expect(s.turn).toBe('foe')
  })

  it('the round ends when 3 token stacks are exhausted', () => {
    let s = JP.makeGame()
    // empty three stacks directly, then trigger an end-check via a legal action
    s = Object.assign({}, s, { tokens: { ...s.tokens, diamond: [], gold: [], silver: [] } })
    expect(JP.emptyStacks(s)).toBe(3)
    // any completed action runs checkEnd; take a camel set to advance
    s = JP.takeCamels(s, 'you')
    expect(s.winner).not.toBeNull()
  })

  it('plays a few full games to a valid winner without throwing, terminating fast', () => {
    for (let game = 0; game < 4; game++) {
      let s = JP.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 400) {
        if (s.turn === 'you') s = randomHumanMove(s)
        else s = JP.aiTurn(s)
      }
      expect(s.winner).not.toBeNull()                          // always terminates
      expect(['you', 'foe', 'tie']).toContain(s.winner)        // valid winner
      expect(guard).toBeLessThan(400)                          // fast — depletes monotonically
    }
  })
})

// a single random legal human action
function randomHumanMove(s: JaipurState): JaipurState {
  const me: Side = 'you'
  const opts: (() => JaipurState)[] = []

  // sell any legal set
  for (const { good } of JP.sellableSets(s, me)) opts.push(() => JP.sell(s, me, good))
  // take all camels
  if (JP.marketCamels(s) > 0) opts.push(() => JP.takeCamels(s, me))
  // take a single good (only if hand has room)
  if (JP.handCount(s, me) < JP.HAND_LIMIT) for (const i of JP.marketGoods(s)) opts.push(() => JP.takeGood(s, me, i))

  if (opts.length === 0) {
    // no legal move — hand the turn to the AI (logic still advances the round)
    return JP.takeCamels(s, me) // no-op if no camels; covered below
  }
  const next = opts[(Math.random() * opts.length) | 0]()
  // guarantee progress: if the chosen action was a no-op (turn didn't pass), force a camel/sell
  if (next.turn === s.turn && !next.winner) {
    const sets = JP.sellableSets(s, me)
    if (sets.length) return JP.sell(s, me, sets[0].good)
    if (JP.marketCamels(s) > 0) return JP.takeCamels(s, me)
    const g = JP.marketGoods(s)
    if (g.length && JP.handCount(s, me) < JP.HAND_LIMIT) return JP.takeGood(s, me, g[0])
  }
  return next
}
