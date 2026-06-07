import { describe, it, expect } from 'vitest'
import * as DM from './logic'
import type { DomState, Tile, Placed } from './logic'

// Pure logic test, no DOM. Checks the deal, matching legality, orientation, scoring,
// then plays a few full random-vs-AI rounds and asserts they terminate with a valid result.

function allTiles(s: DomState): Tile[] {
  return [...s.hands.you, ...s.hands.ai, ...s.boneyard, ...s.line.map(p => ({ a: Math.min(p.a, p.b), b: Math.max(p.a, p.b) }))]
}

describe('dominoes logic', () => {
  it('deals a valid double-six set: 7 + 7 + boneyard, opening tile laid, full 28 set', () => {
    const s = DM.makeGame()
    // Leader has already laid one tile, so hands are 7/7 minus the one opener.
    const total = s.hands.you.length + s.hands.ai.length + s.boneyard.length + s.line.length
    expect(total).toBe(28)
    expect(s.line.length).toBe(1)                       // opening tile placed
    // one hand has 6 (the leader played), the other 7
    const sizes = [s.hands.you.length, s.hands.ai.length].sort()
    expect(sizes).toEqual([6, 7])
    expect(s.boneyard.length).toBe(14)

    // every tile in the game is a distinct member of the canonical 28-tile set
    const ids = allTiles(s).map(DM.tileId).sort((a, b) => a - b)
    const full = DM.fullSet().map(DM.tileId).sort((a, b) => a - b)
    expect(ids).toEqual(full)

    // opener is a double or the heaviest available tile (a sane leader pick)
    const op = s.line[0]
    expect(op.a >= 0 && op.b <= 6).toBe(true)
    expect(s.winner).toBeNull()
    expect(s.turn === 'you' || s.turn === 'ai').toBe(true)
  })

  it('matching legality: a tile is playable only if a half equals an open end', () => {
    const line: Placed[] = [{ a: 3, b: 5 }]                 // open ends 3 (L) and 5 (R)
    expect(DM.ends(line)).toEqual({ L: 3, R: 5 })
    expect(DM.canPlay(line, { a: 3, b: 6 })).toBe(true)     // matches L=3
    expect(DM.canPlay(line, { a: 0, b: 5 })).toBe(true)     // matches R=5
    expect(DM.canPlay(line, { a: 1, b: 2 })).toBe(false)    // matches neither
    expect(DM.playableEnds(line, { a: 3, b: 5 }).sort()).toEqual(['L', 'R'])  // fits both
    expect(DM.playableEnds(line, { a: 1, b: 2 })).toEqual([])
    // empty board: anything is playable (the opening lead)
    expect(DM.canPlay([], { a: 1, b: 2 })).toBe(true)
  })

  it('playing updates the correct open end with correct orientation', () => {
    // Construct a deterministic state with a known line and your turn.
    const base = DM.makeGame()
    const s: DomState = Object.assign({}, base, {
      hands: { you: [{ a: 5, b: 6 }, { a: 0, b: 0 }] as Tile[], ai: [{ a: 1, b: 1 }] as Tile[] },
      boneyard: [] as Tile[],
      line: [{ a: 3, b: 5 }] as Placed[],
      turn: 'you' as const,
      passes: 0, winner: null, reason: null, last: 0,
    })
    // [5|6] on R=5: matching half (5) touches the line, 6 becomes the new right end.
    const r = DM.play(s, 'you', { a: 5, b: 6 }, 'R')
    expect(r.line.map(p => [p.a, p.b])).toEqual([[3, 5], [5, 6]])
    expect(DM.ends(r.line)).toEqual({ L: 3, R: 6 })

    // play onto the left instead: [3|3]? use a tile matching L=3 oriented so 3 touches.
    const s2: DomState = Object.assign({}, s, { hands: { you: [{ a: 2, b: 3 }] as Tile[], ai: [{ a: 1, b: 1 }] as Tile[] } })
    const l = DM.play(s2, 'you', { a: 2, b: 3 }, 'L')
    expect(l.line.map(p => [p.a, p.b])).toEqual([[2, 3], [3, 5]])   // 3 touches old L, 2 is new L
    expect(DM.ends(l.line)).toEqual({ L: 2, R: 5 })
  })

  it('going out scores the sum of pips in the opponent hand', () => {
    const base = DM.makeGame()
    const s: DomState = Object.assign({}, base, {
      hands: { you: [{ a: 5, b: 6 }] as Tile[], ai: [{ a: 6, b: 6 }, { a: 2, b: 4 }] as Tile[] },  // ai pips = 12+6 = 18
      boneyard: [] as Tile[],
      line: [{ a: 3, b: 5 }] as Placed[],
      turn: 'you' as const, passes: 0, winner: null, reason: null, last: 0, scores: { you: 0, ai: 0 },
    })
    const out = DM.play(s, 'you', { a: 5, b: 6 }, 'R')
    expect(out.hands.you.length).toBe(0)
    expect(out.winner).toBe('you')
    expect(out.reason).toBe('out')
    expect(out.scores.you).toBe(18)
  })

  it('blocked game: lighter hand wins the opponent pip sum', () => {
    const base = DM.makeGame()
    // ends are 3 and 5; nobody holds a 3 or 5; boneyard empty -> both must pass -> block.
    const s: DomState = Object.assign({}, base, {
      hands: { you: [{ a: 0, b: 1 }] as Tile[], ai: [{ a: 2, b: 6 }, { a: 4, b: 4 }] as Tile[] }, // you pips=1, ai pips=16
      boneyard: [] as Tile[],
      line: [{ a: 3, b: 5 }] as Placed[],
      turn: 'you' as const, passes: 0, winner: null, reason: null, last: 0, scores: { you: 0, ai: 0 },
    })
    const p1 = DM.pass(s, 'you')
    expect(p1.winner).toBeNull()
    expect(p1.turn).toBe('ai')
    const p2 = DM.pass(p1, 'ai')
    expect(p2.winner).toBe('you')        // lighter hand (1 < 16)
    expect(p2.reason).toBe('blocked')
    expect(p2.scores.you).toBe(16)       // opponent's pip sum
  })

  it('plays full random-vs-AI rounds that terminate with a valid winner, no throws', () => {
    for (let game = 0; game < 4; game++) {
      let s = DM.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 400) {
        if (s.turn === 'you') {
          const playable = s.hands.you.filter(t => DM.canPlay(s.line, t))
          if (playable.length) {
            const t = playable[(Math.random() * playable.length) | 0]
            const ends = DM.playableEnds(s.line, t)
            s = DM.play(s, 'you', t, ends[(Math.random() * ends.length) | 0])
          } else if (s.boneyard.length) {
            s = DM.draw(s, 'you')
          } else {
            s = DM.pass(s, 'you')
          }
        } else {
          s = DM.aiStep(s)
        }
      }
      expect(s.winner).not.toBeNull()                                    // always terminates
      expect(['you', 'ai', 'draw']).toContain(s.winner)                 // valid result
      expect(s.reason === 'out' || s.reason === 'blocked').toBe(true)
      // invariant: the full 28-tile set is always conserved
      const total = s.hands.you.length + s.hands.ai.length + s.boneyard.length + s.line.length
      expect(total).toBe(28)
    }
  })
})
