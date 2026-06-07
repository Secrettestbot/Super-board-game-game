/* THE CREW — UI.
   A 3-player co-op trick-taker on the framework shell. Seat-relative: your hand comes
   from `mySeat`, isMyTurn gates play, and the tasks / trick / progress are shared and
   public. Solo play fills the other two seats with the existing co-op AI (driven by the
   session hook); online play lets teammates join those seats. Because a crewmate can win
   a trick and lead the next, the AI re-arms inside useGameSession on tickKey.

   HIDDEN INFO: only your own hand is real; teammates' hands are redacted to counts (the
   adapter blanks them before a view crosses the wire). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { theCrewAdapter, seedMission } from './net'
import * as CR from './logic'
import type { Card as TCard, CrewState, Task } from './logic'

const CREWCLS = ["cr-you", "cr-vega", "cr-orion"]

function Card({ c, size, faded, dim, onClick, ring }: {
  c: { suit: string; val: number }; size?: string; faded?: boolean; dim?: boolean; onClick?: () => void; ring?: number
}) {
  const cls = ["card", "suit-" + c.suit]
  if (size) cls.push(size)
  if (faded) cls.push("faded")
  if (dim) cls.push("dim")
  if (ring != null) cls.push("ring", CREWCLS[ring])
  return (
    <div className={cls.join(" ")} onClick={onClick}>
      {c.suit === "rocket" ? <span className="rocket-emblem"></span> : null}
      <span className="cval">{c.val}</span>
    </div>
  )
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#0b1018" stroke="#2e3f52" strokeWidth="1.5" />
    <circle cx="24" cy="24" r="13" fill="none" stroke="#4fd0e0" strokeWidth="1.4" opacity="0.5" />
    <path d="M24 12 L27 22 L24 30 L21 22 Z" fill="#4fd0e0" />
    <circle cx="24" cy="20" r="2" fill="#0b1018" />
    <path d="M21 28 l-3 5 M27 28 l3 5" stroke="#e0a64e" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export function Crew() {
  // Mission number is host/UI state; bumping `epoch` remounts the session so makeGame()
  // mints the seeded mission. Online play stays on mission 1 (epoch never advances there).
  const [mission, setMission] = useState(1)
  const [epoch, setEpoch] = useState(0)
  function startMission(n: number) { seedMission(n); setMission(n); setEpoch(e => e + 1) }
  return <CrewBoard key={epoch} mission={mission} onStartMission={startMission} />
}

function CrewBoard({ mission, onStartMission }: { mission: number; onStartMission: (n: number) => void }) {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(theCrewAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Restart the current mission: reset local UI then the session.
  function restart() { setShowRules(false); seedMission(mission); netNew() }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({ onNew: restart, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  // Seat-relative naming: in solo keep the flavour names; online say "You" / "Player N".
  function nameFor(p: number): string {
    if (p === mySeat) return "You"
    if (net.online) return `Player ${p + 1}`
    return CR.NAMES[p] ?? `Player ${p + 1}`
  }

  const yourTurn = !s.result && isMyTurn
  const myHand = s.hands[mySeat] ?? []
  const legal = yourTurn ? new Set(CR.legalCards(myHand, s.trick).map(c => c.id)) : new Set<number>()

  function playYou(c: TCard) { if (yourTurn && legal.has(c.id)) dispatch({ kind: 'play', cardId: c.id }) }

  const shown = s.trick.length ? { cards: s.trick, winner: null as number | null } : s.lastTrick
  function seatCard(p: number) { return shown ? (shown.cards.find(e => e.player === p) || null) : null }
  function tasksOf(p: number) { return s.tasks.filter(t => t.assignee === p) }

  // Other crew seats (everyone but me), in stable order, for the two top panels.
  const otherSeats: number[] = []
  for (let p = 0; p < s.hands.length; p++) if (p !== mySeat) otherSeats.push(p)
  // Trick-center column order: left teammate, me (centre), right teammate.
  const centerOrder = [otherSeats[0], mySeat, otherSeats[1]].filter((p): p is number => p != null)

  let banner: string, bk = ""
  if (s.result === "win") { bk = "win"; banner = "Mission accomplished" }
  else if (s.result === "lose") { bk = "lose"; banner = "Mission failed" }
  else if (yourTurn) { bk = "you"; banner = s.trick.length ? "Your turn — follow the lead" : "Your turn — lead a card" }
  else { bk = "foe"; banner = `${nameFor(s.turn!)} is playing…` }

  function CrewSeat({ p }: { p: number }) {
    const c = seatCard(p)
    const isWinner = shown != null && shown.winner === p
    return (
      <div className={"seat " + CREWCLS[p] + (s.turn === p && !s.result ? " active" : "")}>
        <div className="seat-top">
          <span className="seat-name">{nameFor(p)}</span>
          <span className="seat-cards">{s.hands[p].length}🂠</span>
        </div>
        <div className="seat-tasks">{tasksOf(p).map(tk => <TaskBadge key={tk.cardId} task={tk} small />)}{tasksOf(p).length === 0 && <span className="no-task">no task</span>}</div>
        <div className="seat-play">{c ? <Card c={c.card} size="play" faded={shown!.winner != null && !isWinner} /> : <div className="play-empty"></div>}{isWinner && <span className="won-tag">won</span>}</div>
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="The Crew · co-op trick-taking"
        title="The Crew"
        subtitle="silent teamwork in deep space — win the right cards for the right crewmate"
        onRules={() => setShowRules(true)}
        onNew={restart}
        newLabel="Restart"
        modeLeft={`Mission ${mission} · ${s.tasks.filter(t => t.done).length}/${s.tasks.length} tasks`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · restart &nbsp; ? · rules</>}
      >
        <div className="playcol">
          <div className="crewstrip">
            {otherSeats[0] != null ? <CrewSeat p={otherSeats[0]} /> : <div className="seat" />}
            <div className="trick-center">
              <div className="tc-label">{shown ? (s.trick.length ? "current trick" : "last trick") : "awaiting launch"}</div>
              <div className="tc-cards">
                {centerOrder.map(p => { const e = seatCard(p); return (
                  <div key={p} className={"tc-slot" + (shown && shown.winner === p ? " win" : "")}>
                    {e ? <Card c={e.card} size="play" faded={shown!.winner != null && shown!.winner !== p} /> : <div className="play-empty"></div>}
                    <span className="tc-who">{nameFor(p)}</span>
                  </div>
                ) })}
              </div>
            </div>
            {otherSeats[1] != null ? <CrewSeat p={otherSeats[1]} /> : <div className="seat" />}
          </div>

          <div className="youzone">
            <div className="youhead">
              <span className="yh-name">You</span>
              <div className="yh-tasks">{tasksOf(mySeat).map(tk => <TaskBadge key={tk.cardId} task={tk} />)}{tasksOf(mySeat).length === 0 && <span className="no-task">no task assigned</span>}</div>
            </div>
            <div className="hand">
              {CR.sortHand(myHand).map(c => {
                const isLegal = legal.has(c.id)
                const isTask = s.tasks.some(tk => tk.cardId === c.id)
                return <div key={c.id} className={"handcard" + (yourTurn && !isLegal ? " illegal" : "") + (isTask ? " istask" : "")}>
                  <Card c={c} size="hand" onClick={yourTurn && isLegal ? () => playYou(c) : undefined} dim={yourTurn && !isLegal} />
                  {isTask && <span className="task-pip"></span>}
                </div>
              })}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel tasklist">
            <div className="panel-l">Mission tasks</div>
            <div className="tl-rows">
              {s.tasks.map(tk => (
                <div key={tk.cardId} className={"tl-row" + (tk.done ? " done" : "") + (tk.failed ? " failed" : "")}>
                  <Card c={{ suit: tk.suit, val: tk.val }} size="mini" ring={tk.assignee} />
                  <span className="tl-who">{nameFor(tk.assignee)}</span>
                  <span className="tl-status">{tk.done ? "✓ done" : tk.failed ? "✗ failed" : "pending"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}
          </div>

          <div className="panel"><OnlineBar net={net} /></div>
        </div>
      </GameShell>

      {s.result && <ResultModal s={s} mission={mission} canAdvance={!net.online} onNext={() => onStartMission(mission + 1)} onRetry={restart} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function TaskBadge({ task, small }: { task: Task; small?: boolean }) {
  const c = { suit: task.suit, val: task.val }
  return (
    <div className={"taskbadge" + (task.done ? " done" : "") + (task.failed ? " failed" : "")}>
      <Card c={c} size={small ? "tiny" : "mini"} ring={task.assignee} />
      {task.done && <span className="tb-mark ok">✓</span>}
      {task.failed && <span className="tb-mark no">✗</span>}
    </div>
  )
}

function ResultModal({ s, mission, canAdvance, onNext, onRetry }: { s: CrewState; mission: number; canAdvance: boolean; onNext: () => void; onRetry: () => void }) {
  const won = s.result === "win"
  return (
    <Modal
      eyebrow={won ? "Telemetry nominal" : "Telemetry lost"}
      title={won ? "Mission Complete" : "Mission Failed"}
      closeOnOverlay={false}
      actions={won
        ? <>
            {canAdvance && <button className="btn-modal" onClick={onNext}>Mission {mission + 1} →</button>}
            <button className="btn-modal ghost" onClick={onRetry}>Replay</button>
          </>
        : <button className="btn-modal" onClick={onRetry}>Retry mission</button>}
    >
      <div className="finalsc">{won ? `Mission ${mission} cleared — ${s.tasks.length} task${s.tasks.length > 1 ? "s" : ""} fulfilled` : "A task card went to the wrong crewmate"}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="The Crew" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Launch</button>}>
      <div className="modal-body">
        <p>A <b>cooperative</b> trick-taking game. You and your crewmates <i>Vega</i> and <i>Orion</i> share one goal: fulfil every <b>task</b>.</p>
        <p>Each task is a card pinned to one crewmate (ringed in their colour). That crewmate must <b>win the trick</b> containing their card. If anyone else takes it, the mission fails at once.</p>
        <p>Normal trick rules: follow the led colour if you can; otherwise play anything. <b>Rockets</b> are trump and beat all colours. Highest card wins the trick and leads the next.</p>
        <p>Clear a mission and the next adds another task. Play carefully — you can't tell your crewmates what's in your hand.</p>
        <p><b>Keys:</b> <kbd>N</kbd> restart · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
