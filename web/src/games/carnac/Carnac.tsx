/* CARNAC — UI (built for this codebase). A 6×7 grassy field on the framework shell.
   You raise vertical menhirs; an alpha-beta AI (or a remote opponent) lays horizontal
   dolmens. Whoever cannot place a stone loses (Domineering). Legal placements are hinted
   on hover. Seat-relative for online play via useGameSession. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { carnacAdapter } from './net'
import * as CK from './logic'
import type { Side } from './logic'

const { COLS, ROWS } = CK
const SIDE: Side[] = ['m', 'd']

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#2c3a22" stroke="#54663f" strokeWidth="1.5" />
    <rect x="13" y="9" width="9" height="26" rx="2.5" fill="#cdc6b4" stroke="#7c7560" strokeWidth="0.6" />
    <rect x="26" y="22" width="14" height="9" rx="2.5" fill="#a39a83" stroke="#6c6450" strokeWidth="0.6" />
  </svg>
)

export function Carnac() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(carnacAdapter)
  const [showRules, setShowRules] = useState(false)

  const mySide = SIDE[mySeat]          // 'm' (vertical) for host/solo, 'd' (horizontal) for guest
  const oppSide: Side = mySide === 'm' ? 'd' : 'm'

  function newGame() { netNew(); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && isMyTurn
  const myMoves = useMemo(() => CK.legalMoves(s.board, mySide), [s.board, mySide])
  const foeMoves = useMemo(() => CK.legalMoves(s.board, oppSide), [s.board, oppSide])
  const legal = useMemo(() => yourTurn ? new Set(myMoves) : new Set<number>(), [yourTurn, myMoves])
  const lastSet = useMemo(() => new Set(s.last ?? []), [s.last])

  function clickCell(i: number) { if (yourTurn && legal.has(i)) dispatch({ i }) }

  const iWon = s.winner === mySide
  const oppName = net.online ? 'Opponent' : 'Rival'
  const myShape = mySide === 'm' ? 'menhir (it stands downward)' : 'dolmen (it lies to the right)'

  let banner: string, bk = ''
  if (s.winner) {
    if (iWon) { bk = 'win'; banner = `You win — the ${oppName.toLowerCase()} has no room left` }
    else { bk = 'lose'; banner = `The ${oppName.toLowerCase()} wins — you cannot raise another stone` }
  } else if (yourTurn) { bk = 'you'; banner = `Your turn — place a ${myShape}` }
  else { bk = 'foe'; banner = net.online ? `The ${oppName.toLowerCase()} is choosing a place…` : 'The rival is choosing a place to lie…' }

  // panel labels keyed to side glyphs/orientation, but framed relative to mySeat
  const myLabel = mySide === 'm' ? 'You · Menhir' : 'You · Dolmen'
  const foeLabel = mySide === 'm' ? `${oppName} · Dolmen` : `${oppName} · Menhir`

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
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel turnbox">
            <div className={'tt ' + mySide + (s.turn === mySide && !s.winner ? ' on' : '')}>
              <span className={'tt-glyph ' + mySide} />
              <span className="tt-name">{myLabel}</span>
              <span className="tt-n">{myMoves.length}</span>
            </div>
            <div className={'tt ' + oppSide + (s.turn === oppSide && !s.winner ? ' on' : '')}>
              <span className={'tt-glyph ' + oppSide} />
              <span className="tt-name">{foeLabel}</span>
              <span className="tt-n">{foeMoves.length}</span>
            </div>
            <div className="tt-cap">legal placements remaining</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={iWon} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppName, onNew }: { won: boolean; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'The field is yours' : 'Out of room'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>{won ? 'Your stones hold the dusk.' : 'The rival crowds you out.'}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Carnac" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The field is <b>6 columns × 7 rows</b>. As the <b>Menhir</b> player you click an empty cell to raise a <b>standing stone</b> that fills that cell and the one <i>directly below</i> it — a vertical domino.</p>
        <p>The rival is the <b>Dolmen</b> player, laying <b>lying stones</b> that fill a cell and the one to its <i>right</i> — a horizontal domino.</p>
        <p>A placement is legal only on two empty, in-bounds cells in your orientation. The first player who <b>cannot place a stone</b> loses the field. (This is Domineering.)</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
