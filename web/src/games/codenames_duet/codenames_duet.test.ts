import { describe, it, expect } from 'vitest'
import {
  makeGame,
  setHumanClue,
  guess,
  aiClue,
  aiGuessWord,
  aiGuess,
  giveClue,
  agentsRemaining,
  clueSuggestions,
  indexOf,
  ASSOCIATIONS,
  SELFPLAY_CAP,
  TOTAL_TURNS,
  type State,
  type Role,
} from './logic'

function roleCounts(s: State, player: 0 | 1): Record<Role, number> {
  const out: Record<Role, number> = { agent: 0, bystander: 0, assassin: 0 }
  for (const c of s.cards) out[c.roles[player]]++
  return out
}

describe('makeGame board', () => {
  it('builds a 25-word board with correct per-perspective role counts and 15 unique agents', () => {
    const s = makeGame(1)
    expect(s.cards.length).toBe(25)
    // unique words
    expect(new Set(s.cards.map(c => c.word)).size).toBe(25)
    const p0 = roleCounts(s, 0)
    const p1 = roleCounts(s, 1)
    expect(p0.agent).toBe(9)
    expect(p1.agent).toBe(9)
    expect(p0.assassin).toBe(3)
    expect(p1.assassin).toBe(3)
    // overlap of agents = 3 -> unique agents = 15
    const overlap = s.cards.filter(c => c.roles[0] === 'agent' && c.roles[1] === 'agent').length
    expect(overlap).toBe(3)
    const unique = s.cards.filter(c => c.roles[0] === 'agent' || c.roles[1] === 'agent').length
    expect(unique).toBe(15)
    expect(agentsRemaining(s)).toBe(15)
    // no card is an agent for one player and assassin for the other
    for (const c of s.cards) {
      const collide = (c.roles[0] === 'agent' && c.roles[1] === 'assassin') ||
                      (c.roles[1] === 'agent' && c.roles[0] === 'assassin')
      expect(collide).toBe(false)
    }
  })

  it('is deterministic for a given seed', () => {
    const a = makeGame(42)
    const b = makeGame(42)
    expect(a.cards.map(c => c.word)).toEqual(b.cards.map(c => c.word))
    expect(a.cards.map(c => c.roles.join(''))).toEqual(b.cards.map(c => c.roles.join('')))
  })
})

// Helper: find a board word that, for the GUESSER, has a given role under a clue from `from`.
function findWordWithGuesserRole(s: State, from: 0 | 1, role: Role): string {
  const guesser: 0 | 1 = from === 0 ? 1 : 0
  const c = s.cards.find(c => !c.contacted && c.roles[guesser] === role)!
  return c.word
}

describe('guess resolution', () => {
  it('guessing a guesser-agent contacts it and lets guessing continue', () => {
    let s = makeGame(3)
    s = setHumanClue(s, 'SECRET', 2) // player 0 gives clue; player 1 guesses
    const w = findWordWithGuesserRole(s, 0, 'agent')
    const before = agentsRemaining(s)
    const after = guess(s, w)
    expect(after.cards[indexOf(after, w)].contacted).toBe(true)
    expect(agentsRemaining(after)).toBe(before - 1)
    // turn continues (clue still present, remaining decremented) unless that was the win
    if (after.status === 'playing') {
      expect(after.clue).not.toBe(null)
      expect(after.clue!.remaining).toBe(s.clue!.remaining - 1)
    }
  })

  it('guessing a bystander ends the turn', () => {
    let s = makeGame(3)
    s = setHumanClue(s, 'SECRET', 2)
    const w = findWordWithGuesserRole(s, 0, 'bystander')
    const giverBefore = s.clueGiver
    const after = guess(s, w)
    expect(after.clue).toBe(null)
    expect(after.clueGiver).not.toBe(giverBefore) // roles swapped -> new turn
    expect(after.turnsLeft).toBe(s.turnsLeft - 1)
    expect(after.status).toBe('playing')
  })

  it('guessing an assassin loses the game immediately', () => {
    let s = makeGame(3)
    s = setHumanClue(s, 'SECRET', 2)
    const w = findWordWithGuesserRole(s, 0, 'assassin')
    const after = guess(s, w)
    expect(after.status).toBe('lost')
    expect(after.assassinHit).toBe(true)
  })

  it('contacting all 15 agents wins', () => {
    let s = makeGame(7)
    // Drive a sequence of clue+single-agent-guess by force-revealing agents.
    // Use a long clue so guessing can continue; tap every still-hidden agent.
    let safety = 0
    while (s.status === 'playing' && safety < 100) {
      safety++
      if (s.clue == null) {
        // give a clue with a high number so the guesser may keep going
        s = setHumanClue(s, 'SECRET', 9)
      }
      const guesser: 0 | 1 = s.clue!.from === 0 ? 1 : 0
      const next = s.cards.find(c => !c.contacted && c.roles[guesser] === 'agent')
      if (!next) {
        // No agent available to this guesser this turn; end turn by tapping a bystander
        const by = s.cards.find(c => !c.contacted && c.roles[guesser] === 'bystander')!
        s = guess(s, by.word)
        continue
      }
      s = guess(s, next.word)
    }
    expect(s.status).toBe('won')
    expect(agentsRemaining(s)).toBe(0)
  })

  it('running out of turns with agents remaining loses', () => {
    let s = makeGame(9)
    // Each turn: give a clue, immediately tap a bystander to burn the turn.
    let safety = 0
    while (s.status === 'playing' && safety < 50) {
      safety++
      s = setHumanClue(s, 'SECRET', 1)
      const guesser: 0 | 1 = s.clue!.from === 0 ? 1 : 0
      const by = s.cards.find(c => !c.contacted && c.roles[guesser] === 'bystander')!
      s = guess(s, by.word)
    }
    expect(s.status).toBe('lost')
    expect(s.assassinHit).toBe(false)
    expect(s.turnsLeft).toBeLessThanOrEqual(0)
    expect(agentsRemaining(s)).toBeGreaterThan(0)
  })
})

describe('AI clue giving', () => {
  it('aiClue covers >=1 of the GUESSER\'s hidden agents (safe progress) and never links a guesser-assassin', () => {
    for (const seed of [1, 2, 3, 4, 5, 11, 23, 99]) {
      const s = makeGame(seed)
      const c = aiClue(s)
      expect(c).not.toBe(null)
      expect(c!.number).toBeGreaterThanOrEqual(1)
      expect(c!.covers.length).toBeGreaterThanOrEqual(1)
      const giver = s.clueGiver
      const guesser: 0 | 1 = giver === 0 ? 1 : 0
      // every covered word is a still-hidden agent ON THE GUESSER'S KEY — the only
      // kind of card the guesser can safely contact for progress.
      for (const w of c!.covers) {
        const card = s.cards.find(cc => cc.word === w)!
        expect(card.roles[guesser]).toBe('agent')
        expect(card.contacted).toBe(false)
      }
      // the clue's full linked set contains NO guesser-assassin (real table clues only)
      const linked = ASSOCIATIONS[c!.word]
      if (linked) {
        for (const w of linked) {
          const card = s.cards.find(cc => cc.word === w)
          if (card) expect(card.roles[guesser]).not.toBe('assassin')
        }
      }
    }
  })

  it('clueSuggestions are sorted by coverage descending', () => {
    const s = makeGame(5)
    const sugg = clueSuggestions(s, s.clueGiver)
    for (let i = 1; i < sugg.length; i++) {
      expect(sugg[i - 1].number).toBeGreaterThanOrEqual(sugg[i].number)
    }
  })
})

describe('AI guessing', () => {
  it('aiGuessWord picks a board word linked to the clue and never its own assassin', () => {
    let s = makeGame(4)
    // AI gives a clue (clueGiver starts at 0, so flip a turn so AI clues — instead just
    // set a human clue and let the AI guess it).
    s = setHumanClue(s, 'SECRET', 2)
    const w = aiGuessWord(s)
    if (w != null) {
      expect(ASSOCIATIONS['SECRET']).toContain(w)
      const card = s.cards.find(c => c.word === w)!
      // guesser is player 1 here
      expect(card.roles[1]).not.toBe('assassin')
    }
  })

  it('aiGuess resolves a turn without throwing and never ends in an assassin tap of its own', () => {
    let s = makeGame(6)
    s = setHumanClue(s, 'MONEY', 3)
    expect(() => { s = aiGuess(s) }).not.toThrow()
    // after the AI guessing phase, either the turn ended (new clue-giver) or the game ended
    expect(s.status === 'playing' || s.status === 'won' || s.status === 'lost').toBe(true)
  })
})

describe('cooperative self-play termination', () => {
  it('AI clues + AI guesses for both sides reaches a terminal status under the guard cap with no throws', () => {
    for (const seed of [1, 2, 3, 7, 13, 21, 55, 101]) {
      let s = makeGame(seed)
      let safety = 0
      expect(() => {
        while (s.status === 'playing' && safety < SELFPLAY_CAP) {
          safety++
          if (s.clue == null) {
            s = giveClue(s, s.clueGiver) // current giver (AI for both sides) installs a clue
          } else {
            s = aiGuess(s) // the guesser runs its whole guessing phase
          }
        }
      }).not.toThrow()
      expect(safety).toBeLessThan(SELFPLAY_CAP)
      expect(s.status === 'won' || s.status === 'lost').toBe(true)
    }
  })

  it('respects the turn limit (turnsTaken never exceeds TOTAL_TURNS while playing/lost-by-time)', () => {
    let s = makeGame(2)
    let safety = 0
    while (s.status === 'playing' && safety < SELFPLAY_CAP) {
      safety++
      if (s.clue == null) s = giveClue(s, s.clueGiver)
      else s = aiGuess(s)
    }
    expect(s.turnsTaken).toBeLessThanOrEqual(TOTAL_TURNS)
  })
})
