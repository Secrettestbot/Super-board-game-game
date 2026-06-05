/* ATAXX — UI (built for this codebase). A glowing 7x7 petri dish on the framework shell,
   vs an alpha-beta AI. Select one of your cells to see its clone (near) and jump (far)
   targets, then click to spread. Touching enemy cells infects them. Most cells wins. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as AX from './logic'
import type { AtaxxState, Move } from './logic'

const { N } = AX

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
  const [s, setS] = useState<AtaxxState>(() => AX.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { setS(AX.makeGame()); setSel(null); setShowRules(false) }

  // tick on `last` so a consecutive AI turn (after the human passes) re-arms the timer
  useAITurn(!s.winner && s.turn === 'f', () => setS(p => AX.aiMove(p)), { delayMs: 520, tick: s.last })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && s.turn === 'y'

  // moves available from the selected cell, keyed by destination
  const selMoves = useMemo(() => {
    const map = new Map<number, Move>()
    if (sel == null || !yourTurn) return map
    for (const m of AX.legalMoves(s.board, 'y')) {
      if (m.from === sel) map.set(m.to, m)
    }
    return map
  }, [sel, yourTurn, s.board])

  // any of my cells that actually has a legal move (so I can't select a dead one)
  const movable = useMemo(() => {
    const set = new Set<number>()
    if (!yourTurn) return set
    for (const m of AX.legalMoves(s.board, 'y')) set.add(m.from)
    return set
  }, [yourTurn, s.board])

  const { y, f } = AX.counts(s.board)

  function clickCell(i: number) {
    if (!yourTurn) return
    const v = s.board[i]
    if (v === 'y' && movable.has(i)) { setSel(i); return }
    if (sel != null && selMoves.has(i)) {
      setS(AX.play(s, selMoves.get(i)!, 'y'))
      setSel(null)
      return
    }
    if (v === null) setSel(null)        // clicking empty non-target deselects
  }

  let banner: string, bk: '' | 'you' | 'foe' | 'win' | 'lose' = ''
  if (s.winner === 'y') { bk = 'win'; banner = `You win — ${y} to ${f}` }
  else if (s.winner === 'f') { bk = 'lose'; banner = `The rival wins — ${f} to ${y}` }
  else if (s.winner === 'draw') { bk = ''; banner = `Stalemate — ${y}–${f}` }
  else if (yourTurn) { bk = 'you'; banner = sel == null ? 'Your turn — pick a cell to spread' : 'Choose a target — clone or jump' }
  else { bk = 'foe'; banner = 'The rival is multiplying…' }

  const total = y + f || 1

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
                  {v && <div className={"ax-cell-body " + v + (movable.has(i) && yourTurn && v === 'y' ? " live" : "")} />}
                  {!v && (isClone || isJump) && <div className={"ax-target " + (isClone ? "clone" : "jump")} />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={"sc y" + (s.turn === 'y' && !s.winner ? " on" : "")}>
              <span className="sc-dot y"></span><span className="sc-name">You · Cyan</span><span className="sc-n">{y}</span>
            </div>
            <div className={"sc f" + (s.turn === 'f' && !s.winner ? " on" : "")}>
              <span className="sc-dot f"></span><span className="sc-name">Rival · Magenta</span><span className="sc-n">{f}</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-y" style={{ width: `${(y / total) * 100}%` }} /></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} y={y} f={f} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, y, f, onNew }: { s: AtaxxState; y: number; f: number; onNew: () => void }) {
  const won = s.winner === 'y', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Even colonies' : won ? 'Outbreak' : 'Overrun'}
      title={draw ? 'A Draw' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {y}</span><span className="foe">Rival {f}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Ataxx" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are the <b>cyan</b> colony and move first. Select one of your cells, then pick an empty target within two squares.</p>
        <p>A <b>clone</b> (an adjacent square, distance&nbsp;1) leaves the original cell and spawns a <i>new</i> one — you gain a cell. A <b>jump</b> (distance&nbsp;2) <i>moves</i> the cell instead — no net growth.</p>
        <p>However you land, every <b>rival cell touching the destination</b> is instantly <b>infected</b> and turns your colour.</p>
        <p>With no legal move you <i>pass</i>. When the dish fills or neither side can move, the <b>larger colony wins</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
