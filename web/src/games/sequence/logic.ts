/* SEQUENCE — logic (built for this codebase, not ported).
   A 10x10 board where each cell shows a playing card. The 48 non-Jack cards each appear
   TWICE on the board (two decks laid out), and the 4 corners are FREE/wild cells counting
   for everyone. Two standard 52-card decks form the draw pile; each player holds 7 cards.
   On your turn: play a card from hand, drop YOUR chip on an empty board cell showing that
   card, then draw. JACKS: two-eyed (clubs/diamonds) are WILD (place anywhere empty);
   one-eyed (hearts/spades) REMOVE an opponent chip not part of a completed sequence.
   A SEQUENCE = 5 chips in a row (H/V/diagonal); corners count as everyone's color.
   First to TWO sequences wins. You are player 0, the AI is player 1. */

export type Player = 0 | 1
export type Suit = 'C' | 'D' | 'H' | 'S' // clubs diamonds hearts spades
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'
export interface Card { rank: Rank; suit: Suit }
/** A board cell is either a face card (with the card it shows) or the FREE corner. */
export type BoardCell = { free: true } | { free: false; card: Card }
export type Chip = Player | null
export interface LogEntry { t: string; x: string }

export const SIZE = 10
export const N = SIZE * SIZE

export interface SeqState {
  /** Fixed 10x10 layout of cards (and the 4 free corners). Never changes. length 100. */
  layout: BoardCell[]
  /** Chip owner per cell: 0, 1, or null (empty). Corners count as both but hold no chip. */
  chips: Chip[]
  /** Cells (indices) locked into a completed sequence, per player (cannot be removed). */
  locked: boolean[]
  /** Completed sequence count per player. */
  sequences: [number, number]
  /** The exact cell-runs of each completed sequence, for highlighting. */
  seqRuns: number[][]
  hands: [Card[], Card[]]
  deck: Card[]
  turn: Player
  winner: Player | null
  /** True when the game ended with no winner (deck exhausted + no legal moves, tied). */
  draw: boolean
  /** Monotonic counter — bumped on every state-advancing action so the AI driver re-arms. */
  step: number
  /** The last-played cell (for a brief highlight). */
  last: number | null
  log: LogEntry[]
}

const SUITS: Suit[] = ['C', 'D', 'H', 'S']
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Q', 'K', 'A'] // non-jack ranks (J handled separately)
const ALL_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

export const RED_SUITS = new Set<Suit>(['D', 'H'])
export const isJack = (c: Card) => c.rank === 'J'
/** Two-eyed jacks (clubs/diamonds) are WILD. */
export const isTwoEyedJack = (c: Card) => c.rank === 'J' && (c.suit === 'C' || c.suit === 'D')
/** One-eyed jacks (hearts/spades) REMOVE an opponent chip. */
export const isOneEyedJack = (c: Card) => c.rank === 'J' && (c.suit === 'H' || c.suit === 'S')

export const cardKey = (c: Card) => c.rank + c.suit
export const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit
export const CORNERS = [0, SIZE - 1, N - SIZE, N - 1]
const isCorner = (i: number) => i === 0 || i === SIZE - 1 || i === N - SIZE || i === N - 1

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }
const idx = (r: number, c: number) => r * SIZE + c
const inb = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE
const LINES = [[0, 1], [1, 0], [1, 1], [1, -1]]

/** A standard 104-card pool (two 52-card decks), in a fixed order. */
function twoDeckPool(): Card[] {
  const out: Card[] = []
  for (let d = 0; d < 2; d++)
    for (const s of SUITS)
      for (const r of ALL_RANKS)
        out.push({ rank: r, suit: s })
  return out
}

/** The 48 non-jack cards, each appearing twice = 96 cells, laid out in a stable snaking
 *  pattern, with the 4 corners as FREE cells. Fixed for every game. */
export function buildLayout(): BoardCell[] {
  // Build the 96-card sequence: every (suit,rank) non-jack card twice.
  const cards: Card[] = []
  for (let copy = 0; copy < 2; copy++)
    for (const s of SUITS)
      for (const r of RANKS)
        cards.push({ rank: r, suit: s })
  // cards.length === 96
  const cell: BoardCell[] = new Array(N)
  let p = 0
  for (let i = 0; i < N; i++) {
    if (isCorner(i)) { cell[i] = { free: true } }
    else { cell[i] = { free: false, card: cards[p++] }; }
  }
  return cell
}

export const boardLayout: BoardCell[] = buildLayout()

/** Mulberry32 — small deterministic PRNG so an optional seed gives a repeatable game. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface MakeOpts { deck?: Card[]; seed?: number }

/**
 * Start a game. Pass `optionalDeck` (a full ordered draw pile) for deterministic tests,
 * or a `seed` for a repeatable shuffle. With neither, the deck is randomly shuffled.
 */
export function makeGame(opts?: Card[] | MakeOpts): SeqState {
  let deck: Card[]
  if (Array.isArray(opts)) deck = opts.slice()
  else if (opts?.deck) deck = opts.deck.slice()
  else {
    const seed = opts?.seed != null ? opts.seed : ((Math.random() * 0xffffffff) >>> 0)
    deck = shuffle(twoDeckPool(), rng(seed))
  }
  const hands: [Card[], Card[]] = [[], []]
  // 7 cards each for a 2-player game.
  for (let k = 0; k < 7; k++) { hands[0].push(deck.shift()!); hands[1].push(deck.shift()!) }
  return {
    layout: boardLayout,
    chips: new Array(N).fill(null),
    locked: new Array(N).fill(false),
    sequences: [0, 0],
    seqRuns: [],
    hands,
    deck,
    turn: 0,
    winner: null,
    draw: false,
    step: 0,
    last: null,
    log: [{ t: 'sys', x: 'Play a card, drop a chip on a matching cell, draw. Five in a row is a sequence; two sequences win. Corners are wild for both players.' }],
  }
}

/** Whether a board cell is occupied (a real chip OR a free corner that counts for all). */
export function occupiedFor(s: SeqState, i: number, player: Player): boolean {
  if (isCorner(i)) return true // corners count for everyone
  return s.chips[i] === player
}

/** The two board cells whose card matches `card` (non-jacks). Empty cells only when `emptyOnly`. */
export function cellsForCard(card: Card): number[] {
  const out: number[] = []
  for (let i = 0; i < N; i++) {
    const cell = boardLayout[i]
    if (cell.free === false && sameCard(cell.card, card)) out.push(i)
  }
  return out
}

/**
 * The legal cells to play `card` onto for the current player.
 *  - two-eyed jack: every EMPTY non-corner cell (wild placement)
 *  - one-eyed jack: every opponent chip NOT locked in a completed sequence (removal targets)
 *  - normal card: its matching cells that are currently EMPTY
 */
export function legalCellsForCard(s: SeqState, card: Card, player: Player = s.turn): number[] {
  if (isTwoEyedJack(card)) {
    const out: number[] = []
    for (let i = 0; i < N; i++) if (!isCorner(i) && s.chips[i] == null) out.push(i)
    return out
  }
  if (isOneEyedJack(card)) {
    const opp: Player = player === 0 ? 1 : 0
    const out: number[] = []
    for (let i = 0; i < N; i++) if (!isCorner(i) && s.chips[i] === opp && !s.locked[i]) out.push(i)
    return out
  }
  return cellsForCard(card).filter(i => s.chips[i] == null)
}

/** A card is "dead" if it's a normal card whose two board cells are both occupied. */
export function isDeadCard(s: SeqState, card: Card): boolean {
  if (isJack(card)) return false
  return cellsForCard(card).every(i => s.chips[i] != null)
}

function handIndex(hand: Card[], card: Card): number {
  return hand.findIndex(c => sameCard(c, card))
}

/** Detect every 5-in-a-row of `player`'s chips (corners count). Returns runs as cell arrays. */
export function detectSequences(chips: Chip[], player: Player): number[][] {
  const occ = (i: number) => isCorner(i) || chips[i] === player
  const runs: number[][] = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    for (const [dr, dc] of LINES) {
      const run: number[] = []
      let rr = r, cc = c
      let ok = true
      for (let k = 0; k < 5; k++) {
        if (!inb(rr, cc) || !occ(idx(rr, cc))) { ok = false; break }
        run.push(idx(rr, cc))
        rr += dr; cc += dc
      }
      if (ok) runs.push(run)
    }
  }
  return runs
}

/**
 * Find new sequences for `player` given currently-locked cells. A new sequence may overlap an
 * already-completed one by AT MOST ONE shared cell. Returns the chosen new runs (greedy) plus
 * the set of cells to lock. We add runs one at a time, each sharing ≤1 cell with all locked.
 */
function findNewSequences(chips: Chip[], player: Player, alreadyLocked: boolean[]): number[][] {
  const candidates = detectSequences(chips, player)
  const chosen: number[][] = []
  // Track cells locked by THIS player's completed sequences (existing + newly chosen).
  const locked = new Set<number>()
  for (let i = 0; i < alreadyLocked.length; i++) if (alreadyLocked[i] && (isCorner(i) || chips[i] === player)) locked.add(i)
  for (const run of candidates) {
    const overlap = run.filter(i => locked.has(i)).length
    if (overlap <= 1) {
      chosen.push(run)
      for (const i of run) locked.add(i)
    }
  }
  return chosen
}

/** Re-evaluate sequences after a board change; lock cells, bump counts, set winner. */
function recompute(s: SeqState, player: Player): SeqState {
  const newRuns = findNewSequences(s.chips, player, s.locked)
  if (newRuns.length === 0) return s
  // Count how many of these are genuinely new (not already represented in seqRuns for player).
  const locked = s.locked.slice()
  const seqRuns = s.seqRuns.slice()
  let added = 0
  for (const run of newRuns) {
    // Is this run already a recorded sequence? compare as sorted key.
    const key = run.slice().sort((a, b) => a - b).join(',')
    const exists = seqRuns.some(r => r.slice().sort((a, b) => a - b).join(',') === key)
    if (exists) continue
    seqRuns.push(run)
    for (const i of run) locked[i] = true
    added++
  }
  if (added === 0) return s
  const sequences: [number, number] = [s.sequences[0], s.sequences[1]]
  sequences[player] += added
  let log = s.log
  let winner = s.winner
  const who = player === 0 ? 'You' : 'Rival'
  log = push(log, player === 0 ? 'you' : 'ai', `${who} completed a sequence (${sequences[player]}/2).`)
  if (sequences[player] >= 2) {
    winner = player
    log = push(log, player === 0 ? 'you' : 'ai', `${who === 'You' ? 'You win' : 'Rival wins'} with two sequences!`)
  }
  return { ...s, locked, seqRuns, sequences, winner, log }
}

/** Draw one card for `player` from the deck (no-op if empty). */
export function drawCard(s: SeqState, player: Player): SeqState {
  if (s.deck.length === 0) return s
  const deck = s.deck.slice()
  const card = deck.shift()!
  const hands: [Card[], Card[]] = [s.hands[0].slice(), s.hands[1].slice()]
  hands[player] = hands[player].concat([card])
  return { ...s, deck, hands }
}

/** Discard a dead card and draw a fresh one in its place. */
export function exchangeDead(s: SeqState, player: Player, card: Card): SeqState {
  if (!isDeadCard(s, card)) return s
  const hi = handIndex(s.hands[player], card)
  if (hi < 0) return s
  const hands: [Card[], Card[]] = [s.hands[0].slice(), s.hands[1].slice()]
  hands[player].splice(hi, 1)
  let ns: SeqState = { ...s, hands }
  ns = drawCard(ns, player)
  const who = player === 0 ? 'You' : 'Rival'
  ns = { ...ns, step: ns.step + 1, log: push(ns.log, 'sys', `${who} swapped a dead ${cardKey(card)}.`) }
  return ns
}

/** Remove an opponent chip with a one-eyed jack. `cell` must hold an unlocked opponent chip. */
export function removeChip(s: SeqState, player: Player, card: Card, cell: number): SeqState {
  if (s.winner != null || s.turn !== player) return s
  if (!isOneEyedJack(card)) return s
  const opp: Player = player === 0 ? 1 : 0
  if (isCorner(cell) || s.chips[cell] !== opp || s.locked[cell]) return s
  const hi = handIndex(s.hands[player], card)
  if (hi < 0) return s
  const chips = s.chips.slice()
  chips[cell] = null
  const hands: [Card[], Card[]] = [s.hands[0].slice(), s.hands[1].slice()]
  hands[player].splice(hi, 1)
  const who = player === 0 ? 'You' : 'Rival'
  let ns: SeqState = {
    ...s, chips, hands, last: cell, step: s.step + 1,
    log: push(s.log, player === 0 ? 'you' : 'ai', `${who} removed a chip with the ${cardKey(card)}.`),
  }
  ns = drawCard(ns, player)
  return endTurn(ns, player)
}

/**
 * Play a normal card or two-eyed jack onto `cell` (empty), placing the player's chip,
 * then draw and re-evaluate sequences. For one-eyed jacks, use removeChip instead.
 */
export function play(s: SeqState, player: Player, card: Card, cell: number): SeqState {
  if (s.winner != null || s.turn !== player) return s
  if (isOneEyedJack(card)) return removeChip(s, player, card, cell)
  const legal = legalCellsForCard(s, card, player)
  if (!legal.includes(cell)) return s
  const hi = handIndex(s.hands[player], card)
  if (hi < 0) return s
  const chips = s.chips.slice()
  chips[cell] = player
  const hands: [Card[], Card[]] = [s.hands[0].slice(), s.hands[1].slice()]
  hands[player].splice(hi, 1)
  const who = player === 0 ? 'You' : 'Rival'
  let ns: SeqState = {
    ...s, chips, hands, last: cell, step: s.step + 1,
    log: push(s.log, player === 0 ? 'you' : 'ai', `${who} placed a chip${isTwoEyedJack(card) ? ' (wild jack)' : ''}.`),
  }
  ns = recompute(ns, player)
  ns = drawCard(ns, player)
  if (ns.winner != null) return ns
  return endTurn(ns, player)
}

function endTurn(s: SeqState, player: Player): SeqState {
  if (s.winner != null || s.draw) return s
  const next: Player = player === 0 ? 1 : 0
  const ns: SeqState = { ...s, turn: next }
  return resolveIfStuck(ns)
}

// ===================== AI: heuristic placement =====================

const rowOf = (i: number) => Math.floor(i / SIZE)
const colOf = (i: number) => i % SIZE

/** For a hypothetical chip of `player` at cell `i`, the best line-threat value it creates.
 *  Scores by the longest contiguous run (with own chips/corners) and its open ends. */
function lineThreat(chips: Chip[], i: number, player: Player): number {
  const occ = (j: number) => isCorner(j) || chips[j] === player
  const r0 = rowOf(i), c0 = colOf(i)
  let total = 0
  for (const [dr, dc] of LINES) {
    let count = 1
    let openEnds = 0
    let r = r0 + dr, c = c0 + dc
    while (inb(r, c) && occ(idx(r, c))) { count++; r += dr; c += dc }
    if (inb(r, c) && chips[idx(r, c)] == null && !isCorner(idx(r, c))) openEnds++
    r = r0 - dr; c = c0 - dc
    while (inb(r, c) && occ(idx(r, c))) { count++; r -= dr; c -= dc }
    if (inb(r, c) && chips[idx(r, c)] == null && !isCorner(idx(r, c))) openEnds++
    total += patternValue(count, openEnds)
  }
  return total
}

function patternValue(count: number, open: number): number {
  if (count >= 5) return 1_000_000
  if (count === 4) return open >= 1 ? 50_000 : 3_000
  if (count === 3) return open === 2 ? 4_000 : open === 1 ? 600 : 80
  if (count === 2) return open === 2 ? 300 : open === 1 ? 60 : 10
  return open === 2 ? 18 : open === 1 ? 6 : 2
}

/** Would placing `player`'s chip at `i` complete a brand-new sequence? */
function completesSequence(chips: Chip[], locked: boolean[], i: number, player: Player): boolean {
  if (chips[i] != null || isCorner(i)) return false
  const nb = chips.slice(); nb[i] = player
  const runs = findNewSequences(nb, player, locked)
  // Was there any run through i that wasn't already lockable before?
  return runs.some(run => run.includes(i))
}

/**
 * One AI turn (player 1). Picks one card and plays it:
 *  1) take an immediate sequence completion if available
 *  2) one-eyed jack to break an opponent 4-in-a-row threat
 *  3) block the opponent's strongest placement
 *  4) otherwise the placement that maximizes own threat (centrality tie-break)
 *  5) two-eyed jack saved for high-value wild placements
 *  6) if only dead cards remain, swap one and end (turn passes).
 */
export function aiTurn(s: SeqState): SeqState {
  if (s.winner != null || s.turn !== 1) return s
  const me: Player = 1, opp: Player = 0
  const hand = s.hands[1]

  // Collect candidate placements: { card, cell, kind }.
  type Move = { card: Card; cell: number; score: number; remove?: boolean }
  const moves: Move[] = []

  // 1) immediate own-sequence completions (normal + two-eyed jack).
  for (const card of hand) {
    if (isOneEyedJack(card)) continue
    const cells = legalCellsForCard(s, card, me)
    for (const cell of cells) {
      if (completesSequence(s.chips, s.locked, cell, me)) {
        return play(s, me, card, cell) // take the win/sequence immediately
      }
    }
  }

  // 2) one-eyed jack: remove an opponent chip that's part of a 4-in-a-row threat.
  for (const card of hand) {
    if (!isOneEyedJack(card)) continue
    const targets = legalCellsForCard(s, card, me)
    let bestT = -1, bestTScore = -Infinity
    for (const cell of targets) {
      // value = how much opponent threat this chip currently contributes.
      const t = lineThreat(s.chips, cell, opp)
      if (t > bestTScore) { bestTScore = t; bestT = cell }
    }
    if (bestT >= 0 && bestTScore >= 50_000) {
      return removeChip(s, me, card, bestT)
    }
  }

  // 3) block: if opponent could complete a sequence next with some empty cell, occupy it.
  //    Scan empty non-corner cells the opponent could reach via any non-jack/wild placement.
  for (let i = 0; i < N; i++) {
    if (isCorner(i) || s.chips[i] != null) continue
    if (completesSequence(s.chips, s.locked, i, opp)) {
      // Can we place here? two-eyed jack always can; or a matching normal card.
      const wild = hand.find(c => isTwoEyedJack(c))
      const cell = boardLayout[i]
      const normal = cell.free === false
        ? hand.find(c => !isJack(c) && sameCard(c, cell.card))
        : undefined
      if (normal) return play(s, me, normal, i)
      if (wild) return play(s, me, wild, i)
    }
  }

  // 4) general placements: each playable normal card on each legal cell, scored.
  for (const card of hand) {
    if (isJack(card)) continue
    const cells = legalCellsForCard(s, card, me)
    for (const cell of cells) {
      const off = lineThreat(s.chips, cell, me)
      const def = lineThreat(s.chips, cell, opp)
      // centrality bonus — central cells join more lines.
      const cr = rowOf(cell), cc = colOf(cell)
      const central = -(Math.abs(cr - 4.5) + Math.abs(cc - 4.5))
      moves.push({ card, cell, score: off + def * 0.85 + central })
    }
  }

  if (moves.length > 0) {
    moves.sort((a, b) => b.score - a.score)
    const best = moves[0]
    // Only spend a wild jack when the best normal move is weak.
    if (best.score < 300) {
      const wild = hand.find(c => isTwoEyedJack(c))
      if (wild) {
        // place wild at the highest-threat empty cell.
        let bi = -1, bs = -Infinity
        for (let i = 0; i < N; i++) {
          if (isCorner(i) || s.chips[i] != null) continue
          const v = lineThreat(s.chips, i, me) + lineThreat(s.chips, i, opp) * 0.85
          if (v > bs) { bs = v; bi = i }
        }
        if (bi >= 0 && bs > best.score) return play(s, me, wild, bi)
      }
    }
    return play(s, me, best.card, best.cell)
  }

  // 5) No normal placement. Try a wild jack anywhere useful.
  const wild = hand.find(c => isTwoEyedJack(c))
  if (wild) {
    let bi = -1, bs = -Infinity
    for (let i = 0; i < N; i++) {
      if (isCorner(i) || s.chips[i] != null) continue
      const v = lineThreat(s.chips, i, me)
      if (v > bs) { bs = v; bi = i }
    }
    if (bi >= 0) return play(s, me, wild, bi)
  }
  // One-eyed jack with no high-value target: still use it to remove any opponent chip.
  const oneEyed = hand.find(c => isOneEyedJack(c))
  if (oneEyed) {
    const targets = legalCellsForCard(s, oneEyed, me)
    if (targets.length > 0) {
      let bestT = targets[0], bestTScore = -Infinity
      for (const cell of targets) {
        const t = lineThreat(s.chips, cell, opp)
        if (t > bestTScore) { bestTScore = t; bestT = cell }
      }
      return removeChip(s, me, oneEyed, bestT)
    }
  }

  // 6) Only dead cards remain — swap one and pass the turn.
  const dead = hand.find(c => isDeadCard(s, c))
  if (dead) {
    const swapped = exchangeDead(s, me, dead)
    return endTurn(swapped, me)
  }
  // Truly nothing (shouldn't happen): pass.
  return endTurn(s, me)
}

/** Convenience: current player's sequence count. */
export function sequenceCount(s: SeqState, p: Player): number { return s.sequences[p] }

/** Is the board completely full of chips (corners excluded)? */
export function boardFull(s: SeqState): boolean {
  for (let i = 0; i < N; i++) { if (!isCorner(i) && s.chips[i] == null) return false }
  return true
}

/**
 * Resolve a stalemate. The game is stuck once NEITHER player can make a move that ever
 * advances the board: a move exists only if a player has a legal placement/removal now, or
 * could draw into one (deck non-empty + holds a swappable dead card). If nobody can move,
 * the game ends — more sequences wins, an equal count is a draw. Idempotent.
 */
export function resolveIfStuck(s: SeqState): SeqState {
  if (s.winner != null || s.draw) return s
  // A player can act now if any card has a legal cell.
  const hasLegalNow = (p: Player) => s.hands[p].some(card => legalCellsForCard(s, card, p).length > 0)
  // A player might *become* able to act if the deck can still feed them a fresh card —
  // either they hold a dead card to swap, or (on their turn) they will draw after acting.
  // With the deck empty AND no legal move, that player is permanently stuck.
  const canProgress = (p: Player) => {
    if (hasLegalNow(p)) return true
    if (s.deck.length > 0 && s.hands[p].some(card => isDeadCard(s, card))) return true
    return false
  }
  if (canProgress(0) || canProgress(1)) return s
  const [a, b] = s.sequences
  if (a === b) return { ...s, draw: true } // genuine tie
  const winner: Player = a > b ? 0 : 1
  return { ...s, winner }
}
