/* LINES OF ACTION — UI (built for this codebase). 8x8 board on the framework shell,
   vs a connectivity alpha-beta AI. Select a piece to see its legal slides; the move
   distance equals the count of pieces on the line travelled. Connect all your pieces
   into one group to win. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { linesOfActionAdapter } from './net'
import * as LOA from './logic'
import type { Side } from './logic'

const { N } = LOA

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#13161c" stroke="#3a4256" strokeWidth="1.5" />
    <line x1="11" y1="11" x2="37" y2="37" stroke="#39435c" strokeWidth="1.4" />
    <circle cx="11" cy="11" r="5" fill="#e7ebf5" />
    <circle cx="37" cy="37" r="5" fill="#e7ebf5" />
    <circle cx="24" cy="24" r="5" fill="#5b8dff" />
  </svg>
)

function groups(board: LOA.Cell[], who: LOA.Side): number {
  // count groups via the logic's public helpers indirectly: reuse connected for "1"
  const cells: number[] = []
  for (let i = 0; i < N * N; i++) if (board[i] === who) cells.push(i)
  if (cells.length === 0) return 0
  const set = new Set(cells), seen = new Set<number>()
  let g = 0
  for (const start of cells) {
    if (seen.has(start)) continue
    g++
    const st = [start]; seen.add(start)
    while (st.length) {
      const i = st.pop()!
      const r = Math.floor(i / N), c = i % N
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const rr = r + dr, cc = c + dc
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue
        const j = rr * N + cc
        if (set.has(j) && !seen.has(j)) { seen.add(j); st.push(j) }
      }
    }
  }
  return g
}

export function LinesOfAction() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(linesOfActionAdapter)
  const mySide: Side = mySeat === 0 ? 'b' : 'w' // seat 0 = Black, seat 1 = White
  const oppSide: Side = LOA.other(mySide)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setSel(null); setShowRules(false) } })

  const yourTurn = !s.winner && isMyTurn

  const dests = useMemo(() => {
    if (sel === null || !yourTurn) return new Map<number, boolean>()
    const m = new Map<number, boolean>()
    for (const mv of LOA.movesFrom(s.board, sel, mySide)) m.set(mv.to, mv.cap)
    return m
  }, [sel, yourTurn, s.board, mySide])

  const { b, w } = LOA.counts(s.board)
  const myCount = mySide === 'b' ? b : w, oppCount = mySide === 'b' ? w : b
  const myGroups = groups(s.board, mySide), oppGroups = groups(s.board, oppSide)
  const myWon = s.winner === mySide
  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const mySideName = mySide === 'b' ? 'Black' : 'White'
  const oppSideName = oppSide === 'b' ? 'Black' : 'White'

  function clickCell(i: number) {
    if (!yourTurn) return
    if (sel !== null && dests.has(i)) {
      dispatch({ from: sel, to: i })
      setSel(null)
      return
    }
    if (s.board[i] === mySide) { setSel(i === sel ? null : i); return }
    setSel(null)
  }

  let banner: string, bk = ''
  if (s.winner != null && myWon) { bk = 'win'; banner = 'You win — all pieces connected' }
  else if (s.winner != null) { bk = 'lose'; banner = `${oppLabel} wins — they connected first` }
  else if (yourTurn) { bk = 'you'; banner = sel === null ? `Your turn — pick a ${mySideName.toLowerCase()} piece` : 'Choose a destination' }
  else { bk = 'foe'; banner = net.online ? 'Waiting for opponent…' : 'The rival is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Lines of Action · converge"
        title="Lines of Action"
        subtitle="slide along a line as far as it is crowded — and gather every piece into one group"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="8 × 8"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="loa-wrap">
          <div className="loa-board">
            {s.board.map((v, i) => {
              const isDest = dests.has(i)
              const isCap = isDest && dests.get(i)
              const cls = "loa-cell"
                + (((Math.floor(i / N) + (i % N)) % 2 === 0) ? " lt" : " dk")
                + (sel === i ? " sel" : "")
                + (isDest ? " dest" : "")
                + (s.last && (s.last.from === i || s.last.to === i) ? " last" : "")
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {v && <div className={"loa-piece " + v + (isCap ? " threat" : "")} />}
                  {!v && isDest && <div className="loa-dot" />}
                  {v && isCap && <div className="loa-ring" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={"sc " + mySide + (yourTurn ? " on" : "")}>
              <span className={"sc-disc " + mySide}></span>
              <span className="sc-name">You · {mySideName}</span>
              <span className="sc-meta">{myCount} pcs · {myGroups} grp</span>
            </div>
            <div className={"sc " + oppSide + (!yourTurn && !s.winner ? " on" : "")}>
              <span className={"sc-disc " + oppSide}></span>
              <span className="sc-name">{oppLabel} · {oppSideName}</span>
              <span className="sc-meta">{oppCount} pcs · {oppGroups} grp</span>
            </div>
            <div className="sc-hint">connect all your pieces into <b>one group</b> to win</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWon} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppLabel, onNew }: { won: boolean; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Convergence' : 'Out-connected'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>{won ? 'All your pieces formed one group.' : `${oppLabel} joined all its pieces first.`}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Lines of Action" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Black</b> and move first. Click a piece to see where it can go, then click a destination.</p>
        <p>A piece slides in a straight line — horizontally, vertically, or diagonally — <b>exactly as many squares as the number of pieces (of either colour) on that whole line</b>. It may <b>jump over its own pieces</b> but <i>not</i> over enemy pieces, and may land on an empty square or <b>capture</b> an enemy (never on its own piece).</p>
        <p>Win by gathering <b>all of your remaining pieces into one connected group</b> — touching orthogonally or diagonally. Captures can shrink either side; a single piece counts as connected.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
