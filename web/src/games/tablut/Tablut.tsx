/* TABLUT — UI (built for this codebase). 9x9 carved-wood tafl board on the framework shell.
   Solo: you command the King + Swedes (defenders) vs an alpha-beta attacker AI that moves
   first. Online: you command whichever army your seat holds — seat 0 = defenders, seat 1 =
   attackers — and the remote human plays the other side. Click a piece to see its rook moves,
   click a square to move. Marked throne + corners; a crowned king. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { tablutAdapter } from './net'
import * as TB from './logic'
import type { Side } from './logic'

const { N, THRONE } = TB
const CORNER_SET = new Set(TB.CORNERS)
const SIDE: Side[] = ['def', 'att'] // seat 0 = defenders, seat 1 = attackers

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="8" fill="#3a2a18" stroke="#5e4424" strokeWidth="1.5" />
    <rect x="18" y="18" width="12" height="12" rx="2" fill="#23190d" stroke="#7a5a30" strokeWidth="1" />
    <path d="M19 17 L19 13 L22 15.5 L24 12 L26 15.5 L29 13 L29 17 Z" fill="#e9c46a" stroke="#9a6f24" strokeWidth="0.6" />
    <circle cx="9" cy="9" r="2.4" fill="#c9532f" />
    <circle cx="39" cy="9" r="2.4" fill="#c9532f" />
    <circle cx="9" cy="39" r="2.4" fill="#c9532f" />
    <circle cx="39" cy="39" r="2.4" fill="#c9532f" />
  </svg>
)

export function Tablut() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(tablutAdapter)
  const mySide = SIDE[mySeat] // the army this client commands
  const oppSide: Side = mySide === 'def' ? 'att' : 'def'
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && isMyTurn
  const targets = useMemo(
    () => (yourTurn && sel !== null) ? new Set(TB.movesFrom(s.board, sel)) : new Set<number>(),
    [yourTurn, sel, s.board],
  )
  const { att, def } = TB.counts(s.board)

  function clickCell(i: number) {
    if (!yourTurn) return
    const p = s.board[i]
    if (sel !== null && targets.has(i)) {
      dispatch({ from: sel, to: i })
      setSel(null)
      return
    }
    if (TB.sideOf(p) === mySide) { setSel(sel === i ? null : i); return }
    setSel(null)
  }

  const myWin = s.winner != null && s.winner === mySide
  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myArmy = mySide === 'def' ? 'Defenders' : 'Attackers'
  const oppArmy = oppSide === 'def' ? 'Defenders' : 'Attackers'

  let banner: string, bk = ''
  if (s.winner != null) {
    bk = myWin ? 'win' : 'lose'
    banner = s.winner === 'def'
      ? (myWin ? 'The King escapes — you win' : `The King escapes — ${oppLabel} wins`)
      : (myWin ? 'The King is captured — you win' : `The King is captured — ${oppLabel} wins`)
  } else if (yourTurn) {
    bk = 'you'; banner = sel === null
      ? (mySide === 'def' ? 'Your move — select a Swede or the King' : 'Your move — select an attacker')
      : 'Choose a square to move to'
  } else {
    bk = 'foe'; banner = net.online ? `Waiting for ${oppLabel}…` : 'The attackers are scheming…'
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Tablut · the king's flight"
        title="Tablut"
        subtitle="guide the King to a corner — or watch the siege close in around the throne"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="9 × 9 · tafl"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="tb-wrap">
          <div className="tb-board">
            {s.board.map((v, i) => {
              const special = i === THRONE ? ' throne' : CORNER_SET.has(i) ? ' corner' : ''
              const isSel = sel === i
              const isTarget = targets.has(i)
              const lastFrom = s.last?.from === i
              const lastTo = s.last?.to === i
              return (
                <div
                  key={i}
                  className={'tb-cell' + special + (isSel ? ' sel' : '') + (isTarget ? ' target' : '') + (lastTo ? ' last' : '') + (lastFrom ? ' lastfrom' : '')}
                  onClick={() => clickCell(i)}
                >
                  {(i === THRONE || CORNER_SET.has(i)) && <div className="tb-glyph" />}
                  {v === 'A' && <div className="tb-piece att" />}
                  {v === 'D' && <div className="tb-piece def" />}
                  {v === 'K' && (
                    <div className="tb-piece king">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17 L5 9 L9 12 L12 6 L15 12 L19 9 L19 17 Z" /></svg>
                    </div>
                  )}
                  {!v && isTarget && <div className="tb-dot" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel sideboard">
            <div className={'sd att' + (s.turn === 'att' && !s.winner ? ' on' : '')}>
              <span className="sd-chip att" />
              <span className="sd-name">{mySide === 'att' ? 'You' : oppLabel} · Attackers</span>
              <span className="sd-n">{att}</span>
            </div>
            <div className={'sd def' + (s.turn === 'def' && !s.winner ? ' on' : '')}>
              <span className="sd-chip def" />
              <span className="sd-name">{mySide === 'def' ? 'You' : oppLabel} · Defenders</span>
              <span className="sd-n">{def}<span className="sd-king">♚</span></span>
            </div>
          </div>
          <div className="panel hintbox">
            <div className="hint-l">Objective</div>
            <p>{mySide === 'def'
              ? <>Escort the <b>King</b> to any <b>corner</b>. Sandwich an attacker between two of your pieces to capture it. Lose if the King is boxed in on all four sides.</>
              : <>Capture the <b>King</b> by boxing him in on all four sides. Sandwich a Swede between two attackers to remove it. Lose if the King reaches a corner.</>}</p>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} myArmy={myArmy} oppArmy={oppArmy} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, myArmy, oppArmy, onNew }: { won: boolean; myArmy: string; oppArmy: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Victory' : 'Defeat'}
      title={won ? `${myArmy} Win` : `${oppArmy} Win`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">{won ? 'You prevail' : 'You are bested'}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Tablut" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The <b>defenders</b> command the <b>King</b> and his eight <b>Swedes</b>, clustered on the central <b>throne</b>. The <b>attackers</b> field sixteen pieces ringing the board and <i>move first</i>.</p>
        <p>Every piece moves like a chess <b>rook</b> — any number of empty squares straight along a row or column, never jumping. Only the King may stop on the throne or the four corners.</p>
        <p><b>Capture</b> an enemy by flanking it on opposite sides with your move; the throne and corners count as a wall. The <b>King</b> falls only when surrounded on all four sides.</p>
        <p>The <b>defenders win</b> when the King reaches a <i>corner</i>; the <b>attackers win</b> if they capture him.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
