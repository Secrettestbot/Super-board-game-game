import { describe, it, expect } from 'vitest'
import * as PHK from './logic'
import type { Move } from './logic'

// Pure logic test: no DOM. Verifies the starting position, that legal moves are only
// slides into the adjacent empty point, that a trapped side is detected as a loss, and
// that full games (random human vs perfect AI) terminate cleanly with a consistent winner.

const { PT } = PHK

describe("pong hau k'i logic", () => {
  it('starts on a valid board: 4 pieces placed, centre empty, you (Red) to move', () => {
    const s = PHK.makeGame()
    expect(s.board).toHaveLength(5)
    expect(s.board.filter(c => c !== null)).toHaveLength(4)
    expect(s.board[PT.C]).toBeNull()
    expect(s.board[PT.TL]).toBe('r'); expect(s.board[PT.TR]).toBe('r')
    expect(s.board[PT.BL]).toBe('b'); expect(s.board[PT.BR]).toBe('b')
    expect(s.turn).toBe('r')
    expect(s.you).toBe('r')
    expect(s.winner).toBeNull()
  })

  it('legalMoves returns only slides into the adjacent empty point', () => {
    const s = PHK.makeGame()
    const moves = PHK.legalMoves(s.board, 'r')
    // From the standard start only the empty centre is open; just TL touches it via the
    // diagonal (TR's only neighbours are TL & BR, both occupied).
    expect(moves).toHaveLength(1)
    for (const m of moves) {
      expect(s.board[m.from]).toBe('r')          // moving own piece
      expect(s.board[m.to]).toBeNull()           // into an empty point
      expect(PHK.ADJ[m.from]).toContain(m.to)    // along an edge
    }
    expect(moves[0].to).toBe(PT.C)
  })

  it('a constructed trapped position is detected as a loss for the side to move', () => {
    // Empty = centre; Blue occupies both BL and BR. Blue to move: BL touches {TL,BR} and
    // BR touches {TR,BL,C}. The centre IS adjacent to BR, so park Blue off the diagonal:
    // Red on TL & BR (the diagonal ends), Blue on TR & BL — neither TR nor BL touches the
    // empty centre, so Blue cannot slide there and is trapped.
    const board: PHK.Cell[] = [null, null, null, null, null]
    board[PT.TL] = 'r'; board[PT.BR] = 'r'   // red holds the diagonal ends
    board[PT.TR] = 'b'; board[PT.BL] = 'b'   // blue on the off-diagonal corners
    board[PT.C] = null                        // empty centre — only TL/BR reach it
    expect(PHK.legalMoves(board, 'b')).toHaveLength(0)
    expect(PHK.isLoss(board, 'b')).toBe(true)
    expect(PHK.isLoss(board, 'r')).toBe(false) // red can still slide TL or BR into centre

    // Cross-check against an exhaustive scan: such trapped 2v2 states genuinely exist.
    const found = findTrappedState()
    expect(found).not.toBeNull()
    expect(PHK.legalMoves(found!.layout, found!.toMove)).toHaveLength(0)
    expect(PHK.isLoss(found!.layout, found!.toMove)).toBe(true)
  })

  it('plays several full games (random human vs perfect AI) within a ply cap; ends with a consistent winner', () => {
    let everEnded = false
    for (let game = 0; game < 40; game++) {
      let s = PHK.makeGame()
      let plies = 0
      const CAP = 200
      while (!s.winner && plies++ < CAP) {
        if (s.turn === 'r') {
          const moves = PHK.legalMoves(s.board, 'r')
          const m: Move = moves[(Math.random() * moves.length) | 0]
          s = PHK.move(s, m, 'r')
        } else {
          s = PHK.aiMove(s)
        }
      }
      // The game can repeat, so we only require: no throw, and IF it ended the winner is
      // consistent (the side to move had no slide and the other side is the winner).
      if (s.winner) {
        everEnded = true
        const loser: PHK.Disc = s.winner === 'r' ? 'b' : 'r'
        expect(PHK.legalMoves(s.board, loser)).toHaveLength(0)
        expect(s.turn).toBeNull()
        expect(['r', 'b']).toContain(s.winner)
      } else {
        expect(plies).toBeGreaterThanOrEqual(CAP)
      }
    }
    // With reasonable (perfect-AI) play, games do terminate.
    expect(everEnded).toBe(true)
  })

  it('a perfect AI is never beaten — random human play never yields a human win', () => {
    let humanWins = 0
    for (let game = 0; game < 60; game++) {
      let s = PHK.makeGame()
      let plies = 0
      while (!s.winner && plies++ < 200) {
        if (s.turn === 'r') {
          const moves = PHK.legalMoves(s.board, 'r')
          s = PHK.move(s, moves[(Math.random() * moves.length) | 0], 'r')
        } else {
          s = PHK.aiMove(s)
        }
      }
      if (s.winner === 'r') humanWins++
    }
    expect(humanWins).toBe(0)
  })
})

// Brute-force scan of the tiny state graph for any 2v2 position whose side-to-move has no
// legal slide — confirming trapped (terminal) states exist and isLoss agrees.
function findTrappedState(): { layout: PHK.Cell[]; toMove: PHK.Disc } | null {
  const vals: PHK.Cell[] = ['r', 'b', null]
  const board: PHK.Cell[] = [null, null, null, null, null]
  function* gen(i: number): Generator<PHK.Cell[]> {
    if (i === 5) { yield board.slice(); return }
    for (const v of vals) { board[i] = v; yield* gen(i + 1) }
  }
  for (const layout of gen(0)) {
    if (layout.filter(c => c === 'r').length !== 2) continue
    if (layout.filter(c => c === 'b').length !== 2) continue
    for (const toMove of ['r', 'b'] as PHK.Disc[]) {
      if (PHK.legalMoves(layout, toMove).length === 0) return { layout, toMove }
    }
  }
  return null
}
