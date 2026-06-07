/* BLACKJACK — netplay adapter. Maps the pure 1-player-vs-dealer logic onto the
 * uniform GameAdapter so useGameSession can host/join it.
 *
 * SEATS: this is a single human seat (seat 0) playing against a fixed-rule DEALER.
 * The dealer is not a joinable seat — it is the "AI" that auto-draws. numSeats() is
 * therefore 1, so the table is full once the host takes seat 0 and any would-be guest
 * is rejected (HostSession.addGuest closes a transport when no open seat exists). The
 * host always plays authoritatively. A guest CAN still *spectate*-by-rejection: it
 * never gets a seat, so this stays a host-authoritative solo-vs-dealer game.
 *
 * Even though no one can JOIN the dealer, the dealer's automatic draws still need a
 * driver. During the 'dealer' phase seatToMove() returns seat 1 (an uncontrolled seat
 * outside the joinable range), so HostSession.aiSeat() reports it and the AI timer
 * calls aiStep() -> BJ.dealerStep() one card at a time. The dealer/shoe RNG (shuffle +
 * draws) all run inside the host's logic — the authority owns it.
 *
 * HIDDEN INFO: the dealer's HOLE card and the face-down SHOE (draw deck) are secret
 * until reveal. redactFor strips both from any non-host view. (In practice no guest is
 * ever seated, but redactFor still runs for the host's own view harmlessly and is the
 * guard the leak test exercises against a hypothetical seat-1 view.)
 *
 * INTENTS (all submitted by the seated player, seat 0):
 *   { kind: 'deal'   }            — start a new hand (host RNG shuffles/draws)
 *   { kind: 'hit'    }            — draw a card
 *   { kind: 'stand'  }            — hold; dealer then reveals + plays
 *   { kind: 'double' }            — first-action only: double bet, one card, auto-stand
 *   { kind: 'bet', n }            — accepted for protocol completeness; the logic uses a
 *                                   fixed table minimum, so this is a no-op (returns the
 *                                   input state unchanged) — never throws.
 * applyIntent validates every intent against the phase and returns the input state
 * unchanged for anything illegal / out of turn. tickKey changes on every action. */

import * as BJ from './logic'
import type { BlackjackState, Card } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type BlackjackIntent =
  | { kind: 'deal' }
  | { kind: 'hit' }
  | { kind: 'stand' }
  | { kind: 'double' }
  | { kind: 'bet'; n: number }

/** The lone joinable seat is the human player. Seat 1 is the (un-joinable) dealer. */
const PLAYER_SEAT = 0
const DEALER_SEAT = 1

/** Whose turn it is. The player acts in idle/over/player; the dealer "seat" acts while
 * the hand is being resolved (phase 'dealer'); nobody acts once a hand is over AND we
 * are waiting on the player to deal again — which is still the player's seat. */
function seatToMove(s: BlackjackState): number | null {
  return s.phase === 'dealer' ? DEALER_SEAT : PLAYER_SEAT
}

/** A face-down placeholder card the redacted view shows instead of a real card. The
 * shoe never reveals real cards, and the hole card is hidden until the dealer reveals. */
const HIDDEN: Card = { r: 0, s: 'S' }

export const blackjackAdapter: GameAdapter<BlackjackState, BlackjackIntent> = {
  makeGame: () => BJ.makeGame(),

  // Exactly one joinable seat (the human). The dealer is the house AI, not a seat a
  // remote guest may take, so a would-be guest is rejected (table full) -> the host
  // plays authoritatively. The game is never "over" in the seatToMove sense between
  // hands, so this is always 1.
  numSeats: () => 1,

  // Never null: between hands it's still the player's seat (they press Deal). This keeps
  // the player's seat live so they can start the next hand; the dealer seat is reported
  // only during the 'dealer' phase so the AI driver advances dealerStep.
  seatToMove,

  // The match itself never "ends" — chips can run out, but that is handled in the UI
  // (Reset Bank). For netplay purposes the player always has a seat to act in.
  isOver: () => false,

  applyIntent: (s, seat, i) => {
    // Only the player seat may submit intents; the dealer is driven by aiStep, not the
    // wire. Anything not the seated player's turn returns the input state unchanged.
    if (!i || seat !== PLAYER_SEAT || seatToMove(s) !== PLAYER_SEAT) return s
    switch (i.kind) {
      case 'deal': {
        const out = BJ.deal(s)
        return out === s ? s : out // deal() no-ops mid-hand / when broke
      }
      case 'hit': {
        if (s.phase !== 'player') return s
        const out = BJ.hit(s)
        return out === s ? s : out
      }
      case 'stand': {
        if (s.phase !== 'player') return s
        const out = BJ.stand(s)
        return out === s ? s : out
      }
      case 'double': {
        if (s.phase !== 'player' || s.acted || s.chips < s.bet * 2) return s
        const out = BJ.double(s)
        return out === s ? s : out
      }
      case 'bet':
        // The logic uses a fixed table minimum; there is no variable-bet transition to
        // call, so accept the intent but leave the state unchanged (never throw).
        return s
      default:
        return s
    }
  },

  // Drives the (un-joinable) dealer seat: one dealerStep per tick so cards appear one at
  // a time, exactly like the solo useAITurn loop. The shoe/draw RNG runs here on the
  // host — the authority. Only acts while it's the dealer's phase.
  aiStep: (s, seat) => (seat === DEALER_SEAT && s.phase === 'dealer' ? BJ.dealerStep(s) : s),

  // Changes on EVERY transition: phase, both hand sizes, the bet, chips, the hole flag,
  // the result and the log length (which grows on every mutation).
  tickKey: s =>
    `${s.phase}-${s.player.length}-${s.dealer.length}-${s.bet}-${s.chips}-${s.hole ? 1 : 0}-${s.result ?? ''}-${s.log.length}`,

  // Hidden-info redaction for any non-host (non-player) view: hide the dealer's hole
  // card while it is still face-down, and never reveal the face-down shoe. The seated
  // player (seat 0) sees the table exactly as the solo game does.
  redactFor: (s, seat) => {
    if (seat === PLAYER_SEAT) return s
    // Replace every shoe card with a face-down placeholder (count preserved, values hidden).
    const shoe = s.shoe.map(() => HIDDEN)
    // While the hole card is still down, mask the dealer's second card.
    const dealer = s.hole ? s.dealer.map((c, idx) => (idx === 1 ? HIDDEN : c)) : s.dealer
    return Object.assign({}, s, { shoe, dealer })
  },
}
