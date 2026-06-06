/* HANABI — pure logic (built for this codebase, not ported).
   A COOPERATIVE firework game. You are player 0; players 1 and 2 are AI partners.
   Each player holds 5 cards FACING OUTWARD — they cannot see their own cards but can
   see everyone else's. On a turn you do ONE of: give a clue (spend a clue token, point
   to all of one player's cards of a chosen color or value), discard (regain a clue
   token, draw), or play a card (advances its color firework if it is the next ascending
   value, else it misfires and burns a fuse). The team shares 8 clue tokens and 3 fuses.
   The game ends on the third fuse, on a perfect 25, or one round after the deck empties.
   Score is the sum of the highest value reached in each color's firework (max 25). */

export const COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const
export type Color = (typeof COLORS)[number]
export type Value = 1 | 2 | 3 | 4 | 5

/** Standard per-color value distribution: three 1s, two each of 2/3/4, a single 5. */
export const VALUE_COUNTS: Value[] = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5]

export const NUM_PLAYERS = 3
export const HAND_SIZE = 5
export const MAX_CLUES = 8
export const MAX_FUSES = 3
export const PLAYER_NAMES = ['You', 'Iris', 'Juno']

export interface Card {
  id: number
  color: Color
  value: Value
}

/** What a player legitimately knows about one of their OWN held cards, from clues only. */
export interface Knowledge {
  /** Colors still possible for this card (a color clue collapses to one / eliminates one). */
  colors: Color[]
  /** Values still possible for this card. */
  values: Value[]
  /** True once a color clue has directly touched this card. */
  colorClued: boolean
  /** True once a value clue has directly touched this card. */
  valueClued: boolean
}

export interface HeldCard {
  card: Card
  known: Knowledge
}

export type Clue = { kind: 'color'; color: Color } | { kind: 'value'; value: Value }

export interface LogEntry {
  t: string
  x: string
}

export interface HanabiState {
  deck: Card[]
  hands: HeldCard[][]
  /** Highest value placed per color (0 = empty firework). */
  fireworks: Record<Color, number>
  clueTokens: number
  fuseTokens: number
  discard: Card[]
  turn: number
  /** Counts down once the deck empties: each player gets one final turn. null until armed. */
  finalRoundCounter: number | null
  gameOver: boolean
  /** Increments on every action so the multi-AI driver re-arms (see useAITurn tick). */
  step: number
  log: LogEntry[]
}

/* ---------------------------------------------------------------- deck + setup */

function freshKnowledge(): Knowledge {
  return {
    colors: [...COLORS],
    values: [1, 2, 3, 4, 5],
    colorClued: false,
    valueClued: false,
  }
}

/** Build the full 50-card deck (5 colors x the value distribution). */
export function buildDeck(): Card[] {
  const deck: Card[] = []
  let id = 0
  for (const color of COLORS) {
    for (const value of VALUE_COUNTS) {
      deck.push({ id: id++, color, value })
    }
  }
  return deck
}

/** Deterministic Fisher-Yates using a seeded LCG so tests can pin a deck. */
export function shuffle<T>(arr: T[], seed = 1): T[] {
  const out = arr.slice()
  let s = seed >>> 0 || 1
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/**
 * Create a new game. Pass an optional pre-arranged deck (full 50-card order) for
 * deterministic tests; otherwise a seeded shuffle is used. Cards are dealt from the
 * FRONT of the deck so a supplied deck's first 15 cards become the dealt hands.
 */
export function makeGame(optionalDeck?: Card[], seed = (Date.now() & 0xffff) || 1): HanabiState {
  const deck = optionalDeck ? optionalDeck.slice() : shuffle(buildDeck(), seed)
  const hands: HeldCard[][] = []
  for (let p = 0; p < NUM_PLAYERS; p++) {
    const hand: HeldCard[] = []
    for (let i = 0; i < HAND_SIZE; i++) {
      const card = deck.shift()!
      hand.push({ card, known: freshKnowledge() })
    }
    hands.push(hand)
  }
  const fireworks = {} as Record<Color, number>
  for (const c of COLORS) fireworks[c] = 0
  return {
    deck,
    hands,
    fireworks,
    clueTokens: MAX_CLUES,
    fuseTokens: MAX_FUSES,
    discard: [],
    turn: 0,
    finalRoundCounter: null,
    gameOver: false,
    step: 0,
    log: [{ t: 'sys', x: 'A new firework display begins.' }],
  }
}

/* ---------------------------------------------------------------- helpers */

export function score(s: HanabiState): number {
  let total = 0
  for (const c of COLORS) total += s.fireworks[c]
  return total
}

/** A card is playable iff it is the next ascending value for its color firework. */
export function isPlayable(s: HanabiState, card: Card): boolean {
  return s.fireworks[card.color] === card.value - 1
}

function clone(s: HanabiState): HanabiState {
  return {
    deck: s.deck.slice(),
    hands: s.hands.map((h) =>
      h.map((hc) => ({
        card: hc.card,
        known: {
          colors: hc.known.colors.slice(),
          values: hc.known.values.slice(),
          colorClued: hc.known.colorClued,
          valueClued: hc.known.valueClued,
        },
      })),
    ),
    fireworks: { ...s.fireworks },
    clueTokens: s.clueTokens,
    fuseTokens: s.fuseTokens,
    discard: s.discard.slice(),
    turn: s.turn,
    finalRoundCounter: s.finalRoundCounter,
    gameOver: s.gameOver,
    step: s.step,
    log: s.log.slice(),
  }
}

function log(s: HanabiState, t: string, x: string) {
  s.log = [...s.log, { t, x }]
  if (s.log.length > 60) s.log = s.log.slice(s.log.length - 60)
}

/** Advance to the next player; arm/decrement the final round once the deck is empty. */
function advanceTurn(s: HanabiState) {
  if (s.finalRoundCounter != null) {
    s.finalRoundCounter -= 1
    if (s.finalRoundCounter <= 0) {
      s.gameOver = true
      log(s, 'sys', `Final round complete — the display ends at ${score(s)} of 25.`)
    }
  } else if (s.deck.length === 0 && s.finalRoundCounter == null) {
    // Deck just emptied: every player (including the one who emptied it had already
    // drawn) gets exactly one more turn. Arm the counter to NUM_PLAYERS turns.
    s.finalRoundCounter = NUM_PLAYERS
    log(s, 'sys', 'The deck is empty — one final round.')
  }
  s.turn = (s.turn + 1) % NUM_PLAYERS
  s.step += 1
}

function checkPerfect(s: HanabiState) {
  if (score(s) === 25) {
    s.gameOver = true
    log(s, 'good', 'A perfect display — 25 of 25!')
  }
}

/** Draw a replacement card into a player's hand at the slot the played/discarded card left. */
function drawInto(s: HanabiState, player: number, handIndex: number) {
  if (s.deck.length === 0) {
    // No card to draw: the hand simply shrinks (slot removed).
    s.hands[player].splice(handIndex, 1)
    return
  }
  const card = s.deck.shift()!
  s.hands[player][handIndex] = { card, known: freshKnowledge() }
}

/* ---------------------------------------------------------------- actions */

/**
 * Give a clue from one player to another about a single color or value. Marks ALL of
 * the recipient's matching cards (collapsing their possibilities) AND records the
 * negative information on the non-matching cards (a clue is about every card). Spends
 * one clue token. Throws if no clue tokens, if clue points to self, or if the clue
 * matches none of the recipient's cards (illegal in Hanabi).
 */
export function giveClue(state: HanabiState, fromPlayer: number, toPlayer: number, clue: Clue): HanabiState {
  if (state.gameOver) return state
  const s = clone(state)
  if (s.clueTokens <= 0) throw new Error('no clue tokens')
  if (fromPlayer === toPlayer) throw new Error('cannot clue yourself')
  const hand = s.hands[toPlayer]
  const matches = hand.filter((hc) =>
    clue.kind === 'color' ? hc.card.color === clue.color : hc.card.value === clue.value,
  )
  if (matches.length === 0) throw new Error('clue must match at least one card')

  for (const hc of hand) {
    const isMatch = clue.kind === 'color' ? hc.card.color === clue.color : hc.card.value === clue.value
    if (clue.kind === 'color') {
      if (isMatch) {
        hc.known.colors = [clue.color]
        hc.known.colorClued = true
      } else {
        hc.known.colors = hc.known.colors.filter((c) => c !== clue.color)
      }
    } else {
      if (isMatch) {
        hc.known.values = [clue.value]
        hc.known.valueClued = true
      } else {
        hc.known.values = hc.known.values.filter((v) => v !== clue.value)
      }
    }
  }

  s.clueTokens -= 1
  const what = clue.kind === 'color' ? clue.color : String(clue.value)
  log(
    s,
    'clue',
    `${PLAYER_NAMES[fromPlayer]} tells ${PLAYER_NAMES[toPlayer]}: ${matches.length} ${what}${
      clue.kind === 'value' ? 's' : ''
    }.`,
  )
  advanceTurn(s)
  return s
}

/** Discard a card: regain a clue token (capped at 8), add to discard, draw a replacement. */
export function discard(state: HanabiState, player: number, handIndex: number): HanabiState {
  if (state.gameOver) return state
  const s = clone(state)
  const hc = s.hands[player][handIndex]
  if (hc == null) throw new Error('no card at that slot')
  s.discard.push(hc.card)
  if (s.clueTokens < MAX_CLUES) s.clueTokens += 1
  log(s, 'discard', `${PLAYER_NAMES[player]} discards a ${hc.card.color} ${hc.card.value}.`)
  drawInto(s, player, handIndex)
  advanceTurn(s)
  return s
}

/**
 * Play a card. If it is the next ascending value for its color, the firework advances
 * (completing a stack of 5 regains a clue token). Otherwise it misfires: burn a fuse and
 * discard the card. Either way the slot is refilled from the deck. Third fuse ends the
 * game; a completed display (25) ends the game.
 */
export function playCard(state: HanabiState, player: number, handIndex: number): HanabiState {
  if (state.gameOver) return state
  const s = clone(state)
  const hc = s.hands[player][handIndex]
  if (hc == null) throw new Error('no card at that slot')
  const card = hc.card

  if (isPlayable(s, card)) {
    s.fireworks[card.color] = card.value
    log(s, 'play', `${PLAYER_NAMES[player]} plays the ${card.color} ${card.value}.`)
    if (card.value === 5 && s.clueTokens < MAX_CLUES) {
      s.clueTokens += 1
      log(s, 'good', `${card.color} firework complete — a clue token returns.`)
    }
    drawInto(s, player, handIndex)
    checkPerfect(s)
    if (!s.gameOver) advanceTurn(s)
    else s.step += 1
    return s
  }

  // Misfire.
  s.discard.push(card)
  s.fuseTokens -= 1
  log(s, 'fuse', `${PLAYER_NAMES[player]} misfires the ${card.color} ${card.value} — a fuse burns.`)
  drawInto(s, player, handIndex)
  if (s.fuseTokens <= 0) {
    s.gameOver = true
    log(s, 'fuse', 'The third fuse is gone — the display ends.')
    s.step += 1
    return s
  }
  advanceTurn(s)
  return s
}

/* ---------------------------------------------------------------- AI */

/**
 * Cooperative AI for one player, acting ONLY on information it legitimately holds:
 *   - its own per-card clue knowledge (s.hands[player][i].known), and
 *   - the actual cards in every OTHER player's hand (which it can see, but its own it cannot).
 * It NEVER inspects its own true card identities. Priorities:
 *   1) play a card it knows (from clues) is currently playable;
 *   2) if clue tokens remain, give the most useful clue — point at a playable card in a
 *      partner's hand by an attribute that isn't already fully clued there;
 *   3) discard the least useful card it holds (prefer one whose duplicates are still live).
 * Always returns a legal move so self-play cannot deadlock.
 */
export function aiTurn(state: HanabiState): HanabiState {
  if (state.gameOver) return state
  const player = state.turn
  const hand = state.hands[player]

  // (1) Play a card KNOWN to be playable purely from clue knowledge.
  const playIdx = findKnownPlayable(state, player)
  if (playIdx != null) return playCard(state, player, playIdx)

  // (2) Give a useful clue if tokens remain.
  if (state.clueTokens > 0) {
    const clueMove = findUsefulClue(state, player)
    if (clueMove != null) return giveClue(state, player, clueMove.to, clueMove.clue)
  }

  // (3) Discard (only legal if it would not waste a clue we could spend — but we may be
  // capped at 8 clues with no useful clue, in which case discarding is the fallback).
  // If discarding is impossible because clues are full AND a (any) clue exists, give it.
  if (state.clueTokens >= MAX_CLUES) {
    const anyClue = findAnyLegalClue(state, player)
    if (anyClue != null) return giveClue(state, player, anyClue.to, anyClue.clue)
  }
  if (hand.length > 0) {
    const discardIdx = findDiscardIndex(state, player)
    return discard(state, player, discardIdx)
  }

  // Degenerate fallback (empty hand on the deck-out final round): pass via a forced clue
  // if possible, else end. Should be unreachable under normal flow.
  const anyClue = findAnyLegalClue(state, player)
  if (anyClue != null && state.clueTokens > 0) return giveClue(state, player, anyClue.to, anyClue.clue)
  const s = clone(state)
  advanceTurn(s)
  return s
}

/** Index of a card whose clue knowledge proves it is currently playable, or null. */
function findKnownPlayable(s: HanabiState, player: number): number | null {
  const hand = s.hands[player]
  for (let i = 0; i < hand.length; i++) {
    const k = hand[i].known
    // Fully determined: exactly one color and one value the clues allow.
    if (k.colors.length === 1 && k.values.length === 1) {
      if (s.fireworks[k.colors[0]] === k.values[0] - 1) return i
    } else if (k.values.length === 1 && k.colorClued) {
      // Value pinned and at least one color clue narrowed colors: playable iff EVERY
      // remaining possible color needs exactly this value next.
      const v = k.values[0]
      if (k.colors.every((c) => s.fireworks[c] === v - 1)) return i
    } else if (k.colors.length === 1 && k.valueClued) {
      const c = k.colors[0]
      if (k.values.every((v) => s.fireworks[c] === v - 1)) return i
    }
  }
  return null
}

interface ClueMove {
  to: number
  clue: Clue
}

/** Find a clue that touches a partner's currently-playable card with NEW information. */
function findUsefulClue(s: HanabiState, player: number): ClueMove | null {
  for (let off = 1; off < NUM_PLAYERS; off++) {
    const to = (player + off) % NUM_PLAYERS
    const hand = s.hands[to]
    for (let i = 0; i < hand.length; i++) {
      const hc = hand[i]
      if (!isPlayable(s, hc.card)) continue
      // Prefer the clue that pins the card most. If value not yet clued, clue value;
      // else clue color. Either way it must match (it does — it's this card's attribute).
      if (!hc.known.valueClued) {
        return { to, clue: { kind: 'value', value: hc.card.value } }
      }
      if (!hc.known.colorClued) {
        return { to, clue: { kind: 'color', color: hc.card.color } }
      }
    }
  }
  return null
}

/** Any legal clue at all (matches >=1 card of a partner). Used as a last resort. */
function findAnyLegalClue(s: HanabiState, player: number): ClueMove | null {
  for (let off = 1; off < NUM_PLAYERS; off++) {
    const to = (player + off) % NUM_PLAYERS
    const hand = s.hands[to]
    if (hand.length === 0) continue
    return { to, clue: { kind: 'value', value: hand[0].card.value } }
  }
  return null
}

/**
 * Pick which of the AI's OWN cards to discard, using only legitimate info: clue knowledge
 * about its own cards. Prefer a card the clues show is already-dead (its color firework is
 * past every possible value), else the oldest fully-unclued card (classic "chop"), else 0.
 */
function findDiscardIndex(s: HanabiState, player: number): number {
  const hand = s.hands[player]
  // Dead card: every possible (color,value) the clues allow is already on the firework
  // or otherwise unplayable forever (value <= current firework height for that color).
  for (let i = 0; i < hand.length; i++) {
    const k = hand[i].known
    const dead = k.colors.every((c) => k.values.every((v) => s.fireworks[c] >= v))
    if (dead) return i
  }
  // Oldest fully-unclued card (the conventional chop = highest index here, newest is 0
  // after draws shift). We draw into the freed slot, so treat the LAST unclued slot as chop.
  for (let i = hand.length - 1; i >= 0; i--) {
    const k = hand[i].known
    if (!k.colorClued && !k.valueClued) return i
  }
  return hand.length - 1
}
