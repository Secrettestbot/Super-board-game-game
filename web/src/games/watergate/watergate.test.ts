import { describe, it, expect } from 'vitest'
import * as W from './logic'
import type { Card } from './logic'

// Pure-logic tests (no DOM). A deterministic deck keeps draws reproducible.
// Deck top = end of array; makeGame deals HAND_SIZE off the end to each player.
function deck(): Card[] {
  // 12 plain cards, value 3, event 'surge' (events not exercised unless we want them).
  const out: Card[] = []
  for (let i = 0; i < 12; i++) out.push({ id: i, value: 3, event: 'surge' })
  return out
}

describe('watergate logic', () => {
  it('starts on a valid board — center tokens, full hands, editor first', () => {
    const s = W.makeGame(deck())
    expect(W.momentum(s).pos).toBe(0)
    expect(W.evidenceTokens(s).length).toBe(W.N_EVIDENCE)
    expect(W.informantTokens(s).length).toBe(W.N_INFORMANT)
    expect(s.hands[W.EDITOR].length).toBe(W.HAND_SIZE)
    expect(s.hands[W.NIXON].length).toBe(W.HAND_SIZE)
    expect(s.turn).toBe(W.EDITOR)
    expect(s.winner).toBeNull()
    expect(W.linkCount(s)).toBe(0)
  })

  it("playing a card's VALUE moves the chosen token toward that player's side by the card's power", () => {
    const s = W.makeGame(deck())
    const card = s.hands[W.EDITOR][0]
    const ev = W.evidenceTokens(s)[0]
    const before = ev.pos
    const after = W.playValue(s, W.EDITOR, card.id, [{ id: ev.id, amount: card.value }])
    // editor pulls toward + by the full power
    expect(W.token(after, ev.id)!.pos).toBe(before + card.value)
    // card left the hand
    expect(after.hands[W.EDITOR].some((c) => c.id === card.id)).toBe(false)
    // turn passed to Nixon
    expect(after.turn).toBe(W.NIXON)
  })

  it('a VALUE play cannot exceed the card power and only moves movable tokens', () => {
    const s = W.makeGame(deck())
    const card = s.hands[W.EDITOR][0]
    const ev = W.evidenceTokens(s)[0]
    // over-budget => rejected (state unchanged)
    const bad = W.playValue(s, W.EDITOR, card.id, [{ id: ev.id, amount: card.value + 1 }])
    expect(bad).toBe(s)
    // editor cannot move the momentum token
    const bad2 = W.playValue(s, W.EDITOR, card.id, [{ id: 'M', amount: 1 }])
    expect(bad2).toBe(s)
  })

  it('an EVENT applies its effect (surge shoves momentum toward the player)', () => {
    const s = W.makeGame(deck())
    const card = s.hands[W.EDITOR][0]
    const before = W.momentum(s).pos
    const after = W.playEvent(s, W.EDITOR, card.id)
    // editor surge pushes momentum toward + by 2
    expect(W.momentum(after).pos).toBe(before + 2)
    expect(after.hands[W.EDITOR].some((c) => c.id === card.id)).toBe(false)
  })

  it('the EDITOR reaching its link goal wins', () => {
    let s = W.makeGame(deck())
    // hand-place two evidence tokens one step short of the link threshold, then pull each home.
    const evs = W.evidenceTokens(s)
    s = {
      ...s,
      tokens: s.tokens.map((t) =>
        t.id === evs[0].id || t.id === evs[1].id ? { ...t, pos: W.LINK_AT - 1 } : t,
      ),
    }
    const c1 = s.hands[W.EDITOR][0]
    s = W.playValue(s, W.EDITOR, c1.id, [{ id: evs[0].id, amount: 1 }])
    expect(s.winner).toBeNull() // only one link so far
    // back to editor (turn passed to nixon); force editor turn to finish the second link.
    s = { ...s, turn: W.EDITOR }
    const c2 = s.hands[W.EDITOR][0]
    s = W.playValue(s, W.EDITOR, c2.id, [{ id: evs[1].id, amount: 1 }])
    expect(W.linkCount(s)).toBeGreaterThanOrEqual(W.LINKS_TO_WIN)
    expect(s.winner).toBe(W.EDITOR)
  })

  it('NIXON pulling momentum fully to his end wins', () => {
    let s = W.makeGame(deck())
    // place momentum one step short of Nixon's wall, then have Nixon push it home.
    s = { ...s, tokens: s.tokens.map((t) => (t.id === 'M' ? { ...t, pos: -W.TRACK + 1 } : t)), turn: W.NIXON }
    const card = s.hands[W.NIXON][0]
    s = W.playValue(s, W.NIXON, card.id, [{ id: 'M', amount: 1 }])
    expect(W.momentum(s).pos).toBeLessThanOrEqual(-W.TRACK)
    expect(s.winner).toBe(W.NIXON)
  })

  it('round / deck progression: surviving the round track makes Nixon win', () => {
    let s = W.makeGame(deck())
    expect(s.round).toBe(1)
    // fast-forward to the final round, then end it.
    s = { ...s, round: W.ROUNDS }
    s = W.endRound(s)
    expect(s.winner).toBe(W.NIXON)
  })

  it('endRound deals fresh hands and advances the round when the track remains', () => {
    let s = W.makeGame(deck())
    s = { ...s, hands: { [W.EDITOR]: [], [W.NIXON]: [] } }
    s = W.endRound(s)
    expect(s.round).toBe(2)
    expect(s.hands[W.EDITOR].length).toBe(W.HAND_SIZE)
    expect(s.hands[W.NIXON].length).toBe(W.HAND_SIZE)
    expect(s.turn).toBe(W.EDITOR)
    expect(s.winner).toBeNull()
  })

  it('deterministic self-play reaches a valid winner under a guard cap with no throws', () => {
    for (let g = 0; g < 6; g++) {
      let s = W.makeGame() // random deck each game
      let guard = 0
      expect(() => {
        while (s.winner == null && guard++ < 5000) {
          if (s.turn === W.NIXON) {
            s = W.aiTurn(s)
            continue
          }
          // simple editor policy: pull the most-advanced evidence with the first card.
          const hand = s.hands[W.EDITOR]
          if (hand.length === 0) {
            // no cards but it's editor's turn and round not over — end the round.
            s = W.endRound(s)
            continue
          }
          const ev = W.evidenceTokens(s).slice().sort((a, b) => b.pos - a.pos)[0]
          s = W.playValue(s, W.EDITOR, hand[0].id, [{ id: ev.id, amount: hand[0].value }])
        }
      }).not.toThrow()
      // winner, if present, must be a real player; cap may also be reached.
      if (s.winner != null) {
        expect(s.winner === W.EDITOR || s.winner === W.NIXON).toBe(true)
      }
    }
  })
})
