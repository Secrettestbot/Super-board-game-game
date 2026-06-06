import { describe, it, expect } from 'vitest'
import {
  isOnGrid,
  findPath,
  isValidWord,
  wordScore,
  aiFindWords,
  scoreRound,
  aiTurn,
  revealStep,
  nextRound,
  makeGame,
  submitWord,
  makeRng,
  rollGrid,
  WORDS,
  WORD_SET,
  type Grid,
  type BoggleState,
} from './logic'

// A fixed, hand-built 4x4 grid (row-major) used across the path tests.
//   c a t s
//   o r e d
//   n g i l
//   e u m p
// "cat": c(0)->a(1)->t(2) is a straight adjacent run. "care": c(0)->a(1)->r(5)->e(6).
const GRID: Grid = [
  'c', 'a', 't', 's',
  'o', 'r', 'e', 'd',
  'n', 'g', 'i', 'l',
  'e', 'u', 'm', 'p',
]

describe('isOnGrid()', () => {
  it('finds a word with a valid adjacency path', () => {
    expect(isOnGrid(GRID, 'cat')).toBe(true)   // c0-a1-t2 horizontal
    expect(isOnGrid(GRID, 'care')).toBe(true)  // c0-a1-r5-e6 (a->r is diagonal)
    expect(isOnGrid(GRID, 'cats')).toBe(true)  // c0-a1-t2-s3
  })

  it('rejects a word that would need a reused cell', () => {
    // "rare": only one 'r' (cell 5) and one 'a' (cell 1); r-a-r-e needs r twice.
    expect(isOnGrid(GRID, 'rare')).toBe(false)
  })

  it('rejects a word whose letters are not adjacent in sequence', () => {
    // "cap" -> c0, a1 adjacent, but there is no 'p' adjacent to a1 (p is at cell 15).
    expect(isOnGrid(GRID, 'cap')).toBe(false)
  })

  it('handles a "Qu" cell as a single two-letter cell', () => {
    // grid: row0 q(Qu) u i z / e ...  "quiz": Qu(0)->i(2)? need adjacency. Build a tight grid.
    const g: Grid = [
      'Qu', 'i', 'z', 'a',
      't', 'e', 'd', 'b',
      'c', 'f', 'g', 'h',
      'm', 'n', 'o', 'p',
    ]
    // "quiz": Qu(0) consumes "qu", then i(1), z(2). All adjacent in a row.
    expect(isOnGrid(g, 'quiz')).toBe(true)
    // "qi" would be < the Qu cell letters mismatch handled — "quit": qu(0) i(1) t(4) — t at
    // cell 4 is adjacent (below Qu). valid.
    expect(isOnGrid(g, 'quit')).toBe(true)
  })

  it('findPath returns a real adjacency path for a found word', () => {
    const p = findPath(GRID, 'care')
    expect(p).not.toBe(null)
    expect(p).toEqual([0, 1, 5, 6])
  })
})

describe('isValidWord()', () => {
  it('requires dictionary membership AND a grid path AND length >= 3', () => {
    expect(isValidWord(GRID, 'cat')).toBe(true)
    expect(isValidWord(GRID, 'CAT')).toBe(true)       // case-insensitive
    expect(isValidWord(GRID, 'at')).toBe(false)        // too short
    expect(isValidWord(GRID, 'zzz')).toBe(false)       // not a dictionary word
    // "dog" is in the dictionary but cannot be traced on this grid.
    expect(WORD_SET.has('dog')).toBe(true)
    expect(isValidWord(GRID, 'dog')).toBe(false)
  })
})

describe('wordScore()', () => {
  it('scores by classic Boggle length brackets', () => {
    expect(wordScore('cat')).toBe(1)        // 3
    expect(wordScore('cats')).toBe(1)       // 4
    expect(wordScore('grain')).toBe(2)      // 5
    expect(wordScore('grants')).toBe(3)     // 6
    expect(wordScore('grinder')).toBe(5)    // 7
    expect(wordScore('greatest')).toBe(11)  // 8
    expect(wordScore('marvelous')).toBe(11) // 9 (8+)
  })
})

describe('aiFindWords()', () => {
  it('returns only valid dictionary words actually present on the grid', () => {
    const all = aiFindWords(GRID) // full, uncapped set
    expect(all.length).toBeGreaterThan(0)
    for (const w of all) {
      expect(w.length).toBeGreaterThanOrEqual(3)
      expect(WORD_SET.has(w)).toBe(true)
      expect(isOnGrid(GRID, w)).toBe(true)
    }
    // sanity: it should find "cat"/"care" which we know are present + in the list
    expect(WORDS).toContain('cat')
    expect(all).toContain('cat')
  })

  it('is capped when given an rng (beatable subset)', () => {
    const rng = makeRng(7)
    const sub = aiFindWords(GRID, rng, 5)
    expect(sub.length).toBeLessThanOrEqual(5)
    for (const w of sub) expect(isOnGrid(GRID, w)).toBe(true)
  })
})

describe('scoreRound() shared-word dedupe', () => {
  it('words found by both players score for nobody', () => {
    const base = makeGame(GRID, 1)
    // Both find "cat"; you also find "care"; ai also finds "cats".
    const s: BoggleState = { ...base, words: [['cat', 'care'], ['cat', 'cats']] }
    const scored = scoreRound(s)
    // "cat" is shared -> zero for both. You keep "care"(1). AI keeps "cats"(1).
    expect(scored.lastRound).toEqual({ you: 1, ai: 1 })
    expect(scored.totals).toEqual([1, 1])
  })

  it('all-shared words yield zero for everyone', () => {
    const base = makeGame(GRID, 1)
    const s: BoggleState = { ...base, words: [['cat', 'care'], ['cat', 'care']] }
    const scored = scoreRound(s)
    expect(scored.lastRound).toEqual({ you: 0, ai: 0 })
  })
})

describe('round scoring + winner', () => {
  it('declares the higher cumulative score the winner on the last round', () => {
    const base = makeGame(GRID, 1)
    // You: "cats"(1)+"care"(1)=2 unique. AI: "cat"(1) unique.
    const s: BoggleState = { ...base, words: [['cats', 'care'], ['cat']] }
    const scored = scoreRound(s)
    expect(scored.winner).toBe(0)
    expect(scored.phase).toBe('done')
  })

  it('declares a tie with -1', () => {
    const base = makeGame(GRID, 1)
    const s: BoggleState = { ...base, words: [['cat'], ['care']] } // 1 vs 1
    const scored = scoreRound(s)
    expect(scored.winner).toBe(-1)
  })
})

describe('self-play full game terminates with a valid winner', () => {
  it('runs all rounds via aiTurn/revealStep with no throws, under a guard cap', () => {
    const rng = makeRng(42)
    let st = makeGame(rollGrid(rng), 3, rng)
    let guard = 0
    expect(() => {
      while (st.winner == null && guard < 5000) {
        guard++
        if (st.phase === 'play') {
          // human submits a few words drawn from the AI's own find set, then ends the round
          const candidates = aiFindWords(st.grid)
          for (const w of candidates.slice(0, 3)) {
            const r = submitWord(st, 0, w)
            if (r.ok) st = r.state
          }
          st = aiTurn(st, rng)
        } else if (st.phase === 'reveal') {
          st = revealStep(st)
        } else if (st.phase === 'done') {
          if (st.winner != null) break
          st = nextRound(st, rollGrid(rng), rng)
        }
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(5000)
    expect(st.winner != null).toBe(true)
    expect(st.winner === 0 || st.winner === 1 || st.winner === -1).toBe(true)
    expect(st.round).toBe(3)
  })
})

describe('rollGrid()', () => {
  it('produces 16 cells from the dice, deterministic under a seeded rng', () => {
    const a = rollGrid(makeRng(1))
    const b = rollGrid(makeRng(1))
    expect(a.length).toBe(16)
    expect(a).toEqual(b) // same seed -> same grid
  })
})
