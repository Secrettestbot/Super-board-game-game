import { describe, it, expect } from 'vitest'
import * as C from './logic'
import type { CoupState, Character } from './logic'

// Pure-logic tests: deterministic states for rule checks + a full self-play to a single winner.

// A fixed deck so setup deals known cards. Order: p0 gets [0,1], p1 [2,3], p2 [4,5], rest -> deck.
// Pads to a full legal 15-card deck (3 of each character) so card accounting stays 15.
function deck(...c: Character[]): Character[] {
  const counts: Record<string, number> = {}
  for (const ch of c) counts[ch] = (counts[ch] || 0) + 1
  const out = c.slice()
  for (const ch of C.CHARACTERS) {
    const want = 3 - (counts[ch] || 0)
    for (let i = 0; i < want; i++) out.push(ch)
  }
  return out
}

// Total live + revealed cards in play across all players + deck — should always equal 15.
function cardAccounting(s: CoupState): number {
  let n = s.deck.length
  for (const p of s.players) n += p.cards.length
  return n
}

describe('coup logic', () => {
  it('setup: 15-card deck (3 of each of 5), each player 2 influence + 2 coins', () => {
    const s = C.makeGame()
    expect(s.players).toHaveLength(3)
    for (const p of s.players) {
      expect(p.cards).toHaveLength(2)
      expect(p.cards.every(c => !c.revealed)).toBe(true)
      expect(p.coins).toBe(C.START_COINS)
      expect(p.eliminated).toBe(false)
    }
    // 6 cards dealt, 9 remain in the deck → 15 total, 3 of each character.
    expect(cardAccounting(s)).toBe(15)
    const counts: Record<string, number> = {}
    const all = s.deck.concat(s.players.flatMap(p => p.cards.map(c => c.char)))
    for (const ch of all) counts[ch] = (counts[ch] || 0) + 1
    for (const ch of C.CHARACTERS) expect(counts[ch]).toBe(3)
    expect(s.turn).toBe(0)
    expect(s.winner).toBeNull()
  })

  it('income / foreign aid / coup coin math + forced coup at 10', () => {
    // Income: +1, unblockable, turn passes.
    let s = C.makeGame(deck('Duke', 'Duke', 'Captain', 'Captain', 'Assassin', 'Assassin', 'Contessa', 'Contessa', 'Ambassador'))
    s = C.declareAction(s, 0, 'income', null)
    expect(s.players[0].coins).toBe(3)
    expect(s.turn).toBe(1)

    // Foreign aid with no blocker claimed → +2 once it resolves through passes.
    // Give p0 the turn again by building fresh; drive foreign aid and have all AI pass blocks.
    let s2 = C.makeGame()
    s2.players[1].cards = [{ char: 'Captain', revealed: false }, { char: 'Captain', revealed: false }]
    s2.players[2].cards = [{ char: 'Captain', revealed: false }, { char: 'Captain', revealed: false }]
    s2 = C.declareAction(s2, 0, 'foreign_aid', null)
    // Block phase: neither AI holds a Duke; force passes.
    let guard = 0
    while (s2.pending && s2.pending.kind === 'block' && guard++ < 10) {
      s2 = C.passBlock(s2, s2.pending.decider!)
    }
    expect(s2.players[0].coins).toBe(4)
    expect(s2.turn).toBe(1)

    // Forced coup at 10: legalActions returns only coup.
    let s3 = C.makeGame()
    s3.players[0].coins = 10
    expect(C.legalActions(s3, 0)).toEqual(['coup'])
    s3 = C.declareAction(s3, 0, 'coup', 1)
    // p1 must lose influence; auto-resolve for the (now AI) loser already handled by startLoss? No —
    // human path: resolveLossOfInfluence. Here loser is AI p1; finish via aiStep path.
    if (s3.pending && s3.pending.kind === 'lose') s3 = C.resolveLossOfInfluence(s3, undefined)
    expect(s3.players[0].coins).toBe(3)
    expect(C.aliveInfluence(s3.players[1])).toBe(1)
  })

  it('successful challenge: bluffer loses influence; truthful claim makes the challenger lose', () => {
    // p0 claims Duke (Tax) but holds NO Duke → p1 challenges → p0 loses influence, tax fails.
    let s = C.makeGame(deck('Captain', 'Contessa', /*p0*/ 'Assassin', 'Assassin', /*p1*/ 'Ambassador', 'Ambassador' /*p2*/))
    s = C.declareAction(s, 0, 'tax', null)
    expect(s.pending?.kind).toBe('action_challenge')
    // Advance to p1 as decider.
    const decider = s.pending!.decider!
    s = C.challenge(s, decider)
    // p0 was bluffing → p0 must lose; resolve.
    if (s.pending?.kind === 'lose') s = C.resolveLossOfInfluence(s, undefined)
    expect(C.aliveInfluence(s.players[0])).toBe(1)   // bluffer lost a card
    expect(s.players[0].coins).toBe(2)               // tax did NOT happen
    expect(cardAccounting(s)).toBe(15)

    // Truthful: p0 really holds a Duke. Challenger loses.
    let t = C.makeGame(deck('Duke', 'Contessa', 'Assassin', 'Assassin', 'Ambassador', 'Ambassador'))
    t = C.declareAction(t, 0, 'tax', null)
    const d2 = t.pending!.decider!
    const beforeP0 = C.aliveInfluence(t.players[0])
    t = C.challenge(t, d2)
    // p0 truthful → challenger d2 loses; resolve.
    if (t.pending?.kind === 'lose') t = C.resolveLossOfInfluence(t, undefined)
    expect(C.aliveInfluence(t.players[d2])).toBe(1)            // challenger lost
    expect(C.aliveInfluence(t.players[0])).toBe(beforeP0)     // claimant intact (card replaced)
    expect(cardAccounting(t)).toBe(15)
  })

  it('assassinate: target loses influence (paying 3); block by Contessa foils it', () => {
    // No challenge, no block → target loses an influence and actor pays 3.
    let s = C.makeGame(deck('Assassin', 'Duke', 'Ambassador', 'Ambassador', 'Captain', 'Captain'))
    s.players[0].coins = 3
    s = C.declareAction(s, 0, 'assassinate', 1)
    // action_challenge → pass both, block phase (only target may block, no Contessa) → pass → loss.
    let guard = 0
    while (s.pending && s.pending.kind !== 'lose' && guard++ < 20) {
      const p = s.pending
      if (p.kind === 'action_challenge') s = C.passChallenge(s, p.decider!)
      else if (p.kind === 'block') s = C.passBlock(s, p.decider!)
      else if (p.kind === 'block_challenge') s = C.passChallenge(s, p.decider!)
      else break
    }
    expect(s.pending?.kind).toBe('lose')
    s = C.resolveLossOfInfluence(s, undefined)
    expect(s.players[0].coins).toBe(0)
    expect(C.aliveInfluence(s.players[1])).toBe(1)

    // Contessa block, unchallenged → assassination foiled, target keeps both influence.
    let t = C.makeGame(deck('Assassin', 'Duke', 'Contessa', 'Ambassador', 'Captain', 'Captain'))
    t.players[0].coins = 3
    t = C.declareAction(t, 0, 'assassinate', 1)
    // pass action challenges
    while (t.pending && t.pending.kind === 'action_challenge') t = C.passChallenge(t, t.pending.decider!)
    expect(t.pending?.kind).toBe('block')
    t = C.block(t, 1, 'Contessa')
    // block_challenge → pass all
    while (t.pending && t.pending.kind === 'block_challenge') t = C.passChallenge(t, t.pending.decider!)
    expect(C.aliveInfluence(t.players[1])).toBe(2)   // saved by Contessa
    expect(t.players[0].coins).toBe(0)               // still paid the 3
  })

  it('steal: moves up to 2 coins; block by Captain/Ambassador foils it', () => {
    let s = C.makeGame(deck('Captain', 'Duke', 'Assassin', 'Assassin', 'Contessa', 'Contessa'))
    s.players[1].coins = 5
    s = C.declareAction(s, 0, 'steal', 1)
    let guard = 0
    while (s.pending && guard++ < 20) {
      const p = s.pending
      if (p.kind === 'action_challenge') s = C.passChallenge(s, p.decider!)
      else if (p.kind === 'block') s = C.passBlock(s, p.decider!)
      else if (p.kind === 'block_challenge') s = C.passChallenge(s, p.decider!)
      else break
    }
    expect(s.players[0].coins).toBe(4)   // 2 + 2
    expect(s.players[1].coins).toBe(3)   // 5 - 2

    // Block with Captain (target holds one) → no coins move.
    let t = C.makeGame(deck('Captain', 'Duke', 'Captain', 'Assassin', 'Contessa', 'Contessa'))
    t.players[1].coins = 5
    t = C.declareAction(t, 0, 'steal', 1)
    while (t.pending && t.pending.kind === 'action_challenge') t = C.passChallenge(t, t.pending.decider!)
    expect(t.pending?.kind).toBe('block')
    t = C.block(t, 1, 'Captain')
    while (t.pending && t.pending.kind === 'block_challenge') t = C.passChallenge(t, t.pending.decider!)
    expect(t.players[0].coins).toBe(2)   // unchanged
    expect(t.players[1].coins).toBe(5)
  })

  it('elimination at 0 influence and last-standing wins', () => {
    let s = C.makeGame()
    // Knock p1 down to 1 then 0.
    s.players[1].cards[0].revealed = true
    s.players[0].coins = 7
    s = C.declareAction(s, 0, 'coup', 1)
    if (s.pending?.kind === 'lose') s = C.resolveLossOfInfluence(s, undefined)
    expect(s.players[1].eliminated).toBe(true)
    expect(s.winner).toBeNull()   // p2 still alive

    // Now eliminate p2 as well → p0 wins.
    // p0 gathers coins then coups p2 down. Give a clean state.
    let t = C.makeGame()
    t.players[1].cards[0].revealed = true; t.players[1].cards[1].revealed = true; t.players[1].eliminated = true
    t.players[2].cards[0].revealed = true
    t.players[0].coins = 7
    t = C.declareAction(t, 0, 'coup', 2)
    if (t.pending?.kind === 'lose') t = C.resolveLossOfInfluence(t, undefined)
    expect(t.players[2].eliminated).toBe(true)
    expect(t.winner).toBe(0)
  })

  it('deterministic AI self-play always reaches a single valid winner under a guard cap, no throws', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = C.makeRng(seed * 2654435761)
      let s = C.makeGame()
      let guard = 0
      expect(() => {
        while (s.winner == null && guard++ < 4000) {
          // Make EVERY seat AI-driven so the game self-plays to completion.
          s.players[0].isAI = true
          const before = guard
          s = C.aiStep(s, rng)
          // safety: if aiStep made no progress (shouldn't), force income/coup to avoid a stall.
          if (s.pending == null && s.winner == null && before === guard) {
            s = C.declareAction(s, s.turn, C.legalActions(s, s.turn)[0], C.legalTargets(s, s.turn)[0] ?? null)
          }
        }
      }).not.toThrow()
      expect(s.winner).not.toBeNull()
      expect(guard).toBeLessThan(4000)
      // Exactly one alive player, and that is the winner.
      const alive = s.players.filter(p => C.isAlive(p))
      expect(alive).toHaveLength(1)
      expect(alive[0].id).toBe(s.winner)
      // Card accounting preserved throughout.
      expect(cardAccounting(s)).toBe(15)
    }
  })

  it('a 10+ coin player is FORCED to coup (guarantees progress / termination)', () => {
    const s = C.makeGame()
    s.players[0].coins = 12
    expect(C.legalActions(s, 0)).toEqual(['coup'])
    s.players[0].coins = 9
    expect(C.legalActions(s, 0)).not.toEqual(['coup'])
    expect(C.legalActions(s, 0)).toContain('coup')   // affordable but optional at 9
  })
})
