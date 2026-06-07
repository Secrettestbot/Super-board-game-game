/* SURAKARTA — UI (built for this codebase). A 6x6 grid of points with painted corner-loop
   arcs, red vs black discs, on the shared framework shell. Click your disc to select; legal
   steps and loop-captures are hinted, and a feasible capture path is traced. The rival is an
   alpha-beta minimax. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { surakartaAdapter } from './net'
import * as SK from './logic'
import type { SurakartaState, Move, Player } from './logic'

const { N } = SK

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#6e3b22" stroke="#a8633a" strokeWidth="1.5" />
    <path d="M14 34 A20 20 0 0 1 34 14" fill="none" stroke="#e7c79a" strokeWidth="2" strokeLinecap="round" />
    <circle cx="17" cy="17" r="5" fill="#b8312b" stroke="#000" strokeWidth="0.5" />
    <circle cx="31" cy="31" r="5" fill="#1d1c1f" stroke="#000" strokeWidth="0.5" />
  </svg>
)

// geometry of the board in the inner coordinate space (points laid on a [0..N-1] grid
// with a margin so the corner loop arcs have room).
const M = 1.1                      // margin in cell units around the point grid
const SPAN = (N - 1) + 2 * M       // total span in cell units
const VB = 100                     // viewBox units
const STEP = VB / SPAN             // px per cell unit
const px = (coord: number) => (coord + M) * STEP   // grid coord -> svg px

function Surakarta() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(surakartaAdapter)
  const me: Player = mySeat === 0 ? 'r' : 'b'   // seat 0 = Red, seat 1 = Black
  const foe: Player = SK.other(me)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { netNew(); setShowRules(false); setSel(null) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setSel(null) } })

  const yourTurn = !s.winner && isMyTurn
  // counts relative to the seated player: `mine` = your discs, `theirs` = opponent's
  const cnt = SK.counts(s.board)
  const mine = me === 'r' ? cnt.r : cnt.b
  const theirs = me === 'r' ? cnt.b : cnt.r

  // legal moves from the selected piece (always for the side you control)
  const selMoves = useMemo<Move[]>(
    () => (sel != null && yourTurn && s.board[sel] === me) ? SK.movesFrom(s.board, sel, me) : [],
    [sel, yourTurn, s.board, me],
  )
  const stepTargets = useMemo(() => new Set(selMoves.filter(m => !m.cap).map(m => m.to)), [selMoves])
  const capTargets = useMemo(() => new Set(selMoves.filter(m => m.cap).map(m => m.to)), [selMoves])
  const movablePieces = useMemo(() => {
    if (!yourTurn) return new Set<number>()
    const set = new Set<number>()
    for (const m of SK.allMoves(s.board, me)) set.add(m.from)
    return set
  }, [yourTurn, s.board, me])

  function clickPoint(i: number) {
    if (!yourTurn) return
    if (sel != null && (stepTargets.has(i) || capTargets.has(i))) {
      dispatch({ from: sel, to: i }); setSel(null); return
    }
    if (s.board[i] === me && movablePieces.has(i)) { setSel(i === sel ? null : i); return }
    setSel(null)
  }

  // path of the hovered/selected capture (first available) to draw an arc trail
  const capPaths = useMemo(() => selMoves.filter(m => m.cap && m.path).map(m => m.path!), [selMoves])

  const oppLabel = net.online ? 'Opponent' : 'The rival'
  const thinking = net.online ? 'waiting for opponent…' : 'is thinking…'

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = `You win — ${mine} to ${theirs}` }
  else if (s.winner === foe) { bk = 'lose'; banner = `${oppLabel} wins — ${theirs} to ${mine}` }
  else if (yourTurn) { bk = 'you'; banner = sel != null ? 'Pick a destination or a loop target' : 'Your turn — pick a disc' }
  else { bk = 'foe'; banner = `${oppLabel} ${thinking}` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Surakarta · loop &amp; capture"
        title="Surakarta"
        subtitle="step to a neighbour, or sweep around a corner loop to snare a rival disc"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="6 × 6 · loops"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="sk-wrap">
          <BoardSVG
            s={s}
            me={me}
            sel={sel}
            stepTargets={stepTargets}
            capTargets={capTargets}
            movable={movablePieces}
            capPaths={capPaths}
            onPoint={clickPoint}
          />
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel scoreboard">
            <div className={"sc " + me + (s.turn === me && !s.winner ? " on" : "")}>
              <span className={"sc-disc " + me}></span><span className="sc-name">You · {me === 'r' ? 'Red' : 'Black'}</span><span className="sc-n">{mine}</span>
            </div>
            <div className={"sc " + foe + (s.turn === foe && !s.winner ? " on" : "")}>
              <span className={"sc-disc " + foe}></span><span className="sc-name">{net.online ? 'Opponent' : 'Rival'} · {foe === 'r' ? 'Red' : 'Black'}</span><span className="sc-n">{theirs}</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-r" style={{ width: `${(mine / (mine + theirs || 1)) * 100}%` }} /></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={s.winner === me} mine={mine} theirs={theirs} online={net.online} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

interface BoardProps {
  s: SurakartaState
  me: Player
  sel: number | null
  stepTargets: Set<number>
  capTargets: Set<number>
  movable: Set<number>
  capPaths: number[][]
  onPoint: (i: number) => void
}

function BoardSVG({ s, me, sel, stepTargets, capTargets, movable, capPaths, onPoint }: BoardProps) {
  const points: number[] = []
  for (let i = 0; i < N * N; i++) points.push(i)

  // Corner loop arcs: at each corner, for each loop line index L (0 outer, 1 inner),
  // a quarter-circle joining the row line end and the column line end just outside the grid.
  const arcs: { d: string; cls: string }[] = []
  // arc radius offset (how far outside the grid the arc bows)
  for (const L of [0, 1]) {
    const off = L === 0 ? M * 0.62 : M * 0.30   // outer arc bows further out
    const lo = L, hi = N - 1 - L
    // four corners; each connects a row-end point to a col-end point
    const corners = [
      { rRow: lo, cCol: lo, sx: -1, sy: -1 }, // top-left
      { rRow: lo, cCol: hi, sx: 1, sy: -1 },  // top-right
      { rRow: hi, cCol: lo, sx: -1, sy: 1 },  // bottom-left
      { rRow: hi, cCol: hi, sx: 1, sy: 1 },   // bottom-right
    ]
    for (const cn of corners) {
      // row line end point: (row=cn.rRow, col = lo or hi nearest that corner side)
      const rowEndCol = cn.sx < 0 ? 0 : N - 1
      const colEndRow = cn.sy < 0 ? 0 : N - 1
      // endpoint just outside the grid on the row's open side
      const ax = px(rowEndCol + cn.sx * off)
      const ay = px(cn.rRow)
      const bx = px(cn.cCol)
      const by = px(colEndRow + cn.sy * off)
      const sweep = (cn.sx * cn.sy > 0) ? 0 : 1
      arcs.push({ d: `M ${ax} ${ay} A ${STEP} ${STEP} 0 0 ${sweep} ${bx} ${by}`, cls: L === 0 ? 'sk-arc outer' : 'sk-arc inner' })
    }
  }

  // grid lines (the 6 rows + 6 cols connecting the points)
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (let k = 0; k < N; k++) {
    lines.push({ x1: px(0), y1: px(k), x2: px(N - 1), y2: px(k) })
    lines.push({ x1: px(k), y1: px(0), x2: px(k), y2: px(N - 1) })
  }

  // capture path polylines (drawn as light trails through the traversed points)
  const trails = capPaths.map(path => path.map(i => { const [r, c] = SK.rc(i); return `${px(c)},${px(r)}` }).join(' '))

  return (
    <svg className="sk-board" viewBox={`0 0 ${VB} ${VB}`} role="img" aria-label="Surakarta board">
      <rect x="0" y="0" width={VB} height={VB} rx="4" className="sk-bg" />
      {arcs.map((a, i) => <path key={'a' + i} d={a.d} className={a.cls} />)}
      {lines.map((l, i) => <line key={'l' + i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="sk-grid" />)}
      {trails.map((t, i) => <polyline key={'t' + i} points={t} className="sk-trail" />)}

      {points.map(i => {
        const [r, c] = SK.rc(i)
        const v = s.board[i]
        const cx = px(c), cy = px(r)
        const isStep = stepTargets.has(i)
        const isCap = capTargets.has(i)
        const isSel = sel === i
        const canPick = v === me && movable.has(i)
        return (
          <g key={i} className="sk-pt" onClick={() => onPoint(i)} style={{ cursor: (isStep || isCap || canPick) ? 'pointer' : 'default' }}>
            <circle cx={cx} cy={cy} r={STEP * 0.46} className="sk-hit" />
            <circle cx={cx} cy={cy} r="1.4" className="sk-node" />
            {isStep && <circle cx={cx} cy={cy} r={STEP * 0.16} className="sk-hint-step" />}
            {isCap && <circle cx={cx} cy={cy} r={STEP * 0.40} className="sk-hint-cap" />}
            {v && (
              <circle
                cx={cx} cy={cy} r={STEP * 0.36}
                className={"sk-disc " + v + (isSel ? " sel" : "") + (s.last && s.last.to === i ? " last" : "")}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

function ResultModal({ won, mine, theirs, online, onNew }: { won: boolean; mine: number; theirs: number; online: boolean; onNew: () => void }) {
  const foeName = online ? 'Opponent' : 'Rival'
  return (
    <Modal
      eyebrow={won ? 'Board swept' : 'Out-looped'}
      title={won ? 'You Win' : `${foeName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {mine}</span><span className="foe">{foeName} {theirs}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Surakarta" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Red</b> and move first. Each disc sits on a point of the 6×6 grid. On your turn make one of two moves.</p>
        <p><b>Step:</b> slide a disc to any one of its eight <b>adjacent</b> empty points (orthogonal or diagonal).</p>
        <p><b>Capture:</b> send a disc gliding along its row or column track. It must sweep <i>around at least one corner loop</i>, passing only over empty points, and lands on the <b>first rival disc</b> it reaches — capturing it. You can never capture in a straight line without looping, and your own discs block the path.</p>
        <p>Wipe out every rival disc — or leave the rival with no move — to <b>win</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}

export { Surakarta }
