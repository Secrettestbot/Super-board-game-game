import { describe, it, expect } from 'vitest'
import * as TS from './logic'
import type { TsuroState, Tile } from './logic'

// Pure logic tests (no DOM). Validates tile structure + rotation, single-step movement,
// off-board elimination, and full self-play termination against the real AI.

const N = TS.N

describe('tsuro logic', () => {
  it('makeGame is valid: two stones on distinct border ports, hands dealt, you to move', () => {
    const s = TS.makeGame()
    expect(s.placed).toHaveLength(N * N)
    expect(s.placed.every(c => c === null)).toBe(true)
    expect(s.turn).toBe('you')
    expect(s.winner).toBeNull()
    expect(s.stones).toHaveLength(2)
    const [a, b] = s.stones
    expect(a.alive && b.alive).toBe(true)
    // distinct starting cells
    expect(a.cell).not.toBe(b.cell)
    // both on the border, facing inward (step into the board exists for each)
    for (const st of s.stones) {
      const r = Math.floor(st.cell / N), c = st.cell % N
      expect(r === 0 || r === N - 1 || c === 0 || c === N - 1).toBe(true)
    }
    // hands dealt up to 3 each, all valid tiles, drawn from a real deck
    expect(s.hands.you).toHaveLength(3)
    expect(s.hands.foe).toHaveLength(3)
    for (const t of [...s.hands.you, ...s.hands.foe]) expect(TS.isValidTile(t)).toBe(true)
  })

  it('deck tiles are valid perfect matchings of 8 ports', () => {
    const deck = TS.makeDeck(35)
    expect(deck.length).toBe(35)
    for (const t of deck) {
      expect(t).toHaveLength(8)
      expect(TS.isValidTile(t)).toBe(true)
      // every port appears exactly once across the 4 pairs
      const partners = new Set<number>()
      for (let p = 0; p < 8; p++) { partners.add(p); partners.add(t[p]) }
      expect(partners.size).toBe(8)
    }
  })

  it('rotation permutes ports correctly (+2 per quarter, an involution preserved)', () => {
    const tile: Tile = [4, 5, 6, 7, 0, 1, 2, 3] // straight pass-throughs
    const r1 = TS.rotateTile(tile, 1)
    expect(TS.isValidTile(r1)).toBe(true)
    // port 0 maps to (0+2)=2 ; its partner 4 maps to (4+2)=6 ; so r1[2] should be 6
    expect(r1[2]).toBe(6)
    expect(r1[6]).toBe(2)
    // four quarter-turns return the original
    expect(TS.rotateTile(tile, 4)).toEqual(tile)
  })

  it('placing a tile advances a stone straight through to the correct exit port', () => {
    const s = TS.makeGame()
    // construct a deterministic state: stone facing into the centre cell on port 0,
    // with a straight tile (0<->4) in hand. follow() should carry it to the cell below.
    const cell = (1 * N) + 1 // r=1,c=1
    const straight: Tile = [4, 5, 6, 7, 0, 1, 2, 3]
    const st: TsuroState = {
      ...s,
      placed: new Array(N * N).fill(null),
      stones: [
        { who: 'you', cell, port: 0, alive: true },
        { who: 'foe', cell: 0, port: 1, alive: true }, // parked elsewhere
      ],
      hands: { you: [straight], foe: [straight] },
      deck: [],
      turn: 'you',
    }
    const r = TS.place(st, 0, 0)
    const you = r.stones.find(x => x.who === 'you')!
    expect(you.alive).toBe(true)
    // entered cell on port 0 -> exits port 4 -> arrives in the cell below on port 1
    expect(you.cell).toBe((2 * N) + 1)
    expect(you.port).toBe(1)
  })

  it('a stone driven off the border is eliminated', () => {
    const s = TS.makeGame()
    // stone on the top edge facing up-and-out: a tile routing port 0 -> port 1 keeps it
    // on the top border; following that exit leaves the board -> off.
    const cell = 0 // r=0,c=0
    // tile connecting port 0 to port 1 (both on the top edge) drives it off the top.
    const offTile: Tile = [1, 0, 3, 2, 5, 4, 7, 6]
    const st: TsuroState = {
      ...s,
      placed: new Array(N * N).fill(null),
      stones: [
        { who: 'you', cell, port: 0, alive: true },
        { who: 'foe', cell: N - 1, port: 2, alive: true },
      ],
      hands: { you: [offTile], foe: [offTile] },
      deck: [],
      turn: 'you',
    }
    const r = TS.place(st, 0, 0)
    const you = r.stones.find(x => x.who === 'you')!
    expect(you.alive).toBe(false)
    expect(r.winner).toBe('foe')
  })

  it('plays several full games (random-safe human + AI) to a winner/draw without throwing', () => {
    for (let game = 0; game < 8; game++) {
      let s = TS.makeGame()
      let guard = 0
      expect(() => {
        while (!s.winner && guard++ < 200) {
          if (s.turn === 'you') {
            const st = s.stones.find(x => x.who === 'you' && x.alive)
            if (!st) break
            const hand = s.hands.you
            if (!hand.length) break
            // gather options; prefer a safe one but accept any legal placement
            const opts: { h: number; rot: number; safe: boolean }[] = []
            for (let h = 0; h < hand.length; h++) {
              for (let rot = 0; rot < 4; rot++) {
                const placed = s.placed.slice()
                placed[st.cell] = TS.rotateTile(hand[h], rot)
                const safe = TS.follow(placed, st.cell, st.port) !== null
                opts.push({ h, rot, safe })
              }
            }
            const safe = opts.filter(o => o.safe)
            const pick = (safe.length ? safe : opts)[(Math.random() * (safe.length || opts.length)) | 0]
            s = TS.place(s, pick.h, pick.rot)
          } else {
            s = TS.aiMove(s)
          }
        }
      }).not.toThrow()
      expect(s.winner).not.toBeNull()            // always terminates within the cap
      expect(['you', 'foe', 'draw']).toContain(s.winner)
    }
  })
})
