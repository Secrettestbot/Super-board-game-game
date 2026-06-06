import { describe, it, expect } from 'vitest'
import {
  makeGame, freshDeck, pass, respondCall, respondPassOn, aiStep, aiDecide,
  decider, canPassOn, eligibleTargets, handSize, cardCount, makeRng, forcedLossCheck,
  VERMIN, DECK_SIZE, NUM_PLAYERS, LOSE_AT,
} from './logic'
import type { Vermin, CockroachState } from './logic'

describe('Cockroach Poker — logic', () => {
  it('deals all 64 cards across the three hands', () => {
    const s = makeGame()
    let total = 0
    for (const h of s.hands) total += handSize(h)
    expect(total).toBe(DECK_SIZE)
    // 64 / 3 → hands of 22, 21, 21.
    expect(s.hands.map(handSize).sort((a, b) => b - a)).toEqual([22, 21, 21])
    expect(cardCount(s)).toBe(DECK_SIZE)
  })

  it('a CORRECT guess gives the card to the passer; a WRONG guess to the receiver', () => {
    // Deterministic deck: round-robin deal so player 0 holds known cards.
    const deck = freshDeck() // cockroach×8, rat×8, ... in blocks; round-robin distributes them
    const s = makeGame(deck)
    // Player 0 (turn) passes a real cockroach to player 1, claiming "cockroach" (truthful).
    expect(s.turn).toBe(0)
    expect(s.hands[0]['cockroach']).toBeGreaterThan(0)
    const passed = pass(s, 'cockroach', 1, 'cockroach')
    expect(passed.pending).not.toBeNull()
    // Receiver (1) calls TRUE — correct → passer (0) keeps it.
    const r1 = respondCall(passed, true)
    expect(r1.piles[0]['cockroach']).toBe(1)
    expect(r1.piles[1]['cockroach']).toBe(0)
    expect(r1.turn).toBe(0) // gainer starts next turn
    expect(cardCount(r1)).toBe(DECK_SIZE)

    // Now a BLUFF: pass a cockroach but claim "rat". Receiver calls TRUE (wrong) → receiver keeps it.
    const passed2 = pass(s, 'cockroach', 2, 'rat')
    const r2 = respondCall(passed2, true)
    expect(r2.piles[2]['cockroach']).toBe(1) // receiver (2) gained the revealed card
    expect(r2.piles[0]['cockroach']).toBe(0)
    expect(r2.turn).toBe(2)
    expect(cardCount(r2)).toBe(DECK_SIZE)
  })

  it('pass-on excludes players who have already seen the card and routes back to the passer', () => {
    const s = makeGame(freshDeck())
    // 0 passes to 1.
    const p1 = pass(s, 'cockroach', 1, 'cockroach')
    // 1 may pass on only to player 2 (0 already saw it as the passer).
    const seen = p1.pending!.seenBy.concat([1])
    expect(eligibleTargets(p1, 1, seen)).toEqual([2])
    expect(canPassOn(p1)).toBe(true)
    // 1 passes on to 2.
    const p2 = respondPassOn(p1, 2, 'rat')
    expect(p2.pending!.target).toBe(2)
    expect(p2.pending!.seenBy.sort()).toEqual([0, 1])
    // Now 2 has seen it; nobody is eligible → must call.
    expect(canPassOn(p2)).toBe(false)
    expect(eligibleTargets(p2, 2, p2.pending!.seenBy.concat([2]))).toEqual([])
    // Illegal pass-on (no eligible target) is a no-op.
    const noop = respondPassOn(p2, 0, 'fly')
    expect(noop).toBe(p2)
  })

  it('collecting a FOURTH of a type ends the game with that player as loser', () => {
    let s = makeGame(freshDeck())
    // Hand-seed player 1's pile to 3 cockroaches, then deliver a 4th via a correct call.
    s = { ...s, piles: s.piles.map((p, i) => i === 1 ? { ...p, cockroach: 3 } : p) }
    // 0 bluffs a cockroach claiming "rat" to player 1; player 1 calls TRUE (wrong) → 1 gains it.
    const passed = pass(s, 'cockroach', 1, 'rat')
    const done = respondCall(passed, true)
    expect(done.piles[1]['cockroach']).toBe(LOSE_AT)
    expect(done.loser).toBe(1)
    expect(done.winner).not.toBeNull()
    expect(done.winner).not.toBe(1)
  })

  it('running out of cards on your turn loses', () => {
    let s = makeGame(freshDeck())
    // Empty player 2's hand entirely, then force the turn to player 2 with no pending pass.
    const emptyHand = {} as Record<Vermin, number>
    for (const v of VERMIN) emptyHand[v] = 0
    s = { ...s, hands: s.hands.map((h, i) => i === 2 ? emptyHand : h), turn: 2, pending: null }
    // The AI step (player 2) detects the empty hand and loses.
    const after = aiStep(s)
    expect(after.loser).toBe(2)
    expect(after.winner).not.toBeNull()
  })

  it('eligibleTargets never includes the passer or a prior seer', () => {
    const s = makeGame(freshDeck())
    const p = pass(s, 'cockroach', 1, 'cockroach')
    const t = eligibleTargets(p, 1, p.pending!.seenBy.concat([1]))
    expect(t).not.toContain(0) // passer excluded
    expect(t).not.toContain(1) // self excluded
  })

  it('deterministic AI self-play terminates at a valid loser/winner with no throws and card conservation', () => {
    // Drive ALL three seats with the AI (override the human guard by calling aiDecide directly).
    for (let seed = 0; seed < 12; seed++) {
      let s: CockroachState = makeGame(undefined, makeRng(seed * 911 + 7))
      let guard = 0
      while (s.loser == null && guard < 5000) {
        guard++
        const who = decider(s)
        expect(who).not.toBeNull()
        const before = s
        // Forced-loss: must start a pass but empty hand — handled by forcedLossCheck for ANY seat.
        if (s.pending == null && handSize(s.hands[who!]) === 0) {
          s = forcedLossCheck(s)
          expect(s.loser).toBe(who)
          break
        }
        const rng = makeRng((s.step * 2654435761) >>> 0 ^ (seed + 1))
        const act = aiDecide(s, rng)
        expect(act).not.toBeNull()
        if (act!.kind === 'pass') s = pass(s, act!.card!, act!.target!, act!.claim!)
        else if (act!.kind === 'passon') s = respondPassOn(s, act!.target!, act!.claim!)
        else s = respondCall(s, !!act!.guessTrue)
        // Every action must make progress (state advanced).
        expect(s.step).toBeGreaterThan(before.step)
        // Card conservation holds at every step.
        expect(cardCount(s)).toBe(DECK_SIZE)
      }
      expect(guard).toBeLessThan(5000)
      // Self-play ALWAYS reaches a valid loser/winner.
      expect(s.loser).not.toBeNull()
      expect(s.loser).toBeGreaterThanOrEqual(0)
      expect(s.loser).toBeLessThan(NUM_PLAYERS)
      expect(s.winner).not.toBeNull()
      expect(s.winner).not.toBe(s.loser)
      expect(cardCount(s)).toBe(DECK_SIZE)
    }
  })
})
