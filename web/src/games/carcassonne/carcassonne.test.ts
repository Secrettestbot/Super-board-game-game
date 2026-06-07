import { describe, it, expect } from 'vitest'
import {
  makeGame,
  buildDeck,
  legalPlacements,
  fits,
  edgeAt,
  placeTile,
  resolveCompletions,
  endGameScoring,
  aiTurn,
  aiChooseMove,
  key,
  MEEPLES_PER_PLAYER,
} from './logic'
import type { CarcassonneState, TileDef, Edge, PlacedTile } from './logic'

const F: Edge = 'field', R: Edge = 'road', C: Edge = 'city'

function tileDef(id: string, edges: [Edge, Edge, Edge, Edge], segs: TileDef['segments']): TileDef {
  return { id, edges, segments: segs }
}

/** Build a minimal state with a hand-placed board (no deck draw needed). */
function bareState(board: Record<string, PlacedTile>, current: TileDef | null = null): CarcassonneState {
  return {
    board,
    deck: [],
    current,
    players: [
      { score: 0, meeplesLeft: MEEPLES_PER_PLAYER },
      { score: 0, meeplesLeft: MEEPLES_PER_PLAYER },
    ],
    turn: 0,
    winner: null,
    tick: 0,
  }
}

function placed(def: TileDef, rotation = 0, meeples: Record<number, 0 | 1> = {}): PlacedTile {
  return { def, rotation, meeples }
}

describe('rotation', () => {
  it('edgeAt rotates edges clockwise', () => {
    const t = tileDef('t', [C, R, F, R], [])
    // unrotated: N=city,E=road,S=field,W=road
    expect(edgeAt(t, 0, 0)).toBe('city')
    // rotate 1 (CW): the N edge moves to E
    expect(edgeAt(t, 1, 1)).toBe('city')
    expect(edgeAt(t, 1, 0)).toBe('road') // old W -> N
    // rotate 2: N -> S
    expect(edgeAt(t, 2, 2)).toBe('city')
  })
})

describe('legalPlacements / fits', () => {
  it('only allows placements adjacent to the tableau with matching edges', () => {
    const s = makeGame(buildDeck())
    // start tile at origin: N=city E=road S=field W=road
    const t = tileDef('road', [R, F, R, F], [{ id: 0, kind: 'road', edges: [0, 2] }])
    const legal = legalPlacements(s, t)
    expect(legal.length).toBeGreaterThan(0)
    // every legal placement must touch and match
    for (const p of legal) {
      expect(fits(s, t, p.x, p.y, p.rotation)).toBe(true)
      // not the occupied origin cell
      expect(key(p.x, p.y)).not.toBe('0,0')
    }
  })

  it('rejects a placement whose touching edge mismatches', () => {
    const s = makeGame(buildDeck())
    // a tile that is all city: placing it east of start (start east edge = road) must mismatch
    const allCity = tileDef('city', [C, C, C, C], [{ id: 0, kind: 'city', edges: [0, 1, 2, 3] }])
    // start east edge is road, all-city west edge is city -> mismatch in every rotation
    expect(fits(s, allCity, 1, 0, 0)).toBe(false)
    expect(fits(s, allCity, 1, 0, 1)).toBe(false)
  })

  it('requires adjacency (cannot place floating away from the tableau)', () => {
    const s = makeGame(buildDeck())
    const t = tileDef('f', [F, F, F, F], [])
    expect(fits(s, t, 5, 5, 0)).toBe(false)
  })
})

describe('placeTile', () => {
  it('updates the board map and consumes a meeple when placed', () => {
    const start = tileDef('start', [C, R, F, R], [
      { id: 0, kind: 'city', edges: [0] },
      { id: 1, kind: 'road', edges: [1, 3] },
    ])
    const s = bareState({ [key(0, 0)]: placed(start) })
    // keep a filler tile in the deck so the game does not end after this placement
    const filler = tileDef('filler', [F, F, F, F], [{ id: 0, kind: 'cloister', edges: [] }])
    s.deck = [filler]
    // current tile: a road segment that matches start's east road if placed east
    const road = tileDef('road', [F, R, R, R], [
      { id: 0, kind: 'road', edges: [3] },
      { id: 1, kind: 'road', edges: [1] },
      { id: 2, kind: 'road', edges: [2] },
    ])
    s.current = road
    // place east of start at rotation 0: west edge of road = road, matches start east road
    const ns = placeTile(s, 1, 0, 0, 0) // claim seg 0 (the west road stub)
    expect(ns.board[key(1, 0)]).not.toBe(undefined)
    expect(ns.board[key(1, 0)].def.id).toBe('road')
    // meeple consumed
    expect(ns.players[0].meeplesLeft).toBe(MEEPLES_PER_PLAYER - 1)
    expect(ns.turn).toBe(1)
  })
})

describe('road completion scoring + meeple return', () => {
  it('completes a 3-tile road, scores 1/tile, returns the meeple', () => {
    // straight road tiles laid W-E: each has road on W and E (edges 1,3), N/S field.
    const straightEW = tileDef('rEW', [F, R, F, R], [{ id: 0, kind: 'road', edges: [1, 3] }])
    // end caps: road only on one side (dead-end) so the road CLOSES.
    const capE = tileDef('capE', [F, R, F, F], [{ id: 0, kind: 'road', edges: [1] }]) // road exits E only
    const capW = tileDef('capW', [F, F, F, R], [{ id: 0, kind: 'road', edges: [3] }]) // road exits W only
    // layout: capE at (0,0) [road exits E], straight at (1,0), capW at (2,0) [road exits W]
    const board: Record<string, PlacedTile> = {
      [key(0, 0)]: placed(capE, 0, { 0: 0 }), // player 0 meeple on the road
      [key(1, 0)]: placed(straightEW, 0),
      [key(2, 0)]: placed(capW, 0),
    }
    const s = bareState(board)
    resolveCompletions(s)
    // road of 3 tiles -> 3 points for player 0; meeple returned (+1, never decremented here)
    expect(s.players[0].score).toBe(3)
    expect(s.players[0].meeplesLeft).toBe(MEEPLES_PER_PLAYER + 1)
    // board meeple cleared
    expect(s.board[key(0, 0)].meeples[0]).toBe(undefined)
  })
})

describe('city completion scoring with pennant', () => {
  it('completes a 2-tile city (with pennant) for 2/tile + 2 pennant', () => {
    // two facing half-cities: cityE has city on E, cityW has city on W (with pennant).
    const cityE = tileDef('cE', [F, C, F, F], [{ id: 0, kind: 'city', edges: [1] }])
    const cityW = tileDef('cW', [F, F, F, C], [{ id: 0, kind: 'city', edges: [3], pennant: true }])
    const board: Record<string, PlacedTile> = {
      [key(0, 0)]: placed(cityE, 0, { 0: 1 }), // player 1 meeple
      [key(1, 0)]: placed(cityW, 0),
    }
    const s = bareState(board)
    resolveCompletions(s)
    // 2 tiles * 2 + 1 pennant * 2 = 6
    expect(s.players[1].score).toBe(6)
    expect(s.board[key(0, 0)].meeples[0]).toBe(undefined)
  })
})

describe('majority rule on a contested feature', () => {
  it('the player with more meeples scores; ties score both', () => {
    // a road of 3 tiles closed at both ends, player 0 on the cap, player 1 on the other cap.
    const straightEW = tileDef('rEW', [F, R, F, R], [{ id: 0, kind: 'road', edges: [1, 3] }])
    const capE = tileDef('capE', [F, R, F, F], [{ id: 0, kind: 'road', edges: [1] }])
    const capW = tileDef('capW', [F, F, F, R], [{ id: 0, kind: 'road', edges: [3] }])
    const board: Record<string, PlacedTile> = {
      [key(0, 0)]: placed(capE, 0, { 0: 0 }), // player 0
      [key(1, 0)]: placed(straightEW, 0),
      [key(2, 0)]: placed(capW, 0, { 0: 1 }), // player 1
    }
    const s = bareState(board)
    resolveCompletions(s)
    // tie (1 meeple each) -> both score 3
    expect(s.players[0].score).toBe(3)
    expect(s.players[1].score).toBe(3)
  })
})

describe('cloister completion', () => {
  it('scores 9 when all 8 neighbours + itself are present', () => {
    const cloister = tileDef('clo', [F, F, F, F], [{ id: 0, kind: 'cloister', edges: [] }])
    const blank = tileDef('blank', [F, F, F, F], [])
    const board: Record<string, PlacedTile> = {}
    board[key(0, 0)] = placed(cloister, 0, { 0: 0 }) // player 0 monk
    // fill all 8 surrounding cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue
        board[key(dx, dy)] = placed(blank, 0)
      }
    }
    const s = bareState(board)
    resolveCompletions(s)
    expect(s.players[0].score).toBe(9)
    expect(s.board[key(0, 0)].meeples[0]).toBe(undefined)
  })

  it('does NOT score when not fully surrounded', () => {
    const cloister = tileDef('clo', [F, F, F, F], [{ id: 0, kind: 'cloister', edges: [] }])
    const board: Record<string, PlacedTile> = { [key(0, 0)]: placed(cloister, 0, { 0: 0 }) }
    const s = bareState(board)
    resolveCompletions(s)
    expect(s.players[0].score).toBe(0)
    expect(s.board[key(0, 0)].meeples[0]).toBe(0) // still there
  })
})

describe('end-game scoring of incomplete features', () => {
  it('scores an incomplete road at 1/tile and an incomplete cloister by neighbours', () => {
    // open road of 2 tiles (not capped): player 0 meeple.
    const straightEW = tileDef('rEW', [F, R, F, R], [{ id: 0, kind: 'road', edges: [1, 3] }])
    const board: Record<string, PlacedTile> = {
      [key(0, 0)]: placed(straightEW, 0, { 0: 0 }),
      [key(1, 0)]: placed(straightEW, 0),
    }
    // cloister with only itself + 1 neighbour
    const cloister = tileDef('clo', [F, F, F, F], [{ id: 0, kind: 'cloister', edges: [] }])
    board[key(0, 3)] = placed(cloister, 0, { 0: 1 }) // player 1 monk
    board[key(1, 3)] = placed(cloister, 0) // one neighbour
    const s = bareState(board)
    endGameScoring(s)
    // road: 2 tiles -> 2 for player 0 (but it's open at both ends -> still 1/tile)
    expect(s.players[0].score).toBe(2)
    // cloister: itself + 1 neighbour present -> 2 for player 1
    expect(s.players[1].score).toBe(2)
  })
})

describe('self-play', () => {
  it('a full AI vs AI game terminates with a valid winner and no throws', () => {
    let s = makeGame(buildDeck(), 12345)
    let guard = 0
    while (s.winner == null && guard < 2000) {
      guard++
      // drive BOTH players with the greedy AI
      const move = s.current != null ? aiChooseMove(s, s.current) : null
      if (s.current == null) break
      if (move == null) {
        // no legal move (shouldn't happen) -> force end by emptying deck
        break
      }
      if (s.turn === 1) {
        s = aiTurn(s)
      } else {
        s = placeTile(s, move.placement.x, move.placement.y, move.placement.rotation, move.meepleSegId)
      }
    }
    expect(s.winner == null ? 'unfinished' : 'finished').toBe('finished')
    expect(guard).toBeLessThan(2000)
    expect([0, 1, 'tie']).toContain(s.winner)
    expect(Number.isFinite(s.players[0].score)).toBe(true)
    expect(Number.isFinite(s.players[1].score)).toBe(true)
    // meeples conserved-ish: never exceed the cap, never negative
    for (const p of s.players) {
      expect(p.meeplesLeft).toBeGreaterThanOrEqual(0)
    }
  })
})
