/* ATAXX — UI (built for this codebase). A glowing 7x7 petri dish on the framework shell.
   Select one of your cells to see its clone (near) and jump (far) targets, then click to
   spread. Touching enemy cells infects them. Most cells wins. Supports solo play vs an
   alpha-beta AI and serverless online play (host-authoritative) via useGameSession —
   your side is derived from mySeat, so a remote guest plays the magenta colony. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { ataxxAdapter } from './net'
import * as AX from './logic'
import type { Side } from './logic'

const { N } = AX
const SIDE: Side[] = ['y', 'f'] // seat index -> side

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="11" fill="#0d1524" stroke="#1d3a52" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="5.5" fill="#3df0e0" />
    <circle cx="32" cy="32" r="5.5" fill="#f23ca6" />
    <circle cx="32" cy="16" r="3.4" fill="#f23ca6" opacity="0.7" />
    <circle cx="16" cy="32" r="3.4" fill="#3df0e0" opacity="0.7" />
  </svg>
)

export function Ataxx() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(ataxxAdapter)
  const me = SIDE[mySeat]            // your colony's side
  const opp: Side = me === 'y' ? 'f' : 'y'
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = s.winner == null && isMyTurn

  // moves available from the selected cell, keyed by destination
  const selMoves = useMemo(() => {
    const map = new Map<number, AX.Move>()
    if (sel == null || !yourTurn) return map
    for (const m of AX.legalMoves(s.board, me)) {
      if (m.from === sel) map.set(m.to, m)
    }
    return map
  }, [sel, yourTurn, s.board, me])

  // any of my cells that actually has a legal move (so I can't select a dead one)
  const movable = useMemo(() => {
    const set = new Set<number>()
    if (!yourTurn) return set
    for (const m of AX.legalMoves(s.board, me)) set.add(m.from)
    return set
  }, [yourTurn, s.board, me])

  const { y, f } = AX.counts(s.board)
  const mine = me === 'y' ? y : f
  const theirs = me === 'y' ? f : y

  function clickCell(i: number) {
    if (!yourTurn) return
    const v = s.board[i]
    if (v === me && movable.has(i)) { setSel(i); return }
    if (sel != null && selMoves.has(i)) {
      const m = selMoves.get(i)!
      dispatch({ from: m.from, to: m.to, clone: m.clone })
      setSel(null)
      return
    }
    if (v === null) setSel(null)        // clicking empty non-target deselects
  }

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner === me
  const oppWin = s.winner === opp

  let banner: string, bk: '' | 'you' | 'foe' | 'win' | 'lose' = ''
  if (myWin) { bk = 'win'; banner = `You win — ${mine} to ${theirs}` }
  else if (oppWin) { bk = 'lose'; banner = `The ${oppLabel.toLowerCase()} wins — ${theirs} to ${mine}` }
  else if (s.winner === 'draw') { bk = ''; banner = `Stalemate — ${mine}–${theirs}` }
  else if (yourTurn) { bk = 'you'; banner = sel == null ? 'Your turn — pick a cell to spread' : 'Choose a target — clone or jump' }
  else { bk = 'foe'; banner = net.online ? `The ${oppLabel.toLowerCase()} is moving…` : 'The rival is multiplying…' }

  const total = mine + theirs || 1
  // your colony colour leads the scoreboard; turn-on highlight follows the actual side
  const myColorClass = me                  // 'y' or 'f'
  const oppColorClass = opp

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Ataxx · clone &amp; convert"
        title="Ataxx"
        subtitle="grow your colony two squares at a time and infect every rival you brush against"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="7 × 7"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="ax-wrap">
          <div className="ax-board">
            {s.board.map((v, i) => {
              const move = selMoves.get(i)
              const isClone = move?.clone
              const isJump = move && !move.clone
              const cls = "ax-cell"
                + (i === sel ? " sel" : "")
                + (isClone ? " clone-t" : "")
                + (isJump ? " jump-t" : "")
                + (s.last && s.last.to === i ? " last" : "")
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {v && <div className={"ax-cell-body " + v + (movable.has(i) && yourTurn && v === me ? " live" : "")} />}
                  {!v && (isClone || isJump) && <div className={"ax-target " + (isClone ? "clone" : "jump")} />}
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
            <div className={"sc " + myColorClass + (s.turn === me && s.winner == null ? " on" : "")}>
              <span className={"sc-dot " + myColorClass}></span>
              <span className="sc-name">You · {me === 'y' ? 'Cyan' : 'Magenta'}</span>
              <span className="sc-n">{mine}</span>
            </div>
            <div className={"sc " + oppColorClass + (s.turn === opp && s.winner == null ? " on" : "")}>
              <span className={"sc-dot " + oppColorClass}></span>
              <span className="sc-name">{oppLabel} · {opp === 'y' ? 'Cyan' : 'Magenta'}</span>
              <span className="sc-n">{theirs}</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-y" style={{ width: `${(mine / total) * 100}%` }} /></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} draw={s.winner === 'draw'} mine={mine} theirs={theirs} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, draw, mine, theirs, oppLabel, onNew }: { won: boolean; draw: boolean; mine: number; theirs: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Even colonies' : won ? 'Outbreak' : 'Overrun'}
      title={draw ? 'A Draw' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {mine}</span><span className="foe">{oppLabel} {theirs}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Ataxx" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Select one of your cells, then pick an empty target within two squares.</p>
        <p>A <b>clone</b> (an adjacent square, distance&nbsp;1) leaves the original cell and spawns a <i>new</i> one — you gain a cell. A <b>jump</b> (distance&nbsp;2) <i>moves</i> the cell instead — no net growth.</p>
        <p>However you land, every <b>rival cell touching the destination</b> is instantly <b>infected</b> and turns your colour.</p>
        <p>With no legal move you <i>pass</i>. When the dish fills or neither side can move, the <b>larger colony wins</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
