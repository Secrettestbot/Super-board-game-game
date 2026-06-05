/* COUP — pure logic (built for this codebase, not ported).
   Three players: you (0) and two AI (1, 2). 15-card deck, 3 each of five characters.
   Each player holds 2 face-down influence cards + coins; lose all influence and you're out.
   The game is a small state machine: a player declares an ACTION; that may be challenged by
   the others; surviving that, a target may BLOCK by claiming a character; the block may itself
   be challenged. Reactive decisions (challenge / block) are resolved ONE player at a time so the
   UI can prompt the human at the right moment and the AI driver can step through the rest.

   Randomness (deck shuffle + AI bluff dice) is injectable via an Rng so tests are deterministic
   and self-play always terminates. The forced coup at 10+ coins + Income guarantee progress. */

// ===== Characters & cards =====
export type Character = 'Duke' | 'Assassin' | 'Captain' | 'Ambassador' | 'Contessa'
export const CHARACTERS: Character[] = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa']

export type ActionType = 'income' | 'foreign_aid' | 'coup' | 'tax' | 'assassinate' | 'steal' | 'exchange'

export interface InfluenceCard { char: Character; revealed: boolean }   // revealed = lost/face-up

export interface PlayerState {
  id: number
  name: string
  cards: InfluenceCard[]    // length 2; revealed ones are dead
  coins: number
  eliminated: boolean
  isAI: boolean
}

export interface LogEntry { t: 'sys' | 'you' | 'ai' | 'good' | 'warn'; x: string }

/* The reactive sub-state. We model the life of one action as a sequence of "decision" steps.
   kind:
     'action_challenge' — players (in order) may challenge the actor's character claim
     'block'            — the target (or anyone, for foreign aid) may declare a block
     'block_challenge'  — players may challenge the blocker's claim
     'lose'             — a player must choose which influence to reveal (forced loss)
     'exchange'         — the actor (only) picks which cards to keep after an Ambassador draw
   `decider` is whose decision it currently is (null = resolve/advance). For challenge phases we
   iterate `pendingDeciders` (the candidate challengers in turn order). */
export type PendingKind =
  | 'action_challenge'
  | 'block'
  | 'block_challenge'
  | 'lose'
  | 'exchange'

export interface Pending {
  kind: PendingKind
  action: ActionType
  actor: number             // who declared the action
  target: number | null     // action target (coup/assassinate/steal), null otherwise
  claim: Character | null    // the character being claimed for THIS phase (action or block)
  blocker: number | null     // who declared the block (block_challenge / after a block)
  blockClaim: Character | null
  pendingDeciders: number[]  // remaining players who may challenge/block, in order
  decider: number | null     // the single player whose decision the UI is waiting on
  loser: number | null       // for 'lose': who must reveal
  loseReason: string         // human-readable reason for the loss
  drawn: Character[]          // for 'exchange': the 2 cards drawn (added to actor's hand pool)
}

export interface CoupState {
  players: PlayerState[]
  deck: Character[]          // face-down draw/return pile
  turn: number               // whose action turn it is (index into players)
  pending: Pending | null    // active reactive sub-state, or null = waiting for the turn player's action
  log: LogEntry[]
  winner: number | null      // player id of the sole survivor, or null
}

export const START_COINS = 2
export const COUP_COST = 7
export const ASSASSINATE_COST = 3
export const FORCE_COUP_AT = 10

// ===== Rng (injectable) =====
export interface Rng { next(): number }   // returns [0,1)
export function makeRng(seed: number): Rng {
  let s = (seed >>> 0) || 0x2545f491
  return {
    next() {
      // xorshift32 — deterministic, decent spread
      s ^= s << 13; s >>>= 0
      s ^= s >> 17
      s ^= s << 5; s >>>= 0
      return (s >>> 0) / 0x100000000
    },
  }
}

const push = (log: LogEntry[], t: LogEntry['t'], x: string) => log.concat([{ t, x }]).slice(-40)

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

// ===== Setup =====
export function makeGame(optionalDeck?: Character[], names?: string[]): CoupState {
  const rng = makeRng(0xC0FFEE)
  let deck: Character[]
  if (optionalDeck) {
    deck = optionalDeck.slice()
  } else {
    deck = []
    for (const c of CHARACTERS) { deck.push(c, c, c) }
    deck = shuffle(deck, rng)
  }
  const nm = names || ['You', 'Bishop', 'Vesper']
  const players: PlayerState[] = []
  for (let i = 0; i < 3; i++) {
    const c1 = deck.shift()!
    const c2 = deck.shift()!
    players.push({
      id: i,
      name: nm[i],
      cards: [{ char: c1, revealed: false }, { char: c2, revealed: false }],
      coins: START_COINS,
      eliminated: false,
      isAI: i !== 0,
    })
  }
  return {
    players,
    deck,
    turn: 0,
    pending: null,
    winner: null,
    log: [{ t: 'sys', x: 'The court convenes — three players, two influence apiece. Bluff, challenge, and survive.' }],
  }
}

// ===== Helpers =====
export function aliveInfluence(p: PlayerState): number {
  return p.cards.filter(c => !c.revealed).length
}
export function isAlive(p: PlayerState): boolean {
  return !p.eliminated && aliveInfluence(p) > 0
}
export function hasCharacter(p: PlayerState, ch: Character): boolean {
  return p.cards.some(c => !c.revealed && c.char === ch)
}
export function alivePlayers(s: CoupState): PlayerState[] {
  return s.players.filter(isAlive)
}
/** Players, in turn order starting after `from`, who are alive (excluding `from`). */
function othersInOrder(s: CoupState, from: number): number[] {
  const out: number[] = []
  for (let k = 1; k < s.players.length; k++) {
    const i = (from + k) % s.players.length
    if (isAlive(s.players[i])) out.push(i)
  }
  return out
}

/** The character a given action claims (null = no claim / unchallengeable). */
export function actionClaim(a: ActionType): Character | null {
  switch (a) {
    case 'tax': return 'Duke'
    case 'assassinate': return 'Assassin'
    case 'steal': return 'Captain'
    case 'exchange': return 'Ambassador'
    default: return null
  }
}
/** Characters that can block a given action. */
export function blockers(a: ActionType): Character[] {
  switch (a) {
    case 'foreign_aid': return ['Duke']
    case 'assassinate': return ['Contessa']
    case 'steal': return ['Captain', 'Ambassador']
    default: return []
  }
}

export const ACTION_LABEL: Record<ActionType, string> = {
  income: 'Income', foreign_aid: 'Foreign Aid', coup: 'Coup', tax: 'Tax',
  assassinate: 'Assassinate', steal: 'Steal', exchange: 'Exchange',
}

// ===== Winner / elimination bookkeeping =====
function checkWinner(s: CoupState): number | null {
  const alive = alivePlayers(s)
  return alive.length === 1 ? alive[0].id : null
}

/** Advance the turn to the next alive player after the current turn. Sets winner if one remains. */
function advanceTurn(s: CoupState, log: LogEntry[]): CoupState {
  const winner = checkWinner(s)
  if (winner != null) {
    return Object.assign({}, s, { pending: null, winner, log: push(log, 'sys', `${s.players[winner].name} stands alone — the last influence in the court.`) })
  }
  let next = s.turn
  for (let k = 1; k <= s.players.length; k++) {
    const i = (s.turn + k) % s.players.length
    if (isAlive(s.players[i])) { next = i; break }
  }
  return Object.assign({}, s, { turn: next, pending: null, log })
}

// ===== Legal actions for the turn player =====
export function legalActions(s: CoupState, who: number): ActionType[] {
  const p = s.players[who]
  if (!isAlive(p)) return []
  if (p.coins >= FORCE_COUP_AT) return ['coup']     // mandatory coup
  const acts: ActionType[] = ['income', 'foreign_aid', 'tax', 'exchange']
  if (p.coins >= COUP_COST) acts.push('coup')
  if (p.coins >= ASSASSINATE_COST) acts.push('assassinate')
  acts.push('steal')
  return acts
}

export function actionNeedsTarget(a: ActionType): boolean {
  return a === 'coup' || a === 'assassinate' || a === 'steal'
}

/** Valid targets for a targeted action (alive opponents). */
export function legalTargets(s: CoupState, who: number): number[] {
  return s.players.filter(p => isAlive(p) && p.id !== who).map(p => p.id)
}

// ===== Declaring an action =====
/** Begin `action` by `who` against `target` (null if untargeted). Returns the new state with a
    pending sub-state ready for the first reactive decision (or already resolved for Income/Coup). */
export function declareAction(s: CoupState, who: number, action: ActionType, target: number | null): CoupState {
  if (s.winner != null || s.pending != null || s.turn !== who) return s
  if (!legalActions(s, who).includes(action)) return s
  const actor = s.players[who]
  let log = s.log

  // Income — unblockable, unchallengeable: resolve immediately.
  if (action === 'income') {
    actor.coins += 1
    log = push(log, who === 0 ? 'you' : 'ai', `${actor.name} takes Income (+1 → ${actor.coins}).`)
    return advanceTurn(Object.assign({}, s), log)
  }

  // Coup — pay 7, target loses influence. Unblockable / unchallengeable.
  if (action === 'coup') {
    if (target == null || !isAlive(s.players[target])) return s
    actor.coins -= COUP_COST
    log = push(log, who === 0 ? 'you' : 'ai', `${actor.name} launches a Coup against ${s.players[target].name} (−7 coins).`)
    return startLoss(Object.assign({}, s), target, 'the coup', log, { reAdvance: true })
  }

  // Assassinate costs 3 paid up front (lost even if challenged/blocked).
  if (action === 'assassinate') {
    if (target == null || !isAlive(s.players[target]) || actor.coins < ASSASSINATE_COST) return s
    actor.coins -= ASSASSINATE_COST
  }
  if (action === 'steal' && (target == null || !isAlive(s.players[target]))) return s

  // The remaining actions are challengeable and/or blockable: open the action-challenge phase.
  const claim = actionClaim(action)
  const deciders = othersInOrder(s, who)
  log = push(log, who === 0 ? 'you' : 'ai', actionAnnounce(actor.name, action, target, s))
  const pending: Pending = {
    kind: 'action_challenge',
    action, actor: who, target,
    claim,
    blocker: null, blockClaim: null,
    pendingDeciders: claim ? deciders.slice() : [],   // unchallengeable claim (foreign aid) → skip
    decider: null,
    loser: null, loseReason: '', drawn: [],
  }
  const ns = Object.assign({}, s, { pending, log })
  return advancePending(ns)
}

function actionAnnounce(name: string, a: ActionType, target: number | null, s: CoupState): string {
  switch (a) {
    case 'foreign_aid': return `${name} reaches for Foreign Aid (+2) — anyone holding a Duke may block.`
    case 'tax': return `${name} claims the Duke and levies Tax (+3).`
    case 'assassinate': return `${name} claims the Assassin and targets ${s.players[target!].name}.`
    case 'steal': return `${name} claims the Captain and moves to steal from ${s.players[target!].name}.`
    case 'exchange': return `${name} claims the Ambassador to Exchange influence.`
    default: return `${name} acts.`
  }
}

// ===== Pending machine: pick the next decider, or resolve when none remain =====
/** Sets pending.decider to the next player who must decide, or resolves the phase if exhausted. */
export function advancePending(s: CoupState): CoupState {
  const p = s.pending
  if (!p) return s
  if (p.kind === 'lose' || p.kind === 'exchange') {
    // These wait on a specific actor; decider already set at creation.
    return s
  }
  if (p.pendingDeciders.length === 0) {
    // No one left to react in this phase — resolve it.
    return resolvePhaseExhausted(s)
  }
  const next = p.pendingDeciders[0]
  return Object.assign({}, s, { pending: Object.assign({}, p, { decider: next }) })
}

/** A challenge/block phase ran out of deciders without anyone acting → proceed. */
function resolvePhaseExhausted(s: CoupState): CoupState {
  const p = s.pending!
  if (p.kind === 'action_challenge') {
    // No one challenged the action. Now offer blocks (if any), else resolve the action.
    return openBlockOrResolve(s)
  }
  if (p.kind === 'block') {
    // No one blocked → the action succeeds.
    return resolveAction(s)
  }
  if (p.kind === 'block_challenge') {
    // No one challenged the block → the block stands; the action is foiled.
    return resolveBlockStands(s)
  }
  return s
}

// ===== Opening a block phase =====
function openBlockOrResolve(s: CoupState): CoupState {
  const p = s.pending!
  const bl = blockers(p.action)
  if (bl.length === 0) {
    return resolveAction(s)
  }
  // Foreign aid: anyone may block (claim Duke). Targeted actions: only the target may block.
  let deciders: number[]
  if (p.action === 'foreign_aid') deciders = othersInOrder(s, p.actor)
  else deciders = (p.target != null && isAlive(s.players[p.target])) ? [p.target] : []
  const pending: Pending = Object.assign({}, p, {
    kind: 'block' as PendingKind,
    pendingDeciders: deciders,
    decider: null,
  })
  return advancePending(Object.assign({}, s, { pending }))
}

// ===== A player CHALLENGES the current claim =====
/** `by` challenges the claimant of the current phase (action or block). */
export function challenge(s: CoupState, by: number): CoupState {
  const p = s.pending
  if (!p) return s
  if (p.kind !== 'action_challenge' && p.kind !== 'block_challenge') return s
  if (p.decider !== by) return s

  const isBlockPhase = p.kind === 'block_challenge'
  const claimant = isBlockPhase ? p.blocker! : p.actor
  const claimChar = isBlockPhase ? p.blockClaim! : p.claim!
  const cp = s.players[claimant]
  const has = hasCharacter(cp, claimChar)
  let log = push(s.log, by === 0 ? 'you' : 'ai', `${s.players[by].name} challenges ${cp.name}'s claim of the ${claimChar}!`)

  if (has) {
    // Claim was true: reveal & replace the card; challenger loses influence.
    log = push(log, 'good', `${cp.name} reveals the ${claimChar} — the challenge fails. ${cp.name} reshuffles it and draws anew.`)
    replaceCharacter(s, claimant, claimChar)
    // Challenger loses an influence; afterward continue the line.
    const reason = `the failed challenge against ${cp.name}'s ${claimChar}`
    if (isBlockPhase) {
      // Block was truthful → block stands → action foiled (after the challenger's loss).
      return startLoss(Object.assign({}, s, { log }), by, reason, log, { thenBlockStands: true })
    }
    // Action claim truthful → action proceeds to block phase (after the challenger's loss).
    return startLoss(Object.assign({}, s, { log }), by, reason, log, { thenOpenBlock: true })
  } else {
    // Claim was a bluff: claimant loses influence; that sub-action fails.
    log = push(log, 'warn', `${cp.name} was bluffing — no ${claimChar}! ${cp.name} loses influence.`)
    const reason = `the exposed bluff (${claimChar})`
    if (isBlockPhase) {
      // Block was a bluff → block fails → the ORIGINAL action now resolves (after blocker's loss).
      return startLoss(Object.assign({}, s, { log }), claimant, reason, log, { thenResolveAction: true })
    }
    // Action claim was a bluff → the action fails entirely (after actor's loss).
    return startLoss(Object.assign({}, s, { log }), claimant, reason, log, { thenActionFails: true })
  }
}

/** `by` declines to challenge in the current challenge phase. */
export function passChallenge(s: CoupState, by: number): CoupState {
  const p = s.pending
  if (!p) return s
  if (p.kind !== 'action_challenge' && p.kind !== 'block_challenge') return s
  if (p.decider !== by) return s
  const rest = p.pendingDeciders.filter(d => d !== by)
  return advancePending(Object.assign({}, s, { pending: Object.assign({}, p, { pendingDeciders: rest, decider: null }) }))
}

// ===== A player BLOCKS =====
/** `by` blocks the pending action, claiming `character`. Opens a block-challenge phase. */
export function block(s: CoupState, by: number, character: Character): CoupState {
  const p = s.pending
  if (!p || p.kind !== 'block') return s
  if (!p.pendingDeciders.includes(by)) return s
  if (!blockers(p.action).includes(character)) return s
  const log = push(s.log, by === 0 ? 'you' : 'ai', `${s.players[by].name} blocks with the ${character}.`)
  // Anyone (alive, not the blocker) may challenge the block, starting after the blocker.
  const deciders = othersInOrder(s, by)
  const pending: Pending = Object.assign({}, p, {
    kind: 'block_challenge' as PendingKind,
    blocker: by, blockClaim: character,
    pendingDeciders: deciders,
    decider: null,
  })
  return advancePending(Object.assign({}, s, { pending, log }))
}

/** `by` declines to block (moves to the next potential blocker, else the action resolves). */
export function passBlock(s: CoupState, by: number): CoupState {
  const p = s.pending
  if (!p || p.kind !== 'block') return s
  if (p.decider !== by) return s
  const rest = p.pendingDeciders.filter(d => d !== by)
  return advancePending(Object.assign({}, s, { pending: Object.assign({}, p, { pendingDeciders: rest, decider: null }) }))
}

// ===== Loss-of-influence sub-state =====
interface LossThen {
  reAdvance?: boolean          // after the loss, just advance the turn (coup)
  thenOpenBlock?: boolean      // after the loss, open the block phase for the original action
  thenBlockStands?: boolean    // after the loss, the block stands → action foiled, advance turn
  thenResolveAction?: boolean  // after the loss, resolve the original action
  thenActionFails?: boolean    // after the loss, the action fails, advance turn
}

/** Stash a forced loss of influence onto the pending machine; the loser will choose a card. */
function startLoss(s: CoupState, loser: number, reason: string, log: LogEntry[], then: LossThen): CoupState {
  const lp = s.players[loser]
  if (!isAlive(lp)) {
    // Nothing to lose (already dead) — skip straight to the continuation.
    return continueAfterLoss(Object.assign({}, s, { log }), then)
  }
  const pending: Pending = {
    kind: 'lose',
    action: s.pending ? s.pending.action : 'income',
    actor: s.pending ? s.pending.actor : s.turn,
    target: s.pending ? s.pending.target : null,
    claim: s.pending ? s.pending.claim : null,
    blocker: s.pending ? s.pending.blocker : null,
    blockClaim: s.pending ? s.pending.blockClaim : null,
    pendingDeciders: [],
    decider: loser,
    loser,
    loseReason: reason,
    drawn: [],
  }
  // Carry the continuation by encoding it on the pending via a tag map.
  ;(pending as Pending & { then?: LossThen }).then = then
  return Object.assign({}, s, { pending, log })
}

/** The loser reveals influence `cardIndex` (or auto-picks if only one option). */
export function resolveLossOfInfluence(s: CoupState, cardIndex?: number): CoupState {
  const p = s.pending
  if (!p || p.kind !== 'lose' || p.loser == null) return s
  const lp = s.players[p.loser]
  const live = lp.cards.map((c, i) => ({ c, i })).filter(o => !o.c.revealed)
  if (live.length === 0) return continueAfterLoss(s, (p as Pending & { then?: LossThen }).then || {})
  let idx = cardIndex
  if (idx == null || lp.cards[idx]?.revealed) idx = live[0].i   // default: first live card
  lp.cards[idx].revealed = true
  let log = push(s.log, 'warn', `${lp.name} loses the ${lp.cards[idx].char} (${p.loseReason}).`)
  if (aliveInfluence(lp) === 0) {
    lp.eliminated = true
    log = push(log, 'sys', `${lp.name} is eliminated.`)
  }
  return continueAfterLoss(Object.assign({}, s, { log }), (p as Pending & { then?: LossThen }).then || {})
}

function continueAfterLoss(s: CoupState, then: LossThen): CoupState {
  // If the game is already won, finalize.
  const winner = checkWinner(s)
  if (winner != null) {
    return Object.assign({}, s, { pending: null, winner, log: push(s.log, 'sys', `${s.players[winner].name} stands alone — the last influence in the court.`) })
  }
  const p = s.pending
  // Rebuild a base pending sans the 'lose' wrapper for continuation routing.
  const base = p ? Object.assign({}, p, { kind: p.kind }) : null

  if (then.reAdvance) return advanceTurn(Object.assign({}, s), s.log)
  if (then.thenActionFails) {
    const name = base ? s.players[base.actor].name : ''
    return advanceTurn(Object.assign({}, s), push(s.log, 'sys', `${name}'s action fails.`))
  }
  if (then.thenBlockStands) return resolveBlockStands(reattach(s))
  if (then.thenResolveAction) return resolveAction(reattach(s))
  if (then.thenOpenBlock) return openBlockOrResolve(reattach(s))
  // Default: just advance.
  return advanceTurn(Object.assign({}, s), s.log)
}

/** Restore pending.kind to a neutral value so the resolve* fns read action/actor/target/blocker. */
function reattach(s: CoupState): CoupState {
  const p = s.pending
  if (!p) return s
  return Object.assign({}, s, { pending: Object.assign({}, p) })
}

// ===== Resolving the action's effect =====
function resolveAction(s: CoupState): CoupState {
  const p = s.pending!
  const actor = s.players[p.actor]
  let log = s.log
  switch (p.action) {
    case 'foreign_aid':
      actor.coins += 2
      log = push(log, 'sys', `${actor.name} collects Foreign Aid (+2 → ${actor.coins}).`)
      return advanceTurn(Object.assign({}, s), log)
    case 'tax':
      actor.coins += 3
      log = push(log, 'sys', `${actor.name} levies Tax (+3 → ${actor.coins}).`)
      return advanceTurn(Object.assign({}, s), log)
    case 'steal': {
      const tgt = s.players[p.target!]
      const amt = Math.min(2, tgt.coins)
      tgt.coins -= amt; actor.coins += amt
      log = push(log, 'sys', `${actor.name} steals ${amt} coin${amt === 1 ? '' : 's'} from ${tgt.name}.`)
      return advanceTurn(Object.assign({}, s), log)
    }
    case 'assassinate': {
      log = push(log, 'sys', `${actor.name}'s assassination strikes home.`)
      return startLoss(Object.assign({}, s, { log }), p.target!, 'the assassination', log, { reAdvance: true })
    }
    case 'exchange': {
      // Draw 2 from the deck; actor chooses which to keep.
      const drawn: Character[] = []
      for (let i = 0; i < 2 && s.deck.length > 0; i++) drawn.push(s.deck.shift()!)
      log = push(log, 'sys', `${actor.name} draws from the court deck to Exchange.`)
      const pending: Pending = Object.assign({}, p, { kind: 'exchange' as PendingKind, decider: p.actor, drawn })
      return Object.assign({}, s, { pending, log })
    }
    default:
      return advanceTurn(Object.assign({}, s), log)
  }
}

/** The block held — the original action is foiled and the turn passes. */
function resolveBlockStands(s: CoupState): CoupState {
  const p = s.pending!
  const log = push(s.log, 'sys', `The block holds — ${s.players[p.actor].name}'s ${ACTION_LABEL[p.action]} is foiled.`)
  return advanceTurn(Object.assign({}, s), log)
}

// ===== Exchange resolution =====
/** Cards the actor may choose among during an exchange: their live cards + the 2 drawn. */
export function exchangeOptions(s: CoupState): { fromHand: number[]; drawn: Character[] } | null {
  const p = s.pending
  if (!p || p.kind !== 'exchange') return null
  const lp = s.players[p.actor]
  return { fromHand: lp.cards.map((c, i) => i).filter(i => !lp.cards[i].revealed), drawn: p.drawn.slice() }
}

/** Actor keeps `keep` characters (must equal their live-card count); the rest go back to the deck.
    `keep` is a multiset of characters chosen from {live hand cards} ∪ {drawn}. */
export function resolveExchange(s: CoupState, keep: Character[], rng?: Rng): CoupState {
  const p = s.pending
  if (!p || p.kind !== 'exchange') return s
  const lp = s.players[p.actor]
  const liveIdx = lp.cards.map((c, i) => i).filter(i => !lp.cards[i].revealed)
  const need = liveIdx.length
  // Pool = live characters + drawn.
  const pool = liveIdx.map(i => lp.cards[i].char).concat(p.drawn)
  // Validate keep is a sub-multiset of pool and the right length; else default to keeping current.
  const keepSafe = sanitizeKeep(pool, keep, need, liveIdx.map(i => lp.cards[i].char))
  // Assign kept characters back to the live card slots.
  for (let k = 0; k < liveIdx.length; k++) lp.cards[liveIdx[k]].char = keepSafe[k]
  // Return the remainder to the deck, then shuffle.
  const returned = removeMulti(pool, keepSafe)
  let deck = s.deck.concat(returned)
  if (rng) deck = shuffle(deck, rng)
  const log = push(s.log, 'sys', `${lp.name} returns ${returned.length} card${returned.length === 1 ? '' : 's'} to the deck.`)
  return advanceTurn(Object.assign({}, s, { deck }), log)
}

function sanitizeKeep(pool: Character[], keep: Character[], need: number, fallback: Character[]): Character[] {
  const poolCopy = pool.slice()
  const out: Character[] = []
  for (const c of keep) {
    if (out.length >= need) break
    const i = poolCopy.indexOf(c)
    if (i >= 0) { out.push(c); poolCopy.splice(i, 1) }
  }
  if (out.length !== need) return fallback.slice(0, need)
  return out
}

function removeMulti(pool: Character[], remove: Character[]): Character[] {
  const out = pool.slice()
  for (const c of remove) {
    const i = out.indexOf(c)
    if (i >= 0) out.splice(i, 1)
  }
  return out
}

// ===== Reshuffle a revealed-true claim back into the deck and redraw =====
function replaceCharacter(s: CoupState, who: number, ch: Character): void {
  const p = s.players[who]
  const idx = p.cards.findIndex(c => !c.revealed && c.char === ch)
  if (idx < 0) return
  s.deck.push(ch)
  // shuffle in a light deterministic way using deck length parity (kept simple; AI uses live rng elsewhere)
  // Draw a replacement from the top after a rotate so it isn't the same card.
  if (s.deck.length > 1) {
    const front = s.deck.shift()!
    s.deck.push(front)
  }
  const drawn = s.deck.shift()
  p.cards[idx].char = drawn != null ? drawn : ch
}

// ===== AI =====
/* The AI is heuristic and intentionally simple + non-degenerate:
   - Mandatory coup at 10+ coins (guaranteed by legalActions).
   - If it can afford a coup AND an opponent is on their last influence (or it is threatened),
     coup them. Else if rich (>= COUP_COST + buffer) sometimes coup the leader.
   - Otherwise pick an economic action it can back up (Tax if it has a Duke, Steal, etc.),
     bluffing a character sometimes via the injected rng.
   Reactive: challenge claims that are implausible (claimant already revealed that char's copies,
   or claims a card the AI itself holds all of), and block when it holds (or chooses to bluff) the
   blocker. Bluff frequency is rng-driven so tests are deterministic. */

export interface AIDecision {
  kind: 'action' | 'challenge' | 'block'
  // action:
  action?: ActionType
  target?: number | null
  // challenge: do?
  doChallenge?: boolean
  // block: with which character (null = don't block)
  blockWith?: Character | null
}

/** Count revealed copies of a character across all players (public information). */
function revealedCount(s: CoupState, ch: Character): number {
  let n = 0
  for (const p of s.players) for (const c of p.cards) if (c.revealed && c.char === ch) n++
  return n
}

/** Decide the AI's reactive or proactive move given the current state. Pure. */
export function aiDecide(s: CoupState, rng: Rng): AIDecision {
  const p = s.pending
  // Reactive: a challenge decision is pending and the decider is an AI.
  if (p && (p.kind === 'action_challenge' || p.kind === 'block_challenge') && p.decider != null && s.players[p.decider].isAI) {
    return aiChallengeDecision(s, p, rng)
  }
  // Reactive: a block decision is pending and the decider is an AI.
  if (p && p.kind === 'block' && p.decider != null && s.players[p.decider].isAI) {
    return aiBlockDecision(s, p, rng)
  }
  // Reactive: exchange — AI keeps the best 2 of its options.
  if (p && p.kind === 'exchange' && s.players[p.actor].isAI) {
    return { kind: 'action' }   // handled directly by aiStep; placeholder
  }
  // Proactive: it's the AI's action turn.
  return aiActionDecision(s, s.turn, rng)
}

function aiChallengeDecision(s: CoupState, p: Pending, rng: Rng): AIDecision {
  const by = p.decider!
  const isBlock = p.kind === 'block_challenge'
  const claimant = isBlock ? p.blocker! : p.actor
  const ch = isBlock ? p.blockClaim! : p.claim!
  const me = s.players[by]
  // How many copies of ch are "accounted for" against the claimant having one:
  //  copies the challenger holds + copies already revealed publicly. If 3 are accounted, the
  //  claimant cannot truthfully hold ch → always challenge.
  const mine = me.cards.filter(c => !c.revealed && c.char === ch).length
  const seen = revealedCount(s, ch)
  const accountedAway = mine + seen
  if (accountedAway >= 3) return { kind: 'challenge', doChallenge: true }

  // If challenging would be likely fatal context: be cautious when on last influence.
  const onLast = aliveInfluence(me) <= 1
  // Plausibility: more accounted-away copies → more suspicious.
  let suspicion = accountedAway / 3            // 0, .33, .66
  // Assassinate/blocks are higher-stakes: challenge a bit more on assassinate blocks.
  if (isBlock && p.action === 'assassinate') suspicion += 0.15
  // The claimant being coin-desperate / late bluffs: small bump.
  const threshold = onLast ? 0.62 : 0.40
  const roll = rng.next()
  if (suspicion >= threshold && roll < 0.85) return { kind: 'challenge', doChallenge: true }
  // Occasional speculative challenge to stay non-passive (rare).
  if (!onLast && roll < 0.05) return { kind: 'challenge', doChallenge: true }
  return { kind: 'challenge', doChallenge: false }
}

function aiBlockDecision(s: CoupState, p: Pending, rng: Rng): AIDecision {
  const by = p.decider!
  const me = s.players[by]
  const opts = blockers(p.action)
  // Prefer a block we can back with a held card.
  for (const ch of opts) {
    if (hasCharacter(me, ch)) return { kind: 'block', blockWith: ch }
  }
  // Bluff-block when threatened: always try to block an assassination aimed at us (survival).
  if (p.action === 'assassinate' && p.target === by) {
    return { kind: 'block', blockWith: 'Contessa' }
  }
  // Sometimes bluff-block a steal/foreign-aid.
  const roll = rng.next()
  if (roll < 0.30 && opts.length > 0) {
    const ch = opts[Math.floor(rng.next() * opts.length)] || opts[0]
    return { kind: 'block', blockWith: ch }
  }
  return { kind: 'block', blockWith: null }
}

function aiActionDecision(s: CoupState, who: number, rng: Rng): AIDecision {
  const me = s.players[who]
  const legal = legalActions(s, who)
  // Mandatory coup.
  if (legal.length === 1 && legal[0] === 'coup') {
    return { kind: 'action', action: 'coup', target: pickCoupTarget(s, who) }
  }
  const opps = legalTargets(s, who)
  // Coup an opponent on their last influence if we can afford it.
  if (me.coins >= COUP_COST) {
    const finishable = opps.find(o => aliveInfluence(s.players[o]) === 1)
    if (finishable != null) return { kind: 'action', action: 'coup', target: finishable }
    // Rich: coup the strongest opponent sometimes.
    if (me.coins >= COUP_COST + 1 && rng.next() < 0.5) {
      return { kind: 'action', action: 'coup', target: pickCoupTarget(s, who) }
    }
  }

  // Assassinate a last-influence opponent if affordable.
  if (me.coins >= ASSASSINATE_COST) {
    const finishable = opps.find(o => aliveInfluence(s.players[o]) === 1)
    if (finishable != null && (hasCharacter(me, 'Assassin') || rng.next() < 0.5)) {
      return { kind: 'action', action: 'assassinate', target: finishable }
    }
    if (hasCharacter(me, 'Assassin') && opps.length > 0) {
      return { kind: 'action', action: 'assassinate', target: pickCoupTarget(s, who) }
    }
  }

  // Tax if we hold a Duke (truthful), else economic mix with occasional bluffs.
  if (hasCharacter(me, 'Duke')) return { kind: 'action', action: 'tax', target: null }
  if (hasCharacter(me, 'Captain') && opps.length > 0) {
    const richest = opps.reduce((a, b) => s.players[b].coins > s.players[a].coins ? b : a, opps[0])
    if (s.players[richest].coins > 0) return { kind: 'action', action: 'steal', target: richest }
  }

  const roll = rng.next()
  // Bluff Tax sometimes (claim Duke).
  if (roll < 0.30) return { kind: 'action', action: 'tax', target: null }
  // Steal (truthful or bluff) from someone with coins.
  if (opps.length > 0 && roll < 0.55) {
    const richest = opps.reduce((a, b) => s.players[b].coins > s.players[a].coins ? b : a, opps[0])
    if (s.players[richest].coins > 0) return { kind: 'action', action: 'steal', target: richest }
  }
  // Exchange to improve our hand occasionally.
  if (roll < 0.70) return { kind: 'action', action: 'exchange', target: null }
  // Safe fallbacks: foreign aid (blockable) then income.
  if (roll < 0.88) return { kind: 'action', action: 'foreign_aid', target: null }
  return { kind: 'action', action: 'income', target: null }
}

function pickCoupTarget(s: CoupState, who: number): number {
  const opps = legalTargets(s, who)
  if (opps.length === 0) return who
  // Target the opponent with the most coins (the biggest threat); tiebreak by fewest influence.
  return opps.reduce((a, b) => {
    const pa = s.players[a], pb = s.players[b]
    if (pb.coins !== pa.coins) return pb.coins > pa.coins ? b : a
    return aliveInfluence(pb) < aliveInfluence(pa) ? b : a
  }, opps[0])
}

/** AI chooses which 2 to keep on exchange: prefer a balanced spread, keeping Duke/Contessa/etc. */
export function aiExchangeKeep(s: CoupState): Character[] {
  const p = s.pending
  if (!p || p.kind !== 'exchange') return []
  const lp = s.players[p.actor]
  const liveChars = lp.cards.filter(c => !c.revealed).map(c => c.char)
  const need = liveChars.length
  const pool = liveChars.concat(p.drawn)
  // Value characters; keep distinct high-value ones, avoiding duplicates when possible.
  const rank: Record<Character, number> = { Duke: 5, Contessa: 4, Captain: 3, Assassin: 3, Ambassador: 2 }
  const sorted = pool.slice().sort((a, b) => rank[b] - rank[a])
  const keep: Character[] = []
  const seen = new Set<Character>()
  for (const c of sorted) {
    if (keep.length >= need) break
    if (!seen.has(c)) { keep.push(c); seen.add(c) }
  }
  // Fill remaining (allow duplicates) if we couldn't get enough distinct.
  for (const c of sorted) { if (keep.length >= need) break; keep.push(c) }
  return keep.slice(0, need)
}

/** Apply one AI step (proactive action OR a reactive decision). Drives self-play / the UI loop.
    `rng` makes it deterministic. Returns an unchanged state if it's not the AI's move. */
export function aiStep(s: CoupState, rng: Rng): CoupState {
  if (s.winner != null) return s
  const p = s.pending

  // Reactive: loss — AI auto-picks which influence to drop (keep the better card).
  if (p && p.kind === 'lose' && p.loser != null && s.players[p.loser].isAI) {
    const idx = aiPickLoss(s, p.loser)
    return resolveLossOfInfluence(s, idx)
  }
  // Reactive: exchange.
  if (p && p.kind === 'exchange' && s.players[p.actor].isAI) {
    return resolveExchange(s, aiExchangeKeep(s), rng)
  }
  // Reactive: challenge / block decisions.
  if (p && (p.kind === 'action_challenge' || p.kind === 'block_challenge') && p.decider != null && s.players[p.decider].isAI) {
    const d = aiChallengeDecision(s, p, rng)
    return d.doChallenge ? challenge(s, p.decider) : passChallenge(s, p.decider)
  }
  if (p && p.kind === 'block' && p.decider != null && s.players[p.decider].isAI) {
    const d = aiBlockDecision(s, p, rng)
    return d.blockWith ? block(s, p.decider, d.blockWith) : passBlock(s, p.decider)
  }

  // Proactive AI action turn.
  if (p == null && s.players[s.turn].isAI) {
    const d = aiActionDecision(s, s.turn, rng)
    return declareAction(s, s.turn, d.action!, d.target ?? null)
  }
  return s
}

/** AI keeps its higher-value card; reveals the lower. Returns the card index to reveal. */
function aiPickLoss(s: CoupState, who: number): number {
  const lp = s.players[who]
  const rank: Record<Character, number> = { Duke: 5, Contessa: 4, Captain: 3, Assassin: 3, Ambassador: 2 }
  let worst = -1, worstRank = Infinity
  for (let i = 0; i < lp.cards.length; i++) {
    if (lp.cards[i].revealed) continue
    const r = rank[lp.cards[i].char]
    if (r < worstRank) { worstRank = r; worst = i }
  }
  return worst >= 0 ? worst : 0
}

/** Is the game waiting on a HUMAN decision (player 0) right now? */
export function waitingOnHuman(s: CoupState): boolean {
  if (s.winner != null) return false
  const p = s.pending
  if (p == null) return s.turn === 0
  if ((p.kind === 'action_challenge' || p.kind === 'block_challenge' || p.kind === 'block') && p.decider === 0) return true
  if (p.kind === 'lose' && p.loser === 0) return true
  if (p.kind === 'exchange' && p.actor === 0) return true
  return false
}

/** Is it an AI's move right now (proactive or reactive)? — drives useAITurn `active`. */
export function aiToMove(s: CoupState): boolean {
  if (s.winner != null) return false
  const p = s.pending
  if (p == null) return s.players[s.turn].isAI
  if ((p.kind === 'action_challenge' || p.kind === 'block_challenge' || p.kind === 'block') && p.decider != null) return s.players[p.decider].isAI
  if (p.kind === 'lose' && p.loser != null) return s.players[p.loser].isAI
  if (p.kind === 'exchange') return s.players[p.actor].isAI
  return false
}

export const winner = (s: CoupState): number | null => s.winner
