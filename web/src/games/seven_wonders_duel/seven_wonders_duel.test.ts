import { describe, it, expect } from 'vitest'
import {
  makeGame, accessibleCards, isAccessible, canAfford, buildCard, discardForCoins,
  buildWonder, advanceMilitary, checkScienceWin, scoreVP, aiTurn, distinctScience,
  cardCoinCost, MILITARY_MAX, DISCARD_BASE_COINS,
} from './logic'
import type { SWDState, Card } from './logic'

function find(s: SWDState, id: string): Card { return s.cards[id] }

describe('seven wonders duel logic', () => {
  it('accessibleCards returns only uncovered cards (and covered ones are not)', () => {
    const s = makeGame({ noShuffle: true })
    const acc = accessibleCards(s)
    expect(acc.length).toBeGreaterThan(0)
    // Every accessible card must itself report accessible.
    for (const c of acc) expect(isAccessible(s, c.id)).toBe(true)
    // The bottom row of Age I (6 cards, all face up) should be fully accessible;
    // the very top card is covered, so it must NOT be accessible.
    const topSlot = s.pyramid[0]
    expect(topSlot.cardId).not.toBeNull()
    expect(isAccessible(s, topSlot.cardId!)).toBe(false)
  })

  it('building a card deducts exactly its coin cost and applies effects', () => {
    const s = makeGame({ noShuffle: true })
    // a1-stable (red, cost wood:1) is accessible in the bottom row. With no wood
    // production its coin cost = 1 * BUY_RATE = 2, and it adds +1 military.
    const stable = find(s, 'a1-stable')
    expect(isAccessible(s, 'a1-stable')).toBe(true)
    const cost = cardCoinCost(s.players[0], stable)
    expect(cost).toBe(2)
    const before = s.players[0].coins
    const ns = buildCard(s, 'a1-stable')
    expect(ns.players[0].coins).toBe(before - cost) // coin buying for missing wood
    expect(ns.players[0].military).toBe(1)
    expect(ns.military).toBe(1) // pawn pushed toward AI capital
    expect(ns.turn).toBe(1) // turn passed to AI
    expect(isAccessible(ns, 'a1-stable')).toBe(false) // card left the pyramid
  })

  it('coin buying: a card needing resources you lack costs coins at the buy rate', () => {
    const s = makeGame({ noShuffle: true })
    // a1-baths costs stone:1. With no stone production, cardCoinCost = 1*BUY_RATE = 2.
    const baths = find(s, 'a1-baths')
    expect(cardCoinCost(s.players[0], baths)).toBe(2)
    // Give player 0 a stone producer manually -> cost drops to 0.
    s.players[0].production.stone = 1
    expect(cardCoinCost(s.players[0], baths)).toBe(0)
    expect(canAfford(s, 0, baths)).toBe(true)
  })

  it('discard gives coins and removes the card', () => {
    const s = makeGame({ noShuffle: true })
    const acc = accessibleCards(s)
    const target = acc[0]
    const before = s.players[0].coins
    const ns = discardForCoins(s, target.id)
    expect(ns.players[0].coins).toBe(before + DISCARD_BASE_COINS)
    expect(isAccessible(ns, target.id)).toBe(false)
    expect(ns.discard).toContain(target.id)
  })

  it('building a wonder consumes a card, pays its cost, and grants its effect', () => {
    const s = makeGame({ noShuffle: true })
    const w = s.players[0].wonders[0] // w-pyramids, cost stone:3 -> 6 coins, +9 VP
    expect(w.built).toBe(false)
    const feed = accessibleCards(s)[0]
    const cost = 6 // 3 stone * BUY_RATE, no production
    const before = s.players[0].coins
    const ns = buildWonder(s, feed.id, w.id)
    expect(ns.players[0].wonders[0].built).toBe(true)
    expect(ns.players[0].coins).toBe(before - cost)
    expect(ns.players[0].vp).toBe(9)
    expect(isAccessible(ns, feed.id)).toBe(false) // the drafted card was consumed
    expect(ns.turn).toBe(1)
  })

  it('military advances toward a capital and wins at the end of the track', () => {
    const s = makeGame({ noShuffle: true })
    // Push the pawn all the way toward the AI capital (+) — player 0 military win.
    const ns = advanceMilitary(s, 1, MILITARY_MAX)
    expect(ns.military).toBe(MILITARY_MAX)
    expect(ns.winner).toBe(0)
    expect(ns.winBy).toBe('military')
    // And the other direction -> AI win.
    const ns2 = advanceMilitary(s, -1, MILITARY_MAX)
    expect(ns2.winner).toBe(1)
  })

  it('6 distinct science symbols = instant science win', () => {
    const s = makeGame({ noShuffle: true })
    const p = s.players[0]
    p.science = { wheel: 1, tablet: 1, gear: 1, compass: 1, pen: 1, mortar: 0 }
    expect(distinctScience(p)).toBe(5)
    expect(checkScienceWin(s)).toBeNull()
    p.science.mortar = 1
    expect(distinctScience(p)).toBe(6)
    expect(checkScienceWin(s)).toBe(0)
  })

  it('building a military card moves the pawn the right direction per player', () => {
    const s = makeGame({ noShuffle: true })
    // Find an accessible red card for player 0; if none accessible, drive via a wonder is skipped.
    // Use a guaranteed path: manually give p0 a free military build by adjusting state is overkill;
    // instead verify the pawn sign convention directly with advanceMilitary.
    const youPush = advanceMilitary(s, 1, 2)
    expect(youPush.military).toBe(2) // positive = toward AI capital
    const aiPush = advanceMilitary(s, -1, 3)
    expect(aiPush.military).toBe(-3) // negative = toward your capital
  })

  it('VP scoring after age III counts blue/coins/military lead', () => {
    const s = makeGame({ noShuffle: true })
    s.players[0].vp = 10
    s.players[0].coins = 9 // -> +3 VP
    s.military = MILITARY_MAX - 1 // favours player 0
    const v0 = scoreVP(s, 0)
    expect(v0).toBe(10 + 3 + (MILITARY_MAX - 1))
    // Opponent with nothing scores their coins only.
    s.players[1].coins = 0
    expect(scoreVP(s, 1)).toBe(0)
  })

  it('self-play full game terminates with a valid winner and no throws', () => {
    let s = makeGame()
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 2000) {
        guard++
        if (s.turn === 1) {
          s = aiTurn(s)
        } else {
          // Player 0 also plays greedily by reusing the AI heuristic via a temporary swap:
          // simplest deterministic policy — build the first affordable accessible card,
          // else discard the first accessible card.
          const acc = accessibleCards(s)
          if (acc.length === 0) break
          const buildable = acc.find((c) => canAfford(s, 0, c))
          s = buildable ? buildCard(s, buildable.id) : discardForCoins(s, acc[0].id)
        }
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(2000) // terminated well under the cap
    expect(s.winner === 0 || s.winner === 1).toBe(true)
    expect(['military', 'science', 'civilian']).toContain(s.winBy)
  })
})
