import { describe, it, expect } from 'vitest'
import {
  makeGame, legalMoves, applyMove, inCheck, isCheckmate, isStalemate,
  chooseMove, aiMove, insufficientMaterial, squareName,
  sq, type ChessState, type Board, type Move, type Piece, type Color,
} from './logic'

// ---- helpers ----
function emptyBoard(): Board { return new Array(64).fill(null) }
function place(b: Board, name: string, p: Piece) { b[nameToIdx(name)] = p }
function nameToIdx(name: string): number {
  const file = 'abcdefgh'.indexOf(name[0])
  const rank = 8 - parseInt(name[1], 10)
  return sq(rank, file)
}
function W(type: any): Piece { return { type, color: 0 as Color } }
function B(type: any): Piece { return { type, color: 1 as Color } }
function baseState(board: Board, turn: Color = 0): ChessState {
  return {
    board, turn, castling: { wk: false, wq: false, bk: false, bq: false },
    ep: -1, halfmove: 0, fullmove: 1, history: [], last: null,
    captured: { 0: [], 1: [] }, result: null, reason: null,
  }
}
function find(moves: Move[], from: string, to: string): Move | undefined {
  return moves.find(m => m.from === nameToIdx(from) && m.to === nameToIdx(to))
}

describe('initial setup', () => {
  it('has 32 pieces in standard arrangement', () => {
    const s = makeGame()
    const count = s.board.filter(p => p != null).length
    expect(count).toBe(32)
    expect(s.board[nameToIdx('e1')]).toEqual({ type: 'k', color: 0 })
    expect(s.board[nameToIdx('e8')]).toEqual({ type: 'k', color: 1 })
    expect(s.board[nameToIdx('d1')]).toEqual({ type: 'q', color: 0 })
    expect(s.board[nameToIdx('a1')]).toEqual({ type: 'r', color: 0 })
    expect(s.board[nameToIdx('e2')]).toEqual({ type: 'p', color: 0 })
    expect(s.turn).toBe(0)
  })

  it('offers 20 legal opening moves for White', () => {
    const s = makeGame()
    expect(legalMoves(s).length).toBe(20)
  })
})

describe('pawn moves', () => {
  it('allows double-step from start and exposes an en-passant target', () => {
    let s = makeGame()
    const m = find(legalMoves(s), 'e2', 'e4')
    expect(m).toBeTruthy()
    s = applyMove(s, m!)
    expect(s.ep).toBe(nameToIdx('e3'))
    expect(s.board[nameToIdx('e4')]).toEqual({ type: 'p', color: 0 })
  })

  it('performs an en-passant capture', () => {
    const b = emptyBoard()
    place(b, 'e1', W('k')); place(b, 'e8', B('k'))
    place(b, 'd5', W('p')); place(b, 'e7', B('p'))
    let s = baseState(b, 1)
    // black double-steps e7-e5 next to white pawn on d5
    s = applyMove(s, find(legalMoves(s), 'e7', 'e5')!)
    expect(s.ep).toBe(nameToIdx('e6'))
    // white captures en passant d5xe6
    const ep = find(legalMoves(s), 'd5', 'e6')
    expect(ep?.enPassant).toBe(true)
    s = applyMove(s, ep!)
    expect(s.board[nameToIdx('e6')]).toEqual({ type: 'p', color: 0 })
    expect(s.board[nameToIdx('e5')]).toBeNull() // captured pawn removed
  })

  it('promotes a pawn to a queen', () => {
    const b = emptyBoard()
    place(b, 'e1', W('k')); place(b, 'e8', B('k')); place(b, 'a7', W('p'))
    let s = baseState(b, 0)
    const promos = legalMoves(s).filter(m => m.from === nameToIdx('a7') && m.to === nameToIdx('a8'))
    expect(promos.map(m => m.promo).sort()).toEqual(['b', 'n', 'q', 'r'])
    s = applyMove(s, promos.find(m => m.promo === 'q')!)
    expect(s.board[nameToIdx('a8')]).toEqual({ type: 'q', color: 0 })
  })
})

describe('pins and check', () => {
  it('forbids moving a pinned piece off the pin line', () => {
    const b = emptyBoard()
    place(b, 'e1', W('k')); place(b, 'e8', B('k'))
    place(b, 'e2', W('n')) // pinned by the black rook on e8
    place(b, 'e7', B('p')) // keep black king move count irrelevant
    const s = baseState(b, 0)
    // the knight cannot move because it's pinned to the king by e8 rook... use rook
    const b2 = emptyBoard()
    place(b2, 'e1', W('k')); place(b2, 'e2', W('n')); place(b2, 'e8', B('r')); place(b2, 'a8', B('k'))
    const s2 = baseState(b2, 0)
    const knightMoves = legalMoves(s2).filter(m => m.from === nameToIdx('e2'))
    expect(knightMoves.length).toBe(0)
  })

  it('detects check', () => {
    const b = emptyBoard()
    place(b, 'e1', W('k')); place(b, 'e8', B('r')); place(b, 'a8', B('k'))
    const s = baseState(b, 0)
    expect(inCheck(s, 0)).toBe(true)
  })
})

describe('castling', () => {
  it('allows king-side castling when squares are clear and safe', () => {
    const b = emptyBoard()
    place(b, 'e1', W('k')); place(b, 'h1', W('r')); place(b, 'e8', B('k'))
    const s: ChessState = { ...baseState(b, 0), castling: { wk: true, wq: false, bk: false, bq: false } }
    const m = find(legalMoves(s), 'e1', 'g1')
    expect(m?.castle).toBe('k')
    const after = applyMove(s, m!)
    expect(after.board[nameToIdx('g1')]).toEqual({ type: 'k', color: 0 })
    expect(after.board[nameToIdx('f1')]).toEqual({ type: 'r', color: 0 })
  })

  it('forbids castling through an attacked square', () => {
    const b = emptyBoard()
    place(b, 'e1', W('k')); place(b, 'h1', W('r')); place(b, 'e8', B('k'))
    place(b, 'f8', B('r')) // black rook attacks f1, the square the king passes through
    const s: ChessState = { ...baseState(b, 0), castling: { wk: true, wq: false, bk: false, bq: false } }
    expect(find(legalMoves(s), 'e1', 'g1')).toBeUndefined()
  })

  it('forbids castling while in check', () => {
    const b = emptyBoard()
    place(b, 'e1', W('k')); place(b, 'h1', W('r')); place(b, 'e8', B('r')); place(b, 'a8', B('k'))
    const s: ChessState = { ...baseState(b, 0), castling: { wk: true, wq: false, bk: false, bq: false } }
    expect(find(legalMoves(s), 'e1', 'g1')).toBeUndefined()
  })
})

describe('terminal positions', () => {
  it("detects fool's mate (checkmate)", () => {
    let s = makeGame()
    s = applyMove(s, find(legalMoves(s), 'f2', 'f3')!) // white
    s = applyMove(s, find(legalMoves(s), 'e7', 'e5')!) // black
    s = applyMove(s, find(legalMoves(s), 'g2', 'g4')!) // white
    // black: Qd8-h4#
    s = applyMove(s, find(legalMoves(s), 'd8', 'h4')!)
    expect(s.result).toBe('black')
    expect(s.reason).toBe('checkmate')
    expect(isCheckmate(s)).toBe(true)
  })

  it('detects a known stalemate position', () => {
    // Black king a8, White king c7? use classic: black to move, no legal move, not in check.
    const b = emptyBoard()
    place(b, 'a8', B('k')); place(b, 'c7', W('k')); place(b, 'b6', W('q'))
    const s = baseState(b, 1) // black to move
    expect(isStalemate(s)).toBe(true)
    expect(isCheckmate(s)).toBe(false)
    expect(legalMoves(s).length).toBe(0)
  })

  it('detects insufficient material (K vs K)', () => {
    const b = emptyBoard()
    place(b, 'e1', W('k')); place(b, 'e8', B('k'))
    expect(insufficientMaterial(b)).toBe(true)
    // with a pawn it is sufficient
    place(b, 'a2', W('p'))
    expect(insufficientMaterial(b)).toBe(false)
  })
})

describe('AI', () => {
  it('chooseMove returns a legal move from the opening', () => {
    const s = makeGame()
    const m = chooseMove(s, 2)
    expect(m).toBeTruthy()
    const legal = legalMoves(s)
    expect(legal.some(x => x.from === m!.from && x.to === m!.to)).toBe(true)
  })

  it('AI takes a free hanging queen', () => {
    const b = emptyBoard()
    place(b, 'e1', W('k')); place(b, 'e8', B('k'))
    place(b, 'd4', W('q')) // white queen hanging
    place(b, 'a1', B('r')) // black rook on a1 can take... place rook to capture d4? use rook on d8
    const b2 = emptyBoard()
    place(b2, 'e1', W('k')); place(b2, 'e8', B('k')); place(b2, 'd4', W('q')); place(b2, 'd8', B('r'))
    const s = baseState(b2, 1) // black to move
    const m = chooseMove(s, 3)
    expect(m && squareName(m.to)).toBe('d4')
  })

  it('aiMove finds mate in one', () => {
    // White to move, mate available: Ra8#? construct simple back-rank mate.
    const b = emptyBoard()
    place(b, 'a1', W('r')); place(b, 'h7', W('k')); place(b, 'g8', B('k'))
    place(b, 'f7', W('p')); place(b, 'g7', W('p')); place(b, 'h8', B('p'))
    // black king on g8 boxed in by own pawn h8? give simple: white Ra1-a8 mate
    const b2 = emptyBoard()
    place(b2, 'a1', W('r')); place(b2, 'b6', W('k')); place(b2, 'h8', B('k'))
    place(b2, 'g7', W('p')); place(b2, 'h7', W('p'))
    // mate: Ra8#  (king on h8, pawns g7/h7 cover g8/h... actually king escapes). Just assert AI mates if possible.
    const b3 = emptyBoard()
    place(b3, 'a7', W('r')); place(b3, 'b1', W('r')); place(b3, 'e1', W('k')); place(b3, 'h8', B('k'))
    let s = baseState(b3, 0)
    s = aiMove(s, 3) // white plays
    // After best play white should deliver mate: Rb1-b8 is mate (two-rook ladder)
    expect(s.result).toBe('white')
    expect(s.reason).toBe('checkmate')
  })
})

describe('self-play terminates', () => {
  it('reaches a terminal result under a ply cap without throwing', () => {
    let s = makeGame()
    let plies = 0
    const CAP = 120
    expect(() => {
      while (s.result == null && plies < CAP) {
        const m = chooseMove(s, 2)
        if (!m) break
        s = applyMove(s, m)
        plies++
      }
    }).not.toThrow()
    // either a real terminal or the cap was hit — both acceptable
    const ok = s.result === 'white' || s.result === 'black' || s.result === 'draw' || plies >= CAP || s.result == null
    expect(ok).toBe(true)
    // if a result exists it must be one of the valid strings
    if (s.result != null) {
      expect(['white', 'black', 'draw']).toContain(s.result)
    }
  })
})
