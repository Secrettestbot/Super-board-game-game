/* YOTE — UI (built for this codebase). A 5x6 carved board on the framework shell,
   playable solo vs an alpha-beta capture AI or online vs another human (seat-relative).
   Drop a seed, slide one step, or jump to capture two: the jumped enemy plus one more
   of your choice. Online play runs through useGameSession (host-authoritative). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { yoteAdapter } from './net'
import * as YT from './logic'
import type { Seed, Capture, Cell } from './logic'

// "mode" of the player's pending interaction (local selection only)
type Sel = { from: number } | null

// preview a jump (no bonus removal) so the board shows the jumped pieces already gone
function previewJump(board: Cell[], cap: Capture, who: Seed): Cell[] {
  const b = board.slice()
  b[cap.to] = who; b[cap.from] = null; b[cap.mid] = null
  return b
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#7a3b16" stroke="#a85a28" strokeWidth="1.5" />
    <circle cx="17" cy="24" r="6.5" fill="#2a1a10" stroke="#000" strokeWidth="0.5" />
    <circle cx="31" cy="24" r="6.5" fill="#f0d59a" stroke="#b89154" strokeWidth="0.5" />
  </svg>
)

export function Yote() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(yoteAdapter)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<Sel>(null)

  const you: Seed = mySeat === 0 ? 'd' : 'l'
  const opp: Seed = YT.other(you)
  const game = s.game
  // server is mid-capture (jump applied, removal pending) iff s.pending set
  const inRemoval = s.pending != null
  // the board we render: during a pending capture, show the jump preview
  const board = inRemoval ? previewJump(s.pending!.pre.board, s.pending!.cap, s.pending!.who) : game.board

  function newGame() { netNew(); setShowRules(false); setSel(null) }
  function clearSel() { setSel(null) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (inRemoval) return; if (sel) clearSel(); else setShowRules(false) },
  })

  const over = game.winner !== null || game.turn === null
  // your turn to pick the bonus removal (pending capture belongs to you)
  const myRemoval = inRemoval && isMyTurn && s.pending!.who === you
  const yourTurn = !over && isMyTurn && !inRemoval

  // legal targets for the current selection
  const steps = useMemo(() => (sel ? new Set(YT.stepsFrom(board, sel.from, you)) : new Set<number>()), [sel, board, you])
  const caps = useMemo(() => (sel ? YT.capturesFrom(board, sel.from, you) : []), [sel, board, you])
  const capTo = useMemo(() => new Map(caps.map(c => [c.to, c])), [caps])
  // when not selecting: which of your pieces can act (so they look clickable)
  const movable = useMemo(() => {
    if (!yourTurn) return new Set<number>()
    const out = new Set<number>()
    for (let i = 0; i < YT.N; i++) if (board[i] === you && (YT.stepsFrom(board, i, you).length || YT.capturesFrom(board, i, you).length)) out.add(i)
    return out
  }, [yourTurn, board, you])

  const canDrop = yourTurn && game.hand[you] > 0
  // enemies removable for the bonus pick (during my removal phase)
  const removable = useMemo(
    () => (myRemoval ? new Set(YT.removableEnemies(board, you)) : new Set<number>()),
    [myRemoval, board, you],
  )

  function clickCell(i: number) {
    if (inRemoval) {
      if (myRemoval && removable.has(i)) dispatch({ kind: 'remove', cell: i })
      return
    }
    if (!yourTurn) return
    const v = board[i]
    if (sel) {
      if (capTo.has(i)) { dispatch({ kind: 'move', from: sel.from, to: i }); setSel(null); return }
      if (steps.has(i)) { dispatch({ kind: 'move', from: sel.from, to: i }); setSel(null); return }
      if (v === you) { setSel({ from: i }); return }                   // reselect
      if (v === null && canDrop) { dispatch({ kind: 'drop', cell: i }); setSel(null); return }
      setSel(null); return
    }
    // no selection yet
    if (v === you && movable.has(i)) { setSel({ from: i }); return }
    if (v === null && canDrop) { dispatch({ kind: 'drop', cell: i }) }
  }

  const youBoard = YT.onBoard(board, you), oppBoard = YT.onBoard(board, opp)
  const youTot = youBoard + game.hand[you], oppTot = oppBoard + game.hand[opp]
  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = game.winner === you

  let banner: string, bk = ''
  if (game.winner === you) { bk = 'win'; banner = `You win — the ${net.online ? 'opponent' : 'rival'} is out of seeds` }
  else if (game.winner === opp) { bk = 'lose'; banner = `The ${net.online ? 'opponent' : 'rival'} wins — you are out of seeds` }
  else if (myRemoval) { bk = 'you'; banner = 'Capture! Pick one more enemy seed to remove' }
  else if (inRemoval) { bk = 'foe'; banner = `The ${net.online ? 'opponent' : 'rival'} is capturing…` }
  else if (yourTurn) { bk = 'you'; banner = sel ? 'Choose a step, a jump, or another seed' : canDrop ? 'Your turn — drop a seed or move one' : 'Your turn — move a seed' }
  else { bk = 'foe'; banner = `The ${net.online ? 'opponent' : 'rival'} is thinking…` }

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
            {board.map((v, i) => {
              const isStep = steps.has(i)
              const isCap = capTo.has(i)
              const isRem = removable.has(i)
              const cls = 'yt-cell'
                + (sel?.from === i ? ' sel' : '')
                + (isStep ? ' step' : '')
                + (isCap ? ' cap' : '')
                + (isRem ? ' rem' : '')
                + (game.last === i && !inRemoval ? ' last' : '')
                + ((!v && canDrop && !sel) ? ' droppable' : '')
                + ((v === you && movable.has(i) && !sel) ? ' pickable' : '')
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
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={'sc d' + (!over && isMyTurn ? ' on' : '')}>
              <span className={'sc-seed ' + you} /><span className="sc-name">You</span>
              <span className="sc-stat"><b>{youBoard}</b> on board · <b>{game.hand[you]}</b> in hand</span>
            </div>
            <div className={'sc l' + (!over && !isMyTurn ? ' on' : '')}>
              <span className={'sc-seed ' + opp} /><span className="sc-name">{oppLabel}</span>
              <span className="sc-stat"><b>{oppBoard}</b> on board · <b>{game.hand[opp]}</b> in hand</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-d" style={{ width: `${(youTot / (youTot + oppTot || 1)) * 100}%` }} /></div>
            <div className="sc-totals"><span className="you">You {youTot}</span><span className="foe">{oppLabel} {oppTot}</span></div>
          </div>
          <div className="panel logbox">{game.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {over && game.winner && <ResultModal won={myWin} you={youTot} foe={oppTot} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, you, foe, oppLabel, onNew }: { won: boolean; you: number; foe: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Seeds claimed' : 'Out-captured'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">{oppLabel} {foe}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Yote" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The board starts <b>empty</b>; you each hold <b>12 seeds</b> in hand. On your turn do <b>one</b> of three things:</p>
        <p><b>Drop</b> — place a seed from your hand on any empty cell. <b>Move</b> — slide a seed already on the board one step up, down, left or right into an empty cell.</p>
        <p><b>Capture</b> — jump a seed straight over an <b>adjacent enemy</b> into the empty cell beyond, like checkers. The jumped seed is removed <i>and you also remove one more enemy seed of your choice</i> from anywhere — so every capture takes <b>two</b>. Jumps are single (no chaining).</p>
        <p>You <b>win</b> when the opponent has no seeds left on the board or in hand, or has no legal move on their turn.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
