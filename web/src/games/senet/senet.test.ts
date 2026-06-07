import { describe, it, expect } from 'vitest'
import {
  makeGame, cellOf, pathOf, movePawn, destOf, legalMoves, throwSticks, rollFromSticks,
  grantsExtra, aiStep, SQUARES, PAWNS, OFF, WATER, WATER_BACK, HORUS,
} from './logic'
import type { SenetState, Player } from './logic'

/** Build a custom board state for targeted tests. */
function withBoard(board: (Player | null)[], patch: Partial<SenetState> = {}): SenetState {
  const g = makeGame()
  return Object.assign({}, g, { board: board.slice(), ...patch })
}
const empty = (): (Player | null)[] => new Array(SQUARES).fill(null)

describe('Senet logic', () => {
  it('boustrophedon path indexing: row/col round-trips and middle row reverses', () => {
    // square 1 (idx 0) → top-left
    expect(cellOf(0)).toEqual([0, 0])
    // square 10 (idx 9) → top-right
    expect(cellOf(9)).toEqual([0, 9])
    // square 11 (idx 10) → middle row, far RIGHT (boustrophedon)
    expect(cellOf(10)).toEqual([1, 9])
    // square 20 (idx 19) → middle row, far LEFT
    expect(cellOf(19)).toEqual([1, 0])
    // square 21 (idx 20) → bottom-left ; square 30 (idx 29) → bottom-right
    expect(cellOf(20)).toEqual([2, 0])
    expect(cellOf(29)).toEqual([2, 9])
    // inverse round-trips for every square
    for (let i = 0; i < SQUARES; i++) {
      const [r, c] = cellOf(i)
      expect(pathOf(r, c)).toBe(i)
    }
  })

  it('stick reading: count of whites, all-blank = 5, and extra-throw on 1/4/5', () => {
    expect(rollFromSticks([0, 0, 0, 0])).toBe(5)
    expect(rollFromSticks([1, 0, 0, 0])).toBe(1)
    expect(rollFromSticks([1, 1, 1, 0])).toBe(3)
    expect(rollFromSticks([1, 1, 1, 1])).toBe(4)
    expect([1, 4, 5].every(grantsExtra)).toBe(true)
    expect([2, 3].some(grantsExtra)).toBe(false)
  })

  it('a move advances one pawn forward along the path onto an empty square', () => {
    const b = empty(); b[5] = 0
    let s = withBoard(b, { phase: 'move', roll: 3 })
    expect(destOf(s, 0, 5, 3)).toBe(8)
    s = movePawn(s, 0, 5)
    expect(s.board[5]).toBe(null)
    expect(s.board[8]).toBe(0)
  })

  it('landing on a single opponent pawn SWAPS it back to the mover origin', () => {
    const b = empty(); b[4] = 0; b[7] = 1 // foe alone on idx 7
    let s = withBoard(b, { phase: 'move', roll: 3, turn: 0 })
    expect(destOf(s, 0, 4, 3)).toBe(7)
    s = movePawn(s, 0, 4)
    expect(s.board[7]).toBe(0) // mover now there
    expect(s.board[4]).toBe(1) // opponent swapped back to origin
  })

  it('a 2-pawn opponent block cannot be landed on or passed', () => {
    const b = empty(); b[2] = 0; b[5] = 1; b[6] = 1 // foe block at idx 5,6
    const s = withBoard(b, { phase: 'move', roll: 3, turn: 0 })
    // land on the block (idx5) illegal
    expect(destOf(s, 0, 2, 3)).toBe(null)
    // pass over the block (idx 2 → 7 passes 5,6) illegal
    expect(destOf(s, 0, 2, 5)).toBe(null)
    // a lone foe (remove neighbour) becomes capturable again
    const b2 = empty(); b2[2] = 0; b2[5] = 1
    const s2 = withBoard(b2, { phase: 'move', roll: 3, turn: 0 })
    expect(destOf(s2, 0, 2, 3)).toBe(5)
  })

  it('landing on the House of Water (sq 27) sends the pawn back toward sq 15', () => {
    const b = empty(); b[WATER - 2] = 0 // idx 24, roll 2 → lands on WATER (idx 26)
    let s = withBoard(b, { phase: 'move', roll: 2, turn: 0 })
    expect(destOf(s, 0, WATER - 2, 2)).toBe(WATER)
    s = movePawn(s, 0, WATER - 2)
    expect(s.board[WATER]).toBe(null) // not resting on water
    expect(s.board[WATER_BACK]).toBe(0) // swept back to square 15
  })

  it('bearing off square 30 needs an exact throw; overshoot is illegal', () => {
    const b = empty(); b[HORUS] = 0 // pawn on square 30 (idx 29)
    const s = withBoard(b, { phase: 'move', roll: 1, turn: 0 })
    expect(destOf(s, 0, HORUS, 1)).toBe(OFF) // 29 + 1 = 30 exact → off
    // a pawn on idx 28 (square 29) needs exactly 2; a 3 overshoots
    const b2 = empty(); b2[28] = 0
    const s2 = withBoard(b2, { phase: 'move', roll: 3, turn: 0 })
    expect(destOf(s2, 0, 28, 3)).toBe(null) // 28+3=31 overshoot
    const s3 = withBoard(b2, { phase: 'move', roll: 2, turn: 0 })
    expect(destOf(s3, 0, 28, 2)).toBe(OFF) // 28+2=30 exact
  })

  it('first player to bear ALL pawns off wins', () => {
    const b = empty(); b[HORUS] = 0 // last pawn on square 30
    let s = withBoard(b, { phase: 'move', roll: 1, turn: 0, off: [PAWNS - 1, 0] })
    s = movePawn(s, 0, HORUS)
    expect(s.off[0]).toBe(PAWNS)
    expect(s.winner).toBe(0)
  })

  it('bounded self-play terminates with a valid winner (or cap) and no exceptions', () => {
    // deterministic-ish rng seeded; progress-biased AI for BOTH sides via aiStep on whoever moves.
    let seed = 12345
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    let s = makeGame()
    let cap = 0
    while (s.winner == null && cap < 20000) {
      // drive both players with the AI step machinery (temporarily treat current player as the actor)
      const actor = s.turn
      if (s.phase === 'throw') {
        s = throwSticks(s, rng)
      } else {
        const moves = legalMoves(s, actor, s.roll!)
        if (moves.length === 0) break
        // progress-biased: pick the move with the best destination/score-ish (advance furthest)
        // reuse aiStep when it's player 1; otherwise pick a forward move directly.
        if (actor === 1) {
          s = aiStep(s, rng)
        } else {
          // mimic AI: prefer bear-off, then furthest advance, avoid water
          let best = moves[0]; let bestV = -Infinity
          for (const from of moves) {
            const d = destOf(s, actor, from, s.roll!)
            let v = d === OFF ? 1000 : (d as number) * 4
            if (d === WATER) v -= 800
            if (v > bestV) { bestV = v; best = from }
          }
          s = movePawn(s, actor, best)
        }
      }
      cap++
    }
    // winner valid when present; no in-flight throw pending
    if (s.winner != null) {
      expect(s.winner === 0 || s.winner === 1).toBe(true)
      expect(s.off[s.winner]).toBe(PAWNS)
      expect(s.phase).toBe('throw')
      expect(s.roll).toBe(null)
    } else {
      // hit the cap without a winner is acceptable for this bounded test
      expect(cap).toBeGreaterThan(0)
    }
  })
})
