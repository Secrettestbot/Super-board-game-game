/* RAILROAD INK — UI (built for this codebase). Two 7x7 blueprint grids on the framework
   shell. Each round 4 shared dice roll; pick a die, rotate it, and click a highlighted
   cell to draw it (road-to-road, rail-to-rail). The AI fills its own grid one piece at a
   time, so its driver re-arms on s.step (useAITurn tick). After 7 rounds the higher score
   wins. The end state is shown by default (no hide-on-entrance). */

import { useEffect, useRef, useState } from 'react'
import type { ReactElement, CSSProperties } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as RR from './logic'
import type { RRState, Tile, EdgeType, ScoreBreakdown, Exit } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#16203f" stroke="#33477099" strokeWidth="1.5" />
    <path d="M9 24 H39" stroke="#6fe0f0" strokeWidth="3" strokeLinecap="round" />
    <path d="M24 9 V39" stroke="#ffb74d" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 3.5" />
    <circle cx="24" cy="24" r="4" fill="#c79bff" stroke="#7a52b8" strokeWidth="1.2" />
    <circle cx="9" cy="24" r="2.6" fill="#6fe0f0" /><circle cx="39" cy="24" r="2.6" fill="#6fe0f0" />
    <circle cx="24" cy="9" r="2.6" fill="#ffb74d" /><circle cx="24" cy="39" r="2.6" fill="#ffb74d" />
  </svg>
)

// ---- tile SVG rendering ------------------------------------------------------
// side -> the point on the cell edge it reaches (svg 0..100 box). center is 50,50.
const EDGE_PT: Record<number, [number, number]> = {
  [RR.N_]: [50, 0], [RR.E_]: [100, 50], [RR.S_]: [50, 100], [RR.W_]: [0, 50],
}

function strokeFor(t: EdgeType): { color: string; w: number; dash?: string } {
  if (t === 'road') return { color: 'var(--road)', w: 9 }
  return { color: 'var(--rail)', w: 7, dash: '6 5' }
}

/** Render a tile as an SVG: draw a line from the center to each non-empty edge.
 *  Roads are solid cyan; rails are dashed amber. A station (mixed road+rail) gets a
 *  little hub dot. */
function TileSVG({ tile }: { tile: Tile }) {
  const segs: ReactElement[] = []
  const hasRoad = tile.edges.some(e => e === 'road')
  const hasRail = tile.edges.some(e => e === 'rail')
  const isStation = hasRoad && hasRail
  // draw rails first (under), roads on top
  const order = [RR.N_, RR.E_, RR.S_, RR.W_]
  for (const pass of ['rail', 'road'] as EdgeType[]) {
    for (const s of order) {
      const et = tile.edges[s]
      if (et !== pass) continue
      const [x, y] = EDGE_PT[s]
      const st = strokeFor(et)
      segs.push(
        <line key={pass + '-' + s} x1={50} y1={50} x2={x} y2={y}
          stroke={st.color} strokeWidth={st.w} strokeLinecap="round" strokeDasharray={st.dash} />,
      )
    }
  }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      <rect x="4" y="4" width="92" height="92" rx="9" fill="var(--tile-fill)" stroke="var(--tile-stroke)" strokeWidth="2" />
      {segs}
      {isStation
        ? <circle cx="50" cy="50" r="11" fill="var(--station)" stroke="var(--station-d)" strokeWidth="2.5" />
        : <circle cx="50" cy="50" r="5.5" fill={hasRoad ? 'var(--road-d)' : 'var(--rail-d)'} />}
    </svg>
  )
}

/** Mini face used on the dice tray — same as a tile but standalone box. */
function FaceSVG({ defId, rot }: { defId: string; rot: number }) {
  const tile = RR.makeTile(defId, rot)
  return <div className="face"><TileSVG tile={tile} /></div>
}

// exit nub positioning relative to the grid container (percentages along the border).
function exitStyle(ex: Exit): CSSProperties {
  const r = RR.rowOf(ex.cell), c = RR.colOf(ex.cell)
  const colPct = (c + 0.5) / 7 * 100
  const rowPct = (r + 0.5) / 7 * 100
  const off = '-5px'
  if (ex.side === RR.N_) return { top: off, left: `calc(${colPct}% - 4.5px)` }
  if (ex.side === RR.S_) return { bottom: off, left: `calc(${colPct}% - 4.5px)` }
  if (ex.side === RR.W_) return { left: off, top: `calc(${rowPct}% - 4.5px)` }
  return { right: off, top: `calc(${rowPct}% - 4.5px)` } // E
}

export function RailroadInk() {
  const [s, setS] = useState<RRState>(() => RR.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [selDie, setSelDie] = useState<number | null>(null)
  const [rot, setRot] = useState(0)
  const [fresh, setFresh] = useState<number | null>(null) // last cell you placed, for pop anim
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    setS(RR.makeGame()); setShowRules(false); setSelDie(null); setRot(0); setFresh(null)
  }

  // The AI fills its grid over multiple placements within a round — re-arm on s.step.
  useAITurn(!s.winner && s.turn === 1 && s.phase === 'place', () => setS(p => RR.aiStep(p)), { delayMs: 480, tick: s.step })

  // When it becomes the human's turn / new dice arrive, auto-skip any of YOUR dead dice
  // so a piece that can't be placed never deadlocks.
  useEffect(() => {
    if (s.winner == null && s.turn === 0 && s.phase === 'place') {
      const fixed = RR.autoSkipDeadDice(s, 0)
      if (fixed.step !== s.step) setS(fixed)
    }
  }, [s])

  // Keep selection valid: when round/dice change, reset selection to first unresolved die.
  useEffect(() => {
    if (s.turn !== 0) { setSelDie(null); return }
    if (selDie != null && !s.resolved[0][selDie]) return
    const next = s.dice.findIndex((_, k) => !s.resolved[0][k])
    setSelDie(next >= 0 ? next : null)
    setRot(0)
  }, [s.round, s.turn, s.dice, s.resolved])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  const yourTurn = s.winner == null && s.turn === 0 && s.phase === 'place'

  // legal placements for the currently selected die + rotation
  const selDefId = selDie != null ? s.dice[selDie] : null
  const legal = yourTurn && selDefId != null && !s.resolved[0][selDie!]
    ? RR.legalPlacements(s.grids[0], s.exits, selDefId)
    : []
  // which cells are placeable at the CURRENT rotation
  const placeableAtRot = new Set(legal.filter(p => p.rot === rot).map(p => p.cell))
  // all cells legal at ANY rotation (so we can hint the user to rotate)
  const placeableAny = new Set(legal.map(p => p.cell))

  function rotateSel(dir: number) {
    if (selDefId == null) return
    const rots = RR.orientations(selDefId)
    const idx = rots.indexOf(rot)
    const base = idx >= 0 ? idx : 0
    const next = rots[(base + (dir > 0 ? 1 : rots.length - 1)) % rots.length]
    setRot(next)
  }

  function clickCell(cell: number) {
    if (!yourTurn || selDie == null || selDefId == null) return
    if (placeableAtRot.has(cell)) {
      const ns = RR.placeTile(s, 0, selDie, cell, rot)
      if (ns.step !== s.step) { setFresh(cell); setS(ns) }
      return
    }
    // if legal at another rotation, snap to it (one click rotates into place)
    const alt = legal.find(p => p.cell === cell)
    if (alt) setRot(alt.rot)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === 'r' || e.key === 'R') { rotateSel(1); return true }
      if (e.key === 'e' || e.key === 'E') { rotateSel(-1); return true }
      if (e.key >= '1' && e.key <= '4') {
        const k = Number(e.key) - 1
        if (k < s.dice.length && !s.resolved[0][k]) { setSelDie(k); setRot(0) }
        return true
      }
      return false
    },
  })

  // live scores (so the human can plan); finalized scores live in s.scores after round 7
  const liveYou = s.winner != null ? s.scores[0] : RR.scoreGrid(s.grids[0], s.exits)
  const liveAi = s.winner != null ? s.scores[1] : RR.scoreGrid(s.grids[1], s.exits)

  let banner: React.ReactNode, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = `You win ${liveYou.total}–${liveAi.total}!` }
  else if (s.winner === 1) { bk = 'lose'; banner = `AI wins ${liveAi.total}–${liveYou.total}` }
  else if (s.winner === 'draw') { bk = ''; banner = `Tie — ${liveYou.total} each` }
  else if (yourTurn) {
    bk = 'you'
    const remaining = s.resolved[0].filter(x => !x).length
    banner = `Round ${s.round}/7 — draw your ${remaining} remaining piece${remaining === 1 ? '' : 's'}`
  } else { bk = 'foe'; banner = `Round ${s.round}/7 — the AI is drafting…` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Railroad Ink · roll & write"
        title="Railroad Ink"
        subtitle="draft a road & rail network in blueprint ink — connect the most exits, run the longest lines, fill the heart of the board"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${Math.min(s.round, 7)}/7 · You ${liveYou.total} · AI ${liveAi.total}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>1-4 · pick &nbsp; R · rotate &nbsp; N · new</>}
      >
        <div className="rr-wrap">
          <div className="rr-boards">
            {/* Your grid */}
            <div className="rr-boardbox">
              <div className={'rr-boardtag you' + (yourTurn ? ' on' : '')}>
                <span className="dot" /> Your network <span className="sc">{liveYou.total}</span>
              </div>
              <div className="rr-grid">
                {Array.from({ length: 49 }, (_, i) => {
                  const tile = s.grids[0][i]
                  const can = yourTurn && placeableAtRot.has(i)
                  const couldRotate = yourTurn && !can && placeableAny.has(i)
                  return (
                    <div
                      key={i}
                      className={'rr-cell' + (can || couldRotate ? ' placeable' : '') + (fresh === i ? ' fresh' : '')}
                      onClick={() => clickCell(i)}
                    >
                      {tile && <TileSVG tile={tile} />}
                    </div>
                  )
                })}
                {s.exits.map((ex, k) => (
                  <span key={'x' + k} className={'rr-exit ' + (ex.type === 'rail' ? 'rail' : 'road')} style={exitStyle(ex)} />
                ))}
              </div>
            </div>

            {/* AI grid (summary) */}
            <div className="rr-boardbox">
              <div className={'rr-boardtag foe' + (s.turn === 1 && s.winner == null ? ' on' : '')}>
                <span className="dot" /> AI network <span className="sc">{liveAi.total}</span>
              </div>
              <div className="rr-grid mini">
                {Array.from({ length: 49 }, (_, i) => {
                  const tile = s.grids[1][i]
                  return <div key={i} className="rr-cell">{tile && <TileSVG tile={tile} />}</div>
                })}
                {s.exits.map((ex, k) => (
                  <span key={'a' + k} className={'rr-exit ' + (ex.type === 'rail' ? 'rail' : 'road')} style={exitStyle(ex)} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel rr-dicepanel">
            <div className="rr-pl">{yourTurn ? 'Pick a piece, rotate, then click a glowing cell' : 'This round’s pieces'}</div>
            <div className="rr-dice">
              {s.dice.map((defId, k) => {
                const done = s.resolved[0][k]
                const isJ = RR.defOf(defId).kind === 'junction'
                const sel = selDie === k && !done && yourTurn
                return (
                  <div
                    key={k}
                    className={'rr-die' + (isJ ? ' junction' : '') + (sel ? ' sel' : '') + (done ? ' done' : '')}
                    onClick={() => { if (!done && yourTurn) { setSelDie(k); setRot(0) } }}
                  >
                    <FaceSVG defId={defId} rot={sel ? rot : 0} />
                    <div className="nm">{RR.defOf(defId).label}</div>
                  </div>
                )
              })}
            </div>
            <div className="rr-rotbar">
              <button className="rr-rotbtn ghost" disabled={!yourTurn || selDie == null} onClick={() => rotateSel(-1)}>⟲</button>
              <button className="rr-rotbtn" disabled={!yourTurn || selDie == null} onClick={() => rotateSel(1)}>Rotate ⟳</button>
            </div>
            <div className="rr-hint">
              {!yourTurn && s.winner == null ? 'Watching the AI draft its network…'
                : s.winner != null ? 'Game over — start a new draft.'
                : selDie == null ? 'All pieces placed — handing over to the AI.'
                : placeableAtRot.size > 0 ? 'Click a glowing cell to draw the piece here.'
                : placeableAny.size > 0 ? 'Rotate the piece — it fits at another angle.'
                : 'No legal spot for this piece — it will be skipped.'}
            </div>
          </div>

          <div className="panel rr-score">
            <div className="rr-scogrid">
              <span className="lbl" /><span className="rr-scohead">you</span><span className="rr-scohead">ai</span>
              <span className="lbl">Longest road</span><span className="v you">{liveYou.road}</span><span className="v foe">{liveAi.road}</span>
              <span className="lbl">Longest railway</span><span className="v you">{liveYou.rail}</span><span className="v foe">{liveAi.rail}</span>
              <span className="lbl">Connected exits</span><span className="v you">{liveYou.exits}</span><span className="v foe">{liveAi.exits}</span>
              <span className="lbl">Center 3×3</span><span className="v you">{liveYou.center}</span><span className="v foe">{liveAi.center}</span>
              <span className="lbl">Open ends</span><span className="v neg">−{liveYou.errors}</span><span className="v neg">−{liveAi.errors}</span>
              <span className="lbl tot">Total</span><span className="v you tot">{liveYou.total}</span><span className="v foe tot">{liveAi.total}</span>
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} you={liveYou} ai={liveAi} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, you, ai, onNew }: { winner: 0 | 1 | 'draw'; you: ScoreBreakdown; ai: ScoreBreakdown; onNew: () => void }) {
  const won = winner === 0
  const eyebrow = winner === 'draw' ? 'Dead heat' : won ? 'Network complete' : 'Outdrafted'
  const title = winner === 'draw' ? 'Tie Game' : won ? 'You Win' : 'AI Wins'
  return (
    <Modal eyebrow={eyebrow} title={title} closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Draft again</button>}>
      <div className="finalsc">
        <span className="you">You {you.total}</span><span className="foe">AI {ai.total}</span>
      </div>
      <div className="rr-finalrows">
        <span className="lbl" /><span className="v you">you</span><span className="v foe">ai</span>
        <span className="lbl">Longest road</span><span className="v you">{you.road}</span><span className="v foe">{ai.road}</span>
        <span className="lbl">Longest railway</span><span className="v you">{you.rail}</span><span className="v foe">{ai.rail}</span>
        <span className="lbl">Connected exits</span><span className="v you">{you.exits}</span><span className="v foe">{ai.exits}</span>
        <span className="lbl">Center 3×3</span><span className="v you">{you.center}</span><span className="v foe">{ai.center}</span>
        <span className="lbl">Open ends</span><span className="v you">−{you.errors}</span><span className="v foe">−{ai.errors}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Railroad Ink" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Lay track</button>}>
      <div className="modal-body">
        <p>You and the AI each fill your own <b>7×7</b> grid. The border has <b>12 exits</b> — cyan dots are <i>road</i> exits, amber dots are <i>rail</i> exits.</p>
        <p>Over <b>7 rounds</b>, four shared pieces are rolled (three route dice plus one junction die). You must draw <b>all four</b> into your grid. Pick a piece, <b>rotate</b> it, and click a glowing cell. Every new piece must touch an existing piece or an exit, matching <i>road-to-road</i> and <i>rail-to-rail</i> at the join. A <b>station</b> turns road into rail.</p>
        <p>If a piece truly cannot be placed, it is skipped.</p>
        <p>At the end you score: <b>+1</b> per tile on your longest <i>road</i> and longest <i>railway</i>, points for the most <i>exits</i> joined into one network, <b>+1</b> per filled <i>center 3×3</i> cell, and <b>−1</b> per dangling open end. Highest total wins.</p>
        <p><b>Keys:</b> <kbd>1</kbd>–<kbd>4</kbd> pick piece · <kbd>R</kbd>/<kbd>E</kbd> rotate · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
