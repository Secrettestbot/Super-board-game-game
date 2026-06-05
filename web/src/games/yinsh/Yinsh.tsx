/* YINSH — UI.
   Ported from design/examples/connection_yinsh/yinsh.jsx onto the framework shell. A
   multi-step board game: place rings, then drop-marker + slide-ring (flipping markers),
   claim 5-in-a-row runs, remove rings. The AI takes several sub-steps while it stays
   Black's turn, so useAITurn re-arms on a tick covering all the pending sub-state. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as YI from './logic'
import type { YinshState } from './logic'

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
  const [s, setS] = useState<YinshState>(() => YI.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(YI.makeGame()); setShowRules(false) }

  const aiActing = !s.winner && ((s.phase === "place" && s.turn === "b") || (s.phase === "play" && s.turn === "b" && !s.pendingRing) || (!!s.pendingRows && s.pendingRows.who === "b") || s.removingRing === "b")
  useAITurn(aiActing, () => setS(p => YI.aiTurn(p)), {
    delayMs: 480,
    tick: `${s.turn}|${s.pendingRing}|${s.pendingRows ? s.pendingRows.who : ''}|${s.removingRing}|${s.score.w}-${s.score.b}|${s.placed.w}-${s.placed.b}`,
  })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); if (s.pendingRing) setS(YI.cancelDrop(s)) },
  })

  const yourTurn = !s.winner && s.turn === "w"
  const pend = s.pendingRing
  const moveTargets = useMemo(() => {
    if (!pend) return new Set<string>()
    const [c, r] = pend.split(",").map(Number)
    return new Set(YI.ringMoves(s, c, r))
  }, [pend, s])

  function clickPoint(k: string) {
    if (s.winner) return
    if (s.removingRing === "w") { if (s.rings[k] === "w") setS(YI.removeRing(s, k)); return }
    if (s.pendingRows && s.pendingRows.who === "w") return // handled via run buttons
    if (!yourTurn) return
    if (s.phase === "place") { setS(YI.placeRing(s, k)); return }
    if (pend) { if (moveTargets.has(k)) setS(YI.moveRing(s, k)); else if (k === pend) setS(YI.cancelDrop(s)); return }
    if (s.rings[k] === "w") setS(YI.dropMarker(s, k))
  }

  const myRuns = s.pendingRows && s.pendingRows.who === "w" ? s.pendingRows.runs : null
  function clickRun(run: string[]) { setS(YI.removeRun(s, run)) }

  let banner: string, bk = ""
  if (s.winner === "w") { bk = "win"; banner = "Three rings — you win" }
  else if (s.winner === "b") { bk = "lose"; banner = "The rival claims three rings" }
  else if (s.phase === "place") { bk = yourTurn ? "you" : "foe"; banner = yourTurn ? `Place a ring (${s.placed.w}/5)` : "Rival is placing…" }
  else if (s.removingRing === "w") { bk = "you"; banner = "Row complete! Remove one of your rings" }
  else if (s.pendingRows && s.pendingRows.who === "w") { bk = "you"; banner = "Choose a row to claim" }
  else if (s.removingRing === "b" || (s.pendingRows && s.pendingRows.who === "b")) { bk = "foe"; banner = "Rival scores a row…" }
  else if (pend && yourTurn) { bk = "you"; banner = "Slide the ring — it flips every marker it jumps" }
  else if (yourTurn) { bk = "you"; banner = "Drop a marker in one of your rings" }
  else { bk = "foe"; banner = "The rival is moving…" }

  const lastSet = new Set<string>()
  if (s.last) { if (s.last.from) lastSet.add(s.last.from); if (s.last.to) lastSet.add(s.last.to); if (s.last.place) lastSet.add(s.last.place); if (s.last.drop) lastSet.add(s.last.drop) }
  const runHi = myRuns ? new Set<string>(([] as string[]).concat(...myRuns)) : new Set<string>()

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
              {Object.keys(s.rings).map(k => { const [c, r] = k.split(",").map(Number); const [x, y] = pos(c, r); const removable = (s.removingRing === "w" && s.rings[k] === "w"); return <circle key={"r" + k} cx={x} cy={y} r="17" className={"ring " + s.rings[k] + (pend === k ? " pend" : "") + (lastSet.has(k) ? " last" : "") + (removable ? " removable" : "")} /> })}
              {/* move targets */}
              {[...moveTargets].map(k => { const [c, r] = k.split(",").map(Number); const [x, y] = pos(c, r); return <circle key={"t" + k} cx={x} cy={y} r="9" className="movedot" /> })}
              {/* click layer */}
              {YI.PTS.map(([c, r]) => { const [x, y] = pos(c, r); const k = YI.key(c, r); return <circle key={"c" + k} cx={x} cy={y} r="20" className="hit" onClick={() => clickPoint(k)} /> })}
            </svg>
            {myRuns && <div className="runpicker">{myRuns.map((run, i) => <button key={i} className="runbtn" onClick={() => clickRun(run)}>Claim row {i + 1}</button>)}</div>}
          </div>
        </div>

        <div className="side">
          <div className="panel players">
            <div className={"pl w" + (s.turn === "w" && !s.winner ? " on" : "")}>
              <span className="pl-ring w"></span><span className="pl-name">You · White</span><span className="pl-sc">{s.score.w}<i>/3</i></span>
            </div>
            <div className={"pl b" + (s.turn === "b" && !s.winner ? " on" : "")}>
              <span className="pl-ring b"></span><span className="pl-name">Rival · Black</span><span className="pl-sc">{s.score.b}<i>/3</i></span>
            </div>
          </div>
          <div className="panel hint">
            <div className="panel-l">The turn</div>
            <div className="hint-txt">Drop a marker inside a ring, then slide that ring in a straight line — over empties, or jumping a run of markers to land just beyond. <b>Every marker jumped flips colour.</b> Make a row of five of your colour to remove it and a ring.</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <WinModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function WinModal({ s, onNew }: { s: YinshState; onNew: () => void }) {
  const won = s.winner === "w"
  return (
    <Modal
      eyebrow={won ? "Three claimed" : "Outflipped"}
      title={won ? "You Win" : "Rival Wins"}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {s.score.w}</span><span className="foe">Rival {s.score.b}</span></div>
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
