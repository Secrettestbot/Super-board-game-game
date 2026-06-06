import { describe, it, expect } from 'vitest'
import {
  makeGame, clueFits, hexDistance, hexesWithin, candidateHexes, consistentOpponentClues,
  ask, search, aiTurn, allClues, NHEX, idx, type Hex, type Clue, type CryptidState,
} from './logic'

// A tiny hand-built map helper for clue-evaluation tests.
function blankMap(): Hex[] {
  const m: Hex[] = []
  for (let i = 0; i < NHEX; i++) m.push({ terrain: 'water', structure: null })
  return m
}

describe('hex geometry', () => {
  it('distance to self is zero and neighbors are distance one', () => {
    const c = idx(2, 4)
    expect(hexDistance(c, c)).toBe(0)
    const near = hexesWithin(c, 1).filter((h) => h !== c)
    // Interior hex has 6 neighbors, all at distance 1.
    expect(near.length).toBe(6)
    for (const h of near) expect(hexDistance(c, h)).toBe(1)
  })

  it('distance is symmetric and grows with separation', () => {
    const a = idx(0, 0), b = idx(5, 8)
    expect(hexDistance(a, b)).toBe(hexDistance(b, a))
    expect(hexDistance(a, b)).toBeGreaterThan(hexDistance(a, idx(1, 1)))
  })
})

describe('clueFits per clue type', () => {
  it('twoTerrains matches either terrain only', () => {
    const m = blankMap()
    m[idx(1, 1)].terrain = 'forest'
    m[idx(1, 2)].terrain = 'desert'
    const clue: Clue = { type: 'twoTerrains', a: 'forest', b: 'desert' }
    expect(clueFits(clue, idx(1, 1), m)).toBe(true)
    expect(clueFits(clue, idx(1, 2), m)).toBe(true)
    expect(clueFits(clue, idx(1, 3), m)).toBe(false) // water
  })

  it('within1Terrain matches the hex and its neighbors', () => {
    const m = blankMap()
    const t = idx(3, 4)
    m[t].terrain = 'mountain'
    const clue: Clue = { type: 'within1Terrain', terrain: 'mountain' }
    expect(clueFits(clue, t, m)).toBe(true)
    for (const n of hexesWithin(t, 1)) expect(clueFits(clue, n, m)).toBe(true)
    // A far hex (distance > 1) should not fit.
    expect(clueFits(clue, idx(0, 0), m)).toBe(false)
  })

  it('within2Color matches within two of a colored structure', () => {
    const m = blankMap()
    const t = idx(2, 2)
    m[t].structure = { kind: 'stone', color: 'blue' }
    const clue: Clue = { type: 'within2Color', color: 'blue' }
    expect(clueFits(clue, t, m)).toBe(true)
    for (const n of hexesWithin(t, 2)) expect(clueFits(clue, n, m)).toBe(true)
    expect(clueFits(clue, idx(5, 8), m)).toBe(false)
    // Wrong color does not match.
    expect(clueFits({ type: 'within2Color', color: 'green' }, t, m)).toBe(false)
  })
})

describe('generation', () => {
  it('makeGame produces EXACTLY one hex satisfying both clues (the cryptid)', () => {
    for (const seed of [1, 7, 42, 100, 2024, 9999]) {
      const s = makeGame(seed)
      let count = 0, found = -1
      for (let h = 0; h < NHEX; h++) {
        if (clueFits(s.clues[0], h, s.map) && clueFits(s.clues[1], h, s.map)) { count++; found = h }
      }
      expect(count).toBe(1)
      expect(found).toBe(s.cryptid)
      // The cryptid actually fits both clues.
      expect(clueFits(s.clues[0], s.cryptid, s.map)).toBe(true)
      expect(clueFits(s.clues[1], s.cryptid, s.map)).toBe(true)
    }
  })

  it('is deterministic for a given seed', () => {
    const a = makeGame(123), b = makeGame(123)
    expect(a.cryptid).toBe(b.cryptid)
    expect(a.seed).toBe(b.seed)
    expect(JSON.stringify(a.clues)).toBe(JSON.stringify(b.clues))
  })
})

describe('actions', () => {
  it('ask marks disc/cube correctly per the target clue', () => {
    const s = makeGame(42)
    // Find a hex that fits the AI clue and one that does not.
    let yesHex = -1, noHex = -1
    for (let h = 0; h < NHEX; h++) {
      if (clueFits(s.clues[1], h, s.map)) { if (yesHex < 0) yesHex = h }
      else if (noHex < 0) noHex = h
    }
    expect(yesHex).toBeGreaterThanOrEqual(0)
    expect(noHex).toBeGreaterThanOrEqual(0)
    const s1 = ask(s, 0, 1, yesHex)
    expect(s1.markers[1][yesHex]).toBe('disc')
    expect(s1.turn).toBe(1) // turn passes to AI
    const s2 = ask(s, 0, 1, noHex)
    expect(s2.markers[1][noHex]).toBe('cube')
  })

  it('search on the true cryptid hex wins', () => {
    const s = makeGame(7)
    const s1 = search(s, 0, s.cryptid)
    expect(s1.winner).toBe(0)
    expect(s1.markers[0][s.cryptid]).toBe('disc')
    expect(s1.markers[1][s.cryptid]).toBe('disc')
  })

  it('a failed search places a cube and ends the turn without a win', () => {
    const s = makeGame(7)
    // Pick a hex that is NOT the cryptid.
    const wrong = s.cryptid === 0 ? 1 : 0
    const s1 = search(s, 0, wrong)
    expect(s1.winner).toBe(null)
    expect(s1.turn).toBe(1)
    // Exactly one cube placed somewhere by some player at `wrong`.
    expect(s1.markers[0][wrong] === 'cube' || s1.markers[1][wrong] === 'cube').toBe(true)
  })
})

describe('deduction', () => {
  it('candidateHexes narrows after a cube answer', () => {
    const s = makeGame(42)
    const before = candidateHexes(s, 0).length
    // Ask the AI about a hex that does NOT fit its clue -> cube -> should eliminate it for player 0's view.
    let noHex = -1
    for (let h = 0; h < NHEX; h++) if (!clueFits(s.clues[1], h, s.map) && clueFits(s.clues[0], h, s.map)) { noHex = h; break }
    if (noHex >= 0) {
      const s1 = ask(s, 0, 1, noHex)
      const after = candidateHexes(s1, 0).length
      expect(after).toBeLessThan(before)
      expect(candidateHexes(s1, 0)).not.toContain(noHex)
    } else {
      // If no such hex exists (degenerate), candidate set still bounded.
      expect(before).toBeGreaterThan(0)
    }
  })

  it('consistentOpponentClues always includes the true opponent clue', () => {
    let s = makeGame(2024)
    expect(consistentOpponentClues(s, 1)).toContainEqual(s.clues[0])
    // After some asks of player 0 about random hexes, the true clue stays consistent.
    for (const h of [0, 5, 12, 30, 50]) {
      s = ask(s, 1, 0, h)
      s = { ...s, turn: 1 } // reset turn so we can ask again in this test
    }
    expect(consistentOpponentClues(s, 1)).toContainEqual(s.clues[0])
  })
})

describe('self-play terminates safely', () => {
  it('bounded self-play: no throws, terminates under cap, winner valid when present', () => {
    for (const seed of [1, 2, 3, 11, 77]) {
      let s: CryptidState = makeGame(seed)
      const CAP = 400
      let steps = 0
      expect(() => {
        while (s.winner == null && steps < CAP) {
          steps++
          if (s.turn === 1) {
            s = aiTurn(s)
          } else {
            // Player 0 plays a simple deterministic policy mirroring the AI.
            const before = s
            // Try to search if a single forced candidate exists.
            const oppClues = consistentOpponentClues(s, 0)
            const cand = candidateHexes(s, 0)
            const forced = cand.filter((h) => oppClues.every((cl) => clueFits(cl, h, s.map)))
            if (forced.length === 1) { s = search(s, 0, forced[0]); continue }
            // Else ask AI about the most informative unanswered hex.
            let bestH = -1, bestScore = -Infinity
            for (let h = 0; h < NHEX; h++) {
              if (s.markers[1][h] != null) continue
              let yes = 0, no = 0
              for (const cl of oppClues) { if (clueFits(cl, h, s.map)) yes++; else no++ }
              if (yes === 0 || no === 0) continue
              const sc = Math.min(yes, no)
              if (sc > bestScore) { bestScore = sc; bestH = h }
            }
            if (bestH >= 0) s = ask(s, 0, 1, bestH)
            else s = search(s, 0, cand.length ? cand[0] : s.cryptid)
            if (s === before) break // safety: no progress
          }
        }
      }).not.toThrow()
      expect(steps).toBeLessThanOrEqual(CAP)
      if (s.winner != null) expect(s.winner === 0 || s.winner === 1).toBe(true)
    }
  })
})

describe('clue catalogue', () => {
  it('allClues enumerates every clue type', () => {
    const all = allClues()
    expect(all.some((c) => c.type === 'within1Terrain')).toBe(true)
    expect(all.some((c) => c.type === 'twoTerrains')).toBe(true)
    expect(all.some((c) => c.type === 'within2Color')).toBe(true)
    expect(all.some((c) => c.type === 'within3Kind')).toBe(true)
    expect(all.length).toBeGreaterThan(10)
  })
})
