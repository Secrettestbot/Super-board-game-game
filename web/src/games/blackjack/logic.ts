/* BLACKJACK — logic (built for this codebase, not ported).
   You vs the dealer over a shuffled 52-card shoe. Card values: 2–10 face, J/Q/K = 10,
   Ace = 11 unless that busts (then 1 — soft/hard). Deal two up to you, dealer shows one
   and hides one. Natural blackjack pays 3:2. Your actions: HIT, STAND, DOUBLE (first move
   only — double bet, one card, auto-stand). The "AI" is the fixed-rule dealer: after you
   stand it reveals the hole card and draws until reaching 17 or more, standing on all 17
   (including soft 17). Higher total ≤ 21 wins; equal pushes; dealer bust wins for you.
   Immutable: every action returns a fresh state. No React/DOM. */

export type Suit = 'S' | 'H' | 'D' | 'C'
export interface Card { r: number; s: Suit }   // r: 1 (Ace) .. 13 (King)
export type Phase = 'idle' | 'player' | 'dealer' | 'over'
export type Result = 'win' | 'lose' | 'push' | 'blackjack' | null
export interface LogEntry { t: string; x: string }

export interface BlackjackState {
  shoe: Card[]
  player: Card[]
  dealer: Card[]
  hole: boolean          // dealer's hole card still face-down
  phase: Phase
  bet: number
  chips: number
  doubled: boolean
  acted: boolean         // player has taken at least one action (locks out double)
  result: Result
  log: LogEntry[]
}

export const START_CHIPS = 100
export const BET = 10
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS: Suit[] = ['S', 'H', 'D', 'C']

export const rankLabel = (r: number) => RANKS[r]
export const isRed = (s: Suit) => s === 'H' || s === 'D'
export const suitGlyph = (s: Suit) => ({ S: '♠', H: '♥', D: '♦', C: '♣' }[s])

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

function freshShoe(): Card[] {
  const shoe: Card[] = []
  for (const s of SUITS) for (let r = 1; r <= 13; r++) shoe.push({ r, s })
  // Fisher–Yates
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    const t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t
  }
  return shoe
}

// Best total + whether the hand is "soft" (an ace counted as 11).
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0
  for (const c of cards) {
    const v = c.r === 1 ? 11 : c.r >= 10 ? 10 : c.r
    total += v
    if (c.r === 1) aces++
  }
  let soft = aces > 0
  while (total > 21 && aces > 0) { total -= 10; aces--; if (aces === 0) soft = false }
  if (total > 21) soft = false
  return { total, soft }
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21

export function makeGame(): BlackjackState {
  return {
    shoe: freshShoe(),
    player: [], dealer: [], hole: false,
    phase: 'idle', bet: BET, chips: START_CHIPS,
    doubled: false, acted: false, result: null,
    log: [{ t: 'sys', x: `Welcome to the table. ${START_CHIPS} chips. Press Deal to play a ${BET}-chip hand.` }],
  }
}

// Draw one card, reshuffling if the shoe is running low.
function draw(shoe: Card[]): { card: Card; shoe: Card[] } {
  let s = shoe
  if (s.length < 8) s = freshShoe()
  const card = s[0]
  return { card, shoe: s.slice(1) }
}

function settle(s: BlackjackState, result: Result, msg: string): BlackjackState {
  let chips = s.chips
  if (result === 'blackjack') chips += Math.round(s.bet * 1.5)
  else if (result === 'win') chips += s.bet
  else if (result === 'lose') chips -= s.bet
  // push: no change
  const t = result === 'lose' ? 'ai' : result === 'push' ? 'sys' : 'you'
  return Object.assign({}, s, { phase: 'over' as Phase, result, chips, log: push(s.log, t, msg) })
}

// Start a new round (bet placed). Handles immediate naturals.
export function deal(s: BlackjackState): BlackjackState {
  if (s.phase === 'player' || s.phase === 'dealer') return s
  if (s.chips < BET) return s
  let shoe = s.shoe
  const player: Card[] = [], dealer: Card[] = []
  for (let k = 0; k < 2; k++) { const d = draw(shoe); player.push(d.card); shoe = d.shoe }
  for (let k = 0; k < 2; k++) { const d = draw(shoe); dealer.push(d.card); shoe = d.shoe }
  const base: BlackjackState = Object.assign({}, s, {
    shoe, player, dealer, hole: true, phase: 'player' as Phase, bet: BET,
    doubled: false, acted: false, result: null,
    log: push(s.log, 'sys', `New hand — ${BET} chips wagered. You draw to ${handValue(player).total}.`),
  })
  const youBj = isBlackjack(player), dealerBj = isBlackjack(dealer)
  if (youBj || dealerBj) {
    const revealed = Object.assign({}, base, { hole: false, phase: 'player' as Phase })
    if (youBj && dealerBj) return settle(revealed, 'push', 'Both blackjack — push, bet returned.')
    if (youBj) return settle(revealed, 'blackjack', `Blackjack! Pays 3:2 — you take ${Math.round(BET * 1.5)} chips.`)
    return settle(revealed, 'lose', 'Dealer has blackjack. The hand is lost.')
  }
  return base
}

export function hit(s: BlackjackState): BlackjackState {
  if (s.phase !== 'player') return s
  const d = draw(s.shoe)
  const player = s.player.concat([d.card])
  const ns = Object.assign({}, s, { shoe: d.shoe, player, acted: true, log: push(s.log, 'you', `You hit — now ${handValue(player).total}.`) })
  if (handValue(player).total > 21) return settle(ns, 'lose', `Bust at ${handValue(player).total}. The hand is lost.`)
  return ns
}

export function stand(s: BlackjackState): BlackjackState {
  if (s.phase !== 'player') return s
  return Object.assign({}, s, { phase: 'dealer' as Phase, hole: false, acted: true, log: push(s.log, 'you', `You stand on ${handValue(s.player).total}. Dealer reveals.`) })
}

export function double(s: BlackjackState): BlackjackState {
  if (s.phase !== 'player' || s.acted) return s
  if (s.chips < s.bet * 2) return s
  const d = draw(s.shoe)
  const player = s.player.concat([d.card])
  const total = handValue(player).total
  const ns = Object.assign({}, s, {
    shoe: d.shoe, player, bet: s.bet * 2, doubled: true, acted: true,
    log: push(s.log, 'you', `You double to ${s.bet * 2} and draw to ${total}.`),
  })
  if (total > 21) return settle(ns, 'lose', `Bust at ${total} after doubling. The hand is lost.`)
  return Object.assign({}, ns, { phase: 'dealer' as Phase, hole: false, log: push(ns.log, 'you', 'One card only — you stand. Dealer reveals.') })
}

// One dealer draw / decision step. Stands on all 17 (including soft 17), then compares.
export function dealerStep(s: BlackjackState): BlackjackState {
  if (s.phase !== 'dealer') return s
  const { total } = handValue(s.dealer)
  if (total < 17) {
    const d = draw(s.shoe)
    const dealer = s.dealer.concat([d.card])
    const nt = handValue(dealer).total
    const ns = Object.assign({}, s, { shoe: d.shoe, dealer, log: push(s.log, 'ai', `Dealer draws to ${nt}.`) })
    if (nt > 21) return settle(ns, 'win', `Dealer busts at ${nt}. You win!`)
    return ns
  }
  // dealer stands — compare
  const you = handValue(s.player).total, dl = total
  const stood = Object.assign({}, s, { log: push(s.log, 'ai', `Dealer stands on ${dl}.`) })
  if (you > dl) return settle(stood, 'win', `You win — ${you} beats ${dl}.`)
  if (you < dl) return settle(stood, 'lose', `Dealer wins — ${dl} beats ${you}.`)
  return settle(stood, 'push', `Push at ${you} — bet returned.`)
}

// True while it's the dealer's turn and another step is required.
export const dealerActive = (s: BlackjackState) => s.phase === 'dealer'
