/* HANABI — netplay adapter. Maps the cooperative firework logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map directly to player
 * indices: seat 0 = You (the host), seats 1.. = the other players. numSeats reads the
 * real player count off the hands array (always 3 for the current game).
 *
 * CO-OP: everyone builds the SAME shared fireworks. The fireworks, clue/fuse tokens,
 * discard pile, log and turn order are all PUBLIC and stay intact.
 *
 * HIDDEN INFO — INVERSE: Hanabi's whole gimmick is that you hold your cards facing
 * OUTWARD: you CANNOT see your OWN hand but CAN see everyone else's. So redactFor does
 * the OPPOSITE of a normal hand game — it blanks the VIEWING seat's OWN cards to neutral
 * placeholders (preserving the slot count AND each card's legitimately-known clue
 * `known` info) while leaving every OTHER seat's hand fully visible. The face-down draw
 * deck order is also hidden (kept as an array of placeholders so the count survives). A
 * leak test guards both halves.
 *
 * A turn is one of: give a clue (point at all of one player's cards of a color/value),
 * play a card, or discard a card. Intents are validated against the logic's own rules so
 * the host never trusts a guest-supplied move; anything illegal/out-of-turn returns the
 * input state unchanged (the underlying logic throws on illegal clue/discard/play, so we
 * gate every case up front and never call it speculatively). */

import * as H from './logic'
import type { HanabiState, Card, HeldCard, Clue } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials. `cardIdx` is a slot index in the actor's own
 * hand; `toSeat`+`hint` name a clue target. */
export type HanabiIntent =
  | { kind: 'hint'; toSeat: number; hint: Clue }
  | { kind: 'play'; cardIdx: number }
  | { kind: 'discard'; cardIdx: number }

/** A neutral placeholder hiding a card's real color/value (clue `known` stays real). */
const HIDDEN_CARD: Card = { id: -1, color: 'red', value: 1 }

/** Hide one of the VIEWER's own held cards: blank the true identity, keep the clue info. */
function maskHeld(hc: HeldCard): HeldCard {
  return {
    card: { ...HIDDEN_CARD },
    known: {
      colors: hc.known.colors.slice(),
      values: hc.known.values.slice(),
      colorClued: hc.known.colorClued,
      valueClued: hc.known.valueClued,
    },
  }
}

export const hanabiAdapter: GameAdapter<HanabiState, HanabiIntent> = {
  makeGame: () => H.makeGame(),
  // Real player count off the state (min 2) so a different table size reports correctly.
  numSeats: s => Math.max(2, s.hands.length),
  // turn (0/1/2) == seat index; null when the display has ended or nobody is to move.
  seatToMove: s => (s.gameOver ? null : s.turn),
  isOver: s => s.gameOver,
  applyIntent: (s, seat, i) => {
    if (s.gameOver || s.turn !== seat) return s

    if (i.kind === 'hint') {
      // Clues cost a token, can't target self, and must match >=1 of the target's cards.
      if (s.clueTokens <= 0) return s
      if (i.toSeat === seat) return s
      const hand = s.hands[i.toSeat]
      if (hand == null) return s
      const hint = i.hint
      const matches = hand.some(hc =>
        hint.kind === 'color' ? hc.card.color === hint.color : hc.card.value === hint.value,
      )
      if (!matches) return s
      return H.giveClue(s, seat, i.toSeat, hint)
    }

    const hand = s.hands[seat]
    if (hand == null || hand[i.cardIdx] == null) return s

    if (i.kind === 'play') return H.playCard(s, seat, i.cardIdx)

    // discard: illegal (and the logic does nothing useful) when clue tokens are full.
    if (s.clueTokens >= H.MAX_CLUES) return s
    return H.discard(s, seat, i.cardIdx)
  },
  // Reuse the existing co-op AI for non-local seats. aiTurn acts for s.turn and only ever
  // reads its OWN clue knowledge for its OWN hand (it never inspects its own true cards),
  // so it does not cheat. The host only calls this when it is an AI seat's turn.
  aiStep: (s, seat) => (s.turn === seat ? H.aiTurn(s) : s),
  // Changes on EVERY transition: step increments on every action, turn advances, gameOver
  // flips at the end.
  tickKey: s => `${s.step}-${s.turn}-${s.gameOver ? 'over' : ''}`,
  // INVERSE hidden info: blank the VIEWER's OWN hand to placeholders (keeping slot count +
  // clue knowledge), leave every other seat's hand visible, and hide the face-down deck
  // order while preserving its count. Public fireworks/tokens/discard/log are untouched.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h.map(maskHeld) : h)),
    deck: s.deck.map(() => ({ ...HIDDEN_CARD })),
  }),
}
