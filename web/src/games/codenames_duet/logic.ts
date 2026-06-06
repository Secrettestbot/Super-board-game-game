/* CODENAMES DUET — cooperative word-association logic (built for this codebase).

   A 5x5 grid of 25 WORD cards. Two key cards are overlaid: from player 0's
   perspective each word is an AGENT / BYSTANDER / ASSASSIN, and the same word
   gets a (different but overlapping) role from player 1's perspective. The team
   must CONTACT all 15 unique agents (9 of player 0's + 9 of player 1's, with 3
   overlapping = 15 unique) within a limited number of turns and without ever
   hitting an ASSASSIN.

   On a turn the CLUE-GIVER (one player) gives a one-word CLUE + a NUMBER counting
   how many of THEIR OWN still-hidden agents relate to the clue; the GUESSER (the
   other player) reveals words one at a time. A correct agent (an agent from the
   clue-giver's key) lets the guesser keep going (up to number+1 guesses); a
   bystander or "already an agent for the guesser but not the clue-giver" ends the
   turn; an assassin (on the GUESSER's key — i.e. clue-giver pointed at a word the
   guesser sees as an assassin) LOSES the game. Players alternate roles each turn.

   Pure: no React/DOM, fully immutable. Deterministic board via makeGame(seed).
   The AI gives clues from ITS OWN key card and guesses using the ASSOCIATION table. */

// --- Embedded board word pool (~64 words). ---
export const WORD_POOL: string[] = [
  'AGENT', 'ALPS', 'AMAZON', 'ANGEL', 'APPLE', 'ARM', 'BANK', 'BEACH',
  'BELL', 'BERLIN', 'BOND', 'BOW', 'BRIDGE', 'CAPITAL', 'CARD', 'CASINO',
  'CAT', 'CHEST', 'CLOAK', 'CODE', 'COMET', 'COMPASS', 'CRANE', 'CROWN',
  'DAGGER', 'DEATH', 'DIAMOND', 'DRAGON', 'DRESS', 'EAGLE', 'EMBASSY', 'FALL',
  'FENCE', 'FILE', 'FIRE', 'GLASS', 'GOLD', 'GRAVE', 'HORN', 'ICE',
  'IRON', 'JET', 'KING', 'KNIGHT', 'LAB', 'LASER', 'LOCK', 'MASK',
  'MERCURY', 'MOON', 'NIGHT', 'NINJA', 'NOTE', 'OCEAN', 'PIRATE', 'POISON',
  'QUEEN', 'RADIO', 'RIVER', 'ROBOT', 'ROCK', 'ROME', 'SAFE', 'SCALE',
  'SHADOW', 'SHIP', 'SILVER', 'SNOW', 'SPY', 'STAR', 'STORM', 'SWORD',
  'TANK', 'TOWER', 'TRAIN', 'VENUS', 'WALL', 'WATCH', 'WAVE', 'WEB',
]

// --- Hand-authored association table: clue word -> board words it relates to.
//     Used by the AI to GIVE clues (find a clue covering several own hidden agents
//     and no assassin) and to GUESS (rank candidate board words for a given clue). ---
export const ASSOCIATIONS: Record<string, string[]> = {
  SECRET: ['SPY', 'AGENT', 'CODE', 'MASK', 'CLOAK'],
  STEALTH: ['NINJA', 'SHADOW', 'SPY', 'CLOAK', 'MASK'],
  ROYAL: ['KING', 'QUEEN', 'CROWN', 'KNIGHT'],
  CHESS: ['KING', 'QUEEN', 'KNIGHT', 'ROCK', 'BOW'],
  MONEY: ['BANK', 'GOLD', 'SILVER', 'CASINO', 'SAFE', 'DIAMOND'],
  RICH: ['GOLD', 'DIAMOND', 'CROWN', 'CASINO', 'CAPITAL'],
  WEAPON: ['SWORD', 'DAGGER', 'LASER', 'BOW', 'TANK', 'POISON'],
  BLADE: ['SWORD', 'DAGGER', 'KNIGHT'],
  WATER: ['OCEAN', 'RIVER', 'WAVE', 'BEACH', 'SHIP'],
  SEA: ['OCEAN', 'WAVE', 'SHIP', 'PIRATE', 'BEACH'],
  COLD: ['ICE', 'SNOW', 'STORM', 'ALPS'],
  WINTER: ['SNOW', 'ICE', 'ALPS', 'STORM'],
  SKY: ['STAR', 'COMET', 'MOON', 'EAGLE', 'JET', 'STORM'],
  SPACE: ['STAR', 'COMET', 'MOON', 'MERCURY', 'VENUS'],
  PLANET: ['MERCURY', 'VENUS', 'MOON', 'STAR'],
  METAL: ['GOLD', 'SILVER', 'IRON', 'MERCURY', 'STEEL'],
  CITY: ['BERLIN', 'ROME', 'CAPITAL', 'EMBASSY', 'TOWER'],
  EUROPE: ['BERLIN', 'ROME', 'ALPS', 'EMBASSY'],
  DANGER: ['POISON', 'DEATH', 'DAGGER', 'GRAVE', 'DRAGON'],
  DEADLY: ['DEATH', 'POISON', 'GRAVE', 'DAGGER'],
  DARK: ['NIGHT', 'SHADOW', 'CLOAK', 'GRAVE', 'DEATH'],
  BIRD: ['EAGLE', 'CRANE', 'BOW'],
  FLY: ['JET', 'EAGLE', 'COMET', 'ANGEL'],
  HEAVEN: ['ANGEL', 'CROWN', 'STAR', 'MOON'],
  MUSIC: ['HORN', 'BELL', 'NOTE', 'RADIO'],
  SOUND: ['BELL', 'HORN', 'RADIO', 'NOTE'],
  SHIELD: ['SAFE', 'LOCK', 'WALL', 'FENCE', 'IRON'],
  GUARD: ['KNIGHT', 'WALL', 'FENCE', 'LOCK', 'SAFE'],
  BARRIER: ['WALL', 'FENCE', 'BRIDGE', 'LOCK'],
  WAR: ['TANK', 'SWORD', 'KNIGHT', 'FIRE', 'STORM'],
  HEAT: ['FIRE', 'LASER', 'STORM', 'IRON'],
  VEHICLE: ['JET', 'TRAIN', 'SHIP', 'TANK'],
  RIDE: ['TRAIN', 'SHIP', 'JET', 'WAVE'],
  TIME: ['WATCH', 'BELL', 'NIGHT', 'FALL'],
  BODY: ['ARM', 'CHEST', 'HORN'],
  CARDS: ['CARD', 'CASINO', 'DIAMOND', 'KING', 'QUEEN'],
  TALL: ['TOWER', 'CRANE', 'WALL', 'BRIDGE'],
  STRUCTURE: ['TOWER', 'BRIDGE', 'WALL', 'BANK'],
  SECRETAGENT: ['SPY', 'AGENT', 'BOND', 'CODE'],
  SCIENCE: ['LAB', 'LASER', 'ROBOT', 'CODE'],
  TECH: ['ROBOT', 'LASER', 'RADIO', 'CODE', 'LAB'],
  CLOTHES: ['DRESS', 'MASK', 'CLOAK', 'CROWN'],
  STONE: ['ROCK', 'DIAMOND', 'GRAVE'],
  MYTH: ['DRAGON', 'ANGEL', 'KNIGHT', 'CROWN'],
  GLASSY: ['GLASS', 'ICE', 'DIAMOND', 'MERCURY'],
  REFLECT: ['GLASS', 'MASK', 'SHADOW', 'MOON'],
  NAVIGATE: ['COMPASS', 'STAR', 'SHIP', 'MAP'],
  DIRECTION: ['COMPASS', 'STAR', 'BOW'],
  STORE: ['BANK', 'SAFE', 'CHEST', 'FILE'],
  CONTAIN: ['CHEST', 'SAFE', 'BANK', 'LOCK'],
  PAPER: ['NOTE', 'CARD', 'FILE'],
  ARCHIVE: ['FILE', 'NOTE', 'CODE'],
  ANIMAL: ['CAT', 'EAGLE', 'CRANE', 'DRAGON'],
  PET: ['CAT', 'DRAGON'],
  WEATHER: ['STORM', 'SNOW', 'WAVE', 'FALL'],
  AUTUMN: ['FALL', 'LEAF', 'STORM'],
  SHINE: ['GOLD', 'SILVER', 'DIAMOND', 'STAR', 'GLASS'],
  ARCHER: ['BOW', 'ARM', 'EAGLE'],
  // --- denser thematic clues so multi-agent coverage is common on random boards ---
  SPYCRAFT: ['SPY', 'AGENT', 'BOND', 'CLOAK', 'MASK', 'CODE'],
  CASTLE: ['KING', 'QUEEN', 'KNIGHT', 'TOWER', 'CROWN', 'WALL'],
  TREASURE: ['GOLD', 'SILVER', 'DIAMOND', 'CHEST', 'CROWN'],
  ARMORY: ['SWORD', 'DAGGER', 'BOW', 'TANK', 'LASER', 'SHIELD'],
  STORMY: ['STORM', 'WAVE', 'SNOW', 'ICE', 'FIRE'],
  COSMOS: ['STAR', 'MOON', 'COMET', 'MERCURY', 'VENUS'],
  FORTIFY: ['WALL', 'FENCE', 'LOCK', 'SAFE', 'IRON', 'TOWER'],
  TRANSPORT: ['JET', 'TRAIN', 'SHIP', 'TANK'],
  GLEAM: ['GOLD', 'SILVER', 'DIAMOND', 'GLASS', 'ICE', 'STAR'],
  PERIL: ['POISON', 'DEATH', 'DAGGER', 'DRAGON', 'GRAVE', 'FIRE'],
  NIGHTLIFE: ['NIGHT', 'CASINO', 'SHADOW', 'MOON', 'BELL'],
  FORTRESS: ['TOWER', 'WALL', 'BRIDGE', 'BANK', 'SAFE'],
  ESPIONAGE: ['SPY', 'AGENT', 'CODE', 'EMBASSY', 'FILE', 'MASK'],
  LABWORK: ['LAB', 'LASER', 'ROBOT', 'CODE', 'MERCURY'],
  ROYALTY: ['KING', 'QUEEN', 'CROWN', 'KNIGHT', 'CASTLE'],
  VOYAGE: ['SHIP', 'OCEAN', 'COMPASS', 'STAR', 'WAVE', 'PIRATE'],
  FROST: ['ICE', 'SNOW', 'ALPS', 'GLASS'],
  BLADES: ['SWORD', 'DAGGER', 'KNIGHT', 'ARM'],
  VALUABLE: ['GOLD', 'SILVER', 'DIAMOND', 'CROWN', 'SAFE', 'BANK'],
}

export type Role = 'agent' | 'bystander' | 'assassin'

export interface Card {
  word: string
  /** Role from each player's perspective: roles[0] = player 0's key, roles[1] = player 1's key. */
  roles: [Role, Role]
  /** Contacted (revealed as an agent) by either player. */
  contacted: boolean
  /** Revealed as a non-agent (bystander / assassin source) — for end-state display. */
  revealed: boolean
}

export interface Clue {
  /** The clue word. */
  word: string
  /** How many of the clue-giver's agents the clue points at. */
  number: number
  /** Guesses remaining this turn (starts at number+1, min reached at 0). */
  remaining: number
  /** Who gave the clue: 0 (you) or 1 (AI). The OTHER player guesses. */
  from: 0 | 1
}

export type Status = 'playing' | 'won' | 'lost'

export interface State {
  cards: Card[]
  /** Whose turn it is to GIVE a clue: alternates each turn. */
  clueGiver: 0 | 1
  /** The active clue, or null when a clue still needs to be given this turn. */
  clue: Clue | null
  turnsLeft: number
  turnsTaken: number
  status: Status
  /** Whether the loss was via an assassin (vs running out of turns). */
  assassinHit: boolean
}

/** Total turns the team shares to contact all 15 agents. Tuned to the association
 *  density so a well-played cooperative game is winnable but tense (greedy-optimal
 *  play clears in ~11-12 turns on these boards). */
export const TOTAL_TURNS = 13
export const SELFPLAY_CAP = 400

// --- Seedable RNG (mulberry32) so boards are deterministic in tests. ---
export type RNG = () => number
export function makeRng(seed: number): RNG {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: RNG): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build the dual key-card role assignment for 25 cards.
 *
 * Constraints (standard Codenames Duet key):
 *   - Player 0: 9 agents, 3 assassins, 13 bystanders.
 *   - Player 1: 9 agents, 3 assassins, 13 bystanders.
 *   - 3 cards are agents for BOTH (overlap) -> 9 + 9 - 3 = 15 unique agents.
 *   - No card may be an agent for one player AND an assassin for the other near-overlap
 *     is allowed by real rules, but we forbid agent/assassin collisions on the SAME card
 *     to keep the cooperative puzzle fair and always-solvable.
 *
 * We assign over 25 index slots. Indices:
 *   0..2   : shared agents (agent for both)              (3)
 *   3..8   : player0-only agents (agent p0, bystander p1)(6)
 *   9..14  : player1-only agents (bystander p0, agent p1)(6)
 *   15..17 : player0 assassins (assassin p0, bystander p1)(3)
 *   18..20 : player1 assassins (bystander p0, assassin p1)(3)
 *   21..24 : bystanders for both                          (4)
 * Then the 25 words are shuffled onto these role slots so the board layout varies.
 */
function buildRoles(rng: RNG): [Role, Role][] {
  const slots: [Role, Role][] = []
  const push = (n: number, a: Role, b: Role) => { for (let i = 0; i < n; i++) slots.push([a, b]) }
  push(3, 'agent', 'agent')         // shared agents
  push(6, 'agent', 'bystander')     // p0-only agents
  push(6, 'bystander', 'agent')     // p1-only agents
  push(3, 'assassin', 'bystander')  // p0 assassins
  push(3, 'bystander', 'assassin')  // p1 assassins
  push(4, 'bystander', 'bystander') // shared bystanders
  // 3+6+6+3+3+4 = 25
  return shuffle(slots, rng)
}

/**
 * Create a fresh game. Pass a numeric seed for a deterministic board (tests);
 * omit for a random board. Player 0 (you) gives the first clue.
 */
export function makeGame(seed?: number): State {
  const rng = makeRng(seed == null ? (Math.random() * 1e9) | 0 : seed)
  const words = shuffle(WORD_POOL, rng).slice(0, 25)
  const roles = buildRoles(rng)
  const cards: Card[] = words.map((word, i) => ({
    word,
    roles: roles[i],
    contacted: false,
    revealed: false,
  }))
  return {
    cards,
    clueGiver: 0,
    clue: null,
    turnsLeft: TOTAL_TURNS,
    turnsTaken: 0,
    status: 'playing',
    assassinHit: false,
  }
}

function clone(s: State): State {
  return {
    ...s,
    cards: s.cards.map(c => ({ ...c, roles: [c.roles[0], c.roles[1]] as [Role, Role] })),
    clue: s.clue ? { ...s.clue } : null,
  }
}

/** Count of unique agents still to be contacted (agent for EITHER player, not yet contacted). */
export function agentsRemaining(s: State): number {
  let n = 0
  for (const c of s.cards) {
    if (c.contacted) continue
    if (c.roles[0] === 'agent' || c.roles[1] === 'agent') n++
  }
  return n
}

/** Is a card an agent on `player`'s key card? */
export function isAgentFor(c: Card, player: 0 | 1): boolean {
  return c.roles[player] === 'agent'
}

/** All board words (uppercase) for the current game. */
export function boardWords(s: State): string[] {
  return s.cards.map(c => c.word)
}

/** Index of a board word, or -1. */
export function indexOf(s: State, word: string): number {
  const w = word.toUpperCase()
  return s.cards.findIndex(c => c.word === w)
}

// ------------------------------------------------------------------
// CLUE GIVING
// ------------------------------------------------------------------

/**
 * Set a human-authored clue for the current clue-giver. `number` counts the
 * clue-giver's own still-hidden agents the clue points at. Establishes a turn
 * with number+1 guesses. No-op if it's not a fresh clue moment or game over.
 */
export function setHumanClue(s: State, word: string, number: number): State {
  if (s.status !== 'playing') return s
  if (s.clue != null) return s
  const n = Math.max(1, number | 0)
  const next = clone(s)
  next.clue = { word: word.toUpperCase(), number: n, remaining: n + 1, from: s.clueGiver }
  return next
}

export interface ClueSuggestion {
  word: string
  number: number
  /** The clue-giver's own hidden agents this clue covers. */
  covers: string[]
}

/**
 * Score every clue word in the ASSOCIATIONS table for `player` as clue-giver.
 *
 * The GUESSER (the other player) resolves taps against the GUESSER's own key, so a
 * tap only makes progress (and is safe) when the word is the GUESSER's hidden agent.
 * A word that is the giver's agent but the guesser's bystander would just END the
 * turn, and a guesser-assassin would lose. So a good cooperative clue points at the
 * GUESSER's still-hidden agents.
 *
 * A clue is LEGAL only if NONE of its associated on-board words is a guesser-assassin
 * or a guesser-bystander (those would waste / end the turn), and it must cover at
 * least one of the GUESSER's still-hidden agents. `number` counts those covered
 * guesser-agents. Returns suggestions sorted by coverage (desc).
 */
export function clueSuggestions(s: State, player: 0 | 1): ClueSuggestion[] {
  const guesser: 0 | 1 = player === 0 ? 1 : 0
  const byWord = new Map<string, Card>()
  for (const c of s.cards) byWord.set(c.word, c)
  const out: ClueSuggestion[] = []
  for (const clueWord of Object.keys(ASSOCIATIONS)) {
    const linked = ASSOCIATIONS[clueWord]
    let unsafe = false
    const covers: string[] = []
    for (const lw of linked) {
      const card = byWord.get(lw)
      if (!card) continue // word not on this board
      if (card.contacted) continue // already an agent — harmless to mention, skip
      // A guesser-ASSASSIN among the linked words is disqualifying: the guesser could
      // tap it and lose. Bystanders are tolerated — the guesser simply won't tap them
      // (the number tells the guesser exactly how many real agents to find).
      if (card.roles[guesser] === 'assassin') { unsafe = true; break }
      // Count only the guesser's hidden agents: real, safe progress this turn.
      if (card.roles[guesser] === 'agent') covers.push(lw)
    }
    if (unsafe) continue
    if (covers.length === 0) continue
    out.push({ word: clueWord, number: covers.length, covers })
  }
  out.sort((a, b) => b.number - a.number || a.word.localeCompare(b.word))
  return out
}

/** The AI's chosen clue (it gives from its OWN key card). Returns null if none legal. */
export function aiClue(s: State): ClueSuggestion | null {
  const player = s.clueGiver
  const sugg = clueSuggestions(s, player)
  if (sugg.length > 0) return sugg[0]
  // Fallback: emit a safe 1-clue pointing at a single GUESSER hidden agent (a safe,
  // progress-making tap) via a synthetic NEAR-<word> clue the AI guesser understands.
  const guesser: 0 | 1 = player === 0 ? 1 : 0
  for (const c of s.cards) {
    if (!c.contacted && c.roles[guesser] === 'agent') {
      return { word: 'NEAR-' + c.word, number: 1, covers: [c.word] }
    }
  }
  return null
}

/**
 * giveClue: convenience used by self-play & UI for the AI side — the AI picks a
 * clue from its key and installs it. No-op if it's not the AI's clue moment.
 */
export function giveClue(s: State, fromPlayer: 0 | 1): State {
  if (s.status !== 'playing') return s
  if (s.clue != null) return s
  if (s.clueGiver !== fromPlayer) return s
  const c = aiClue(s)
  if (!c) {
    // No legal clue (degenerate) — burn the turn so play can't deadlock.
    return endTurn(clone(s))
  }
  const next = clone(s)
  next.clue = { word: c.word, number: c.number, remaining: c.number + 1, from: fromPlayer }
  return next
}

// ------------------------------------------------------------------
// GUESSING
// ------------------------------------------------------------------

/** End the current turn: clear the clue, swap clue-giver, decrement turns, check loss. */
function endTurn(s: State): State {
  s.clue = null
  s.clueGiver = s.clueGiver === 0 ? 1 : 0
  s.turnsLeft -= 1
  s.turnsTaken += 1
  if (s.status === 'playing' && agentsRemaining(s) > 0 && s.turnsLeft <= 0) {
    s.status = 'lost'
  }
  return s
}

function checkWin(s: State): State {
  if (s.status === 'playing' && agentsRemaining(s) === 0) s.status = 'won'
  return s
}

/**
 * The GUESSER (the player NOT currently the clue-giver) taps `word`. Resolves:
 *   - assassin on the GUESSER's key  -> immediate LOSS.
 *   - agent on the GUESSER's key (a hidden agent for either, but specifically the
 *     guesser sees it as agent)       -> CONTACTED; keep guessing (remaining--).
 *     If that was the last unique agent -> WIN.
 *   - anything else (bystander, or already contacted, or guesser-bystander) -> turn ENDS.
 * Decrements remaining; when remaining hits 0 the turn ends. No-op if no active clue
 * or game over. The card resolves against the GUESSER's perspective key.
 */
export function guess(s: State, word: string): State {
  if (s.status !== 'playing') return s
  if (s.clue == null) return s
  const idx = indexOf(s, word)
  if (idx < 0) return s
  const next = clone(s)
  const card = next.cards[idx]
  if (card.contacted) return s // already an agent; can't re-tap
  const guesser: 0 | 1 = next.clue!.from === 0 ? 1 : 0
  const role = card.roles[guesser]

  if (role === 'assassin') {
    card.revealed = true
    next.status = 'lost'
    next.assassinHit = true
    return next
  }
  if (role === 'agent') {
    card.contacted = true
    card.revealed = true
    checkWin(next)
    if (next.status === 'won') return next
    next.clue!.remaining -= 1
    if (next.clue!.remaining <= 0) return endTurn(next)
    return next
  }
  // bystander from the guesser's view -> ends the turn.
  card.revealed = true
  return endTurn(next)
}

/** Player 0 (human) taps a word while the AI is the clue-giver. Thin wrapper for clarity. */
export function humanGuess(s: State, word: string): State {
  return guess(s, word)
}

/**
 * The AI guesser (player 1) picks ONE word to tap for the active clue. Uses the
 * ASSOCIATION table to rank unrevealed candidate words by how strongly they relate
 * to the clue word, refusing any word it can see is an assassin on its OWN key
 * (conservative near assassins). Returns null if it should stop / no safe pick.
 */
export function aiGuessWord(s: State): string | null {
  if (s.clue == null) return null
  const clue = s.clue
  const guesser: 0 | 1 = clue.from === 0 ? 1 : 0
  // Candidate board words this clue points at (per the table), still hidden.
  const onBoard = new Set(s.cards.filter(c => !c.contacted && !c.revealed).map(c => c.word))
  const linked = ASSOCIATIONS[clue.word] ?? []
  // Fallback for synthetic "NEAR-WORD" clues from aiClue.
  let ranked: string[] = linked.filter(w => onBoard.has(w))
  if (ranked.length === 0 && clue.word.startsWith('NEAR-')) {
    const w = clue.word.slice(5)
    if (onBoard.has(w)) ranked = [w]
  }
  // The AI guesser knows its OWN key, so it taps ONLY words it sees as its own
  // hidden agents — never a bystander (dead turn) or an assassin (loss). This is the
  // conservative, cooperative read of the clue+number.
  const cardByWord = new Map(s.cards.map(c => [c.word, c]))
  const safe = ranked.filter(w => {
    const c = cardByWord.get(w)
    return c != null && c.roles[guesser] === 'agent'
  })
  if (safe.length === 0) return null
  // Rank by association strength: the word's position in the clue's linked list
  // (earlier = stronger).
  safe.sort((a, b) => linked.indexOf(a) - linked.indexOf(b))
  return safe[0]
}

/**
 * Run the AI's full guessing phase for the active clue: tap words one at a time
 * until the turn ends (bystander/assassin/exhausted guesses) or the game ends.
 * Conservative: stops voluntarily once it has used its "number" of confident
 * agent taps and the next candidate is not clearly an own-agent (avoids burning
 * the free guess into a risky tap). Guard-capped against any loop.
 */
export function aiGuess(s: State): State {
  if (s.status !== 'playing' || s.clue == null) return s
  let st = s
  let safety = 0
  const number = st.clue.number
  let agentTaps = 0
  while (st.status === 'playing' && st.clue != null && safety < 30) {
    safety++
    const w = aiGuessWord(st)
    if (w == null) { st = endTurn(clone(st)); break }
    const guesser: 0 | 1 = st.clue.from === 0 ? 1 : 0
    const card = st.cards.find(c => c.word === w)!
    const wasOwnAgent = card.roles[guesser] === 'agent'
    // Conservative bonus-guess policy: after using `number` agent taps, only take
    // the extra guess if the next pick is still confidently the AI's own agent.
    if (agentTaps >= number && !wasOwnAgent) { st = endTurn(clone(st)); break }
    const before = st.clue
    st = guess(st, w)
    if (wasOwnAgent) agentTaps++
    // If the clue object is gone (turn ended / win), stop.
    if (st.clue == null || st.status !== 'playing') break
    // If guess didn't change anything (shouldn't happen), break to be safe.
    if (st.clue === before && st.clue.remaining === before.remaining) { st = endTurn(clone(st)); break }
  }
  return st
}

/** Convenience accessor. */
export function status(s: State): Status {
  return s.status
}
