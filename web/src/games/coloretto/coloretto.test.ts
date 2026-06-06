import { describe, it, expect } from 'vitest'
import * as CL from './logic'
import type { ColorettoState, Tableau, Player } from './logic'

// Reference logic test: pure, no DOM. Verifies deck construction, the triangular + best-3
// tableau scoring, the draw/place/take mechanics, and that full random games terminate with
// a valid winner. `npm test` runs this alongside every other game's test.

function emptyTableau(): Tableau {
  const colors = {} as Tableau['colors']
  for (const c of CL.COLORS) colors[c] = 0
  return { colors, plus2: 0 }
}

describe('coloretto logic', () => {
  it('builds a valid starting game', () => {
    const s = CL.makeGame()
    expect(s.rows).toHaveLength(CL.ROWS)
    expect(s.rows.every(r => r.length === 0)).toBe(true)
    expect(s.turn).toBe('you')
    expect(s.winner).toBeNull()
    expect(s.taken.every(t => t === false)).toBe(true)

    // deck: 9 of each of 7 colours, BONUS_PLUS2 "+2" cards, exactly one "last" marker.
    const colorCount: Record<string, number> = {}
    let plus2 = 0, last = 0
    for (const c of s.deck) {
      if (c.kind === 'color') colorCount[c.color] = (colorCount[c.color] || 0) + 1
      else if (c.kind === 'plus2') plus2++
      else last++
    }
    expect(last).toBe(1)
    expect(plus2).toBe(CL.BONUS_PLUS2)
    for (const col of CL.COLORS) expect(colorCount[col]).toBe(CL.PER_COLOR)
    expect(s.deck.length).toBe(CL.COLORS.length * CL.PER_COLOR + CL.BONUS_PLUS2 + 1)
  })

  it('computes the triangular per-colour score', () => {
    expect(CL.triScore(0)).toBe(0)
    expect(CL.triScore(1)).toBe(1)
    expect(CL.triScore(2)).toBe(3)
    expect(CL.triScore(3)).toBe(6)
    expect(CL.triScore(4)).toBe(10)
    expect(CL.triScore(5)).toBe(15)
    expect(CL.triScore(6)).toBe(21)
    expect(CL.triScore(9)).toBe(21) // capped
  })

  it('scores best-3 colours positive and the rest negative, plus flat +2s', () => {
    const t = emptyTableau()
    // 5 colours present: red 3(=6), blue 2(=3), green 1(=1) -> positive
    //                    yellow 4(=10), purple 1(=1) -> negative
    t.colors.red = 3
    t.colors.blue = 2
    t.colors.green = 1
    t.colors.yellow = 4
    t.colors.purple = 1
    t.plus2 = 2
    // best 3 by value are yellow(10), red(6), blue(3) -> +19
    // remaining green(1) + purple(1) -> -2 ; plus2 -> +4
    expect(CL.scoreTableau(t)).toBe(10 + 6 + 3 - 1 - 1 + 4)

    const only = emptyTableau(); only.colors.red = 3
    expect(CL.scoreTableau(only)).toBe(6) // fewer than 3 colours: all positive
  })

  it('draws a card onto a row and takes a row to transfer cards', () => {
    let s = CL.makeGame()
    // force a known pending card so placement is deterministic
    s = { ...s, deck: s.deck.concat([{ kind: 'color', color: 'red' }]) }
    s = CL.draw(s, 'you')
    expect(s.pending).not.toBeNull()
    const before = s.deck.length
    s = CL.place(s, 0, 'you')
    expect(s.rows[0]).toHaveLength(1)
    expect(s.pending).toBeNull()
    expect(s.deck.length).toBe(before) // place doesn't touch the deck

    // now the AI is to act; give it a turn so the round can have cards, then take a row as
    // a fresh game to test transfer directly.
    let g = CL.makeGame()
    g = { ...g, rows: [[{ kind: 'color', color: 'blue' }, { kind: 'plus2' }], [], []] }
    g = CL.take(g, 0, 'you')
    expect(g.tableau.you.colors.blue).toBe(1)
    expect(g.tableau.you.plus2).toBe(1)
    expect(g.rows[0]).toHaveLength(0)
    expect(g.taken[0]).toBe(true)
    expect(g.done.you).toBe(true)
  })

  it('plays full random games to a valid winner and terminates fast', () => {
    for (let game = 0; game < 4; game++) {
      let s: ColorettoState = CL.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 5000) {
        if (s.turn === 'ai') { s = CL.aiStep(s); continue }
        const who: Player = 'you'
        // if we already drew a card, we must place it
        if (s.pending) {
          const rows = CL.placeRows(s, who)
          // placeRows should be non-empty because draw is only legal with an open row
          s = CL.place(s, rows[(Math.random() * rows.length) | 0], who)
          continue
        }
        if (s.done.you) { /* sitting out — turn should pass to ai */ s = CL.aiStep(s); continue }
        const takeRows = CL.legalTakeRows(s, who)
        const canDraw = CL.legalDraw(s, who)
        const options: ('draw' | number)[] = []
        if (canDraw) options.push('draw')
        for (const r of takeRows) options.push(r)
        if (options.length === 0) {
          // no legal action (e.g. deck empty and nothing to take) — force a take if any,
          // else this state must already be terminal; break to avoid an infinite loop.
          break
        }
        const pick = options[(Math.random() * options.length) | 0]
        s = pick === 'draw' ? CL.draw(s, who) : CL.take(s, pick, who)
      }
      expect(guard).toBeLessThan(5000)     // terminates fast (deck shrinks each draw)
      expect(s.winner).not.toBeNull()      // a valid winner was reached
      expect(['you', 'ai', 'draw']).toContain(s.winner)
      expect(s.scores).not.toBeNull()
    }
  })
})
