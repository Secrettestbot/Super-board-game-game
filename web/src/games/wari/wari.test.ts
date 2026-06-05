import { describe, it, expect } from 'vitest'
import {
  makeGame, legalMoves, applyMove, aiTurn, winner,
  type WariState, type Side,
} from './logic'

// Total seeds on board + both captured stores must always equal 48.
function total(s: WariState): number {
  return s.pits.reduce((a, b) => a + b, 0) + s.captured.you + s.captured.ai
}

// Build a custom state for deterministic capture tests.
function mk(pits: number[], turn: Side = 'you'): WariState {
  return {
    pits: pits.slice(),
    captured: { you: 0, ai: 0 },
    turn, winner: null, last: null, capturedPits: [],
    moveCount: 0, log: [],
  }
}

describe('wari', () => {
  it('starts with 48 seeds (4 per pit) and you to move', () => {
    const s = makeGame()
    expect(s.pits).toHaveLength(12)
    expect(total(s)).toBe(48)
    expect(s.turn).toBe('you')
    expect(legalMoves(s.pits, 'you')).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('conserves 48 seeds across every move of a real game', () => {
    let s = makeGame()
    let guard = 0
    while (s.winner == null && guard++ < 500) {
      const side = s.turn as Side
      const moves = legalMoves(s.pits, side)
      const pick = moves[guard % moves.length]
      s = applyMove(s, pick, side)
      expect(total(s)).toBe(48)
    }
  })

  it('skips the origin pit when sowing a full lap (12+ seeds)', () => {
    // pit 0 holds 12 seeds; sowing should place one in each of the other 11 pits
    // and the 12th wraps to pit 1 (origin 0 is skipped), not back into pit 0.
    const pits = new Array(12).fill(0)
    pits[0] = 12
    const s = mk(pits, 'you')
    const after = applyMove(s, 0, 'you')
    expect(after.pits[0]).toBe(0) // origin skipped, stays empty
    expect(after.pits[1]).toBe(2) // got the first seed and the wrapping 12th
    for (let i = 2; i <= 11; i++) expect(after.pits[i]).toBe(1)
    expect(after.pits.reduce((a, b) => a + b, 0) + after.captured.you).toBe(12)
  })

  it('multi-captures: last seed makes an opp pit 2 or 3, chaining backward', () => {
    // You sow pit 5 (3 seeds) -> lands in pits 6,7,8. Set up so 6,7,8 become 2/3.
    const pits = new Array(12).fill(0)
    pits[5] = 3      // sow into 6,7,8
    pits[6] = 1      // ->2  (capturable, it's AI's row)
    pits[7] = 2      // ->3  (capturable)
    pits[8] = 1      // ->2  last seed lands here
    // give AI extra seeds elsewhere so this isn't a grand slam
    pits[9] = 5
    pits[10] = 3
    const s = mk(pits, 'you')
    const after = applyMove(s, 5, 'you')
    // last lands in 8 (=2) capture, walk back 7 (=3) capture, 6 (=2) capture, 5 is yours -> stop
    expect(after.captured.you).toBe(2 + 3 + 2)
    expect(after.pits[8]).toBe(0)
    expect(after.pits[7]).toBe(0)
    expect(after.pits[6]).toBe(0)
  })

  it('grand-slam move captures nothing (would take all opponent seeds)', () => {
    // AI has seeds only in pits 6 and 7. You sow so that capturing both empties
    // the AI entirely -> abapa forbids the capture.
    const pits = new Array(12).fill(0)
    pits[5] = 2   // sow into 6,7
    pits[6] = 1   // ->2
    pits[7] = 1   // ->2  last seed; capturing 6+7 takes ALL of AI's seeds
    pits[0] = 4   // your own seeds elsewhere
    const s = mk(pits, 'you')
    const after = applyMove(s, 5, 'you')
    expect(after.captured.you).toBe(0)          // no capture
    expect(after.pits[6]).toBe(2)               // seeds remain
    expect(after.pits[7]).toBe(2)
  })

  it('feeding rule: when opponent is empty you must play a move that feeds them', () => {
    // AI (6..11) all empty. You have seeds in pit 0 (1 seed, stays your side) and
    // pit 5 (1 seed -> reaches AI pit 6). Only pit 5 feeds, so it is the lone legal move.
    const pits = new Array(12).fill(0)
    pits[0] = 1   // sowing keeps it on your side (lands in pit 1) — does NOT feed
    pits[5] = 1   // sowing lands in pit 6 (AI) — feeds
    const s = mk(pits, 'you')
    const moves = legalMoves(s.pits, 'you')
    expect(moves).toEqual([5])
  })

  it('endgame sweep assigns remaining seeds and declares the right winner', () => {
    // AI cannot move (all empty); you still have seeds + a captured lead.
    const pits = new Array(12).fill(0)
    pits[0] = 3
    pits[1] = 2
    const s: WariState = {
      pits, captured: { you: 20, ai: 18 }, turn: 'you',
      winner: null, last: null, capturedPits: [], moveCount: 0, log: [],
    }
    // You sow pit 1 (2 seeds -> into pits 2,3, both yours). AI then has no move ->
    // game ends; your remaining board seeds sweep to you.
    const after = applyMove(s, 1, 'you')
    expect(after.winner).toBe('you')
    expect(after.captured.you + after.captured.ai).toBe(20 + 18 + 5) // all 43 distributed
    expect(after.captured.you).toBe(20 + 5) // you collect your 5 board seeds
    expect(after.captured.ai).toBe(18)
  })

  it('bounded self-play terminates with no throws and 48 seeds conserved', () => {
    let s = makeGame()
    let guard = 0
    expect(() => {
      while (s.winner == null && guard++ < 500) {
        s = s.turn === 'ai' ? aiTurn(s) : (() => {
          const moves = legalMoves(s.pits, 'you')
          return applyMove(s, moves[guard % moves.length], 'you')
        })()
        expect(total(s)).toBe(48)
      }
    }).not.toThrow()
    // either a natural winner or a cap-hit (treated as ongoing) — both fine
    expect(total(s)).toBe(48)
    if (s.winner != null) expect(['you', 'ai', 'draw']).toContain(winner(s))
  })
})
