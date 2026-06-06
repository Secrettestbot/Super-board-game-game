/* QUARTO — UI (built for this codebase). A 4x4 gallery and 16 unique pieces; your rival picks
   the piece you must place, you pick theirs. Complete a line of four sharing any one trait to win. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as Q from './logic'
import type { QuartoState, Piece } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1a1622" stroke="#3a3450" strokeWidth="1.5" />
    <circle cx="18" cy="18" r="7" fill="none" stroke="#cdbbe6" strokeWidth="2" />
    <rect x="25" y="25" width="13" height="13" rx="2" fill="#8a6fd6" />
  </svg>
)

/** A rendered Quarto piece. size class scales tall/short; classes carry colour/shape/fill. */
function PieceView({ p, big }: { p: Piece; big?: boolean }) {
  const a = Q.attrs(p)
  const cls = [
    'qt-piece',
    a.tall ? 'tall' : 'short',
    a.dark ? 'dark' : 'light',
    a.square ? 'square' : 'round',
    a.solid ? 'solid' : 'hollow',
    big ? 'big' : '',
  ].join(' ')
  return (
    <span className={cls} title={Q.pieceName(p)}>
      <span className="qt-body">{!a.solid && <span className="qt-hole" />}</span>
    </span>
  )
}

export function Quarto() {
  const [s, setS] = useState<QuartoState>(() => Q.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(Q.makeGame()); setShowRules(false) }

  // The AI may need two steps on its turn (place, then hand) — re-arm on hand state changes.
  const aiActive = !s.winner && s.turn === 'ai'
  useAITurn(aiActive, () => setS(p => Q.aiMove(p)), { delayMs: 520, tick: s.hand })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'you'
  const youPlacing = yourTurn && s.hand !== null    // must place the handed piece
  const youHanding = yourTurn && s.hand === null     // must hand a piece to rival

  function clickCell(i: number) {
    if (youPlacing && s.board[i] === null) setS(Q.place(s, i))
  }
  function clickPool(p: Piece) {
    if (youHanding) setS(Q.hand(s, p))
  }

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'Quarto — you win' }
  else if (s.winner === 'ai') { bk = 'lose'; banner = 'The rival completes a line' }
  else if (s.winner === 'draw') { bk = ''; banner = 'The gallery fills — a draw' }
  else if (youPlacing) { bk = 'you'; banner = 'Place the piece you were handed' }
  else if (youHanding) { bk = 'you'; banner = 'Now hand a piece to the rival' }
  else { bk = 'foe'; banner = s.hand !== null ? 'The rival is placing…' : 'The rival is choosing…' }

  const pool = Q.poolPieces(s.pool)
  const winSet = new Set(s.line ?? [])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Quarto · the rival picks your piece"
        title="Quarto"
        subtitle="four in a line sharing any single trait wins — but your opponent chooses what you play"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="4 × 4 · 16 pieces"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="qt-wrap">
          <div className="qt-board">
            {s.board.map((v, i) => (
              <div
                key={i}
                className={'qt-cell' + (youPlacing && v === null ? ' open' : '') + (s.last === i ? ' last' : '') + (winSet.has(i) ? ' win' : '')}
                onClick={() => clickCell(i)}
              >
                {v !== null && <PieceView p={v} />}
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel handbox">
            <div className="panel-l">{s.hand !== null ? (yourTurn ? 'You must place' : 'Rival must place') : 'No piece in hand'}</div>
            <div className="hand-stage">
              {s.hand !== null
                ? <PieceView p={s.hand} big />
                : <span className="hand-empty">—</span>}
            </div>
            {s.hand !== null && <div className="hand-name">{Q.pieceName(s.hand)}</div>}
          </div>

          <div className={'panel poolbox' + (youHanding ? ' active' : '')}>
            <div className="panel-l">{youHanding ? 'Pick one to hand over' : 'Pieces remaining'}</div>
            <div className="qt-pool">
              {pool.map(p => (
                <button
                  key={p}
                  className={'qt-poolslot' + (youHanding ? ' pickable' : '')}
                  disabled={!youHanding}
                  onClick={() => clickPool(p)}
                >
                  <PieceView p={p} />
                </button>
              ))}
              {pool.length === 0 && <span className="hand-empty">—</span>}
            </div>
          </div>

          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: QuartoState; onNew: () => void }) {
  const won = s.winner === 'you', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'No line found' : won ? 'A line of four' : 'Out-curated'}
      title={draw ? 'A Draw' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        {draw
          ? <p>The gallery filled with no row, column, or diagonal of four sharing a single trait. Honours even.</p>
          : <p>{won ? 'You' : 'The rival'} completed a line of four pieces sharing a common trait — <b>Quarto!</b></p>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Quarto" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Sixteen pieces, each unique across <b>four traits</b>: <i>tall / short</i>, <i>dark / light</i>, <i>square / round</i>, and <i>solid / hollow</i>.</p>
        <p>The twist: <b>you never choose your own piece</b>. Your opponent hands you the piece you must place on any empty cell. Then <b>you</b> hand one of the remaining pieces to them.</p>
        <p>Win by completing any row, column, or main diagonal of four pieces that <b>all share at least one trait</b> — all tall, all hollow, all round, and so on. Fill the board with no such line and it's a draw.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
