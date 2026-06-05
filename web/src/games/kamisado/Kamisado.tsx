/* KAMISADO — UI (built for this codebase). An 8-colour board on the framework shell,
   vs an alpha-beta minimax AI. The colour you land on dictates the rival's next tower. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as KM from './logic'
import type { KState } from './logic'

const { N, LAYOUT, COLOR_NAMES } = KM

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#161a2e" stroke="#2c3258" strokeWidth="1.5" />
    <rect x="9" y="9" width="12" height="12" rx="2" fill="#ef7d23" />
    <rect x="27" y="9" width="12" height="12" rx="2" fill="#3b73e0" />
    <rect x="9" y="27" width="12" height="12" rx="2" fill="#5fb86a" />
    <rect x="27" y="27" width="12" height="12" rx="2" fill="#d6406a" />
  </svg>
)

export function Kamisado() {
  const [s, setS] = useState<KState>(() => KM.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { setS(KM.makeGame()); setShowRules(false); setSel(null) }

  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => KM.aiMove(p)), { delayMs: 520 })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setSel(null) } })

  const yourTurn = !s.winner && s.turn === 'you'

  // Which of your towers must move (by required colour, or any when free).
  const youMoves = useMemo(() => yourTurn ? KM.legalMoves(s, 'you') : [], [yourTurn, s])
  const movableFroms = useMemo(() => new Set(youMoves.map(m => m.from)), [youMoves])

  // When a tower is selected, its legal destinations.
  const dests = useMemo(() => {
    if (sel == null) return new Set<number>()
    return new Set(youMoves.filter(m => m.from === sel).map(m => m.to))
  }, [sel, youMoves])

  // Auto-select the single required tower so its targets show immediately.
  const effSel = sel != null && movableFroms.has(sel)
    ? sel
    : (s.required != null && movableFroms.size === 1 ? [...movableFroms][0] : sel)
  const effDests = useMemo(() => {
    if (effSel == null) return new Set<number>()
    return new Set(youMoves.filter(m => m.from === effSel).map(m => m.to))
  }, [effSel, youMoves])

  function clickCell(i: number) {
    if (!yourTurn) return
    const t = s.board[i]
    if (t && t.owner === 'you' && movableFroms.has(i)) { setSel(i); return }
    if (effSel != null && (effDests.has(i) || dests.has(i))) {
      setS(KM.move(s, effSel, i))
      setSel(null)
    }
  }

  const reqColor = s.required
  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'Kamisado — you reach the far row!' }
  else if (s.winner === 'ai') { bk = 'lose'; banner = 'The rival reaches the far row' }
  else if (s.winner === 'draw') { bk = ''; banner = 'A deadlock — drawn' }
  else if (yourTurn) {
    bk = 'you'
    banner = reqColor == null ? 'Your turn — move any tower' : `Your turn — move your ${COLOR_NAMES[reqColor]} tower`
  } else {
    bk = 'foe'
    banner = reqColor == null ? 'The rival is thinking…' : `Rival must move ${COLOR_NAMES[reqColor]}…`
  }

  const lastFrom = s.last?.from ?? -1, lastTo = s.last?.to ?? -1

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Kamisado · the colour chain"
        title="Kamisado"
        subtitle="the colour you land on commands the rival's next tower — race a tower to the far row"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="8 × 8 · 8 colours"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="km-wrap">
          <div className="km-board">
            {s.board.map((t, i) => {
              const col = LAYOUT[i]
              const isMovable = movableFroms.has(i)
              const isSel = i === effSel
              const isDest = effDests.has(i) || dests.has(i)
              const cls = 'km-cell c' + col
                + (isDest ? ' dest' : '')
                + (i === lastFrom ? ' from' : '') + (i === lastTo ? ' to' : '')
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {t && (
                    <div className={'km-tower ' + t.owner + ' c' + t.color
                      + (isMovable ? ' movable' : '') + (isSel ? ' sel' : '')}>
                      <span className="km-pip" />
                    </div>
                  )}
                  {!t && isDest && <div className="km-dot" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel turnbox">
            <div className="panel-l">To move</div>
            <div className={'turn-row' + (yourTurn ? ' on' : '')}>
              <span className="turn-who you">You</span>
              <span className="turn-who foe">Rival</span>
            </div>
            <div className="req-l panel-l">Required colour</div>
            {reqColor == null
              ? <div className="req free">FREE — any tower</div>
              : <div className="req"><span className={'req-chip c' + reqColor} /> {COLOR_NAMES[reqColor]}</div>}
          </div>
          <div className="panel swatchbox">
            <div className="panel-l">Colours</div>
            <div className="swatches">
              {COLOR_NAMES.map((nm, c) => <span key={c} className={'sw c' + c} title={nm} />)}
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

function ResultModal({ s, onNew }: { s: KState; onNew: () => void }) {
  const won = s.winner === 'you', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Stalemate' : won ? 'You broke through' : 'Out-manoeuvred'}
      title={draw ? 'A Draw' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalmsg">
        {draw
          ? 'Both required towers were stuck — the round deadlocked.'
          : won
            ? 'Your tower landed on the rival’s home row. Kamisado!'
            : 'The rival’s tower reached your home row first.'}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Kamisado" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Every one of the 64 cells is one of <b>8 colours</b>. You own 8 towers — one of each colour — on your home row (the bottom). The rival sits across the top.</p>
        <p>Towers move <b>straight forward</b> or <b>diagonally forward</b>, any number of empty cells — never sideways, backward, or through another tower.</p>
        <p><b>The colour rule:</b> the colour of the cell your tower <i>lands on</i> dictates which tower the rival must move next — their tower <b>of that colour</b>. Your first move is free.</p>
        <p>If the dictated tower is fully blocked, that player <b>passes</b> and the same colour passes back. Get any tower onto the <b>far row</b> to win.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
