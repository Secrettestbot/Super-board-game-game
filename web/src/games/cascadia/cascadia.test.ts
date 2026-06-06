import { describe, it, expect } from 'vitest'
import * as C from './logic'
import type { Tableau, PlacedTile, Animal, Terrain } from './logic'

// Pure-logic tests (no DOM). Hex adjacency, legal placement, placePair updates, each
// wildlife scoring rule on a known tableau, corridor scoring, market refill, and a
// full self-play game to a valid winner under a guard cap with no throws.

function tile(terrains: Terrain[], slots: Animal[], animal: Animal | null = null): PlacedTile {
  return { terrains, slots, rotation: 0, placedAnimal: animal }
}

/** Build a tableau directly from {q,r}->tile for scoring tests. */
function tableauOf(entries: [number, number, PlacedTile][]): Tableau {
  const t: Tableau = {}
  for (const [q, r, pt] of entries) t[C.hexKey(q, r)] = pt
  return t
}

describe('cascadia hex + placement', () => {
  it('axial neighbours are the six standard directions and adjacency is symmetric', () => {
    const nb = C.neighbors(0, 0)
    expect(nb).toHaveLength(6)
    // (1,0) is a neighbour of (0,0) and vice versa.
    expect(nb.some(h => h.q === 1 && h.r === 0)).toBe(true)
    const back = C.neighbors(1, 0)
    expect(back.some(h => h.q === 0 && h.r === 0)).toBe(true)
    // negative + zero coords are valid neighbours
    expect(nb.some(h => h.q === -1 && h.r === 1)).toBe(true)
    expect(nb.some(h => h.q === 0 && h.r === -1)).toBe(true)
  })

  it('legalTilePlacements returns exactly the empty hexes around the tableau', () => {
    const tab = tableauOf([[0, 0, tile(['forest'], ['bear'])]])
    const spots = C.legalTilePlacements(tab)
    expect(spots).toHaveLength(6) // all six neighbours of the lone tile
    // adding a second tile, its occupied hex is excluded and new frontier appears
    const tab2 = tableauOf([
      [0, 0, tile(['forest'], ['bear'])],
      [1, 0, tile(['river'], ['salmon'])],
    ])
    const spots2 = C.legalTilePlacements(tab2)
    expect(spots2.some(h => h.q === 0 && h.r === 0)).toBe(false)
    expect(spots2.some(h => h.q === 1 && h.r === 0)).toBe(false)
    // the shared frontier is deduped
    const keys = new Set(spots2.map(h => C.hexKey(h.q, h.r)))
    expect(keys.size).toBe(spots2.length)
  })

  it('placePair places the habitat tile adjacent and seats the wildlife token', () => {
    const s = C.makeGame(C.makeBags(7))
    const token = s.market[0].token
    // find an empty hex adjacent to (0,0) for player 0
    const hex = C.legalTilePlacements(s.tableaus[0])[0]
    // place tile then seat the token if that tile hosts it, else aside
    const hostsToken = s.market[0].tile.slots.includes(token)
    const animalCoord = hostsToken ? hex : null
    const after = C.placePair(s, 0, 0, hex, 0, animalCoord)
    expect(after.turn).toBe(1) // turn passed to AI
    const placed = after.tableaus[0][C.hexKey(hex.q, hex.r)]
    expect(placed).toBeDefined()
    if (hostsToken) expect(placed.placedAnimal).toBe(token)
    // turnsLeft decremented
    expect(after.turnsLeft).toBe(s.turnsLeft - 1)
  })

  it('rejects an illegal (non-adjacent or occupied) tile placement', () => {
    const s = C.makeGame(C.makeBags(3))
    // (5,5) is far from the lone starter at (0,0) → illegal, state unchanged
    const after = C.placePair(s, 0, 0, { q: 5, r: 5 }, 0, null)
    expect(after).toBe(s)
    // placing on the occupied starter is illegal too
    const after2 = C.placePair(s, 0, 0, { q: 0, r: 0 }, 0, null)
    expect(after2).toBe(s)
  })

  it('refills the market after a take (still four pairs)', () => {
    const s = C.makeGame(C.makeBags(11))
    const hex = C.legalTilePlacements(s.tableaus[0])[0]
    const after = C.placePair(s, 0, 0, hex, 0, null)
    expect(after.market).toHaveLength(4)
    // the drawn pair came off the front of the bags
    expect(after.tileBag.length).toBe(s.tileBag.length - 1)
    expect(after.tokenBag.length).toBe(s.tokenBag.length - 1)
  })
})

describe('cascadia wildlife scoring', () => {
  it('bear scores 4 per adjacent pair', () => {
    // two adjacent bears = one pair = 4
    const tab = tableauOf([
      [0, 0, tile(['forest'], ['bear'], 'bear')],
      [1, 0, tile(['forest'], ['bear'], 'bear')],
    ])
    expect(C.wildlifeScore(tab).byAnimal.bear).toBe(4)
    // a lone bear scores 0
    const lone = tableauOf([[0, 0, tile(['forest'], ['bear'], 'bear')]])
    expect(C.wildlifeScore(lone).byAnimal.bear).toBe(0)
  })

  it('elk scores by straight lines (longer is better)', () => {
    // a straight run of 3 elk along the (1,0) axis
    const line3 = tableauOf([
      [0, 0, tile(['prairie'], ['elk'], 'elk')],
      [1, 0, tile(['prairie'], ['elk'], 'elk')],
      [2, 0, tile(['prairie'], ['elk'], 'elk')],
    ])
    const single = tableauOf([[0, 0, tile(['prairie'], ['elk'], 'elk')]])
    expect(C.wildlifeScore(line3).byAnimal.elk).toBe(9)
    expect(C.wildlifeScore(single).byAnimal.elk).toBe(2)
    expect(C.wildlifeScore(line3).byAnimal.elk).toBeGreaterThan(C.wildlifeScore(single).byAnimal.elk)
  })

  it('salmon scores by run length, lone salmon scores 0', () => {
    const run3 = tableauOf([
      [0, 0, tile(['river'], ['salmon'], 'salmon')],
      [1, 0, tile(['river'], ['salmon'], 'salmon')],
      [2, 0, tile(['river'], ['salmon'], 'salmon')],
    ])
    expect(C.wildlifeScore(run3).byAnimal.salmon).toBe(4)
    const lone = tableauOf([[0, 0, tile(['river'], ['salmon'], 'salmon')]])
    expect(C.wildlifeScore(lone).byAnimal.salmon).toBe(0)
  })

  it('hawk scores 3 only for non-adjacent (lonely) hawks', () => {
    // two adjacent hawks → 0
    const clustered = tableauOf([
      [0, 0, tile(['mountain'], ['hawk'], 'hawk')],
      [1, 0, tile(['mountain'], ['hawk'], 'hawk')],
    ])
    expect(C.wildlifeScore(clustered).byAnimal.hawk).toBe(0)
    // two separated hawks → 6
    const apart = tableauOf([
      [0, 0, tile(['mountain'], ['hawk'], 'hawk')],
      [3, 0, tile(['mountain'], ['hawk'], 'hawk')],
    ])
    expect(C.wildlifeScore(apart).byAnimal.hawk).toBe(6)
  })

  it('fox scores by variety of distinct adjacent animals', () => {
    // a fox surrounded by a bear, an elk and a salmon → 3 distinct kinds
    const tab = tableauOf([
      [0, 0, tile(['forest'], ['fox'], 'fox')],
      [1, 0, tile(['forest'], ['bear'], 'bear')],
      [0, 1, tile(['forest'], ['elk'], 'elk')],
      [-1, 0, tile(['river'], ['salmon'], 'salmon')],
    ])
    expect(C.wildlifeScore(tab).byAnimal.fox).toBe(3)
  })
})

describe('cascadia corridor scoring', () => {
  it('largest connected terrain group scores its size with a majority bonus', () => {
    // a connected run of 3 forest tiles + an isolated forest tile elsewhere
    const tab = tableauOf([
      [0, 0, tile(['forest'], ['bear'])],
      [1, 0, tile(['forest'], ['elk'])],
      [2, 0, tile(['forest'], ['fox'])],
      [5, 0, tile(['forest'], ['hawk'])], // disconnected — not counted in the largest
      [0, 1, tile(['wetland'], ['salmon'])],
    ])
    expect(C.largestCorridor(tab, 'forest')).toBe(3)
    const cs = C.corridorScore(tab)
    // forest is the largest corridor (3) → +2 majority bonus → 5
    expect(cs.byTerrain.forest).toBe(5)
    // wetland corridor of size 1, not the max → just 1
    expect(cs.byTerrain.wetland).toBe(1)
  })
})

describe('cascadia self-play', () => {
  it('a full greedy-vs-greedy game terminates with a valid winner and no throws', () => {
    let s = C.makeGame(C.makeBags(42))
    let guard = 0
    while (s.winner == null && guard++ < 1000) {
      if (s.turn === 1) { s = C.aiTurn(s); continue }
      // player 0 plays greedily too (reuse aiChoose for player 0)
      const move = C.aiChoose(s, 0)
      expect(move).not.toBeNull()
      s = C.placePair(s, 0, move!.marketIndex, move!.hex, move!.rotation, move!.animalCoord)
    }
    expect(s.winner === 0 || s.winner === 1).toBe(true)
    expect(s.turnsLeft).toBe(0)
    // scores were computed and the winner has the >= score
    expect(s.scores[s.winner!]).toBe(Math.max(s.scores[0], s.scores[1]))
    // both tableaus grew to the expected tile count (starter + TILES_EACH placements)
    expect(Object.keys(s.tableaus[0]).length).toBe(C.TILES_EACH + 1)
    expect(Object.keys(s.tableaus[1]).length).toBe(C.TILES_EACH + 1)
  })

  it('bounded: turnsLeft strictly decreases to zero', () => {
    let s = C.makeGame(C.makeBags(99))
    const start = s.turnsLeft
    let prev = start
    let guard = 0
    while (s.winner == null && guard++ < 1000) {
      s = s.turn === 1 ? C.aiTurn(s) : (() => {
        const m = C.aiChoose(s, 0)!
        return C.placePair(s, 0, m.marketIndex, m.hex, m.rotation, m.animalCoord)
      })()
      expect(s.turnsLeft).toBeLessThan(prev)
      prev = s.turnsLeft
    }
    expect(start - s.turnsLeft).toBe(start)
  })
})
