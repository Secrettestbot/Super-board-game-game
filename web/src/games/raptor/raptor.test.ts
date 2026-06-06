import { describe, it, expect } from 'vitest'
import {
  makeGame, revealCards, resolveRound, lowerHigher, applyMovement,
  checkWinner, selfPlay, mother, babies, scientists, pieceAt, aiResolve,
} from './logic'
import type { State, Piece } from './logic'

// helper: replace the piece list of a state
function withPieces(s: State, pieces: Piece[]): State {
  return { ...s, pieces }
}

describe('Raptor logic', () => {
  it('reveals two cards: lower acts first (special), higher takes the main action', () => {
    const s = makeGame(1)
    const r = revealCards(s, 3, 7)
    expect(r.phase).toBe('resolve')
    expect(r.revealed).toEqual([3, 7])
    const lh = lowerHigher(r)
    expect(lh).not.toBeNull()
    expect(lh!.low).toBe(0)      // you played 3 (lower)
    expect(lh!.high).toBe(1)     // scientists played 7 (higher)
    expect(lh!.highCard).toBe(7)
    // ties: player 0 counts as lower
    const r2 = revealCards(makeGame(1), 5, 5)
    expect(lowerHigher(r2)!.low).toBe(0)
  })

  it('movement spends exactly the action number as points (baby walks toward an edge)', () => {
    let s = makeGame(2)
    // isolate a single baby dead-centre (max distance from any edge), no scientists.
    const mom = mother(s)!
    const baby: Piece = { id: 88, kind: 'baby', r: 4, c: 5, alive: true }
    s = withPieces(s, [mom, baby])
    const before = Math.min(baby.r, baby.c, s.rows - 1 - baby.r, s.cols - 1 - baby.c)
    const after = applyMovement(s, 0, 2, false)
    const b2 = after.pieces.find(p => p.id === 88 && p.alive)!
    const distAfter = Math.min(b2.r, b2.c, after.rows - 1 - b2.r, after.cols - 1 - b2.c)
    // 2 movement points should reduce the baby's distance to the nearest edge by 2.
    expect(distAfter).toBe(before - 2)
  })

  it('a baby reaching the board edge escapes (counter increments)', () => {
    let s = makeGame(3)
    const mom = mother(s)!
    // place a single baby on the edge (row 0)
    const baby: Piece = { id: 99, kind: 'baby', r: 0, c: 5, alive: true }
    s = withPieces(s, [mom, baby])
    const after = applyMovement(s, 0, 1, false)
    expect(after.babiesEscaped).toBe(1)
    expect(after.pieces.find(p => p.id === 99)!.alive).toBe(false)
  })

  it('a scientist adjacent to a baby captures it (counter increments)', () => {
    let s = makeGame(4)
    const sci: Piece = { id: 50, kind: 'scientist', r: 4, c: 4, alive: true }
    const baby: Piece = { id: 51, kind: 'baby', r: 4, c: 5, alive: true }
    s = withPieces(s, [sci, baby])
    const after = applyMovement(s, 1, 2, false)
    expect(after.babiesCaptured).toBe(1)
    expect(after.pieces.find(p => p.id === 51)!.alive).toBe(false)
  })

  it('the mother eats an adjacent scientist (counter increments)', () => {
    let s = makeGame(5)
    const mom: Piece = { id: 0, kind: 'mother', r: 4, c: 5, alive: true }
    const sci: Piece = { id: 60, kind: 'scientist', r: 4, c: 6, alive: true }
    // keep a baby on the board so the "all babies captured" win doesn't preempt the eat
    const baby: Piece = { id: 61, kind: 'baby', r: 1, c: 1, alive: true }
    s = withPieces(s, [mom, sci, baby])
    const after = applyMovement(s, 0, 1, false)
    expect(after.scientistsEaten).toBe(1)
    expect(after.pieces.find(p => p.id === 60)!.alive).toBe(false)
  })

  it('raptor win condition triggers when 3 babies escaped / 3 scientists eaten', () => {
    const s = makeGame(6)
    expect(checkWinner({ ...s, babiesEscaped: 3 })).toBe(0)
    expect(checkWinner({ ...s, scientistsEaten: 3 })).toBe(0)
    expect(checkWinner({ ...s, babiesEscaped: 2 })).toBeNull()
  })

  it('scientist win condition triggers when mother sleeps / all babies captured', () => {
    const s = makeGame(7)
    expect(checkWinner({ ...s, motherAsleep: true })).toBe(1)
    // remove all babies -> all captured (none escaped) -> scientists win
    const noBabies = { ...s, pieces: s.pieces.map(p => p.kind === 'baby' ? { ...p, alive: false } : p) }
    expect(checkWinner(noBabies)).toBe(1)
  })

  it('resolveRound applies lower-special then higher-action and advances the round', () => {
    const s0 = makeGame(8)
    const r = revealCards(s0, 2, 8)
    expect(r.phase).toBe('resolve')
    const done = resolveRound(r)
    expect(done.phase === 'reveal' || done.phase === 'gameover').toBe(true)
    if (done.phase === 'reveal') {
      expect(done.round).toBe(s0.round + 1)
      expect(done.revealed).toEqual([null, null])
      // the played cards moved to discard
      expect(done.discards[0]).toContain(2)
      expect(done.discards[1]).toContain(8)
    }
  })

  it('deterministic self-play reaches a valid winner under a guard cap, no throws', () => {
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      let final!: State
      expect(() => { final = selfPlay(seed, 500) }).not.toThrow()
      // winner is either null (cap hit) or a valid player; if present it matches checkWinner
      if (final.winner != null) {
        expect(final.winner === 0 || final.winner === 1).toBe(true)
        expect(final.phase).toBe('gameover')
      }
      // determinism: same seed -> same result
      const again = selfPlay(seed, 500)
      expect(again.winner).toBe(final.winner)
      expect(again.round).toBe(final.round)
    }
  })

  it('aiResolve never throws across many steps and bumps turn', () => {
    let s = makeGame(99)
    let prev = s.turn
    for (let i = 0; i < 60 && s.winner == null; i++) {
      const before = s.turn
      s = aiResolve(s)
      expect(s.turn).toBeGreaterThanOrEqual(before)
      prev = s.turn
    }
    expect(prev).toBeGreaterThan(0)
  })
})
