import { describe, it, expect } from 'vitest'
import {
  makeGame, legalActions, playBird, gainFood, layEggs, drawCards,
  scorePlayer, aiTurn, totalEggs, produce, BIRD, TURNS_EACH,
} from './logic'
import type { State } from './logic'

// A deterministic deck (top = end of array). Plenty of cheap birds so plays are possible.
function fixedDeck(): string[] {
  // hands are dealt from the END; 4 each => last 8 ids go to players.
  // Provide a long deck so draws/tray never run dry.
  const ids = [
    'robin', 'sparrow', 'duck', 'cardinal', 'jay', 'quail', 'goose', 'killdeer',
    'meadow', 'kingfisher', 'pelican', 'wood', 'heron', 'turkey', 'owl', 'swan',
    'hawk', 'pheasant', 'robin', 'sparrow', 'duck', 'cardinal', 'jay', 'quail',
    'goose', 'killdeer', 'meadow', 'kingfisher', 'pelican', 'wood', 'heron', 'turkey',
    'owl', 'swan', 'hawk', 'pheasant', 'robin', 'sparrow', 'duck', 'cardinal',
  ]
  return ids
}

describe('wingspan setup', () => {
  it('deals a hand, gives food, fills the tray, and gives each player TURNS_EACH cubes', () => {
    const s = makeGame(fixedDeck())
    expect(s.players).toHaveLength(2)
    for (const p of s.players) {
      expect(p.hand.length).toBe(4)
      expect(p.food).toBe(2)
      expect(p.cubesLeft).toBe(TURNS_EACH)
      expect(p.rows.forest.length).toBe(0)
    }
    expect(s.tray.length).toBe(3)
    expect(s.turn).toBe(0)
    expect(s.winner).toBe(null)
  })
})

describe('playing a bird', () => {
  it('deducts food and places the bird in the correct habitat', () => {
    const s = makeGame(fixedDeck())
    // ensure player 0 holds a known forest bird with enough food
    s.players[0].hand = ['jay', 'duck'] // jay = forest, cost 2
    s.players[0].food = 5
    const before = s.players[0].food
    const after = playBird(s, 0, 'jay', 'forest')
    expect(after.players[0].food).toBe(before - BIRD['jay'].cost)
    expect(after.players[0].rows.forest.map(b => b.defId)).toEqual(['jay'])
    expect(after.players[0].rows.wetland.length).toBe(0)
    expect(after.players[0].hand).not.toContain('jay')
    // an action cube was spent
    expect(after.players[0].cubesLeft).toBe(TURNS_EACH - 1)
  })

  it('refuses a bird you cannot afford and does not mutate', () => {
    const s = makeGame(fixedDeck())
    s.players[0].hand = ['hawk'] // cost 4
    s.players[0].food = 0
    const after = playBird(s, 0, 'hawk', 'forest')
    expect(after).toBe(s)
  })
})

describe('gain food scaling', () => {
  it('scales with the number of forest birds already in the row', () => {
    const s = makeGame(fixedDeck())
    // empty forest -> produce = 1
    s.players[0].rows.forest = []
    expect(produce(s.players[0], 'forest')).toBe(1)
    const a1 = gainFood(s, 0)
    // gained 1 (no power birds) so food = 2 + 1 = 3
    expect(a1.players[0].food).toBe(3)

    // with 2 forest birds (no powers) -> produce = 3
    const s2 = makeGame(fixedDeck())
    s2.players[0].rows.forest = [{ defId: 'hawk', eggs: 0 }, { defId: 'hawk', eggs: 0 }]
    expect(produce(s2.players[0], 'forest')).toBe(3)
    const a2 = gainFood(s2, 0)
    expect(a2.players[0].food).toBe(2 + 3)
  })
})

describe('lay eggs', () => {
  it('respects per-bird egg capacity', () => {
    const s = makeGame(fixedDeck())
    // one grassland bird with capacity 1-ish: use 'wood' (cap 2) placed in forest doesn't matter.
    // put a single low-capacity bird and try to over-lay.
    s.players[0].rows.grassland = [{ defId: 'meadow', eggs: 0 }] // capacity 3
    s.players[0].rows.forest = []
    s.players[0].rows.wetland = []
    // produce(grassland) = 1 + 1 bird = 2 eggs requested, capacity 3 -> 2 laid
    const a = layEggs(s, 0)
    const laid = a.players[0].rows.grassland[0].eggs
    expect(laid).toBeLessThanOrEqual(BIRD['meadow'].capacity)
    expect(totalEggs(a.players[0])).toBe(laid)
    expect(laid).toBeGreaterThan(0)
  })

  it('never lays more eggs than total remaining capacity', () => {
    const s = makeGame(fixedDeck())
    // a single forest bird with capacity 2, already full
    s.players[0].rows.forest = [{ defId: 'wood', eggs: 2 }] // cap 2, full
    s.players[0].rows.grassland = []
    s.players[0].rows.wetland = []
    const a = layEggs(s, 0)
    // no room anywhere -> total eggs unchanged
    expect(totalEggs(a.players[0])).toBe(2)
  })
})

describe('draw cards', () => {
  it('adds cards to the hand and consumes a cube', () => {
    const s = makeGame(fixedDeck())
    const beforeHand = s.players[0].hand.length
    const a = drawCards(s, 0)
    expect(a.players[0].hand.length).toBeGreaterThan(beforeHand)
    expect(a.players[0].cubesLeft).toBe(TURNS_EACH - 1)
  })
})

describe('turns are finite', () => {
  it('an action consumes a cube and play stops after TURNS_EACH each', () => {
    let s = makeGame(fixedDeck())
    // both players just gain food repeatedly until they're out of cubes
    let guard = 0
    while (s.winner == null && guard < 100) {
      guard++
      s = gainFood(s, s.turn)
    }
    expect(s.players[0].cubesLeft).toBe(0)
    expect(s.players[1].cubesLeft).toBe(0)
    expect(s.winner).not.toBe(null)
  })
})

describe('scoring', () => {
  it('sums bird points + eggs on birds + cached food', () => {
    const s = makeGame(fixedDeck())
    s.players[0].rows.forest = [{ defId: 'hawk', eggs: 1 }]   // 6 pts + 1 egg
    s.players[0].rows.grassland = [{ defId: 'sparrow', eggs: 2 }] // 1 pt + 2 eggs
    s.players[0].rows.wetland = []
    s.players[0].food = 6 // 6/3 = 2 pts
    const sc = scorePlayer(s, 0)
    expect(sc).toBe(6 + 1 + 1 + 2 + 2)
  })
})

describe('legal actions never deadlock', () => {
  it('food/eggs/draw are always available even with an empty hand and no food', () => {
    const s = makeGame(fixedDeck())
    s.players[0].hand = []
    s.players[0].food = 0
    const acts = legalActions(s, 0)
    const kinds = acts.map(a => a.kind)
    expect(kinds).toContain('food')
    expect(kinds).toContain('eggs')
    expect(kinds).toContain('draw')
  })
})

describe('ai self-play', () => {
  it('plays a full game to a valid winner under a guard cap with no throws', () => {
    let s: State = makeGame() // random deck
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 1000) {
        guard++
        if (s.turn === 0) {
          // drive player 0 with a simple greedy-ish policy that always has a legal move
          const acts = legalActions(s, 0)
          const play = acts.find(a => a.kind === 'play')
          if (play && play.cardId && play.habitat) s = playBird(s, 0, play.cardId, play.habitat)
          else {
            // alternate among food/eggs/draw deterministically
            const pick = guard % 3
            if (pick === 0) s = gainFood(s, 0)
            else if (pick === 1) s = layEggs(s, 0)
            else s = drawCards(s, 0)
          }
        } else {
          s = aiTurn(s)
        }
      }
    }).not.toThrow()
    expect(s.winner).not.toBe(null)
    // winner is 0, 1, or -1 (tie)
    expect([-1, 0, 1]).toContain(s.winner)
    expect(s.players[0].cubesLeft).toBe(0)
    expect(s.players[1].cubesLeft).toBe(0)
    // total turns taken is exactly 2 * TURNS_EACH
    expect(guard).toBeLessThanOrEqual(2 * TURNS_EACH)
  })
})
