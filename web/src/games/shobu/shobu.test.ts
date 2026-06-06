import { describe, it, expect } from 'vitest'
import {
  makeGame, passiveMovesOnBoard, passiveMoves, aggressiveMoves,
  tryAggressive, applyPassive, applyAggressive, legalCombinedMoves,
  aiTurn, winnerOf, countOn, aggressiveBoardsFor, BOARD_LIGHT, DIRS, DIR_NAMES,
} from './logic'
import type { ShobuState, Board, Player } from './logic'

const idx = (r: number, c: number) => r * 4 + c
const dirIndex = (name: string) => DIR_NAMES.indexOf(name)

// Build a state from explicit board layouts for targeted tests.
function withBoards(boards: Board[], turn: Player = 0): ShobuState {
  const s = makeGame(0)
  return { ...s, boards: boards.map(b => b.slice()), turn, phase: 'passive', pending: null }
}
function emptyBoard(): Board { return new Array(16).fill(null) }

describe('shobu logic', () => {
  it('passive moves slide through empty cells only and never push or land on stones', () => {
    const b = emptyBoard()
    b[idx(1, 1)] = 0          // our stone
    b[idx(0, 1)] = 1          // an opponent stone directly N of it (blocks the path)
    const moves = passiveMovesOnBoard(b, 0, 2)
    // moving N (toward the opponent) must NOT be allowed at any distance
    const n = dirIndex('N')
    expect(moves.some(m => m.from === idx(1, 1) && m.dir === n)).toBe(false)
    // moving S 1 and 2 into empty space is fine ((1,1)->(2,1)->(3,1))
    const s = dirIndex('S')
    expect(moves.some(m => m.from === idx(1, 1) && m.dir === s && m.dist === 1)).toBe(true)
    expect(moves.some(m => m.from === idx(1, 1) && m.dir === s && m.dist === 2)).toBe(true)
  })

  it('a passive distance-2 is blocked if a stone sits on the intermediate or landing cell', () => {
    const b = emptyBoard()
    b[idx(3, 0)] = 0
    b[idx(1, 0)] = 0   // own stone two cells N (landing cell occupied)
    const moves = passiveMovesOnBoard(b, 0, 2).filter(m => m.from === idx(3, 0) && m.dir === dirIndex('N'))
    // dist 1 to (2,0) is OK, dist 2 to (1,0) blocked by own stone
    expect(moves.some(m => m.dist === 1)).toBe(true)
    expect(moves.some(m => m.dist === 2)).toBe(false)
  })

  it('aggressive move pushes at most one opponent stone; blocked by two-in-a-row or own stone', () => {
    // two opponent stones in a row ahead -> illegal
    const b1 = emptyBoard()
    b1[idx(3, 0)] = 0
    b1[idx(2, 0)] = 1
    b1[idx(1, 0)] = 1
    expect(tryAggressive(b1, idx(3, 0), dirIndex('N'), 1, 0)).toBeNull()

    // own stone ahead -> illegal
    const b2 = emptyBoard()
    b2[idx(3, 0)] = 0
    b2[idx(2, 0)] = 0
    expect(tryAggressive(b2, idx(3, 0), dirIndex('N'), 1, 0)).toBeNull()

    // single opponent stone ahead with empty beyond -> legal push
    const b3 = emptyBoard()
    b3[idx(3, 0)] = 0
    b3[idx(2, 0)] = 1
    const m = tryAggressive(b3, idx(3, 0), dirIndex('N'), 1, 0)
    expect(m).not.toBeNull()
    expect(m!.pushed).toBe(idx(2, 0))
    expect(m!.removed).toBe(false)
  })

  it('a push that forces a stone over the edge removes it', () => {
    const b = emptyBoard()
    b[idx(1, 0)] = 0
    b[idx(0, 0)] = 1   // opponent on the top edge, pushed N -> off the board
    const m = tryAggressive(b, idx(1, 0), dirIndex('N'), 1, 0)
    expect(m).not.toBeNull()
    expect(m!.removed).toBe(true)
    expect(m!.pushed).toBe(idx(0, 0))
  })

  it('cannot push a stone into an occupied cell', () => {
    const b = emptyBoard()
    b[idx(3, 0)] = 0
    b[idx(2, 0)] = 1
    b[idx(1, 0)] = 0   // cell the pushed stone would land on is occupied
    expect(tryAggressive(b, idx(3, 0), dirIndex('N'), 1, 0)).toBeNull()
  })

  it('aggressive moves match the passive dir+dist and sit on an opposite-shade board', () => {
    const s = makeGame(0)
    const pmoves = passiveMoves(s, 0)
    expect(pmoves.length).toBeGreaterThan(0)
    const pm = pmoves[0]
    const ams = aggressiveMoves(s, pm, 0)
    expect(ams.length).toBeGreaterThan(0)
    for (const am of ams) {
      expect(am.dir).toBe(pm.dir)
      expect(am.dist).toBe(pm.dist)
      // opposite shade
      expect(BOARD_LIGHT[am.board]).toBe(!BOARD_LIGHT[pm.board])
      expect(aggressiveBoardsFor(pm.board)).toContain(am.board)
    }
  })

  it('clearing a board of the opponent’s stones wins the game (deterministic)', () => {
    // Set up a board (a dark board, idx 1) with a single opponent stone on the top edge,
    // and our stone right below it, so pushing N removes the last opponent stone -> win.
    const boards: Board[] = [emptyBoard(), emptyBoard(), emptyBoard(), emptyBoard()]
    // home board 3 (light) gets a trivial passive available
    boards[3][idx(3, 0)] = 0
    boards[3][idx(1, 0)] = null
    // aggressive target must be opposite shade to board 3 (light) => a dark board (1 or 2).
    // Use board 1 (dark, top-right). Put exactly one opponent stone, on the edge.
    boards[1][idx(0, 1)] = 1            // the lone opponent stone (board has only this one => already?)
    boards[1][idx(1, 1)] = 0            // our pusher just below it
    // Make sure board 1 currently has 1 opponent stone (not already a win for anyone):
    expect(countOn(boards[1], 1)).toBe(1)
    expect(countOn(boards[1], 0)).toBe(1)
    const s = withBoards(boards, 0)

    // Passive: move our stone on board 3 N by 1 (3,0)->(2,0), dir N dist 1.
    const n = dirIndex('N')
    const afterP = applyPassive(s, { board: 3, from: idx(3, 0), dir: n, dist: 1, to: idx(2, 0) })
    expect(afterP.phase).toBe('aggressive')
    // Aggressive: on board 1, push the opponent stone N off the edge.
    const am = aggressiveMoves(afterP, afterP.pending!, 0).find(a => a.board === 1 && a.from === idx(1, 1))
    expect(am).toBeTruthy()
    expect(am!.removed).toBe(true)
    const done = applyAggressive(afterP, am!)
    expect(done.winner).toBe(0)
    expect(winnerOf(done.boards)).toBe(0)
    expect(countOn(done.boards[1], 1)).toBe(0)
  })

  it('applyPassive rejects a passive that has no aggressive counterpart', () => {
    // Construct a position where a passive exists but its dir+dist has NO aggressive option.
    const boards: Board[] = [emptyBoard(), emptyBoard(), emptyBoard(), emptyBoard()]
    // Our only home stone is on board 3 (light) and can passively move, but on the dark boards
    // (1,2) we have NO stones at all -> no aggressive counterpart possible.
    boards[3][idx(3, 3)] = 0
    const s = withBoards(boards, 0)
    const raw = passiveMovesOnBoard(boards[3], 0, 3)
    expect(raw.length).toBeGreaterThan(0)
    // none should survive the aggressive-counterpart filter
    expect(passiveMoves(s, 0).length).toBe(0)
    // applyPassive should be a no-op (still passive phase)
    const r = applyPassive(s, raw[0])
    expect(r.phase).toBe('passive')
    expect(r.pending).toBeNull()
  })

  it('bounded self-play terminates without throwing and any winner is valid', () => {
    let s = makeGame(0)
    let steps = 0
    const CAP = 400
    while (s.winner == null && steps < CAP) {
      const before = s.turn
      s = aiTurn(s)
      steps++
      // turn must advance or game ended
      if (s.winner == null) expect(s.turn).not.toBe(before)
    }
    // winner, if present, must be a real player and correspond to a cleared board
    if (s.winner != null) {
      expect(s.winner === 0 || s.winner === 1).toBe(true)
      expect(winnerOf(s.boards)).toBe(s.winner)
    }
    expect(steps).toBeLessThanOrEqual(CAP)
  })

  it('legalCombinedMoves only yields matching passive+aggressive pairs', () => {
    const s = makeGame(0)
    const cms = legalCombinedMoves(s, 0)
    expect(cms.length).toBeGreaterThan(0)
    for (const cm of cms.slice(0, 50)) {
      expect(cm.aggressive.dir).toBe(cm.passive.dir)
      expect(cm.aggressive.dist).toBe(cm.passive.dist)
      expect(BOARD_LIGHT[cm.aggressive.board]).toBe(!BOARD_LIGHT[cm.passive.board])
    }
    void DIRS
  })
})
