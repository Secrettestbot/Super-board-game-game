/* NINE MEN'S MORRIS — netplay adapter. Maps morris's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Perfect information, so no redactFor.
 * Seats: 0 = White (the original human side, s.you), 1 = Black.
 *
 * Morris has phases (place / move / remove) and forming a MILL lets the SAME player
 * remove an opponent man before the turn passes. So a single "turn" can contain a
 * sub-action (the removal) by the same seat. We model each discrete action as an intent
 * keyed by phase:
 *   { kind: 'place',  cell }        — drop a man (place phase)
 *   { kind: 'move',   from, to }    — slide a man (move phase)
 *   { kind: 'remove', cell }        — take a rival man (remove phase, after a mill)
 *
 * seatToMove returns whoever the state says must act next — which STAYS the same seat
 * during its own mill-removal (logic keeps s.turn unchanged while phase === 'remove').
 * applyIntent validates the action against the current phase + that seat's turn and
 * returns the input state unchanged if illegal/out-of-turn.
 * tickKey changes on EVERY action (incl. the removal) so the AI re-arms for it. */

import * as MM from './logic'
import type { MorrisState, Color } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type MorrisIntent =
  | { kind: 'place'; cell: number }
  | { kind: 'move'; from: number; to: number }
  | { kind: 'remove'; cell: number }

// seat 0 = white (s.you), seat 1 = black.
const COLOR: Color[] = ['w', 'b']
const seatColor = (seat: number): Color | null => (seat === 0 ? 'w' : seat === 1 ? 'b' : null)

export const morrisAdapter: GameAdapter<MorrisState, MorrisIntent> = {
  makeGame: () => MM.makeGame(),
  numSeats: () => 2,
  // s.turn is the colour to act; it stays the same colour during that side's mill removal.
  seatToMove: s => (s.winner != null || s.turn == null ? null : COLOR.indexOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null) return s
    const who = seatColor(seat)
    if (who == null || s.turn !== who) return s
    // Each reducer (place/slide/remove) re-validates phase + turn + legality and returns
    // the input state unchanged when the action is illegal, so out-of-phase intents are safe.
    switch (i.kind) {
      case 'place': return MM.place(s, i.cell, who)
      case 'move': return MM.slide(s, i.from, i.to, who)
      case 'remove': return MM.remove(s, i.cell, who)
      default: return s
    }
  },
  // aiMove plays a full AI turn (place/slide AND the resulting removal) atomically and
  // leaves no dangling 'remove' phase, so one aiStep == one advanced state with a fresh
  // tickKey. The explicit 'remove' branch is a safety net should state ever be parked in
  // the AI's removal phase; tickKey re-arms the timer for it either way.
  aiStep: (s, seat) => {
    const who = seatColor(seat)
    if (who == null || s.turn !== who || s.winner != null) return s
    if (s.phase === 'remove') {
      const rem = MM.removable(s.board, who === 'w' ? 'b' : 'w')
      return rem.length ? MM.remove(s, rem[(Math.random() * rem.length) | 0], who) : s
    }
    return MM.aiMove(s)
  },
  // Changes on EVERY action: phase + turn + men counts + last-move signature all move.
  tickKey: s =>
    `${s.phase}-${s.turn ?? ''}-${s.hand.w},${s.hand.b}-${s.onBoard.w},${s.onBoard.b}-${s.last.join('.')}-${s.winner ?? ''}`,
}
