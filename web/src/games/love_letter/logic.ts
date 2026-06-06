/* LOVE LETTER — logic (2-player adaptation, built for this codebase; immutable, no DOM).
   You (player 0) and the Rival (player 1) court the Princess. Each ROUND: shuffle the 16-card
   deck, set ONE card aside face-down (removed from play). NOTE: the official 2p variant also
   burns 3 cards FACE-UP — we SKIP the face-up cards for simplicity (one face-down card only).
   Deal one card to each player; the current player draws and plays one of two cards, resolving
   its effect. A round ends when one player is OUT, or the deck empties (higher card wins).
   First to TARGET round tokens wins the game. */

export type Player = 0 | 1            // 0 = you, 1 = rival
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export const TARGET_TOKENS = 4

export interface CardInfo { value: CardValue; name: string; count: number; blurb: string }

export const CARDS: Record<CardValue, CardInfo> = {
  1: { value: 1, name: 'Guard',    count: 5, blurb: 'Name a non-Guard card; if the rival holds it, they are out.' },
  2: { value: 2, name: 'Priest',   count: 2, blurb: "Look at the rival's hand." },
  3: { value: 3, name: 'Baron',    count: 2, blurb: 'Compare hands; the lower value is out.' },
  4: { value: 4, name: 'Handmaid', count: 2, blurb: 'You are protected until your next turn.' },
  5: { value: 5, name: 'Prince',   count: 2, blurb: 'A player discards their hand and draws anew.' },
  6: { value: 6, name: 'King',     count: 1, blurb: 'Trade hands with the rival.' },
  7: { value: 7, name: 'Countess', count: 1, blurb: 'Must be played with the King or Prince.' },
  8: { value: 8, name: 'Princess', count: 1, blurb: 'Discard or play this and you are out.' },
}

export const cardName = (v: CardValue) => CARDS[v].name

export interface LogEntry { t: string; x: string }     // t: 'you' | 'ai' | 'sys'
export interface Discard { who: Player; v: CardValue }

export interface LoveLetterState {
  deck: CardValue[]                 // draw pile, top = last element
  hands: CardValue[][]             // hands[0] = you, hands[1] = rival; 1 card at rest, 2 on your turn
  out: boolean[]                   // out[p] = eliminated this round
  protected: boolean[]             // handmaid protection
  discards: Discard[]              // all played/discarded cards, in order
  tokens: number[]                 // round tokens won [you, rival]
  turn: Player | null              // whose turn (null when round/game over or awaiting input handled in UI)
  drewExtra: boolean               // true once the current player has drawn (holds 2)
  reveal: boolean                  // Priest revealed the rival's hand to you
  roundOver: boolean
  roundWinner: Player | null
  winner: Player | null            // game winner (reached TARGET_TOKENS)
  log: LogEntry[]
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-30) }
const who = (p: Player) => p === 0 ? 'You' : 'The rival'
const whoLow = (p: Player) => p === 0 ? 'you' : 'the rival'
const tag = (p: Player) => p === 0 ? 'you' : 'ai'

export function fullDeck(): CardValue[] {
  const d: CardValue[] = []
  for (const k of Object.keys(CARDS)) {
    const v = Number(k) as CardValue
    for (let i = 0; i < CARDS[v].count; i++) d.push(v)
  }
  return d
}

export function shuffle<T>(a: T[]): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

// Begin a fresh round. `starter` plays first and immediately draws their 2nd card.
function startRound(tokens: number[], starter: Player, log: LogEntry[]): LoveLetterState {
  const deck = shuffle(fullDeck())
  deck.pop()                                    // ONE card set aside face-down (removed); face-up cards skipped
  const hands: CardValue[][] = [[deck.pop()!], [deck.pop()!]]
  hands[starter].push(deck.pop()!)              // current player draws to 2
  return {
    deck, hands,
    out: [false, false],
    protected: [false, false],
    discards: [],
    tokens: tokens.slice(),
    turn: starter,
    drewExtra: true,
    reveal: starter === 0,                       // when you start you already see your 2 cards (rival hidden)
    roundOver: false, roundWinner: null, winner: null,
    log: push(log, 'sys', `New round — ${whoLow(starter)} draw${starter === 0 ? '' : 's'} first.`),
  }
}

export function makeGame(): LoveLetterState {
  const log = push([], 'sys', 'Court the Princess. Outlast the rival each round; first to ' + TARGET_TOKENS + ' favors wins.')
  return startRound([0, 0], 0, log)
}

// Which card values the current player may legally PLAY (Countess rule enforced).
export function legalPlays(s: LoveLetterState, p: Player): CardValue[] {
  const h = s.hands[p]
  if (h.length < 2) return []
  // Countess rule: must play Countess if also holding King or Prince.
  if (h.includes(7) && (h.includes(6) || h.includes(5))) return [7]
  return h.slice()
}

const opp = (p: Player): Player => (p === 0 ? 1 : 0) as Player

// Remove ONE instance of `v` from a hand, return the remaining hand.
function without(hand: CardValue[], v: CardValue): CardValue[] {
  const i = hand.indexOf(v)
  const r = hand.slice()
  if (i >= 0) r.splice(i, 1)
  return r
}

function endRound(s: LoveLetterState, winner: Player, reason: string, log: LogEntry[]): LoveLetterState {
  const tokens = s.tokens.slice()
  tokens[winner]++
  log = push(log, tag(winner), `${who(winner)} win${winner === 0 ? '' : 's'} the round — ${reason} (favor ${tokens[winner]}).`)
  const gameWinner = tokens[winner] >= TARGET_TOKENS ? winner : null
  if (gameWinner !== null) log = push(log, tag(gameWinner), `${who(gameWinner)} win${gameWinner === 0 ? '' : 's'} the game!`)
  return Object.assign({}, s, {
    tokens, turn: null, roundOver: true, roundWinner: winner, winner: gameWinner,
    reveal: true, log,
  })
}

function eliminate(s: LoveLetterState, p: Player, reason: string, log: LogEntry[]): LoveLetterState {
  const out = s.out.slice(); out[p] = true
  log = push(log, 'sys', `${who(p)} ${p === 0 ? 'are' : 'is'} out — ${reason}.`)
  const survivor = opp(p)
  return endRound(Object.assign({}, s, { out, log }), survivor, `${whoLow(p)} eliminated`, log)
}

// Advance to the opponent's turn: clear protection for the new player, draw a card.
function passTurn(s: LoveLetterState, log: LogEntry[]): LoveLetterState {
  const next = opp(s.turn as Player)
  // deck exhausted -> resolve by highest card
  if (s.deck.length === 0) {
    const a = s.hands[0][0], b = s.hands[1][0]
    const reason = `higher card (${cardName(a as CardValue)} vs ${cardName(b as CardValue)})`
    if (a === b) {
      // tie on value — split decided by who has been dealt more discard value (rare); default to current player
      const wn: Player = s.tokens[0] <= s.tokens[1] ? 0 : 1
      return endRound(s, wn, 'deck empty — tie broken', log)
    }
    const wn: Player = (a as number) > (b as number) ? 0 : 1
    return endRound(s, wn, `deck empty — ${reason}`, log)
  }
  const deck = s.deck.slice()
  const hands = s.hands.map(h => h.slice())
  hands[next].push(deck.pop()!)
  const prot = s.protected.slice(); prot[next] = false    // protection lasts until your next turn
  return Object.assign({}, s, {
    deck, hands, turn: next, drewExtra: true,
    protected: prot,
    reveal: next === 0,                                    // you see your own 2 cards; rival hidden again
    log,
  })
}

/* PLAY a card. `guardGuess` required for a Guard targeting the rival; `princeTarget` required
   for the Prince. The acting player is always `s.turn`. Returns a new state (round may end). */
export interface PlayOpts { guardGuess?: CardValue; princeTarget?: Player }

export function play(s: LoveLetterState, v: CardValue, opts: PlayOpts = {}): LoveLetterState {
  if (s.winner !== null || s.roundOver || s.turn === null) return s
  const p = s.turn
  if (!legalPlays(s, p).includes(v)) return s

  let hands = s.hands.map(h => h.slice())
  hands[p] = without(hands[p], v)                          // the played card leaves the hand
  let discards = s.discards.concat([{ who: p, v }])
  let prot = s.protected.slice()
  let log = push(s.log, tag(p), `${who(p)} play${p === 0 ? '' : 's'} the ${cardName(v)}.`)
  let st = Object.assign({}, s, { hands, discards, protected: prot, drewExtra: false, reveal: false, log })
  const o = opp(p)

  switch (v) {
    case 8: // PRINCESS — playing it eliminates you
      return eliminate(st, p, 'played the Princess', st.log)

    case 7: // COUNTESS — no effect
      st = Object.assign({}, st, { log: push(st.log, 'sys', `The Countess watches, unmoved.`) })
      return passTurn(st, st.log)

    case 4: // HANDMAID — protected until next turn
      prot = st.protected.slice(); prot[p] = true
      st = Object.assign({}, st, { protected: prot, log: push(st.log, tag(p), `${who(p)} ${p === 0 ? 'are' : 'is'} protected.`) })
      return passTurn(st, st.log)

    case 2: { // PRIEST — look at the rival's hand
      const reveal = p === 0                                // only meaningful to surface to you
      const msg = p === 0 ? `You glimpse the rival's ${cardName(st.hands[o][0] as CardValue)}.` : `The rival peeks at your hand.`
      st = Object.assign({}, st, { reveal, log: push(st.log, tag(p), msg) })
      return passTurn(st, st.log)
    }

    case 6: { // KING — trade hands
      if (st.protected[o]) {
        st = Object.assign({}, st, { log: push(st.log, 'sys', `The rival is protected — no trade.`) })
        return passTurn(st, st.log)
      }
      const nh = st.hands.map(h => h.slice())
      const tmp = nh[p]; nh[p] = nh[o]; nh[o] = tmp
      st = Object.assign({}, st, { hands: nh, log: push(st.log, tag(p), `${who(p)} trade${p === 0 ? '' : 's'} hands with the rival.`) })
      return passTurn(st, st.log)
    }

    case 3: { // BARON — compare hands; lower is out
      if (st.protected[o]) {
        st = Object.assign({}, st, { log: push(st.log, 'sys', `The rival is protected — the Baron finds no duel.`) })
        return passTurn(st, st.log)
      }
      const mine = st.hands[p][0] as CardValue, theirs = st.hands[o][0] as CardValue
      if (mine === theirs) {
        st = Object.assign({}, st, { log: push(st.log, 'sys', `The Baron duel ties — both stand.`) })
        return passTurn(st, st.log)
      }
      const loser: Player = mine < theirs ? p : o
      return eliminate(st, loser, `lost the Baron duel`, st.log)
    }

    case 1: { // GUARD — guess the rival's non-Guard card
      const g = opts.guardGuess
      if (st.protected[o] || g === undefined) {
        const note = st.protected[o] ? `the rival is protected` : `no target`
        st = Object.assign({}, st, { log: push(st.log, 'sys', `The Guard finds ${note}.`) })
        return passTurn(st, st.log)
      }
      st = Object.assign({}, st, { log: push(st.log, tag(p), `${who(p)} guess${p === 0 ? '' : 'es'} ${cardName(g)}.`) })
      if (st.hands[o][0] === g) return eliminate(st, o, `the Guard guessed right`, st.log)
      st = Object.assign({}, st, { log: push(st.log, 'sys', `Wrong — the rival does not hold the ${cardName(g)}.`) })
      return passTurn(st, st.log)
    }

    case 5: { // PRINCE — chosen player discards & redraws
      const t: Player = opts.princeTarget !== undefined ? opts.princeTarget : o
      if (t === o && st.protected[o]) {
        st = Object.assign({}, st, { log: push(st.log, 'sys', `The rival is protected — the Prince is rebuffed.`) })
        return passTurn(st, st.log)
      }
      const discarded = st.hands[t][0] as CardValue
      let nd = st.discards.concat([{ who: t, v: discarded }])
      st = Object.assign({}, st, { discards: nd, log: push(st.log, tag(p), `${who(p)} force${p === 0 ? '' : 's'} ${whoLow(t)} to discard the ${cardName(discarded)}.`) })
      if (discarded === 8) return eliminate(st, t, `discarded the Princess`, st.log)
      // redraw — from deck, or the set-aside card if empty (we approximate: if deck empty, draw nothing extra and keep them in with value 0 cannot happen; give a Guard fallback rarely)
      const deck = st.deck.slice()
      const nh = st.hands.map(h => h.slice())
      const drawn = deck.length ? deck.pop()! : (1 as CardValue)
      nh[t] = [drawn]
      st = Object.assign({}, st, { deck, hands: nh, log: push(st.log, 'sys', `${who(t)} draw${t === 0 ? '' : 's'} a fresh card.`) })
      return passTurn(st, st.log)
    }
  }
  return st
}

/* ===================== AI ===================== */

// Count how many of value v remain unseen from the rival's perspective (deck + your hidden hand).
function unseen(s: LoveLetterState, me: Player): Record<number, number> {
  const remaining: Record<number, number> = {}
  for (const k of Object.keys(CARDS)) remaining[Number(k)] = CARDS[Number(k) as CardValue].count
  // subtract everything the AI can see: discards + its own hand
  for (const d of s.discards) remaining[d.v]--
  for (const c of s.hands[me]) remaining[c]--
  return remaining
}

// Pick the most likely non-Guard value the opponent holds, for a Guard guess.
function bestGuardGuess(s: LoveLetterState, me: Player): CardValue {
  const rem = unseen(s, me)
  let best: CardValue = 5, bestN = -1
  for (let v = 2 as CardValue; v <= 8; v = (v + 1) as CardValue) {
    if (rem[v] > bestN) { bestN = rem[v]; best = v }
  }
  return best
}

// The AI plays its whole turn: choose a sensible legal card and resolve it.
export function aiTurn(s: LoveLetterState): LoveLetterState {
  if (s.winner !== null || s.roundOver || s.turn !== 1) return s
  const me: Player = 1
  const legal = legalPlays(s, me)
  if (!legal.length) return s
  if (legal.length === 1) {
    // forced (e.g. Countess rule). Provide sensible options just in case.
    return resolveAI(s, legal[0], me)
  }

  const h = s.hands[me]
  const high = Math.max(h[0], h[1]) as CardValue
  const low = Math.min(h[0], h[1]) as CardValue

  // Never play the Princess. Avoid forced Countess handled above.
  if (low === 8) return resolveAI(s, high, me)            // keep Princess, play the other
  if (high === 8) return resolveAI(s, low, me)

  const rem = unseen(s, me)
  const oppProtected = s.protected[opp(me)]

  // If holding the Countess with nothing forcing it, hold it (play the other card) unless that's risky.
  // Prefer Guard if we have a confident guess; prefer Baron if our other card is high.
  // Default heuristic: play the LOWER card to keep a strong card in hand, but make smart use of effects.

  // Guard: good when we can guess; guess best when one value is very likely.
  if (h.includes(1) && !oppProtected) {
    const guess = bestGuardGuess(s, me)
    if (rem[guess] >= 1) return resolveAI(s, 1, me, { guardGuess: guess })
  }
  // Baron: play only if our remaining card is strong (likely to win the duel).
  if (h.includes(3) && !oppProtected) {
    const keep = h[0] === 3 ? h[1] : h[0]
    if ((keep as number) >= 4) return resolveAI(s, 3, me)
  }
  // King: trade only if our other card is weak (we'd gain).
  if (h.includes(6)) {
    const keep = h[0] === 6 ? h[1] : h[0]
    if ((keep as number) <= 2 && !oppProtected) return resolveAI(s, 6, me)
  }
  // Prince: target the opponent (unless protected); never target self when holding Princess.
  if (h.includes(5) && !oppProtected) {
    return resolveAI(s, 5, me, { princeTarget: opp(me) })
  }
  // Priest: cheap info — fine to play the lower-value Priest.
  if (h.includes(2)) return resolveAI(s, 2, me)
  // Handmaid: protect when our other card is valuable.
  if (h.includes(4)) {
    const keep = h[0] === 4 ? h[1] : h[0]
    if ((keep as number) >= 5) return resolveAI(s, 4, me)
  }
  // Fallback: play the lower-value card, keeping the stronger one.
  return resolveAI(s, low, me)
}

// Apply an AI choice, supplying any required targeting.
function resolveAI(s: LoveLetterState, v: CardValue, me: Player, opts: PlayOpts = {}): LoveLetterState {
  if (v === 1 && opts.guardGuess === undefined && !s.protected[opp(me)]) {
    return play(s, v, { guardGuess: bestGuardGuess(s, me) })
  }
  if (v === 5 && opts.princeTarget === undefined) {
    return play(s, v, { princeTarget: opp(me) })
  }
  return play(s, v, opts)
}

// Start the next round after a round (not game) ends. Loser of the round starts next (or alternate).
export function nextRound(s: LoveLetterState): LoveLetterState {
  if (s.winner !== null) return s
  const starter: Player = s.roundWinner !== null ? s.roundWinner : 0   // round winner leads the next round
  return startRound(s.tokens, starter, s.log)
}
