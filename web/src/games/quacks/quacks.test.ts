import { describe, it, expect } from 'vitest'
import * as Q from './logic'
import type { QuacksState, PlayerState } from './logic'

// Pure-logic tests (no DOM). Deterministic via the seeded RNG on the state.

function freshDrawState(): QuacksState {
  return Q.makeGame(12345)
}

describe('quacks logic', () => {
  it('starts a valid game — 2 players, round 1, draw phase, no winner, white bombs in bag', () => {
    const s = Q.makeGame(1)
    expect(s.players.length).toBe(2)
    expect(s.round).toBe(1)
    expect(s.phase).toBe('draw')
    expect(s.winner).toBeNull()
    expect(s.players[0].seat).toBe(0)
    expect(s.players[1].seat).toBe(1)
    // starting bag has white cherry bombs
    expect(s.players[0].bag.filter(c => c.color === 'white').length).toBeGreaterThan(0)
    expect(s.players[0].pool.length).toBe(s.players[0].bag.length)
    expect(s.players[0].pos).toBe(0)
  })

  it('drawing a chip advances the pot by the chip value and records it', () => {
    const s = freshDrawState()
    const before = s.players[0]
    const s2 = Q.drawChip(s, 0)
    const after = s2.players[0]
    expect(after.drawn.length).toBe(1)
    const chip = after.drawn[0]
    expect(after.pos).toBe(before.pos + chip.value)
    expect(after.pool.length).toBe(before.pool.length - 1)
  })

  it('white total exceeding 7 explodes the pot', () => {
    // Construct a player whose pool is all whites guaranteeing a bust.
    let s = freshDrawState()
    const whites = [
      { id: 101, color: 'white' as const, value: 3 },
      { id: 102, color: 'white' as const, value: 3 },
      { id: 103, color: 'white' as const, value: 3 },
    ]
    const p: PlayerState = { ...s.players[0], pool: whites, drawn: [], pos: 0, whiteTotal: 0, exploded: false, done: false }
    s = { ...s, players: [p, s.players[1]] }
    s = Q.drawChip(s, 0) // 3
    s = Q.drawChip(s, 0) // 6
    expect(s.players[0].exploded).toBe(false)
    s = Q.drawChip(s, 0) // 9 -> >7 explode
    expect(s.players[0].whiteTotal).toBeGreaterThan(7)
    expect(s.players[0].exploded).toBe(true)
    expect(s.players[0].done).toBe(true)
  })

  it('stopping banks BOTH vp and coins (no explosion)', () => {
    let s = freshDrawState()
    // give player a known safe position with no whites drawn
    const p: PlayerState = { ...s.players[0], pos: 9, whiteTotal: 0, exploded: false, drawn: [], done: false }
    const ai: PlayerState = { ...s.players[1], pos: 6, whiteTotal: 0, exploded: false, drawn: [], done: true }
    s = { ...s, players: [p, ai] }
    s = Q.stop(s, 0)
    expect(s.players[0].done).toBe(true)
    s = Q.resolveRound(s)
    // round 1 resolved -> shop phase, player banked vp and coins both > 0
    expect(s.players[0].vp).toBe(Q.vpForPos(9))
    expect(s.players[0].coins).toBe(Q.coinsForPos(9))
    expect(s.players[0].vp).toBeGreaterThan(0)
    expect(s.players[0].coins).toBeGreaterThan(0)
  })

  it('exploding banks EITHER points OR coins, not both', () => {
    let s = freshDrawState()
    const p: PlayerState = { ...s.players[0], pos: 9, whiteTotal: 8, exploded: true, drawn: [], done: true }
    const ai: PlayerState = { ...s.players[1], pos: 5, whiteTotal: 0, exploded: false, drawn: [], done: true }
    s = { ...s, players: [p, ai] }
    s = Q.resolveRound(s)
    const banked = s.players[0]
    const gotVp = banked.vp > 0
    const gotCoins = banked.coins > 0
    // exactly one of the two is non-zero
    expect(gotVp !== gotCoins).toBe(true)
  })

  it('buying a chip deducts coins and adds it to the bag', () => {
    let s = freshDrawState()
    // put into shop with coins
    const p: PlayerState = { ...s.players[0], coins: 20 }
    s = { ...s, phase: 'shop', players: [p, s.players[1]] }
    const item = Q.SHOP[0]
    const bagBefore = s.players[0].bag.length
    s = Q.buyChip(s, 0, item.id)
    expect(s.players[0].coins).toBe(20 - item.cost)
    expect(s.players[0].bag.length).toBe(bagBefore + 1)
    expect(s.players[0].bag.some(c => c.color === item.color && c.value === item.value)).toBe(true)
  })

  it('cannot buy a chip you cannot afford', () => {
    let s = freshDrawState()
    const p: PlayerState = { ...s.players[0], coins: 0 }
    s = { ...s, phase: 'shop', players: [p, s.players[1]] }
    const bagBefore = s.players[0].bag.length
    s = Q.buyChip(s, 0, Q.SHOP[0].id)
    expect(s.players[0].bag.length).toBe(bagBefore)
    expect(s.players[0].coins).toBe(0)
  })

  it('plays a full self-play game to a valid winner in 9 rounds with no throws', () => {
    let s = Q.makeGame(777)
    let guard = 0
    const CAP = 100000
    while (s.winner == null && guard < CAP) {
      guard++
      if (s.phase === 'draw') {
        // player 0 plays the same push-your-luck heuristic via aiTurn-style: draw a bit then stop
        const you = s.players[0]
        if (!you.done) {
          if (you.pool.length === 0 || Q.nextDrawBustProb(you) >= 0.4 || you.pos >= 14) {
            s = Q.stop(s, 0)
          } else {
            s = Q.drawChip(s, 0)
          }
          continue
        }
        // both done? aiTurn handles AI + resolve
        s = Q.aiTurn(s)
        continue
      }
      // shop / anything else -> AI drives shopping + round advance
      s = Q.aiTurn(s)
    }
    expect(guard).toBeLessThan(CAP)
    expect(s.phase).toBe('over')
    expect(s.winner === 0 || s.winner === 1).toBe(true)
    expect(s.round).toBe(Q.ROUNDS)
  })
})
