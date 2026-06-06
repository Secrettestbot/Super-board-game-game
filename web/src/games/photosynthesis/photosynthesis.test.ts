import { describe, it, expect } from 'vitest'
import {
  makeGame, computeShadows, computeShadowMap, collectLight, legalActions, applyAction,
  rotateSun, aiTurn, isLegal, ringOf, key, treeCounts,
  type State, type Action,
  SEED, SMALL, MEDIUM, LARGE, R, ROUNDS_TOTAL, PLANT_COST, COLLECT_COST, growCost,
} from './logic'

/** Build a clean board with no trees and no starting light, for controlled scenarios. */
function blank(): State {
  const s = makeGame()
  for (const k in s.board) s.board[k].tree = null
  s.players[0].lightPoints = 0
  s.players[1].lightPoints = 0
  return s
}

describe('photosynthesis logic', () => {
  it('builds a radius-3 board of 37 cells with correct rings', () => {
    const s = makeGame()
    expect(Object.keys(s.board).length).toBe(37)
    expect(ringOf(0, 0)).toBe(0)        // center
    expect(ringOf(R, 0)).toBe(3)        // outer edge
    expect(ringOf(1, 0)).toBe(1)        // inner
    // every cell ring is between 0 and 3
    for (const k in s.board) expect(s.board[k].ring).toBeGreaterThanOrEqual(0)
  })

  it('computeShadows marks cells the right distance away from the sun, by caster size', () => {
    const s = blank()
    s.sun = 0 // shadow extends in DIRS[0] = (+1, 0)
    // a MEDIUM tree at (-1,0) shades the two cells (0,0) and (1,0)
    s.board[key(-1, 0)].tree = { owner: 0, size: MEDIUM }
    // put a SMALL tree at (0,0) and a LARGE at (1,0)
    s.board[key(0, 0)].tree = { owner: 1, size: SMALL }
    s.board[key(1, 0)].tree = { owner: 1, size: LARGE }
    const map = computeShadowMap(s)
    expect(map[key(0, 0)]).toBe(MEDIUM)
    expect(map[key(1, 0)]).toBe(MEDIUM)
    const shaded = computeShadows(s)
    // small (size1) at (0,0) covered by medium(2) → shaded
    expect(shaded.has(key(0, 0))).toBe(true)
    // large (size3) at (1,0) covered only by medium(2) < 3 → NOT shaded
    expect(shaded.has(key(1, 0))).toBe(false)
    // caster itself unshaded
    expect(shaded.has(key(-1, 0))).toBe(false)
  })

  it('collectLight gives size-based light only to unshaded trees', () => {
    const s = blank()
    s.sun = 0
    // p0 large at (-2,0) casts shadow over (-1,0),(0,0),(1,0)
    s.board[key(-2, 0)].tree = { owner: 0, size: LARGE }
    // p0 small at (0,0) is shaded → 0 light; p0 medium at (2,0) is in the open → 2 light
    s.board[key(0, 0)].tree = { owner: 0, size: SMALL }
    s.board[key(2, 0)].tree = { owner: 0, size: MEDIUM }
    const gained = collectLight(s, 0)
    // large(3) open + medium(2) open + small(0, shaded) = 3 + 2 + 0
    expect(gained).toBe(5)
    expect(s.players[0].lightPoints).toBe(5)
  })

  it('plant requires adjacency to your small+ tree and costs 1', () => {
    const s = blank()
    s.board[key(0, 0)].tree = { owner: 0, size: SMALL }
    s.players[0].lightPoints = 1
    s.turn = 0
    const acts = legalActions(s, 0).filter(a => a.type === 'plant')
    expect(acts.length).toBeGreaterThan(0)
    // a far cell is not a legal plant target
    const far: Action = { type: 'plant', q: 3, r: 0, from: key(0, 0) }
    expect(isLegal(s, 0, far)).toBe(false)
    // plant on a real adjacent target
    const a = acts[0] as Extract<Action, { type: 'plant' }>
    const ns = applyAction(s, a)
    expect(ns.board[key(a.q, a.r)].tree).toEqual({ owner: 0, size: SEED })
    expect(ns.players[0].lightPoints).toBe(0) // spent 1
  })

  it('grow costs scale by tier and advance the size', () => {
    expect(growCost(SEED)).toBe(1)
    expect(growCost(SMALL)).toBe(2)
    expect(growCost(MEDIUM)).toBe(3)
    const s = blank()
    s.board[key(0, 0)].tree = { owner: 0, size: SMALL }
    s.players[0].lightPoints = 2
    s.turn = 0
    const ns = applyAction(s, { type: 'grow', q: 0, r: 0 })
    expect(ns.board[key(0, 0)].tree!.size).toBe(MEDIUM)
    expect(ns.players[0].lightPoints).toBe(0)
  })

  it('collecting a large tree scores the ring VP and depletes that tile', () => {
    const s = blank()
    // place a large tree on the center ring (ring 0)
    s.board[key(0, 0)].tree = { owner: 0, size: LARGE }
    s.players[0].lightPoints = COLLECT_COST
    s.turn = 0
    const topTile = s.vpTiles[0][0]
    const before = s.vpTiles[0].length
    const ns = applyAction(s, { type: 'collect', q: 0, r: 0 })
    expect(ns.players[0].vp).toBe(topTile)
    expect(ns.board[key(0, 0)].tree).toBeNull()
    expect(ns.vpTiles[0].length).toBe(before - 1)
    expect(ns.players[0].lightPoints).toBe(0)
  })

  it('rotateSun cycles through the six directions', () => {
    let s = makeGame()
    s.sun = 5
    s = rotateSun(s)
    expect(s.sun).toBe(0)
    const seen = new Set<number>()
    let t = makeGame()
    for (let i = 0; i < 6; i++) { seen.add(t.sun); t = rotateSun(t) }
    expect(seen.size).toBe(6)
  })

  it('a full self-play game terminates at a valid winner with no throws', () => {
    let s = makeGame()
    let guard = 0
    expect(() => {
      while (s.phase !== 'over' && guard < 5000) {
        guard++
        if (s.turn === 1) {
          s = aiTurn(s)
        } else {
          // human player: greedy-ish — take the first non-end action, else end
          const acts = legalActions(s, 0)
          const act = acts.find(a => a.type !== 'end') ?? { type: 'end' as const }
          s = applyAction(s, act)
        }
      }
    }).not.toThrow()
    expect(s.phase).toBe('over')
    expect(s.winner === 0 || s.winner === 1).toBe(true)
    expect(s.round).toBe(ROUNDS_TOTAL)
    expect(guard).toBeLessThan(5000)
  })

  it('both players make moves and accrue score across a self-play game', () => {
    let s = makeGame()
    let guard = 0
    while (s.phase !== 'over' && guard < 5000) {
      guard++
      if (s.turn === 1) s = aiTurn(s)
      else {
        const acts = legalActions(s, 0)
        const act = acts.find(a => a.type !== 'end') ?? { type: 'end' as const }
        s = applyAction(s, act)
      }
    }
    // sanity: at least one player scored some VP over a full game
    expect(s.players[0].vp + s.players[1].vp).toBeGreaterThan(0)
    // tree counts stay in board bounds
    const tc = treeCounts(s, 1)
    expect(tc.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(37)
  })
})
