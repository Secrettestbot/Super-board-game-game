import { describe, it, expect } from 'vitest'
import {
  makeGame, take3, take2, buy, reserve, canTake3, canTake2, canAfford,
  qualifiesForNoble, aiTurn, decideWinner, TOKS, GEMS, WIN_PRESTIGE, MAX_RESERVED, TOKEN_LIMIT,
} from './logic'
import type { SplendorState, PlayerState, Card, Noble, Tok } from './logic'

// ---- token conservation helper -------------------------------------------
// Total of each color = bank + both players' tokens. Must stay constant
// (4 per gem, 5 gold at start) across any sequence of actions.
function tokenTotals(s: SplendorState): Record<Tok, number> {
  const out = {} as Record<Tok, number>
  for (const k of TOKS) out[k] = s.bank[k] + s.players[0].tokens[k] + s.players[1].tokens[k]
  return out
}
const START_TOTALS: Record<Tok, number> = { emerald: 4, sapphire: 4, ruby: 4, diamond: 4, onyx: 4, gold: 5 }

function expectConserved(s: SplendorState) {
  expect(tokenTotals(s)).toEqual(START_TOTALS)
}

describe('splendor logic', () => {
  it('take 3 different colors: legal, distinct, debits bank, ends turn', () => {
    const s = makeGame({ noShuffle: true })
    expect(canTake3(s, ['emerald', 'sapphire', 'ruby'])).toBe(true)
    expect(canTake3(s, ['emerald', 'emerald', 'ruby'])).toBe(false) // duplicate
    const ns = take3(s, ['emerald', 'sapphire', 'ruby'])
    expect(ns.players[0].tokens.emerald).toBe(1)
    expect(ns.players[0].tokens.sapphire).toBe(1)
    expect(ns.players[0].tokens.ruby).toBe(1)
    expect(ns.bank.emerald).toBe(3)
    expect(ns.turn).toBe(1)
    expectConserved(ns)
  })

  it('take 2 same color: only legal when pile has >= 4', () => {
    const s = makeGame({ noShuffle: true })
    expect(canTake2(s, 'ruby')).toBe(true) // starts at 4
    const ns = take2(s, 'ruby')
    expect(ns.players[0].tokens.ruby).toBe(2)
    expect(ns.bank.ruby).toBe(2)
    expectConserved(ns)
    // After dropping to 2, taking 2 again is illegal (pile < 4).
    expect(canTake2(ns, 'ruby')).toBe(false)
    const blocked = take2(ns, 'ruby')
    expect(blocked).toBe(ns) // unchanged
  })

  it('buy applies bonus discounts and gold substitution', () => {
    // Construct a deterministic state by hand.
    const s = makeGame({ noShuffle: true })
    // Card costing ruby:2, onyx:1. Give player a ruby bonus (discount 1) + tokens + a gold.
    const card: Card = { id: 'x', tier: 1, cost: { ruby: 2, onyx: 1 }, bonus: 'emerald', points: 1 }
    s.visible[0][0] = card
    const me = s.players[0]
    me.bonuses.ruby = 1 // discounts ruby cost from 2 -> 1
    me.tokens.ruby = 1  // covers the remaining ruby
    me.tokens.onyx = 0  // missing the onyx...
    me.tokens.gold = 1  // ...covered by gold
    expect(canAfford(me, card)).toBe(true)
    const ns = buy(s, 'x')
    const p = ns.players[0]
    expect(p.bonuses.emerald).toBe(1)
    expect(p.prestige).toBe(1)
    expect(p.tokens.ruby).toBe(0)
    expect(p.tokens.gold).toBe(0)
    expect(p.bought.length).toBe(1)
    // Spent gems returned to bank: ruby 4->5, gold 5->6.
    // (Conservation not asserted here: the test hand-injected tokens onto the
    //  player without debiting the bank, so global totals are intentionally off.)
    expect(ns.bank.ruby).toBe(5)
    expect(ns.bank.gold).toBe(6)
  })

  it('reserve gives a gold and caps at 3 reserved', () => {
    let s = makeGame({ noShuffle: true })
    const firstId = s.visible[0][0]!.id
    s = reserve(s, { id: firstId })
    expect(s.players[0].reserved.length).toBe(1)
    expect(s.players[0].tokens.gold).toBe(1) // got a gold
    expect(s.bank.gold).toBe(4)
    expectConserved(s)
    // Force player 0 to reserve up to the cap via blind top-deck draws.
    const p = s.players[0]
    while (p.reserved.length < MAX_RESERVED) p.reserved.push(s.decks[0].shift()!)
    expect(p.reserved.length).toBe(MAX_RESERVED)
    // Now a further reserve is illegal (no change).
    s.turn = 0
    const blocked = reserve(s, { tier: 1 })
    expect(blocked).toBe(s)
  })

  it('noble auto-visits when bonus requirements are met', () => {
    const s = makeGame({ noShuffle: true })
    const noble: Noble = { id: 'nz', req: { ruby: 1, onyx: 1 }, points: 3 }
    s.nobles = [noble]
    // A free card (cost 0) granting a ruby bonus; player already has an onyx bonus.
    const card: Card = { id: 'free', tier: 1, cost: {}, bonus: 'ruby', points: 0 }
    s.visible[0][0] = card
    s.players[0].bonuses.onyx = 1
    expect(qualifiesForNoble(s.players[0], noble)).toBe(false) // missing ruby bonus
    const ns = buy(s, 'free')
    const p = ns.players[0]
    expect(p.bonuses.ruby).toBe(1)
    expect(p.nobles.length).toBe(1)
    expect(p.prestige).toBe(3) // noble points
    expect(ns.nobles.length).toBe(0) // noble removed from pool
  })

  it('enforces the 10-token hand limit at end of turn', () => {
    const s = makeGame({ noShuffle: true })
    // Pre-load player 0 to 9 tokens, then take 2 more -> would be 11 -> discard to 10.
    s.players[0].tokens.emerald = 5
    s.players[0].tokens.sapphire = 4
    // Bank must have >=4 ruby (it does: 4).
    const ns = take2(s, 'ruby') // +2 -> 11 total -> trimmed to 10
    let total = 0
    for (const k of TOKS) total += ns.players[0].tokens[k]
    expect(total).toBe(TOKEN_LIMIT)
    // (Conservation not asserted: tokens were hand-injected onto the player.)
  })

  it('triggers final round at 15 prestige and ends after the AI completes the round', () => {
    const s = makeGame({ noShuffle: true })
    // Give player 0 a card that pushes them to 15 prestige.
    const card: Card = { id: 'big', tier: 3, cost: {}, bonus: 'diamond', points: 15 }
    s.visible[2][0] = card
    const afterBuy = buy(s, 'big')
    expect(afterBuy.players[0].prestige).toBe(WIN_PRESTIGE)
    expect(afterBuy.finalRound).toBe(true)
    expect(afterBuy.winner).toBe(null) // AI still gets its turn
    expect(afterBuy.turn).toBe(1)
    // AI plays its final turn -> game resolves.
    const done = aiTurn(afterBuy)
    expect(done.winner).not.toBe(null)
    expect(done.winner).toBe(0) // player 0 had 15, AI has < 15
  })

  it('self-plays a full game to a valid winner under a guard cap, no throws, tokens conserved', () => {
    let s = makeGame() // shuffled (uses Math.random)
    let turns = 0
    const CAP = 4000
    expect(() => {
      while (s.winner == null && turns < CAP) {
        // Both seats driven by the AI heuristic (player 0 borrows seat-1 logic via turn swap).
        if (s.turn === 0) {
          // Run the AI brain for player 0 by temporarily presenting it as turn 1's chooser:
          // simplest deterministic-progress driver — reuse aiTurn after a turn flip is unsafe,
          // so just take/buy greedily here using the same public API.
          s = drivePlayer0(s)
        } else {
          s = aiTurn(s)
        }
        expectConserved(s)
        turns++
      }
    }).not.toThrow()
    // Either a clean winner or cap reached — both acceptable, but assert validity if finished.
    if (s.winner != null) {
      expect([0, 1]).toContain(s.winner)
      // Winner consistent with the tiebreak rule.
      expect(s.winner).toBe(decideWinner(s))
    } else {
      // Cap reached without throw is acceptable per the brief.
      expect(turns).toBe(CAP)
    }
    expectConserved(s)
  })
})

// A simple greedy driver for player 0 in the self-play test (mirrors aiTurn but for seat 0).
function drivePlayer0(s: SplendorState): SplendorState {
  const me: PlayerState = s.players[0]
  // Buy any affordable card.
  const visible: Card[] = []
  for (let t = 0; t < 3; t++) for (const cc of s.visible[t]) if (cc) visible.push(cc)
  const pool = visible.concat(me.reserved)
  const aff = pool.filter((cc) => canAfford(me, cc))
  if (aff.length) {
    aff.sort((a, b) => b.points - a.points)
    return buy(s, aff[0].id)
  }
  // Otherwise take up to 3 distinct available gems (guaranteed progress).
  const avail = GEMS.filter((g) => s.bank[g] >= 1)
  if (avail.length) {
    const pick = avail.slice(0, 3)
    if (canTake3(s, pick)) return take3(s, pick)
  }
  for (const g of GEMS) if (canTake2(s, g)) return take2(s, g)
  // Reserve blind if a deck remains.
  for (let t = 0 as 0 | 1 | 2; t < 3; t = (t + 1) as 0 | 1 | 2) {
    if (s.decks[t].length && me.reserved.length < MAX_RESERVED) return reserve(s, { tier: (t + 1) as 1 | 2 | 3 })
  }
  // Nothing possible: end via a no-op legal take if any, else mutate turn defensively.
  return { ...s, turn: 1, step: s.step + 1 }
}
