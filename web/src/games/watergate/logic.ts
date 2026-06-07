/* WATERGATE — pure logic (built for this codebase, not ported).
   A 2-player asymmetric tug-of-war. You are the EDITOR (Washington Post, player 0),
   the AI is NIXON's administration (player 1).

   A central TUG TRACK runs from -TRACK (Nixon's end) through 0 (center) to +TRACK
   (the Editor's end). On it sit tokens:
     - one MOMENTUM token (the administration's narrative),
     - two INFORMANT tokens, and
     - several EVIDENCE tokens.
   Editor pulls tokens toward + ; Nixon pushes toward - .

   Each round both players draw a HAND of cards. A card has a VALUE (power) and an
   EVENT (special effect). On your turn you PLAY one card EITHER for its VALUE (move
   chosen tokens toward your side by the card's power) OR for its EVENT.

   WIN:
     EDITOR  — complete TWO links: pull TWO evidence tokens fully to the Editor end
               (a token at +TRACK is "linked" — informant→evidence→Nixon connected).
     NIXON   — pull the MOMENTUM token fully to his end (-TRACK),
               OR survive ROUNDS rounds (the deck / round track runs out).

   Immutable updates, no DOM, deterministic deck available for tests. */

export const TRACK = 6            // track half-width: positions run -TRACK..+TRACK
export const LINK_AT = 3          // an evidence token is "linked" once pulled to +LINK_AT
export const ROUNDS = 5           // Nixon survives if this many rounds elapse
export const HAND_SIZE = 5
export const LINKS_TO_WIN = 2     // editor needs this many evidence tokens at +LINK_AT
export const N_EVIDENCE = 4
export const N_INFORMANT = 2

export type Player = 0 | 1        // 0 = EDITOR (you), 1 = NIXON (ai)
export const EDITOR: Player = 0
export const NIXON: Player = 1

export type TokenKind = 'momentum' | 'evidence' | 'informant'

export interface Token {
  id: string
  kind: TokenKind
  pos: number        // -TRACK..+TRACK ; + is editor side, - is nixon side
}

export type EventKind =
  | 'surge'      // move momentum 2 extra toward the player's side
  | 'shred'      // (nixon flavor) shove the most-advanced evidence 2 toward nixon
  | 'subpoena'   // (editor flavor) pull every evidence 1 toward editor
  | 'recount'    // reset momentum toward center by 2 (toward 0)
  | 'draw2'      // draw 2 extra cards into your hand

export interface Card {
  id: number
  value: number      // power, 1..5
  event: EventKind
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface WatergateState {
  tokens: Token[]
  hands: Record<Player, Card[]>
  decks: Record<Player, Card[]>      // per-player draw pile (top = end)
  discards: Record<Player, Card[]>
  round: number                      // 1-based
  turn: Player | null
  you: Player                        // always EDITOR here
  winner: Player | null
  log: LogEntry[]
}

const EVENT_LABEL: Record<EventKind, string> = {
  surge: 'Surge', shred: 'Shred', subpoena: 'Subpoena', recount: 'Recount', draw2: 'Source Tip',
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

// Build a full per-player record (avoids computed-key literals widening to a partial type).
function rec<T>(editorVal: T, nixonVal: T): Record<Player, T> {
  return { 0: editorVal, 1: nixonVal }
}

const clamp = (n: number) => Math.max(-TRACK, Math.min(TRACK, n))
const other = (p: Player): Player => (p === EDITOR ? NIXON : EDITOR)
const NAME = (p: Player) => (p === EDITOR ? 'The Post' : "Nixon's people")

// ===== deck =====

const EVENTS: EventKind[] = ['surge', 'shred', 'subpoena', 'recount', 'draw2']

// A deterministic but varied deck of cards (used per player when no deck supplied).
export function buildDeck(seedOffset = 0): Card[] {
  const cards: Card[] = []
  let id = seedOffset * 1000
  // 18 cards: values cycle 1..5, events cycle through the list.
  for (let i = 0; i < 18; i++) {
    const value = (i % 5) + 1
    const event = EVENTS[(i + seedOffset) % EVENTS.length]
    cards.push({ id: id++, value, event })
  }
  return cards
}

function shuffle<T>(a: T[]): T[] {
  const arr = a.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function initialTokens(): Token[] {
  const toks: Token[] = []
  toks.push({ id: 'M', kind: 'momentum', pos: 0 })
  for (let i = 0; i < N_INFORMANT; i++) toks.push({ id: 'I' + i, kind: 'informant', pos: 1 })
  for (let i = 0; i < N_EVIDENCE; i++) toks.push({ id: 'E' + i, kind: 'evidence', pos: 0 })
  return toks
}

/** makeGame(optionalDeck?) — if a deck is passed it is used for BOTH players' draw piles
    (deterministic ordering, top = end of array) so tests are reproducible. */
export function makeGame(optionalDeck?: Card[]): WatergateState {
  const editorDeck = optionalDeck ? optionalDeck.slice() : shuffle(buildDeck(0))
  const nixonDeck = optionalDeck ? optionalDeck.slice() : shuffle(buildDeck(2))

  const eHand = editorDeck.slice(editorDeck.length - HAND_SIZE)
  const eRest = editorDeck.slice(0, editorDeck.length - HAND_SIZE)
  const nHand = nixonDeck.slice(nixonDeck.length - HAND_SIZE)
  const nRest = nixonDeck.slice(0, nixonDeck.length - HAND_SIZE)

  return {
    tokens: initialTokens(),
    hands: rec(eHand, nHand),
    decks: rec(eRest, nRest),
    discards: rec<Card[]>([], []),
    round: 1,
    turn: EDITOR,
    you: EDITOR,
    winner: null,
    log: [{ t: 'sys', x: 'Round 1 — the Post moves first. Pull evidence to your side; deny Nixon his momentum.' }],
  }
}

// ===== token helpers =====

export function token(s: WatergateState, id: string): Token | undefined {
  return s.tokens.find((t) => t.id === id)
}
export function momentum(s: WatergateState): Token {
  return s.tokens.find((t) => t.kind === 'momentum')!
}
export function evidenceTokens(s: WatergateState): Token[] {
  return s.tokens.filter((t) => t.kind === 'evidence')
}
export function informantTokens(s: WatergateState): Token[] {
  return s.tokens.filter((t) => t.kind === 'informant')
}

/** A "link" = an evidence token pulled to the editor's link threshold (+LINK_AT). */
export function linkCount(s: WatergateState): number {
  return evidenceTokens(s).filter((t) => t.pos >= LINK_AT).length
}

// directional sign for a player's side: editor pulls toward +, nixon toward -.
const sideSign = (p: Player) => (p === EDITOR ? 1 : -1)

function setTokenPos(tokens: Token[], id: string, pos: number): Token[] {
  return tokens.map((t) => (t.id === id ? { ...t, pos: clamp(pos) } : t))
}
// Evidence floor: once the Post has surfaced evidence past center, Nixon can stall it
// but never bury it back below center (0). So a negative push on evidence stops at 0.
function nudge(tokens: Token[], id: string, delta: number): Token[] {
  const t = tokens.find((x) => x.id === id)
  if (!t) return tokens
  let target = t.pos + delta
  if (t.kind === 'evidence' && delta < 0 && t.pos >= 0 && target < 0) target = 0
  return setTokenPos(tokens, id, target)
}

// Which tokens can a given player legally move with a VALUE play?
//   Editor moves evidence + informants (pulls them toward +).
//   Nixon moves the momentum token (toward -) and may shove evidence toward - too.
export function movableTokens(s: WatergateState, p: Player): Token[] {
  if (p === EDITOR) return s.tokens.filter((t) => t.kind === 'evidence' || t.kind === 'informant')
  return s.tokens.filter((t) => t.kind === 'momentum' || t.kind === 'evidence')
}

// ===== win checks =====

export function checkLinks(s: WatergateState): boolean {
  return linkCount(s) >= LINKS_TO_WIN
}
export function checkMomentum(s: WatergateState): boolean {
  return momentum(s).pos <= -TRACK
}

// Evaluate win conditions, returning a possibly-updated state (winner set + log).
function evaluate(s: WatergateState, log: LogEntry[]): WatergateState {
  if (checkLinks(s)) {
    return { ...s, winner: EDITOR, turn: null, log: push(log, 'you', 'Two links complete — the story runs. The Post wins.') }
  }
  if (checkMomentum(s)) {
    return { ...s, winner: NIXON, turn: null, log: push(log, 'ai', 'Momentum reaches the wall — the administration buries it. Nixon wins.') }
  }
  return { ...s, log }
}

// ===== card / hand helpers =====

function removeFromHand(hand: Card[], id: number): Card[] {
  return hand.filter((c) => c.id !== id)
}

export interface Play { id: number; kind: 'value' | 'event' }

// Every card in hand can be played either as VALUE or as EVENT.
export function legalPlays(s: WatergateState, player: Player): Play[] {
  if (s.winner != null || s.turn !== player) return []
  const out: Play[] = []
  for (const c of s.hands[player]) {
    out.push({ id: c.id, kind: 'value' })
    out.push({ id: c.id, kind: 'event' })
  }
  return out
}

// After a player acts, advance the turn. If the acting player's hand is now empty
// AND the opponent's is too, the round ends.
function afterAction(s: WatergateState, p: Player, log: LogEntry[]): WatergateState {
  const evaluated = evaluate(s, log)
  if (evaluated.winner != null) return evaluated

  const both = evaluated.hands[EDITOR].length === 0 && evaluated.hands[NIXON].length === 0
  if (both) return endRound({ ...evaluated, turn: other(p) })

  // pass turn to opponent if they still have cards, else keep acting player going.
  let next = other(p)
  if (evaluated.hands[next].length === 0) next = p
  return { ...evaluated, turn: next }
}

// ===== actions =====

/** Play a card's VALUE: move the chosen tokens toward the player's side by the card's
    power, distributed across tokenChoices (defaults to applying the full power to the
    first legal token). Each entry: { id, amount } summing to <= card.value. */
export function playValue(
  s: WatergateState,
  player: Player,
  cardId: number,
  tokenChoices?: { id: string; amount: number }[],
): WatergateState {
  if (s.winner != null || s.turn !== player) return s
  const card = s.hands[player].find((c) => c.id === cardId)
  if (!card) return s

  const movable = new Set(movableTokens(s, player).map((t) => t.id))
  let choices = tokenChoices
  if (!choices || choices.length === 0) {
    // default: dump the full power onto the first movable token (momentum for nixon,
    // the most-advanced evidence for editor).
    const target =
      player === NIXON
        ? momentum(s).id
        : (movableTokens(s, player).slice().sort((a, b) => b.pos - a.pos)[0]?.id ?? momentum(s).id)
    choices = [{ id: target, amount: card.value }]
  }

  // validate: only movable tokens, non-negative amounts, total power not exceeded.
  let total = 0
  for (const ch of choices) {
    if (!movable.has(ch.id)) return s
    if (ch.amount < 0) return s
    total += ch.amount
  }
  if (total > card.value) return s

  const sign = sideSign(player)
  let tokens = s.tokens
  let pressure = false
  for (const ch of choices) {
    if (ch.amount === 0) continue
    tokens = nudge(tokens, ch.id, sign * ch.amount)
    // Public-pressure bias: when the EDITOR advances an evidence/informant token, the
    // mounting story also drags MOMENTUM 1 step back toward the Post. This is the
    // asymmetric counterweight to Nixon getting to both race momentum AND block.
    if (player === EDITOR && ch.id !== 'M') pressure = true
  }
  if (pressure) tokens = nudge(tokens, 'M', +1)

  const hands = { ...s.hands, [player]: removeFromHand(s.hands[player], cardId) }
  const discards = { ...s.discards, [player]: s.discards[player].concat([card]) }
  const verb = player === EDITOR ? 'pulls' : 'shoves'
  const log = push(
    s.log,
    player === EDITOR ? 'you' : 'ai',
    `${NAME(player)} ${verb} with a ${card.value} (${total} power)${pressure ? ' — momentum slips back' : ''}.`,
  )
  return afterAction({ ...s, tokens, hands, discards }, player, log)
}

/** Play a card's EVENT. */
export function playEvent(s: WatergateState, player: Player, cardId: number): WatergateState {
  if (s.winner != null || s.turn !== player) return s
  const card = s.hands[player].find((c) => c.id === cardId)
  if (!card) return s

  let tokens = s.tokens
  let hands = { ...s.hands, [player]: removeFromHand(s.hands[player], cardId) }
  let decks = s.decks
  const sign = sideSign(player)

  switch (card.event) {
    case 'surge':
      // shove momentum 2 toward the player's side
      tokens = nudge(tokens, 'M', sign * 2)
      break
    case 'shred': {
      // shove the most-advanced (toward editor) evidence 2 toward nixon's side
      const ev = evidenceTokens({ ...s, tokens }).slice().sort((a, b) => b.pos - a.pos)[0]
      if (ev) tokens = nudge(tokens, ev.id, -2)
      break
    }
    case 'subpoena':
      // pull EVERY evidence token 1 toward the editor
      for (const ev of evidenceTokens({ ...s, tokens })) tokens = nudge(tokens, ev.id, +1)
      break
    case 'recount': {
      // pull momentum 2 back toward center (0)
      const m = momentum({ ...s, tokens })
      const step = m.pos > 0 ? -2 : m.pos < 0 ? 2 : 0
      tokens = nudge(tokens, 'M', step)
      break
    }
    case 'draw2': {
      const deck = decks[player].slice()
      const drawn: Card[] = []
      for (let k = 0; k < 2 && deck.length; k++) drawn.push(deck.pop()!)
      hands = { ...hands, [player]: hands[player].concat(drawn) }
      decks = { ...decks, [player]: deck }
      break
    }
  }

  const discards = { ...s.discards, [player]: s.discards[player].concat([card]) }
  const log = push(
    s.log,
    player === EDITOR ? 'you' : 'ai',
    `${NAME(player)} plays ${EVENT_LABEL[card.event]}.`,
  )
  return afterAction({ ...s, tokens, hands, decks, discards }, player, log)
}

/** End the current round: discard remaining hands, deal new ones, advance round.
    If the round track is exhausted (round > ROUNDS) Nixon survives and wins. */
export function endRound(s: WatergateState): WatergateState {
  if (s.winner != null) return s

  // sweep any leftover cards into discards
  let discards: Record<Player, Card[]> = rec(
    s.discards[EDITOR].concat(s.hands[EDITOR]),
    s.discards[NIXON].concat(s.hands[NIXON]),
  )

  const nextRound = s.round + 1
  if (nextRound > ROUNDS) {
    // Nixon survived the full round track.
    const log = push(s.log, 'ai', `Round ${ROUNDS} closes with the story unproven — Nixon survives and wins.`)
    return { ...s, discards, hands: rec<Card[]>([], []), turn: null, winner: NIXON, log }
  }

  // deal new hands, reshuffling from discards if a deck runs short.
  const deal = (p: Player, decks: Record<Player, Card[]>) => {
    let deck = decks[p].slice()
    if (deck.length < HAND_SIZE) {
      deck = shuffle(discards[p]).concat(deck)
      discards = { ...discards, [p]: [] }
    }
    const hand = deck.slice(deck.length - HAND_SIZE)
    const rest = deck.slice(0, deck.length - HAND_SIZE)
    return { hand, rest }
  }

  const eDeal = deal(EDITOR, s.decks)
  const nDeal = deal(NIXON, s.decks)
  const log = push(s.log, 'sys', `Round ${nextRound} — fresh hands dealt.`)
  return {
    ...s,
    hands: rec(eDeal.hand, nDeal.hand),
    decks: rec(eDeal.rest, nDeal.rest),
    discards,
    round: nextRound,
    turn: EDITOR,
    log,
  }
}

// ===== AI (Nixon) — heuristic, fast =====
// Nixon balances pushing MOMENTUM toward his wall against BLOCKING the editor's most
// advanced evidence. He weighs each card's value-play and its event, then picks the best.

interface AIOption {
  score: number
  apply: (st: WatergateState) => WatergateState
}

export function aiTurn(s: WatergateState): WatergateState {
  if (s.winner != null || s.turn !== NIXON) return s
  const p = NIXON
  const hand = s.hands[p]
  if (hand.length === 0) {
    // nothing to do — let the turn machinery move on (should not normally happen)
    return afterAction(s, p, s.log)
  }

  const m = momentum(s)
  const topEvidence = evidenceTokens(s).slice().sort((a, b) => b.pos - a.pos)[0]
  const evidenceThreat = topEvidence ? topEvidence.pos : -TRACK
  const momentumGap = m.pos - -TRACK // distance momentum still must travel to Nixon's wall

  const options: AIOption[] = []

  for (const c of hand) {
    // --- VALUE play option(s) ---
    // Option A: push momentum toward the wall.
    {
      const after = momentum(playValue(s, p, c.id, [{ id: 'M', amount: c.value }])).pos
      const progress = m.pos - after // positive = moved toward nixon wall
      let sc = progress * 3
      if (after <= -TRACK) sc += 100 // winning move
      // value momentum more when the gap is small (close to winning)
      if (momentumGap <= c.value) sc += 20
      options.push({ score: sc, apply: (st) => playValue(st, p, c.id, [{ id: 'M', amount: c.value }]) })
    }
    // Option B: shove the most-advanced evidence back (block the editor).
    if (topEvidence) {
      const sc = evidenceThreat * 2.2 + c.value // higher threat (closer to +) => more urgent
      const tid = topEvidence.id
      options.push({ score: sc, apply: (st) => playValue(st, p, c.id, [{ id: tid, amount: c.value }]) })
    }

    // --- EVENT option ---
    let evScore = -1
    switch (c.event) {
      case 'surge':
        evScore = momentumGap <= 2 ? 60 : 6 // momentum +2 toward wall
        break
      case 'shred':
        evScore = topEvidence ? evidenceThreat * 2 + 4 : -1 // block strongest evidence by 2
        break
      case 'recount':
        // pulls momentum toward center — bad for nixon, skip
        evScore = -1
        break
      case 'subpoena':
        // editor-flavored; for nixon it would HELP the editor, never use
        evScore = -1
        break
      case 'draw2':
        evScore = 3 // more options next, mild
        break
    }
    options.push({ score: evScore, apply: (st) => playEvent(st, p, c.id) })
  }

  options.sort((a, b) => b.score - a.score)
  const best = options[0]
  const next = best.apply(s)
  // guard: if the chosen apply somehow was a no-op, fall back to playing first card's value on momentum.
  if (next === s) return playValue(s, p, hand[0].id, [{ id: 'M', amount: hand[0].value }])
  return next
}

// public alias matching the spec name
export const winner = (s: WatergateState): Player | null => s.winner
