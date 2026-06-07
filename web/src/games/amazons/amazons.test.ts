import { describe, it, expect } from 'vitest'
import * as AZ from './logic'

// Pure logic test (no DOM). Verifies the standard start, queen-move blocking, a full
// move+shoot turn, and that full self-play games always terminate with a frozen loser.

describe('amazons logic', () => {
  it('starts at the standard opening: 4 amazons per side, White to move, nothing burned', () => {
    const s = AZ.makeGame()
    expect(s.board).toHaveLength(100)
    expect(s.turn).toBe('w')
    expect(s.you).toBe('w')
    expect(s.winner).toBeNull()
    expect(AZ.amazonsOf(s.board, 'w')).toHaveLength(4)
    expect(AZ.amazonsOf(s.board, 'b')).toHaveLength(4)
    expect(s.board.filter(c => c === 'x')).toHaveLength(0)
    // exact standard squares: White d1,g1,a4,j4 ; Black a7,j7,d10,g10
    expect(new Set(AZ.amazonsOf(s.board, 'w'))).toEqual(
      new Set([AZ.idx(9, 3), AZ.idx(9, 6), AZ.idx(6, 0), AZ.idx(6, 9)]))
    expect(new Set(AZ.amazonsOf(s.board, 'b'))).toEqual(
      new Set([AZ.idx(3, 0), AZ.idx(3, 9), AZ.idx(0, 3), AZ.idx(0, 6)]))
  })

  it('queen-move generation respects blocking by pieces and burned squares', () => {
    const board: AZ.Cell[] = new Array(100).fill(null)
    const from = AZ.idx(5, 5)
    board[from] = 'w'
    board[AZ.idx(5, 8)] = 'b'        // blocks rightward past col 7
    board[AZ.idx(2, 5)] = 'x'        // burned: blocks upward past row 3
    const moves = AZ.queenMoves(board, from)
    const set = new Set(moves)
    // rightward stops before the black amazon and never includes it
    expect(set.has(AZ.idx(5, 6))).toBe(true)
    expect(set.has(AZ.idx(5, 7))).toBe(true)
    expect(set.has(AZ.idx(5, 8))).toBe(false)   // occupied
    expect(set.has(AZ.idx(5, 9))).toBe(false)   // beyond the blocker
    // upward stops before the burned square
    expect(set.has(AZ.idx(3, 5))).toBe(true)
    expect(set.has(AZ.idx(2, 5))).toBe(false)   // burned
    expect(set.has(AZ.idx(1, 5))).toBe(false)   // beyond the burn
    // a diagonal into open space is fine
    expect(set.has(AZ.idx(8, 8))).toBe(true)
  })

  it('a full turn moves the amazon and burns a square', () => {
    const s = AZ.makeGame()
    const from = AZ.idx(6, 0)                 // a4 amazon
    const to = AZ.queenMoves(s.board, from)[0]
    const shoot = AZ.arrowTargets(s.board, from, to)[0]
    expect(to).not.toBeUndefined()
    expect(shoot).not.toBeUndefined()
    const ns = AZ.playTurn(s, from, to, shoot, 'w')
    expect(ns.board[from]).toBeNull()         // amazon left its square
    expect(ns.board[to]).toBe('w')            // amazon relocated
    expect(ns.board[shoot]).toBe('x')         // square burned
    expect(ns.board.filter(c => c === 'x')).toHaveLength(1)
    expect(ns.turn).toBe('b')                 // handed to the rival
    expect(ns.lastMoveFrom).toBe(from)
    expect(ns.lastMoveTo).toBe(to)
    expect(ns.lastShot).toBe(shoot)
  })

  it('rejects illegal turns (wrong side, blocked move, illegal arrow)', () => {
    const s = AZ.makeGame()
    // moving a black amazon on White's turn is a no-op
    expect(AZ.playTurn(s, AZ.idx(3, 0), AZ.idx(4, 0), AZ.idx(5, 0), 'b')).toBe(s)
    // a non-queen-move destination is rejected
    const from = AZ.idx(9, 3)
    expect(AZ.playTurn(s, from, AZ.idx(0, 0), from, 'w')).toBe(s)
  })

  it('plays several full self-play games to a frozen loser, no throws', () => {
    for (let game = 0; game < 4; game++) {
      let s = AZ.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 400) {
        if (s.turn === 'w') {
          // human side: a uniformly random legal full turn
          const t = AZ.randomTurn(s.board, 'w')
          expect(t).not.toBeNull()            // White still has a move (else loop would have ended)
          s = AZ.playTurn(s, t!.from, t!.to, t!.shoot, 'w')
        } else {
          s = AZ.aiMove(s)                    // AI side via real engine (depth 1)
        }
      }
      expect(s.winner).not.toBeNull()         // always terminates within the cap
      expect(s.turn).toBeNull()               // game is closed
      // the winner is whoever moved last; the loser has no legal move
      const loser: AZ.Side = s.winner === 'w' ? 'b' : 'w'
      expect(AZ.hasMove(s.board, loser)).toBe(false)
    }
  })
})
