/* HANAMIKOJI — netplay adapter. Maps hanamikoji's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map directly to players:
 * seat 0 = you (the original human side, the first starter), seat 1 = the rival.
 *
 * HIDDEN INFO: each player's HAND is private; the SECRET marker hides one card
 * face-down (the opponent must not see it until it is revealed at round end); the
 * TRADE-OFF discards two cards face-down (gone, never revealed); the draw DECK and
 * the one set-aside REMOVED card are face-down. The GIFT and COMPETITION reveals are
 * PUBLIC (both players see the revealed cards in s.pending.options) and stay intact.
 *
 * redactFor therefore, for the OTHER seat, blanks: that seat's hand cards, its
 * committed-but-unrevealed secret card, the whole face-down draw deck, and the
 * removed card. Secrets become public at round end (folded into `placed` by
 * resolveRound), so once roundOver they are no longer hidden. A leak test guards this.
 *
 * Intents are JSON plain objects — the four actions plus the opponent's gift/split
 * choice. applyIntent validates against the live hand / pending choice and returns
 * the input state unchanged for any illegal or out-of-turn intent (never throws).
 * Between rounds, the next round's starter advances the game with a `next` intent
 * (the AI does this automatically via aiStep). */

import * as H from './logic'
import type { HanamikojiState, Geisha, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A neutral placeholder hiding a card's real geisha id from the other seat. */
const HIDDEN = -1 as unknown as Geisha

/** A move reduced to wire essentials. One discriminated union covers every action. */
export type HanamikojiIntent =
  | { kind: 'secret'; card: Geisha }
  | { kind: 'tradeoff'; cards: Geisha[] }
  | { kind: 'gift'; cards: Geisha[] }
  | { kind: 'competition'; pairs: Geisha[][] }
  | { kind: 'choose'; choiceIndex: number } // opponent resolves a pending gift/competition
  | { kind: 'next' } // advance to the next round (between-round transition)

const opp = (p: Player): Player => (p === 0 ? 1 : 0)

export const hanamikojiAdapter: GameAdapter<HanamikojiState, HanamikojiIntent> = {
  makeGame: () => H.makeGame(),
  numSeats: () => 2,
  // Whose turn it is, mapped to a seat index:
  //  - game over -> null
  //  - a gift/competition reveal pending -> the chooser must act
  //  - between rounds (roundOver, no winner) -> the NEXT round's starter advances it
  //  - otherwise -> s.turn
  seatToMove: s => {
    if (s.winner !== null) return null
    if (s.pending !== null) return s.pending.chooser
    if (s.roundOver) return opp(s.starter)
    return s.turn
  },
  isOver: s => s.winner !== null,
  applyIntent: (s, seat, i) => {
    if (s.winner !== null) return s

    // Resolve a pending gift/competition: only the designated chooser may act.
    if (s.pending !== null) {
      if (i.kind !== 'choose' || s.pending.chooser !== seat) return s
      return H.opponentChoose(s, i.choiceIndex)
    }

    // Between rounds: the next round's starter advances the game.
    if (s.roundOver) {
      if (i.kind !== 'next' || opp(s.starter) !== seat) return s
      return H.nextRound(s)
    }

    // A normal action: only the player to move may act. The logic functions
    // re-validate the cards against the live hand, so a guest can't spoof a move.
    if (s.turn !== seat) return s
    switch (i.kind) {
      case 'secret':
        return H.secret(s, i.card)
      case 'tradeoff':
        return i.cards.length === 2 ? H.tradeoff(s, i.cards) : s
      case 'gift':
        return i.cards.length === 3 ? H.gift(s, i.cards) : s
      case 'competition':
        return i.pairs.length === 2 && i.pairs.every(p => p.length === 2) ? H.competition(s, i.pairs) : s
      default:
        return s
    }
  },
  // The AI both takes actions, resolves choices on your reveals, and advances rounds.
  aiStep: s => {
    if (s.pending !== null && s.pending.chooser === 1) return H.aiChoose(s)
    if (s.roundOver && s.winner === null) return H.nextRound(s)
    if (s.turn === 1) return H.aiAction(s)
    return s
  },
  // Changes on EVERY transition: count placed cards + spent markers + pending + round.
  tickKey: s => {
    let placed = 0
    for (const p of [0, 1]) for (let g = 0; g < H.GEISHA_COUNT; g++) placed += s.placed[p][g]
    let used = 0
    for (const p of [0, 1]) for (const m of H.MARKERS) if (s.used[p][m]) used++
    const pend = s.pending == null ? 0 : 1
    return `${s.round}-${placed}-${used}-${pend}-${s.roundOver ? 1 : 0}-${s.winner ?? ''}`
  },
  // Hidden info: for the OTHER seat, blank its hand cards, its unrevealed secret, the
  // face-down draw deck, and the removed card. Secrets are public once roundOver
  // (folded into `placed` by resolveRound), so they need no hiding then. The viewing
  // seat keeps its own real hand/secret; gift/competition reveals stay public.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => HIDDEN))),
    secret: s.roundOver
      ? s.secret.slice()
      : s.secret.map((c, i) => (i === seat ? c : c == null ? null : HIDDEN)),
    deck: s.deck.map(() => HIDDEN),
    removed: s.removed == null ? null : HIDDEN,
  }),
}
