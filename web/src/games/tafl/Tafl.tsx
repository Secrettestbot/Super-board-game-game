/* HNEFATAFL (Brandubh, 7x7) — UI. A cold Norse stone board on the framework shell, vs an
   alpha-beta attacker AI. You command the King + guard; click a piece to see its rook moves,
   click a square to move. Throne + corners are marked; the king wears a crown. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as T from './logic'
import type { State } from './logic'

const { THRONE } = T
const CORNER_SET = new Set(T.CORNERS)

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="8" fill="#1c2733" stroke="#36506a" strokeWidth="1.5" />
    <rect x="18" y="18" width="12" height="12" rx="2" fill="#0f1820" stroke="#4a6e8e" strokeWidth="1" />
    <path d="M18 17 L18 12 L21.5 15 L24 11 L26.5 15 L30 12 L30 17 Z" fill="#8fc7e6" stroke="#3d6f8f" strokeWidth="0.6" />
    <circle cx="9" cy="9" r="2.4" fill="#6fa8c9" />
    <circle cx="39" cy="9" r="2.4" fill="#6fa8c9" />
    <circle cx="9" cy="39" r="2.4" fill="#6fa8c9" />
    <circle cx="39" cy="39" r="2.4" fill="#6fa8c9" />
  </svg>
)

export function Tafl() {
  const [s, setS] = useState<State>(() => T.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { setS(T.makeGame()); setSel(null); setShowRules(false) }

  useAITurn(s.winner == null && s.turn === 'attackers', () => setS(p => T.aiTurn(p)), { delayMs: 520, tick: s.last })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = s.winner == null && s.turn === 'defenders'
  const targets = useMemo(
    () => (yourTurn && sel != null) ? new Set(T.movesFrom(s.board, sel)) : new Set<number>(),
    [yourTurn, sel, s.board],
  )
  const { att, def } = T.counts(s.board)

  function clickCell(i: number) {
    if (!yourTurn) return
    if (sel != null && targets.has(i)) {
      setS(T.applyMove(s, sel, i, 'defenders'))
      setSel(null)
      return
    }
    if (T.sideOf(s.board[i]) === 'defenders') { setSel(sel === i ? null : i); return }
    setSel(null)
  }

  let banner: string, bk = ''
  if (s.winner === 'defenders') { bk = 'win'; banner = 'The King escapes — you win' }
  else if (s.winner === 'attackers') { bk = 'lose'; banner = 'The King is captured — the rival wins' }
  else if (s.winner === 'draw') { bk = ''; banner = 'A stalemate at the throne' }
  else if (yourTurn) { bk = 'you'; banner = sel == null ? 'Your move — select the King or a guard' : 'Choose a square to move to' }
  else { bk = 'foe'; banner = 'The attackers are closing in…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Hnefatafl · Brandubh"
        title="Hnefatafl"
        subtitle="march the King to a corner — or watch the siege tighten around the throne"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="7 × 7 · tafl"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="hf-wrap">
          <div className="hf-board">
            {s.board.map((v, i) => {
              const special = i === THRONE ? ' throne' : CORNER_SET.has(i) ? ' corner' : ''
              const isSel = sel === i
              const isTarget = targets.has(i)
              const lastFrom = s.last?.from === i
              const lastTo = s.last?.to === i
              return (
                <div
                  key={i}
                  className={'hf-cell' + special + (isSel ? ' sel' : '') + (isTarget ? ' target' : '') + (lastTo ? ' last' : '') + (lastFrom ? ' lastfrom' : '')}
                  onClick={() => clickCell(i)}
                >
                  {(i === THRONE || CORNER_SET.has(i)) && <div className="hf-glyph" />}
                  {v === 'A' && <div className="hf-piece att" />}
                  {v === 'D' && <div className="hf-piece def" />}
                  {v === 'K' && (
                    <div className="hf-piece king">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17 L5 9 L9 12 L12 6 L15 12 L19 9 L19 17 Z" /></svg>
                    </div>
                  )}
                  {v == null && isTarget && <div className="hf-dot" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel sideboard">
            <div className={'sd att' + (s.turn === 'attackers' && s.winner == null ? ' on' : '')}>
              <span className="sd-chip att" />
              <span className="sd-name">Rival · Attackers</span>
              <span className="sd-n">{att}</span>
            </div>
            <div className={'sd def' + (s.turn === 'defenders' && s.winner == null ? ' on' : '')}>
              <span className="sd-chip def" />
              <span className="sd-name">You · Defenders</span>
              <span className="sd-n">{def}<span className="sd-king">♚</span></span>
            </div>
          </div>
          <div className="panel hintbox">
            <div className="hint-l">Objective</div>
            <p>Escort the <b>King</b> to any <b>corner</b>. Flank an attacker between two of your pieces to capture it. You lose if the King is boxed in on all four sides.</p>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: State; onNew: () => void }) {
  const won = s.winner === 'defenders'
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
    <Modal eyebrow="How to play" title="Hnefatafl · Brandubh" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You command the <b>King</b> and his four <b>guards</b>, clustered on the central <b>throne</b>. The rival's eight <b>attackers</b> ring the board and <i>move first</i>.</p>
        <p>Every piece moves like a chess <b>rook</b> — any number of empty squares straight along a row or column, never jumping. Only the King may stop on the throne or the four corners.</p>
        <p><b>Capture</b> an attacker by flanking it on opposite sides with your move; the throne and corners count as a wall. Moving into a sandwich yourself is safe. The <b>King</b> falls only when surrounded on all four sides.</p>
        <p><b>You win</b> when the King reaches a <i>corner</i>. You lose if he is captured.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
