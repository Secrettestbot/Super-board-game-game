/* YINSH — UI.
   Ported from design/examples/connection_yinsh/yinsh.jsx onto the framework shell. A
   multi-step board game: place rings, then drop-marker + slide-ring (flipping markers),
   claim 5-in-a-row runs, remove rings.

   Online-capable via useGameSession(yinshAdapter): seat 0 = White, seat 1 = Black. The
   hook drives the AI for any empty seat, so there is no local useAITurn. Everything the
   player sees (your rings/markers, clickability, banners, players panel, result) is
   relative to mySeat; the opponent is "Opponent" when playing online. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { yinshAdapter } from './net'
import * as YI from './logic'
import type { Side, YinshState } from './logic'

// layout: map (c,r) to pixel. columns vertical; offset alternate columns by half.
const SX = 52, SY = 46
function pos(c: number, r: number): [number, number] { const x = 40 + c * SX; const y = 36 + r * SY + (c % 2) * (SY / 2); return [x, y] }
const BW = 40 * 2 + 10 * SX, BH = 36 * 2 + 10 * SY + SY / 2

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#11161c" stroke="#33414e" strokeWidth="1.5" />
    <circle cx="18" cy="20" r="7" fill="none" stroke="#e6e2d6" strokeWidth="2.6" />
    <circle cx="30" cy="28" r="7" fill="none" stroke="#c0392b" strokeWidth="2.6" />
  </svg>
)

export function Yinsh() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(yinshAdapter)
  const me: Side = mySeat === 0 ? 'w' : 'b' // seat 0 = White, seat 1 = Black
  const opp: Side = me === 'w' ? 'b' : 'w'
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setShowRules(false) }

  // isMyTurn gates ALL interaction — placement, drop, slide, and run/ring removals.
  const active = !s.winner && isMyTurn
  const pend = s.pendingRing
  const moveTargets = useMemo(() => {
    if (!pend || !active) return new Set<string>()
    const [c, r] = pend.split(",").map(Number)
    return new Set(YI.ringMoves(s, c, r))
  }, [pend, s, active])

  function clickPoint(k: string) {
    if (s.winner || !isMyTurn) return
    if (s.removingRing === me) { if (s.rings[k] === me) dispatch({ kind: 'removeRing', cell: k }); return }
    if (s.pendingRows && s.pendingRows.who === me) return // handled via run buttons
    if (s.phase === "place") { dispatch({ kind: 'placeRing', cell: k }); return }
    if (pend) { if (moveTargets.has(k)) dispatch({ kind: 'moveRing', to: k }); else if (k === pend) dispatch({ kind: 'cancelDrop' }); return }
    if (s.rings[k] === me) dispatch({ kind: 'dropMarker', cell: k })
  }

  const myRuns = s.pendingRows && s.pendingRows.who === me && isMyTurn ? s.pendingRows.runs : null
  function clickRun(run: string[]) { dispatch({ kind: 'removeRow', run }) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); if (pend && isMyTurn) dispatch({ kind: 'cancelDrop' }) },
  })

  const oppName = net.online ? 'Opponent' : 'Rival'
  const myWon = s.winner === me
  const oppActing = !s.winner && !isMyTurn

  let banner: string, bk = ""
  if (myWon) { bk = "win"; banner = "Three rings — you win" }
  else if (s.winner === opp) { bk = "lose"; banner = `${oppName} claims three rings` }
  else if (s.phase === "place") { bk = active ? "you" : "foe"; banner = active ? `Place a ring (${s.placed[me]}/5)` : `${oppName} is placing…` }
  else if (s.removingRing === me) { bk = "you"; banner = "Row complete! Remove one of your rings" }
  else if (s.pendingRows && s.pendingRows.who === me) { bk = "you"; banner = "Choose a row to claim" }
  else if (s.removingRing === opp || (s.pendingRows && s.pendingRows.who === opp)) { bk = "foe"; banner = `${oppName} scores a row…` }
  else if (pend && active) { bk = "you"; banner = "Slide the ring — it flips every marker it jumps" }
  else if (active) { bk = "you"; banner = "Drop a marker in one of your rings" }
  else { bk = "foe"; banner = `${oppName} is moving…` }

  const lastSet = new Set<string>()
  if (s.last) { if (s.last.from) lastSet.add(s.last.from); if (s.last.to) lastSet.add(s.last.to); if (s.last.place) lastSet.add(s.last.place); if (s.last.drop) lastSet.add(s.last.drop) }
  const runHi = myRuns ? new Set<string>(([] as string[]).concat(...myRuns)) : new Set<string>()

  const myTurnOn = !s.winner && isMyTurn
  const oppTurnOn = oppActing

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Yinsh · rings & markers"
        title="Yinsh"
        subtitle="slide rings to flip markers, line up five, and give up rings to win"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={s.phase === "place" ? "Placing rings" : "Rings won — first to 3"}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="boardwrap">
          <div className="board">
            <svg viewBox={`0 0 ${BW} ${BH}`} className="yboard" preserveAspectRatio="xMidYMid meet">
              {/* connecting grid lines */}
              {YI.PTS.map(([c, r]) => {
                const [x, y] = pos(c, r)
                return [[1, 0], [0, 1], [1, 1]].map(([dc, dr], di) => {
                  if (!YI.has(c + dc, r + dr)) return null
                  const [x2, y2] = pos(c + dc, r + dr)
                  return <line key={c + "_" + r + "_" + di} x1={x} y1={y} x2={x2} y2={y2} className="gridline" />
                })
              })}
              {YI.PTS.map(([c, r]) => { const [x, y] = pos(c, r); return <circle key={"n" + c + "_" + r} cx={x} cy={y} r="3" className="node" /> })}

              {/* markers */}
              {Object.keys(s.markers).map(k => { const [c, r] = k.split(",").map(Number); const [x, y] = pos(c, r); return <circle key={"m" + k} cx={x} cy={y} r="13" className={"marker " + s.markers[k] + (runHi.has(k) ? " runhi" : "")} /> })}
              {/* rings */}
              {Object.keys(s.rings).map(k => { const [c, r] = k.split(",").map(Number); const [x, y] = pos(c, r); const removable = (s.removingRing === me && isMyTurn && s.rings[k] === me); return <circle key={"r" + k} cx={x} cy={y} r="17" className={"ring " + s.rings[k] + (pend === k ? " pend" : "") + (lastSet.has(k) ? " last" : "") + (removable ? " removable" : "")} /> })}
              {/* move targets */}
              {[...moveTargets].map(k => { const [c, r] = k.split(",").map(Number); const [x, y] = pos(c, r); return <circle key={"t" + k} cx={x} cy={y} r="9" className="movedot" /> })}
              {/* click layer */}
              {YI.PTS.map(([c, r]) => { const [x, y] = pos(c, r); const k = YI.key(c, r); return <circle key={"c" + k} cx={x} cy={y} r="20" className="hit" onClick={() => clickPoint(k)} /> })}
            </svg>
            {myRuns && <div className="runpicker">{myRuns.map((run, i) => <button key={i} className="runbtn" onClick={() => clickRun(run)}>Claim row {i + 1}</button>)}</div>}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel players">
            <div className={"pl " + me + (myTurnOn ? " on" : "")}>
              <span className={"pl-ring " + me}></span><span className="pl-name">You · {me === 'w' ? 'White' : 'Black'}</span><span className="pl-sc">{s.score[me]}<i>/3</i></span>
            </div>
            <div className={"pl " + opp + (oppTurnOn ? " on" : "")}>
              <span className={"pl-ring " + opp}></span><span className="pl-name">{oppName} · {opp === 'w' ? 'White' : 'Black'}</span><span className="pl-sc">{s.score[opp]}<i>/3</i></span>
            </div>
          </div>
          <div className="panel hint">
            <div className="panel-l">The turn</div>
            <div className="hint-txt">Drop a marker inside a ring, then slide that ring in a straight line — over empties, or jumping a run of markers to land just beyond. <b>Every marker jumped flips colour.</b> Make a row of five of your colour to remove it and a ring.</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <WinModal won={myWon} myScore={s.score[me]} oppScore={s.score[opp]} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function WinModal({ won, myScore, oppScore, oppName, onNew }: { won: boolean; myScore: number; oppScore: number; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? "Three claimed" : "Outflipped"}
      title={won ? "You Win" : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myScore}</span><span className="foe">{oppName} {oppScore}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Yinsh" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>First you each place your <b>five rings</b> on the board, alternating. Then on a turn you <b>drop a marker</b> (your colour) inside one of your rings and <b>move that ring</b> in a straight line.</p>
        <p>The ring slides over empty points, or jumps across a solid run of markers to land on the first empty point beyond. <b>Every marker the ring passes over flips to the opposite colour.</b></p>
        <p>Line up <b>five</b> of your markers in a row to remove them and take one of your own rings off the board — that's a point. <b>First to remove three rings wins.</b></p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel drop.</p>
      </div>
    </Modal>
  )
}
