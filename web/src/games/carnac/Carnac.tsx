/* CARNAC — UI (built for this codebase). A 6×7 grassy field on the framework shell.
   You raise vertical menhirs; an alpha-beta AI lays horizontal dolmens. Whoever cannot
   place a stone loses (Domineering). Legal placements are hinted on hover. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as CK from './logic'
import type { CarnacState } from './logic'

const { COLS, ROWS } = CK

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#2c3a22" stroke="#54663f" strokeWidth="1.5" />
    <rect x="13" y="9" width="9" height="26" rx="2.5" fill="#cdc6b4" stroke="#7c7560" strokeWidth="0.6" />
    <rect x="26" y="22" width="14" height="9" rx="2.5" fill="#a39a83" stroke="#6c6450" strokeWidth="0.6" />
  </svg>
)

export function Carnac() {
  const [s, setS] = useState<CarnacState>(() => CK.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(CK.makeGame()); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'd', () => setS(p => CK.aiMove(p)), { delayMs: 520 })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'm'
  const youMoves = useMemo(() => CK.legalMoves(s.board, 'm'), [s.board])
  const foeMoves = useMemo(() => CK.legalMoves(s.board, 'd'), [s.board])
  const legal = useMemo(() => yourTurn ? new Set(youMoves) : new Set<number>(), [yourTurn, youMoves])
  const lastSet = useMemo(() => new Set(s.last ?? []), [s.last])

  function clickCell(i: number) { if (yourTurn && legal.has(i)) setS(CK.place(s, i, 'm')) }

  let banner: string, bk = ''
  if (s.winner === 'm') { bk = 'win'; banner = 'You win — the rival has no room left' }
  else if (s.winner === 'd') { bk = 'lose'; banner = 'The rival wins — you cannot raise another stone' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — raise a menhir (it stands downward)' }
  else { bk = 'foe'; banner = 'The rival is choosing a place to lie…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Carnac · standing stones"
        title="Carnac"
        subtitle="raise vertical menhirs against the rival's horizontal dolmens — whoever runs out of room loses"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${COLS} × ${ROWS} field`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="ck-wrap">
          <div className="ck-board" style={{ ['--cols' as string]: COLS, ['--rows' as string]: ROWS }}>
            {s.board.map((v, i) => (
              <div
                key={i}
                className={
                  'ck-cell' +
                  (legal.has(i) ? ' hint' : '') +
                  (lastSet.has(i) ? ' last' : '')
                }
                onClick={() => clickCell(i)}
              >
                {v && <div className={'ck-stone ' + v} />}
                {!v && legal.has(i) && <div className="ck-ghost" />}
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel turnbox">
            <div className={'tt m' + (s.turn === 'm' && !s.winner ? ' on' : '')}>
              <span className="tt-glyph m" />
              <span className="tt-name">You · Menhir</span>
              <span className="tt-n">{youMoves.length}</span>
            </div>
            <div className={'tt d' + (s.turn === 'd' && !s.winner ? ' on' : '')}>
              <span className="tt-glyph d" />
              <span className="tt-name">Rival · Dolmen</span>
              <span className="tt-n">{foeMoves.length}</span>
            </div>
            <div className="tt-cap">legal placements remaining</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={s.winner === 'm'} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, onNew }: { won: boolean; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'The field is yours' : 'Out of room'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>{won ? 'Your menhirs hold the dusk.' : 'The dolmens crowd you out.'}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Carnac" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The field is <b>6 columns × 7 rows</b>. You are the <b>Menhir</b> player: each turn you click an empty cell to raise a <b>standing stone</b> that fills that cell and the one <i>directly below</i> it — a vertical domino.</p>
        <p>The rival is the <b>Dolmen</b> player, laying <b>lying stones</b> that fill a cell and the one to its <i>right</i> — a horizontal domino.</p>
        <p>A placement is legal only on two empty, in-bounds cells in your orientation. The first player who <b>cannot place a stone</b> loses the field. (This is Domineering.)</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
