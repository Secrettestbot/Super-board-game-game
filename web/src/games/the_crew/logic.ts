/* THE CREW — cooperative trick-taking logic.
   Ported from design/examples/coop_the_crew/crew_logic.jsx; the IIFE + window.CrewLogic
   global became ESM exports and a CrewState type. The cooperative AI is unchanged.

   3 crew (you + Vega + Orion). 40 cards: 4 colours × 1-9 plus 4 rockets (trump) 1-4. Each
   mission has public TASK cards; a task is assigned to the crew member who must WIN that
   exact card in a trick. Follow suit; rockets trump. The crew wins when every task is
   fulfilled; if a task card is taken by the wrong member, the mission fails. */

export type Suit = 'pink' | 'blue' | 'green' | 'yellow' | 'rocket'
export interface Card { id: number; suit: Suit; val: number }
export interface TrickCard { player: number; card: Card }
export interface Task { cardId: number; suit: Suit; val: number; assignee: number; done: boolean; failed?: boolean }
export interface LogEntry { t: string; x: string }

export interface CrewState {
  missionNo: number
  hands: Card[][]
  tasks: Task[]
  trick: TrickCard[]
  leader: number
  turn: number | null
  trickNo: number
  lastTrick: { cards: TrickCard[]; winner: number } | null
  result: 'win' | 'lose' | null
  log: LogEntry[]
}

export const SUITS: Suit[] = ["pink", "blue", "green", "yellow"]
export const NAMES = ["You", "Vega", "Orion"]
let UID = 0
function card(suit: Suit, val: number): Card { return { id: ++UID, suit, val } }

function buildDeck(): Card[] {
  const d: Card[] = []
  for (const s of SUITS) for (let v = 1; v <= 9; v++) d.push(card(s, v))
  for (let v = 1; v <= 4; v++) d.push(card("rocket", v))
  return d
}
function shuffle<T>(a: T[]): T[] { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]] } return a }

export function sortHand(h: Card[]): Card[] {
  const order: Record<Suit, number> = { pink: 0, blue: 1, green: 2, yellow: 3, rocket: 4 }
  return h.slice().sort((a, b) => order[a.suit] - order[b.suit] || a.val - b.val)
}

export function makeMission(missionNo: number): CrewState {
  let deck = shuffle(buildDeck())
  // 40 isn't divisible by 3 — set one non-rocket card aside so hands are even (13 each)
  const di = deck.findIndex(c => c.suit !== "rocket")
  deck.splice(di, 1)
  const hands = [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39)].map(sortHand)
  // commander = holder of rocket 4
  let commander = 0
  hands.forEach((h, i) => { if (h.some(c => c.suit === "rocket" && c.val === 4)) commander = i })
  // tasks: prefer high colour cards (far more winnable with AI crewmates), assign to holder
  const taskCount = Math.min(missionNo, 5)
  const colourCards: { c: Card; pi: number }[] = []
  hands.forEach((h, pi) => h.forEach(c => { if (c.suit !== "rocket") colourCards.push({ c, pi }) }))
  const high = shuffle(colourCards.filter(o => o.c.val >= 6))
  const rest = shuffle(colourCards.filter(o => o.c.val < 6))
  const chosen = high.concat(rest).slice(0, taskCount)
  const tasks: Task[] = chosen.map(o => ({ cardId: o.c.id, suit: o.c.suit, val: o.c.val, assignee: o.pi, done: false }))
  return {
    missionNo, hands, tasks,
    trick: [], leader: commander, turn: commander, trickNo: 0,
    lastTrick: null, result: null,
    log: [{ t: "sys", x: `Mission ${missionNo}: ${taskCount} task${taskCount > 1 ? "s" : ""}. ${NAMES[commander]} ${commander === 0 ? "are" : "is"} commander and leads.` }],
  }
}

function ledSuit(trick: TrickCard[]) { return trick.length ? trick[0].card.suit : null }
export function legalCards(hand: Card[], trick: TrickCard[]): Card[] {
  const ls = ledSuit(trick)
  if (!ls) return hand.slice()
  const has = hand.filter(c => c.suit === ls)
  return has.length ? has : hand.slice()
}
export function trickWinner(trick: TrickCard[]): number {
  const ls = trick[0].card.suit
  let best = trick[0]
  for (const e of trick) {
    const c = e.card, b = best.card
    if (c.suit === "rocket" && b.suit !== "rocket") best = e
    else if (c.suit === "rocket" && b.suit === "rocket") { if (c.val > b.val) best = e }
    else if (b.suit !== "rocket" && c.suit === ls && c.val > b.val) best = e
  }
  return best.player
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-50) }

export function playCard(s: CrewState, player: number, cardId: number): CrewState {
  if (s.result || s.turn !== player) return s
  const hand = s.hands[player]
  const c = hand.find(x => x.id === cardId)
  if (!c) return s
  if (!legalCards(hand, s.trick).some(x => x.id === cardId)) return s

  const hands = s.hands.map((h, i) => i === player ? h.filter(x => x.id !== cardId) : h)
  const trick = s.trick.concat([{ player, card: c }])
  let log = push(s.log, player === 0 ? "you" : "ai", `${NAMES[player]} played ${cardLabel(c)}.`)

  if (trick.length < 3) {
    return Object.assign({}, s, { hands, trick, turn: (player + 1) % 3, log })
  }
  // resolve trick
  const winner = trickWinner(trick)
  log = push(log, winner === 0 ? "you" : "ai", `${NAMES[winner]} won the trick.`)
  // task checks
  const tasks = s.tasks.map(t => Object.assign({}, t))
  let failed: Task | null = null
  for (const e of trick) {
    const task = tasks.find(tk => tk.cardId === e.card.id && !tk.done)
    if (task) {
      if (winner === task.assignee) { task.done = true; log = push(log, "task", `✓ ${NAMES[task.assignee]} secured ${suitName(task.suit)} ${task.val}.`) }
      else { task.failed = true; failed = task }
    }
  }
  let s2: CrewState = Object.assign({}, s, {
    hands, trick: [], turn: winner, leader: winner, trickNo: s.trickNo + 1,
    lastTrick: { cards: trick, winner }, tasks, log,
  })
  if (failed) { s2.result = "lose"; s2.log = push(s2.log, "fail", `✗ ${suitName(failed.suit)} ${failed.val} went to ${NAMES[winner]} — mission failed.`); s2.turn = null; return s2 }
  if (tasks.every(t => t.done)) { s2.result = "win"; s2.log = push(s2.log, "win", "All tasks complete — mission accomplished!"); s2.turn = null; return s2 }
  // out of cards with tasks remaining (shouldn't normally happen) → lose
  if (hands.every(h => h.length === 0) && !tasks.every(t => t.done)) { s2.result = "lose"; s2.log = push(s2.log, "fail", "Cards exhausted with tasks unmet — mission failed."); s2.turn = null }
  return s2
}

// ===== cooperative AI =====
function strength(c: Card) { return c.suit === "rocket" ? 100 + c.val : c.val }
function taskOf(tasks: Task[], c: Card) { return tasks.find(t => t.cardId === c.id) || null }

function aiChoose(s: CrewState, player: number): number {
  const hand = s.hands[player]
  const legal = legalCards(hand, s.trick)
  if (legal.length === 1) return legal[0].id
  const tasks = s.tasks.filter(t => !t.done)
  const isLast = s.trick.length === 2
  const winnerNow = s.trick.length ? trickWinner(s.trick) : -1
  // a committed task = a task card already played in this trick (only its assignee can hold it)
  const committed = s.trick.map(e => taskOf(tasks, e.card)).find(Boolean) || null

  function scoreCard(c: Card) {
    const prosp = s.trick.concat([{ player, card: c }])
    const winnerAfter = trickWinner(prosp)
    let sc = -strength(c) * 0.22                 // base: prefer dumping weak cards
    const myTask = taskOf(tasks, c) && taskOf(tasks, c)!.assignee === player ? taskOf(tasks, c) : null

    if (committed) {
      const a = committed.assignee
      if (winnerAfter === a) sc += isLast ? 300 : 40        // assignee keeps the lead
      else {
        if (winnerNow === a) sc -= 350                      // I'd steal it from the assignee
        else sc -= isLast ? 220 : 25                        // assignee already not winning
      }
    } else if (myTask) {
      // committing my own task card — only when I actually win it
      if (winnerAfter === player) sc += isLast ? 260 : 50
      else sc -= 120                                         // would lose my own task → avoid
    } else {
      // no task committed and this isn't my task card
      if (winnerAfter === player) sc -= 7 + strength(c) * 0.25 // don't grab tricks needlessly
      if (c.suit === "rocket") sc -= 9                      // save rockets
    }
    return sc
  }

  if (s.trick.length === 0) {
    // leading
    const myStrongTask = legal.filter(c => { const t = taskOf(tasks, c); return t && t.assignee === player && c.suit !== "rocket" && c.val >= 8 }).sort((a, b) => b.val - a.val)[0]
    if (myStrongTask) return myStrongTask.id
    // suits where SOME crewmate holds a task → avoid leading those (risk forcing a bad trick)
    const taskSuits = new Set(tasks.map(t => t.suit))
    const safe = legal.filter(c => c.suit !== "rocket" && !taskOf(tasks, c) && !taskSuits.has(c.suit)).sort((a, b) => a.val - b.val)
    if (safe.length) return safe[0].id
    const lowNonTask = legal.filter(c => c.suit !== "rocket" && !taskOf(tasks, c)).sort((a, b) => a.val - b.val)
    if (lowNonTask.length) return lowNonTask[0].id
    return legal.slice().sort((a, b) => strength(a) - strength(b))[0].id
  }
  let best = legal[0], bestSc = -Infinity
  for (const c of legal) { const v = scoreCard(c) + Math.random() * 0.8; if (v > bestSc) { bestSc = v; best = c } }
  return best.id
}

export function aiStep(s: CrewState): CrewState {
  if (s.result || s.turn == null || s.turn === 0) return s
  return playCard(s, s.turn, aiChoose(s, s.turn))
}

export function cardLabel(c: Card) { return c.suit === "rocket" ? "Rocket " + c.val : suitName(c.suit) + " " + c.val }
export function suitName(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
