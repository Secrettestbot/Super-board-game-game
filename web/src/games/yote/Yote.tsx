/* YOTE — UI (built for this codebase). A 5x6 carved board on the framework shell,
   vs an alpha-beta capture AI. Drop a seed, slide one step, or jump to capture two:
   the jumped enemy plus one more of your choice. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as YT from './logic'
import type { YoteState, Capture } from './logic'

const { COLS } = YT

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#7a3b16" stroke="#a85a28" strokeWidth="1.5" />
    <circle cx="17" cy="24" r="6.5" fill="#2a1a10" stroke="#000" strokeWidth="0.5" />
    <circle cx="31" cy="24" r="6.5" fill="#f0d59a" stroke="#b89154" strokeWidth="0.5" />
  </svg>
)

// "mode" of the player's pending interaction
type Sel = { from: number } | null

export function Yote() {
  const [s, setS] = useState<YoteState>(() => YT.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<Sel>(null)
  // pending capture awaiting the bonus-removal pick
  const [pendingCap, setPendingCap] = useState<Capture | null>(null)

  function newGame() { setS(YT.makeGame()); setShowRules(false); setSel(null); setPendingCap(null) }
  function clearSel() { setSel(null) }

  useAITurn(!s.winner && s.turn === 'l' && !pendingCap, () => setS(p => YT.aiMove(p)), { delayMs: 520 })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (pendingCap) return; if (sel) clearSel(); else setShowRules(false) },
  })

  const yourTurn = !s.winner && s.turn === 'd' && !pendingCap
  const you = 'd' as const

  // legal targets for the current selection
  const steps = useMemo(() => (sel ? new Set(YT.stepsFrom(s.board, sel.from, you)) : new Set<number>()), [sel, s.board])
  const caps = useMemo(() => (sel ? YT.capturesFrom(s.board, sel.from, you) : []), [sel, s.board])
  const capTo = useMemo(() => new Map(caps.map(c => [c.to, c])), [caps])
  // when not selecting: which of your pieces can act (so they look clickable)
  const movable = useMemo(() => {
    if (!yourTurn) return new Set<number>()
    const out = new Set<number>()
    for (let i = 0; i < YT.N; i++) if (s.board[i] === you && (YT.stepsFrom(s.board, i, you).length || YT.capturesFrom(s.board, i, you).length)) out.add(i)
    return out
  }, [yourTurn, s.board])

  const canDrop = yourTurn && s.hand[you] > 0
  // enemies removable for the bonus pick (after a jump has been simulated)
  const removable = useMemo(() => (pendingCap ? new Set(YT.removableEnemies(simJump(s, pendingCap), you)) : new Set<number>()), [pendingCap, s.board])

  function clickCell(i: number) {
    if (pendingCap) {
      if (removable.has(i)) {
        setS(YT.capture(s, pendingCap, i, you))
        setPendingCap(null); setSel(null)
      }
      return
    }
    if (!yourTurn) return
    const v = s.board[i]
    if (sel) {
      if (capTo.has(i)) {
        const cap = capTo.get(i)!
        const after = simJump(s, cap)
        const rem = YT.removableEnemies(after, you)
        if (rem.length) { setPendingCap(cap); setSel(null) }          // ask for bonus
        else { setS(YT.capture(s, cap, null, you)); setSel(null) }    // nothing extra to take
        return
      }
      if (steps.has(i)) { setS(YT.move(s, sel.from, i, you)); setSel(null); return }
      if (v === you) { setSel({ from: i }); return }                  // reselect
      if (v === null && canDrop) { setS(YT.drop(s, i, you)); setSel(null); return }
      setSel(null); return
    }
    // no selection yet
    if (v === you && movable.has(i)) { setSel({ from: i }); return }
    if (v === null && canDrop) { setS(YT.drop(s, i, you)) }
  }

  const dBoard = YT.onBoard(s.board, 'd'), lBoard = YT.onBoard(s.board, 'l')
  const dTot = dBoard + s.hand.d, lTot = lBoard + s.hand.l

  let banner: string, bk = ''
  if (s.winner === 'd') { bk = 'win'; banner = 'You win — the rival is out of seeds' }
  else if (s.winner === 'l') { bk = 'lose'; banner = 'The rival wins — you are out of seeds' }
  else if (pendingCap) { bk = 'you'; banner = 'Capture! Pick one more enemy seed to remove' }
  else if (yourTurn) { bk = 'you'; banner = sel ? 'Choose a step, a jump, or another seed' : canDrop ? 'Your turn — drop a seed or move one' : 'Your turn — move a seed' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Yote · drop, slide, jump"
        title="Yote"
        subtitle="a West African capture game — leap an enemy seed to claim two at once"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="5 × 6 · 12 seeds each"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="yt-wrap">
          <div className="yt-board">
            {s.board.map((v, i) => {
              const isStep = steps.has(i)
              const isCap = capTo.has(i)
              const isRem = removable.has(i)
              const cls = 'yt-cell'
                + (sel?.from === i ? ' sel' : '')
                + (isStep ? ' step' : '')
                + (isCap ? ' cap' : '')
                + (isRem ? ' rem' : '')
                + (s.last === i ? ' last' : '')
                + ((!v && canDrop && !sel && !pendingCap) ? ' droppable' : '')
                + ((v === you && movable.has(i) && !sel && !pendingCap) ? ' pickable' : '')
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {v && <div className={'yt-seed ' + v + (isRem ? ' targeted' : '')} />}
                  {!v && (isStep || isCap) && <div className={'yt-dot' + (isCap ? ' cap' : '')} />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc d' + (s.turn === 'd' && !s.winner ? ' on' : '')}>
              <span className="sc-seed d" /><span className="sc-name">You</span>
              <span className="sc-stat"><b>{dBoard}</b> on board · <b>{s.hand.d}</b> in hand</span>
            </div>
            <div className={'sc l' + (s.turn === 'l' && !s.winner ? ' on' : '')}>
              <span className="sc-seed l" /><span className="sc-name">Rival</span>
              <span className="sc-stat"><b>{lBoard}</b> on board · <b>{s.hand.l}</b> in hand</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-d" style={{ width: `${(dTot / (dTot + lTot || 1)) * 100}%` }} /></div>
            <div className="sc-totals"><span className="you">You {dTot}</span><span className="foe">Rival {lTot}</span></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} you={dTot} foe={lTot} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

// simulate just the jump (not the bonus removal) to know which enemies remain
function simJump(s: YoteState, cap: Capture): YT.Cell[] {
  const b = s.board.slice()
  b[cap.to] = 'd'; b[cap.from] = null; b[cap.mid] = null
  return b
}

function ResultModal({ s, you, foe, onNew }: { s: YoteState; you: number; foe: number; onNew: () => void }) {
  const won = s.winner === 'd'
  return (
    <Modal
      eyebrow={won ? 'Seeds claimed' : 'Out-captured'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">Rival {foe}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Yote" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The board starts <b>empty</b>; you each hold <b>12 seeds</b> in hand. You move first. On your turn do <b>one</b> of three things:</p>
        <p><b>Drop</b> — place a seed from your hand on any empty cell. <b>Move</b> — slide a seed already on the board one step up, down, left or right into an empty cell.</p>
        <p><b>Capture</b> — jump a seed straight over an <b>adjacent enemy</b> into the empty cell beyond, like checkers. The jumped seed is removed <i>and you also remove one more enemy seed of your choice</i> from anywhere — so every capture takes <b>two</b>. Jumps are single (no chaining).</p>
        <p>You <b>win</b> when the rival has no seeds left on the board or in hand, or has no legal move on their turn.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
