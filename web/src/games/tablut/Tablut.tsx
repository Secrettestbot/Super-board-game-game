/* TABLUT — UI (built for this codebase). 9x9 carved-wood tafl board on the framework shell,
   vs an alpha-beta attacker AI. You command the King + Swedes; click a piece to see its rook
   moves, click a square to move. Marked throne + corners; a crowned king. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as TB from './logic'
import type { TablutState } from './logic'

const { N, THRONE } = TB
const CORNER_SET = new Set(TB.CORNERS)

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
  const [s, setS] = useState<TablutState>(() => TB.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { setS(TB.makeGame()); setSel(null); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'att', () => setS(p => TB.aiMove(p)), { delayMs: 520 })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && s.turn === 'def'
  const targets = useMemo(
    () => (yourTurn && sel !== null) ? new Set(TB.movesFrom(s.board, sel)) : new Set<number>(),
    [yourTurn, sel, s.board],
  )
  const { att, def } = TB.counts(s.board)

  function clickCell(i: number) {
    if (!yourTurn) return
    const p = s.board[i]
    if (sel !== null && targets.has(i)) {
      setS(TB.move(s, { from: sel, to: i }, 'def'))
      setSel(null)
      return
    }
    if (TB.sideOf(p) === 'def') { setSel(sel === i ? null : i); return }
    setSel(null)
  }

  let banner: string, bk = ''
  if (s.winner === 'def') { bk = 'win'; banner = 'The King escapes — you win' }
  else if (s.winner === 'att') { bk = 'lose'; banner = 'The King is captured — the rival wins' }
  else if (yourTurn) { bk = 'you'; banner = sel === null ? 'Your move — select a Swede or the King' : 'Choose a square to move to' }
  else { bk = 'foe'; banner = 'The attackers are scheming…' }

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
          <div className="panel sideboard">
            <div className={'sd att' + (s.turn === 'att' && !s.winner ? ' on' : '')}>
              <span className="sd-chip att" />
              <span className="sd-name">Rival · Attackers</span>
              <span className="sd-n">{att}</span>
            </div>
            <div className={'sd def' + (s.turn === 'def' && !s.winner ? ' on' : '')}>
              <span className="sd-chip def" />
              <span className="sd-name">You · Defenders</span>
              <span className="sd-n">{def}<span className="sd-king">♚</span></span>
            </div>
          </div>
          <div className="panel hintbox">
            <div className="hint-l">Objective</div>
            <p>Escort the <b>King</b> to any <b>corner</b>. Sandwich an attacker between two of your pieces to capture it. Lose if the King is boxed in on all four sides.</p>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: TablutState; onNew: () => void }) {
  const won = s.winner === 'def'
  return (
    <Modal
      eyebrow={won ? 'The King is free' : 'The siege holds'}
      title={won ? 'Defenders Win' : 'Attackers Win'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">{won ? 'King Escaped' : 'King Captured'}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Tablut" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You command the <b>King</b> and his eight <b>Swedes</b>, clustered on the central <b>throne</b>. The rival's sixteen <b>attackers</b> ring the board and <i>move first</i>.</p>
        <p>Every piece moves like a chess <b>rook</b> — any number of empty squares straight along a row or column, never jumping. Only the King may stop on the throne or the four corners.</p>
        <p><b>Capture</b> an attacker by flanking it on opposite sides with your move; the throne and corners count as a wall. The <b>King</b> falls only when surrounded on all four sides.</p>
        <p><b>You win</b> when the King reaches a <i>corner</i>. You lose if he is captured.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
