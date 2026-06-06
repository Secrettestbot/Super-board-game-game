/* CANADIAN / INTERNATIONAL CHECKERS — UI (built for this codebase). A cool slate-and-teal
   12x12 draughts board on the framework shell, ivory & onyx flying discs, gold king rings.
   Click a piece to see its landings; captures are forced, you must take the longest, and
   multi-jumps resolve as a single highlighted move. Solo vs a minimax alpha-beta AI, or
   online host/guest via useGameSession (seat-relative: your discs are always nearest you). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { canadianCheckersAdapter } from './net'
import * as CC from './logic'
import type { Player, Move } from './logic'

const { N } = CC

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#10242b" stroke="#2c5560" strokeWidth="1.5" />
    <rect x="3" y="3" width="14" height="14" fill="#274852" />
    <rect x="17" y="17" width="14" height="14" fill="#274852" />
    <rect x="31" y="31" width="14" height="14" fill="#274852" />
    <rect x="17" y="3" width="14" height="14" fill="#0d1b21" />
    <rect x="31" y="17" width="14" height="14" fill="#0d1b21" />
    <circle cx="13" cy="35" r="6.5" fill="#f3ead6" stroke="#9c8d6e" strokeWidth="1" />
    <circle cx="35" cy="13" r="6.5" fill="#23282e" stroke="#000" strokeWidth="1" />
  </svg>
)

export function CanadianCheckers() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(canadianCheckersAdapter)
  const me = mySeat as Player           // seat 0 = Ivory (player 0), seat 1 = Onyx (player 1)
  const opp = (1 - me) as Player
  const [sel, setSel] = useState<number | null>(null)
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = s.winner == null && isMyTurn

  const legal = useMemo<Move[]>(() => (yourTurn ? CC.legalMoves(s) : []), [yourTurn, s])
  const movableFrom = useMemo(() => new Set(legal.map(m => m.from)), [legal])
  const selMoves = useMemo<Move[]>(() => (sel == null ? [] : legal.filter(m => m.from === sel)), [sel, legal])
  const targets = useMemo(() => new Set(selMoves.map(m => m.to)), [selMoves])
  // every square a selected chain jumps over or lands on (for the path glow)
  const chainSquares = useMemo(() => {
    const set = new Set<number>()
    for (const m of selMoves) { for (const cap of m.caps) set.add(cap); for (const p of m.path) set.add(p) }
    return set
  }, [selMoves])

  const c = CC.counts(s.board)
  const mustCapture = legal.length > 0 && legal[0].caps.length > 0

  function clickCell(i: number) {
    if (!yourTurn) return
    const p = s.board[i]
    if (CC.ownerOf(p) === me && movableFrom.has(i)) {
      setSel(i === sel ? null : i)
      return
    }
    if (sel != null && targets.has(i)) {
      const m = selMoves.find(mv => mv.to === i)!
      dispatch({ from: m.from, to: m.to })
      setSel(null)
    }
  }

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner === me
  const oppWin = s.winner === opp

  let banner: string, bk = ''
  if (myWin) { bk = 'win'; banner = 'You win — the board is yours' }
  else if (oppWin) { bk = 'lose'; banner = `The ${oppLabel.toLowerCase()} wins this one` }
  else if (yourTurn) {
    bk = 'you'
    banner = !movableFrom.size ? 'Your turn'
      : mustCapture ? 'Capture is forced — take the longest jump'
        : 'Your turn — advance a disc'
  } else { bk = 'foe'; banner = net.online ? `The ${oppLabel.toLowerCase()} is moving…` : 'The rival is thinking…' }

  const lastSet = s.last ? new Set([s.last.from, s.last.to]) : new Set<number>()

  // seat-relative render: when you sit as seat 1 (top), flip the board so your discs are
  // nearest you. Each visual cell maps back to the real board index via `order`.
  const flip = me !== 0
  const order = useMemo(
    () => (flip ? Array.from({ length: N * N }, (_, i) => N * N - 1 - i) : Array.from({ length: N * N }, (_, i) => i)),
    [flip],
  )

  const myCount = me === 0 ? c.p0 : c.p1
  const oppCount = me === 0 ? c.p1 : c.p0
  const myKings = me === 0 ? c.k0 : c.k1
  const oppKings = me === 0 ? c.k1 : c.k0
  const myDisc = me === 0 ? 'p0' : 'p1'
  const oppDisc = me === 0 ? 'p1' : 'p0'
  const myColorName = me === 0 ? 'Ivory' : 'Onyx'
  const oppColorName = me === 0 ? 'Onyx' : 'Ivory'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Canadian Checkers · 12 × 12"
        title="Canadian Checkers"
        subtitle="international draughts on the big board — flying kings, forced max-captures"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="12 × 12 · 30 men each"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="cc-wrap">
          <div className="cc-board">
            {order.map((i) => {
              const p = s.board[i]
              const dark = (Math.floor(i / N) + (i % N)) % 2 === 1
              const isTarget = targets.has(i)
              const cls =
                'cc-cell ' + (dark ? 'dark' : 'light') +
                (i === sel ? ' sel' : '') +
                (isTarget ? ' target' : '') +
                (chainSquares.has(i) && i !== sel ? ' chain' : '') +
                (lastSet.has(i) ? ' last' : '')
              const owner = CC.ownerOf(p)
              const pickable = yourTurn && ((owner === me && movableFrom.has(i)) || isTarget)
              return (
                <div key={i} className={cls + (pickable ? ' pick' : '')} onClick={() => clickCell(i)}>
                  {p != null && (
                    <div className={'cc-disc ' + (owner === 0 ? 'p0' : 'p1')}>
                      {CC.isKing(p) && <span className="cc-crown" />}
                    </div>
                  )}
                  {p == null && isTarget && <div className="cc-dot" />}
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
            <div className={'sc ' + myDisc + (yourTurn ? ' on' : '')}>
              <span className={'sc-disc ' + myDisc} />
              <span className="sc-name">You · {myColorName}</span>
              <span className="sc-n">{myCount}</span>
            </div>
            <div className={'sc ' + oppDisc + (s.winner == null && !isMyTurn ? ' on' : '')}>
              <span className={'sc-disc ' + oppDisc} />
              <span className="sc-name">{oppLabel} · {oppColorName}</span>
              <span className="sc-n">{oppCount}</span>
            </div>
            <div className="sc-kings">
              <span>{myKings} king{myKings === 1 ? '' : 's'}</span>
              <span>{oppKings} king{oppKings === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={myWin} myCount={myCount} oppCount={oppCount} myColorName={myColorName} oppColorName={oppColorName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, myCount, oppCount, myColorName, oppColorName, onNew }: {
  won: boolean; myCount: number; oppCount: number; myColorName: string; oppColorName: string; onNew: () => void
}) {
  return (
    <Modal
      eyebrow={won ? 'Cleared the board' : 'Boxed in'}
      title={won ? 'You Win' : 'Opponent Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">{myColorName} {myCount}</span><span className="foe">{oppColorName} {oppCount}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Canadian Checkers" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>International draughts on a <b>12 × 12</b> board — 72 dark squares, <b>30 men</b> a side. You start with the men nearest you and move first. Men step <b>one diagonal forward</b> onto an empty dark square.</p>
        <p>To <b>capture</b>, jump an adjacent enemy — <b>forward or backward</b> — into the empty square beyond; further jumps <b>chain</b> into one move. <i>Captures are forced, and you must take the move that captures the most pieces.</i></p>
        <p>Reach the far row and <b>end your move there</b> to be crowned a <b>King</b> — kings <b>fly</b>: gliding any distance along an empty diagonal and capturing an enemy at range, landing anywhere beyond.</p>
        <p>Capture every enemy disc — or leave the opponent with no legal move — to win. Click a piece for its landings, then a square to move.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
