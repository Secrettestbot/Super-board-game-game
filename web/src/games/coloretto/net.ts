/* COLORETTO — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
   useGameSession can host/join it. Hidden information: the face-down DECK order (and the
   remaining card distribution). Collected tableaux and the open rows are PUBLIC, so the
   only thing redactFor hides is the deck — its contents are replaced with face-down
   placeholders while keeping its length (so the "N in deck" counter still works).

   Seats: 0 = 'you', 1 = 'ai'. A turn is one action:
     {kind:'flip',  column} — draw the top card and place it onto an open column (row)
     {kind:'take',  column} — collect a column into your tableau and sit out the round
   The drawn card is random/hidden, so a guest never supplies it; the host draws then
   places onto the requested column in a single transition. */

import * as CL from './logic'
import type { ColorettoState, Card, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type ColorettoIntent =
  | { kind: 'flip'; column: number }
  | { kind: 'take'; column: number }

const SEAT_TO_PLAYER: Player[] = ['you', 'ai']
function seatPlayer(seat: number): Player | null {
  return SEAT_TO_PLAYER[seat] ?? null
}
function playerSeat(p: Player | null): number | null {
  if (p === 'you') return 0
  if (p === 'ai') return 1
  return null
}

/** A face-down placeholder used to hide the deck's real contents from non-authority seats. */
const FACE_DOWN: Card = { kind: 'last' } // any concrete Card shape; values are meaningless when hidden

export const colorettoAdapter: GameAdapter<ColorettoState, ColorettoIntent> = {
  makeGame: () => CL.makeGame(),
  // Two players ('you' and 'ai'); read off the real participant set so a future
  // larger state would report its true seat count.
  numSeats: s => Object.keys(s.tableau).length,
  seatToMove: s => (s.winner ? null : playerSeat(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, intent) => {
    if (s.winner) return s
    const who = seatPlayer(seat)
    if (who == null || s.turn !== who) return s
    // A turn that already produced a pending card mid-flip cannot accept a new intent;
    // flip handles draw+place atomically so this should not arise from a guest.
    if (s.pending) return s

    if (intent.kind === 'flip') {
      if (!CL.legalDraw(s, who)) return s
      // The row must be open BEFORE drawing (placeRows only applies once a card is
      // pending, so validate openness directly here).
      if (!CL.rowOpen(s, intent.column)) return s
      const drawn = CL.draw(s, who)
      // draw must have produced a pending card to place; if not (e.g. deck exhausted by
      // the last-round marker), nothing legal happened — return original state.
      if (!drawn.pending || drawn.turn !== who) return s
      if (!CL.placeRows(drawn, who).includes(intent.column)) return s
      return CL.place(drawn, intent.column, who)
    }
    // take
    if (!CL.legalTakeRows(s, who).includes(intent.column)) return s
    return CL.take(s, intent.column, who)
  },
  aiStep: s => CL.aiStep(s),
  // Changes on every transition: turn, round-progress (done flags + taken rows),
  // pending card, deck size, and winner all move with each action.
  tickKey: s => {
    const taken = s.taken.map(t => (t ? '1' : '0')).join('')
    return `${s.turn ?? ''}-${s.pending ? 'p' : 'n'}-${s.deck.length}-${s.done.you ? 1 : 0}${s.done.ai ? 1 : 0}-${taken}-${s.winner ?? ''}`
  },
  // Hidden info: replace the face-down deck contents with placeholders but keep its
  // length. Everything else (rows, tableaux, taken/done, lastRound flag) is public.
  redactFor: (s, _seat) => ({
    ...s,
    deck: s.deck.map(() => FACE_DOWN),
  }),
}
