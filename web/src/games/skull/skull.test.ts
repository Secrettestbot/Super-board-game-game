import { describe, it, expect } from 'vitest'
import * as SK from './logic'
import type { SkullState, Rng } from './logic'

// Deterministic RNG so every game resolves the same way and always terminates.
function seeded(seed: number): Rng {
  let x = seed >>> 0
  return () => {
    // xorshift32
    x ^= x << 13; x >>>= 0
    x ^= x >> 17
    x ^= x << 5; x >>>= 0
    return (x >>> 0) / 4294967296
  }
}

// Sum of all discs (hand + stack + implied) every player owns — must equal points-independent
// conservation: total discs only ever decreases on a failed challenge, by exactly one.
function totalDiscs(s: SkullState): number {
  return s.players.reduce((n, p) => n + p.hand.roses + p.hand.skulls + p.stack.length, 0)
}

describe('skull logic', () => {
  it('makeGame sets up 4 players, each 3 roses + 1 skull, 0 points', () => {
    const s = SK.makeGame()
    expect(s.players).toHaveLength(4)
    for (const p of s.players) {
      expect(p.hand.roses).toBe(3)
      expect(p.hand.skulls).toBe(1)
      expect(p.stack).toEqual([])
      expect(p.points).toBe(0)
      expect(p.eliminated).toBe(false)
    }
    expect(s.phase).toBe('place')
    expect(s.bid).toBeNull()
    expect(s.bidder).toBeNull()
    expect(s.winner).toBeNull()
    expect(totalDiscs(s)).toBe(16)
  })

  it('placing a disc moves it from hand to stack', () => {
    let s = SK.makeGame()
    s = SK.place(s, 0, 'rose')
    expect(s.players[0].hand.roses).toBe(2)
    expect(s.players[0].stack).toEqual(['rose'])
    expect(s.turn).toBe(1)          // advanced to next player
    expect(SK.totalPlaced(s)).toBe(1)
    // can't place out of turn
    const blocked = SK.place(s, 0, 'rose')
    expect(blocked).toBe(s)
  })

  it('a successful challenge (flip N roses) awards exactly one point', () => {
    // Build a state where P0 has opened a bid of 2 and everyone else passed → P0 must flip.
    let s = SK.makeGame()
    // P0 places two roses on its own stack (top two are roses), others place one rose each.
    s = SK.place(s, 0, 'rose')   // P0 stack: [rose]
    s = SK.place(s, 1, 'rose')
    s = SK.place(s, 2, 'rose')
    s = SK.place(s, 3, 'rose')   // first pass done, turn back to P0
    s = SK.place(s, 0, 'rose')   // P0 stack: [rose, rose]
    s = SK.place(s, 1, 'rose'); s = SK.place(s, 2, 'rose'); s = SK.place(s, 3, 'rose')
    s = SK.openBid(s, 0, 2)      // P0 claims 2 roses
    expect(s.phase).toBe('bid')
    // everyone passes
    s = SK.pass(s, 1); s = SK.pass(s, 2); s = SK.pass(s, 3)
    expect(s.phase).toBe('challenge')
    expect(s.bidder).toBe(0)
    expect(s.challengeTarget).toBe(2)
    // flip own stack twice — both roses → win
    s = SK.flip(s, 0)
    s = SK.flip(s, 0)
    expect(s.phase).toBe('reveal')
    expect(s.outcome).toEqual({ player: 0, success: true })
    expect(s.players[0].points).toBe(1)
  })

  it('a failed challenge (hit a skull) removes one disc and resets the round', () => {
    let s = SK.makeGame()
    // P0 places a SKULL then bids 1 → flipping its own top disc hits the skull.
    s = SK.place(s, 0, 'skull')
    s = SK.place(s, 1, 'rose'); s = SK.place(s, 2, 'rose'); s = SK.place(s, 3, 'rose')
    s = SK.openBid(s, 0, 1)
    s = SK.pass(s, 1); s = SK.pass(s, 2); s = SK.pass(s, 3)
    expect(s.phase).toBe('challenge')
    const before = totalDiscs(s)
    s = SK.flip(s, 0, () => 0)   // deterministic removal (first owned disc)
    expect(s.phase).toBe('reveal')
    expect(s.outcome).toEqual({ player: 0, success: false })
    s = SK.nextRound(s)
    expect(s.phase).toBe('place')
    expect(s.round).toBe(2)
    // exactly one disc destroyed
    expect(totalDiscs(s)).toBe(before - 1)
    expect(s.players[0].points).toBe(0)
    // stacks folded back into hands
    for (const p of s.players) expect(p.stack).toEqual([])
  })

  it('first player to TARGET_POINTS wins and phase becomes done', () => {
    // craft a near-win: P0 already has 1 point, win a second challenge.
    let s = SK.makeGame()
    s.players[0].points = SK.TARGET_POINTS - 1
    s = SK.place(s, 0, 'rose')
    s = SK.place(s, 1, 'rose'); s = SK.place(s, 2, 'rose'); s = SK.place(s, 3, 'rose')
    s = SK.openBid(s, 0, 1)
    s = SK.pass(s, 1); s = SK.pass(s, 2); s = SK.pass(s, 3)
    s = SK.flip(s, 0)
    expect(s.players[0].points).toBe(SK.TARGET_POINTS)
    expect(s.phase).toBe('done')
    expect(s.winner).toBe(0)
  })

  it('flipTargets enforces flipping your OWN stack before others', () => {
    let s = SK.makeGame()
    s = SK.place(s, 0, 'rose')
    s = SK.place(s, 1, 'rose'); s = SK.place(s, 2, 'rose'); s = SK.place(s, 3, 'rose')
    s = SK.place(s, 0, 'rose')   // P0 has 2 placed
    s = SK.place(s, 1, 'rose'); s = SK.place(s, 2, 'rose'); s = SK.place(s, 3, 'rose')
    s = SK.openBid(s, 0, 3)
    s = SK.pass(s, 1); s = SK.pass(s, 2); s = SK.pass(s, 3)
    expect(SK.flipTargets(s)).toEqual([0])         // must flip own first
    s = SK.flip(s, 0); s = SK.flip(s, 0)            // exhaust own stack
    const t = SK.flipTargets(s)
    expect(t).not.toContain(0)                      // own stack now empty of unflipped discs
    expect(t.length).toBeGreaterThan(0)             // others available
  })

  it('bounded AI self-play terminates with a valid winner and conserved disc accounting', () => {
    for (let game = 0; game < 25; game++) {
      const rng = seeded(game * 2654435761 + 12345)
      let s = SK.makeGame()
      const startDiscs = totalDiscs(s)
      let prevDiscs = startDiscs
      let guard = 0
      while (s.winner == null && guard++ < 6000) {
        // disc count must be monotone non-increasing, dropping by at most 1 per step
        const now = totalDiscs(s)
        expect(now).toBeLessThanOrEqual(prevDiscs)
        expect(prevDiscs - now).toBeLessThanOrEqual(1)
        prevDiscs = now

        if (s.phase === 'reveal') { s = SK.nextRound(s); continue }
        const who = s.turn
        if (who === 0) {
          // simple deterministic human: behave like the AI for full determinism & termination.
          s = SK.aiAct(s, 0, rng)
        } else {
          s = SK.aiAct(s, who, rng)
        }
      }
      expect(s.winner).not.toBeNull()
      expect(s.winner).toBeGreaterThanOrEqual(0)
      expect(s.winner).toBeLessThan(4)
      // winner must actually satisfy a victory condition
      const w = s.players[s.winner!]
      const aliveCount = s.players.filter(p => !p.eliminated).length
      expect(w.points >= SK.TARGET_POINTS || aliveCount === 1).toBe(true)
      // total discs only ever went down
      expect(totalDiscs(s)).toBeLessThanOrEqual(startDiscs)
    }
  })
})
