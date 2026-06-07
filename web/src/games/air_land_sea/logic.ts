/* AIR, LAND & SEA — logic (built for this codebase, not ported).

   A 2-player tactical card game fought as a series of BATTLES. Three THEATERS sit in a row —
   AIR · LAND · SEA. The deck is 18 cards: 6 of each theater type, values 1..6, each printed with
   an ABILITY. At the start of a battle each player is dealt 6 cards. Players alternate turns.

   On your turn you must do ONE of:
     (a) PLAY a card FACE-UP into the theater that MATCHES its type, triggering its ability; OR
     (b) PLAY a card FACE-DOWN into ANY theater as a generic strength-2 card (no ability); OR
     (c) WITHDRAW — concede the battle. Withdrawing early hands the opponent FEWER victory points
         than fighting to the end, so it limits the bleeding when you are losing badly.

   Cards stack on YOUR side of each theater. The battle ends when a player withdraws OR both
   hands are empty. SCORING — you CONTROL a theater if your total strength there is strictly
   greater than the opponent's; a TIE goes to the player who did NOT trigger the resolution
   (the defender). You WIN the battle by controlling a MAJORITY (2 of 3) theaters. If each side
   controls fewer than 2 (e.g. a strength tie leaves it open) the higher TOTAL strength wins.

   VICTORY POINTS — fought to the end: winner takes 6 VP. Withdrawal: the OPPONENT of the
   withdrawer takes VP based on how many cards the withdrawer still had to play (fewer cards left
   = later withdrawal = fewer VP for the opponent): 4 cards+ -> 2 VP, 2-3 -> 3 VP, 0-1 -> 4 VP.
   First side to 12 VP across battles wins the WAR.

   Seats are 0 (you) and 1 (the AI). Seat 0 / theater 0 / VP 0 are all valid — never truthiness-
   test them; compare with === / != null. Immutable updates, no DOM. */

export const THEATERS = ['air', 'land', 'sea'] as const
export type Theater = typeof THEATERS[number]
export type Seat = 0 | 1

export type Ability =
  | 'none'        // face-down generic (strength 2)
  | 'reinforce'   // plain — no special effect (kept for simple cards)
  | 'support'     // +3 to your strength in BOTH adjacent theaters (handled at scoring)
  | 'ambush'      // +0 here, but counts double in its own theater (handled at scoring)
  | 'maneuver'    // plain strong card, no effect (simplified)
  | 'escalation'  // each of your FACE-DOWN cards (anywhere) is worth +1 extra (handled at scoring)

export interface Card {
  id: number
  theater: Theater   // the card's printed type / home theater
  value: number      // printed strength 1..6
  ability: Ability
  name: string
}

/** A card as it sits on the board: which seat owns it, and whether it's face-down (strength 2). */
export interface Placed {
  card: Card
  faceDown: boolean
}

export interface TheaterStacks {
  0: Placed[]   // seat 0's stack in this theater
  1: Placed[]   // seat 1's stack in this theater
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  theaters: TheaterStacks[]   // length 3, indexed by THEATERS order
  hands: [Card[], Card[]]     // seat 0 and seat 1 hands
  deck: Card[]                // remaining cards after the deal (unused this battle, reshuffled next)
  turn: Seat | null           // whose turn (null when a battle/war is over and awaiting "next")
  withdrawn: Seat | null      // who withdrew this battle (null if fought to the end)
  phase: 'battle' | 'battleOver' | 'warOver'
  vp: [number, number]        // running victory points across battles
  battleResult: BattleResult | null  // populated when a battle ends, for the UI
  battleNo: number
  winner: Seat | null         // war winner (first to 12 VP)
  tick: number                // monotonic action counter — drives the AI timer
  log: LogEntry[]
}

export interface BattleResult {
  winner: Seat               // who won the battle
  vpAwarded: number          // VP the winner gained
  byWithdrawal: boolean
  control: (Seat | null)[]   // who controlled each theater (length 3)
  strength: [number, number] // total strength each side (with abilities) summed over theaters
}

const WIN_VP = 12
const HAND_SIZE = 6
const FIGHT_VP = 6

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0)
const who = (seat: Seat) => (seat === 0 ? 'You' : 'The enemy')

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

// ===== Deck =====
// 18 cards: 6 per theater, values 1..6. Abilities are assigned by value so the deck is fixed and
// deterministic. We keep a small representative set of abilities (the rest are plain "reinforce"
// or "maneuver"), as permitted by the brief.

const NAMES: Record<Theater, Record<number, string>> = {
  air: { 1: 'Support', 2: 'Air Drop', 3: 'Maneuver', 4: 'Aerodrome', 5: 'Containment', 6: 'Heavy Bombers' },
  land: { 1: 'Support', 2: 'Reinforce', 3: 'Maneuver', 4: 'Ambush', 5: 'Escalation', 6: 'Heavy Tanks' },
  sea: { 1: 'Support', 2: 'Maneuver', 3: 'Transport', 4: 'Escalation', 5: 'Ambush', 6: 'Super Battleship' },
}

function abilityFor(theater: Theater, value: number): Ability {
  // value 1 -> support; ambush / escalation seeded per theater; high cards are plain heavy hitters.
  if (value === 1) return 'support'
  if (theater === 'land' && value === 4) return 'ambush'
  if (theater === 'sea' && value === 5) return 'ambush'
  if (theater === 'land' && value === 5) return 'escalation'
  if (theater === 'sea' && value === 4) return 'escalation'
  if (value === 3) return 'maneuver'
  return 'reinforce'
}

export function buildDeck(): Card[] {
  const deck: Card[] = []
  let id = 0
  for (const theater of THEATERS) {
    for (let v = 1; v <= 6; v++) {
      deck.push({ id: id++, theater, value: v, ability: abilityFor(theater, v), name: NAMES[theater][v] })
    }
  }
  return deck
}

function shuffle<T>(a: T[]): T[] {
  const arr = a.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function emptyTheaters(): TheaterStacks[] {
  return THEATERS.map(() => ({ 0: [], 1: [] }))
}

/** makeGame(optionalDeck?) — optionalDeck is the full 18-card order (deal reads from the FRONT:
   first 6 -> seat 0's hand, next 6 -> seat 1's hand, rest -> deck). Deterministic for tests. */
export function makeGame(optionalDeck?: Card[]): State {
  const full = optionalDeck ? optionalDeck.slice() : shuffle(buildDeck())
  return startBattle(
    {
      theaters: emptyTheaters(),
      hands: [[], []],
      deck: full,
      turn: 0,
      withdrawn: null,
      phase: 'battle',
      vp: [0, 0],
      battleResult: null,
      battleNo: 0,
      winner: null,
      tick: 0,
      log: [{ t: 'sys', x: 'A new war begins. Win two of three theaters to take the battle. First to 12 VP wins.' }],
    },
    full,
    0,
  )
}

/** Deal a fresh battle from `source` (a full 18-card order). startingSeat alternates each battle. */
function startBattle(s: State, source: Card[], startingSeat: Seat): State {
  const youHand = source.slice(0, HAND_SIZE)
  const aiHand = source.slice(HAND_SIZE, HAND_SIZE * 2)
  const deck = source.slice(HAND_SIZE * 2)
  return {
    ...s,
    theaters: emptyTheaters(),
    hands: [youHand, aiHand],
    deck,
    turn: startingSeat,
    withdrawn: null,
    phase: 'battle',
    battleResult: null,
    battleNo: s.battleNo + 1,
    tick: s.tick + 1,
    log: push(s.log, 'sys', `Battle ${s.battleNo + 1} — ${who(startingSeat)} ${startingSeat === 0 ? 'go' : 'goes'} first.`),
  }
}

// ===== Legal plays =====

export interface PlayOption {
  card: Card
  theater: number   // theater INDEX 0..2
  faceDown: boolean
}

/** All legal plays for `seat` this turn: every card face-down into any theater, plus each card
   face-up into ITS OWN theater. (Withdraw is always available but isn't a "play".) */
export function legalPlays(s: State, seat: Seat): PlayOption[] {
  if (s.phase !== 'battle' || s.turn !== seat) return []
  const out: PlayOption[] = []
  for (const card of s.hands[seat]) {
    // Face-up only into its matching theater.
    out.push({ card, theater: THEATERS.indexOf(card.theater), faceDown: false })
    // Face-down into any of the three theaters.
    for (let ti = 0; ti < THEATERS.length; ti++) out.push({ card, theater: ti, faceDown: true })
  }
  return out
}

// ===== Strength / control =====

/** Effective strength of a placed card BEFORE cross-theater abilities (support handled separately).
   Face-down = always 2. Face-up = printed value, doubled for an 'ambush' card in its own theater. */
function baseStrength(p: Placed, theaterIndex: number): number {
  if (p.faceDown) return 2
  let v = p.card.value
  if (p.card.ability === 'ambush' && THEATERS.indexOf(p.card.theater) === theaterIndex) v *= 2
  return v
}

/** Total strength for `seat` in a single theater, applying that theater's own face-up abilities
   plus inbound 'support' from this seat's adjacent theaters and 'escalation' face-down bonuses. */
export function theaterStrength(s: State, seat: Seat, theaterIndex: number): number {
  let total = 0
  for (const p of s.theaters[theaterIndex][seat]) total += baseStrength(p, theaterIndex)

  // Support: a face-up Support card grants +3 to its owner in BOTH adjacent theaters.
  for (let ti = 0; ti < THEATERS.length; ti++) {
    if (Math.abs(ti - theaterIndex) !== 1) continue // only adjacent theaters support this one
    for (const p of s.theaters[ti][seat]) {
      if (!p.faceDown && p.card.ability === 'support') total += 3
    }
  }

  // Escalation: if this seat controls ANY face-up Escalation card anywhere, each of this seat's
  // face-down cards in THIS theater is worth +1 extra.
  let hasEscalation = false
  for (let ti = 0; ti < THEATERS.length; ti++) {
    for (const p of s.theaters[ti][seat]) {
      if (!p.faceDown && p.card.ability === 'escalation') hasEscalation = true
    }
  }
  if (hasEscalation) {
    for (const p of s.theaters[theaterIndex][seat]) if (p.faceDown) total += 1
  }
  return total
}

/** Who controls a theater? Strictly-greater strength wins; on a TIE the `defender` keeps it
   (the player who did NOT trigger resolution). Returns the controlling seat. */
export function theaterControl(s: State, theaterIndex: number, defender: Seat): Seat {
  const a = theaterStrength(s, 0, theaterIndex)
  const b = theaterStrength(s, 1, theaterIndex)
  if (a > b) return 0
  if (b > a) return 1
  return defender
}

/** Resolve the whole battle. `defender` is the seat who did NOT end it (wins strength ties). */
export function resolveBattle(s: State, defender: Seat): BattleResult {
  const control: Seat[] = []
  let count0 = 0
  let count1 = 0
  let str0 = 0
  let str1 = 0
  for (let ti = 0; ti < THEATERS.length; ti++) {
    const c = theaterControl(s, ti, defender)
    control.push(c)
    if (c === 0) count0++
    else count1++
    str0 += theaterStrength(s, 0, ti)
    str1 += theaterStrength(s, 1, ti)
  }
  let winner: Seat
  if (count0 >= 2) winner = 0
  else if (count1 >= 2) winner = 1
  else winner = str0 >= str1 ? (str0 === str1 ? defender : 0) : 1 // fallback (shouldn't trigger with 3 theaters)
  return { winner, vpAwarded: 0, byWithdrawal: false, control, strength: [str0, str1] }
}

// ===== Actions ===== (all return a new state; illegal => unchanged)

function replaceTheater(theaters: TheaterStacks[], idx: number, t: TheaterStacks): TheaterStacks[] {
  const out = theaters.slice()
  out[idx] = t
  return out
}

/** play(s, seat, card, theaterIndex, faceDown). Face-up must match the card's own theater. */
export function play(s: State, seat: Seat, card: Card, theaterIndex: number, faceDown: boolean): State {
  if (s.phase !== 'battle' || s.turn !== seat) return s
  if (theaterIndex < 0 || theaterIndex >= THEATERS.length) return s
  const hand = s.hands[seat]
  const inHand = hand.find(c => c.id === card.id)
  if (!inHand) return s
  // Face-up cards may ONLY go to their own theater.
  if (!faceDown && THEATERS.indexOf(inHand.theater) !== theaterIndex) return s

  const stacks = s.theaters[theaterIndex]
  const placed: Placed = { card: inHand, faceDown }
  const newStack = stacks[seat].concat([placed])
  const newTheater: TheaterStacks = { ...stacks, [seat]: newStack }
  const theaters = replaceTheater(s.theaters, theaterIndex, newTheater)

  const newHand = hand.filter(c => c.id !== inHand.id)
  const hands: [Card[], Card[]] = seat === 0 ? [newHand, s.hands[1]] : [s.hands[0], newHand]

  const tn = THEATERS[theaterIndex].toUpperCase()
  const desc = faceDown
    ? `${who(seat)} played a card face-down to ${tn} (strength 2).`
    : `${who(seat)} played ${inHand.name} ${inHand.value} to ${tn}.`
  let t: State = { ...s, theaters, hands, turn: other(seat), tick: s.tick + 1, log: push(s.log, seat === 0 ? 'you' : 'ai', desc) }

  // Battle ends when BOTH hands are empty. The player who made the LAST play triggered it, so the
  // OTHER seat is the defender (wins ties).
  if (t.hands[0].length === 0 && t.hands[1].length === 0) {
    t = endBattle(t, other(seat), false)
  }
  return t
}

/** withdraw(s, seat) — `seat` concedes the battle to the opponent. */
export function withdraw(s: State, seat: Seat): State {
  if (s.phase !== 'battle' || s.turn !== seat) return s
  const opp = other(seat)
  const t: State = { ...s, withdrawn: seat, log: push(s.log, seat === 0 ? 'you' : 'ai', `${who(seat)} withdrew from the battle.`) }
  return endBattle(t, opp, true)
}

/** Settle a finished battle: compute the result, award VP, and detect the war winner. `winnerHint`
   is used only for withdrawals (the opponent of the withdrawer); fought battles re-resolve. */
function endBattle(s: State, defender: Seat, byWithdrawal: boolean): State {
  let result: BattleResult
  if (byWithdrawal) {
    // The withdrawer concedes; opponent (defender here) wins. VP scales with how late the
    // withdrawal came — fewer cards left in the withdrawer's hand => more VP for the opponent.
    const withdrawer = other(defender)
    const left = s.hands[withdrawer].length
    const vp = left >= 4 ? 2 : left >= 2 ? 3 : 4
    // Still compute control/strength for display (defender wins ties).
    const probe = resolveBattle(s, defender)
    result = { winner: defender, vpAwarded: vp, byWithdrawal: true, control: probe.control, strength: probe.strength }
  } else {
    const r = resolveBattle(s, defender)
    result = { ...r, vpAwarded: FIGHT_VP, byWithdrawal: false }
  }

  const vp: [number, number] = [s.vp[0], s.vp[1]]
  vp[result.winner] += result.vpAwarded

  const warWinner: Seat | null = vp[0] >= WIN_VP ? 0 : vp[1] >= WIN_VP ? 1 : null
  const log = push(
    s.log,
    result.winner === 0 ? 'you' : 'ai',
    `${who(result.winner)} won battle ${s.battleNo} (+${result.vpAwarded} VP)${byWithdrawal ? ' by withdrawal' : ''}. Score ${vp[0]}–${vp[1]}.`,
  )

  return {
    ...s,
    vp,
    battleResult: result,
    phase: warWinner != null ? 'warOver' : 'battleOver',
    turn: null,
    winner: warWinner,
    tick: s.tick + 1,
    log: warWinner != null ? push(log, warWinner === 0 ? 'you' : 'ai', `${who(warWinner)} reached 12 VP and won the war!`) : log,
  }
}

/** nextBattle(s) — after a battle is over (and the war isn't), deal the next battle. The loser of
   the previous battle (or the non-starter) starts the next one to keep it fair; we alternate by
   battle number. */
export function nextBattle(s: State): State {
  if (s.phase !== 'battleOver') return s
  const source = shuffle(buildDeck())
  // Alternate the starting seat each battle.
  const startingSeat: Seat = s.battleNo % 2 === 0 ? 0 : 1
  return startBattle(s, source, startingSeat)
}

// ===== AI ===== (seat 1; heuristic — fast, single atomic action per call)
// Strategy:
//  1. Evaluate: if currently losing badly (would control 0 theaters and trail in strength) AND
//     hand is small, WITHDRAW to limit VP loss.
//  2. Otherwise, search every legal (card, theater, faceDown) play, simulate it, and score the
//     resulting board by (theaters it would control) * 100 + own strength - opp strength, with a
//     small bonus for playing face-up matching cards (uses abilities) and keeping strong cards.
//  3. Pick the best; ties broken toward face-up plays in contested theaters.

function controlCount(s: State, seat: Seat, defender: Seat): number {
  let n = 0
  for (let ti = 0; ti < THEATERS.length; ti++) if (theaterControl(s, ti, defender) === seat) n++
  return n
}

function totalStrength(s: State, seat: Seat): number {
  let n = 0
  for (let ti = 0; ti < THEATERS.length; ti++) n += theaterStrength(s, seat, ti)
  return n
}

function scoreFor(s: State, seat: Seat): number {
  // Defender = whoever would be on the receiving end at resolution. For scoring we treat the AI
  // as the one acting, so the opponent defends ties — conservative for the AI.
  const def = other(seat)
  const ctrl = controlCount(s, seat, def)
  return ctrl * 100 + (totalStrength(s, seat) - totalStrength(s, other(seat)))
}

/** aiTurn(s): performs ONE atomic AI action (play or withdraw) and returns the new state. */
export function aiTurn(s: State): State {
  if (s.phase !== 'battle' || s.turn !== 1) return s
  const seat: Seat = 1
  const hand = s.hands[seat]
  if (hand.length === 0) return s // shouldn't happen (battle would have ended), guard anyway

  // 1. Consider withdrawing when clearly losing and few cards remain to swing it.
  const curCtrl = controlCount(s, seat, 0)           // opp defends ties — pessimistic for AI
  const myStr = totalStrength(s, seat)
  const oppStr = totalStrength(s, 0)
  const losingBadly = curCtrl === 0 && oppStr - myStr >= 7
  if (losingBadly && hand.length <= 3 && hand.length >= 1) {
    return withdraw(s, seat)
  }

  // 2. Otherwise pick the best play.
  const options = legalPlays(s, seat)
  let bestState: State | null = null
  let bestScore = -Infinity
  let bestOption: PlayOption | null = null
  for (const opt of options) {
    const probe = play(s, seat, opt.card, opt.theater, opt.faceDown)
    if (probe === s) continue // illegal (shouldn't happen for legalPlays output)
    let score = scoreFor(probe, seat)
    // Prefer using abilities: face-up matching play that isn't a wasted high card.
    if (!opt.faceDown) {
      if (opt.card.ability === 'support' || opt.card.ability === 'ambush' || opt.card.ability === 'escalation') score += 4
      score += 1
    } else {
      // Face-down sacrifices the printed value; slightly penalize burning a high card face-down.
      score -= opt.card.value * 0.3
    }
    if (score > bestScore) {
      bestScore = score
      bestState = probe
      bestOption = opt
    }
  }
  if (bestState != null && bestOption != null) return bestState
  // Fallback: play first card face-down into theater 0.
  return play(s, seat, hand[0], 0, true)
}

// ===== Convenience for UI =====

export { other, who, WIN_VP, HAND_SIZE }
