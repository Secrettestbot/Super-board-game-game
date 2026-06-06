/* KONANE — Hawaiian Checkers (UI, built for this codebase). A black lava papamu on the framework
   shell, basalt + coral pebbles, vs a mobility-driven alpha-beta AI — or a remote opponent online.
   Opening removals are hinted; in play a selected stone shows its legal jump landings. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { konaneAdapter } from './net'
import * as KO from './logic'
import type { Move, Stone } from './logic'

const { N } = KO
const STONE_NAME: Record<Stone, string> = { b: 'Basalt', w: 'Coral' }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#211d1a" stroke="#4a3f37" strokeWidth="1.5" />
    <circle cx="17" cy="17" r="6" fill="#15110e" stroke="#000" strokeWidth="0.5" />
    <circle cx="31" cy="17" r="6" fill="#efe9df" stroke="#c4bcae" strokeWidth="0.5" />
    <circle cx="17" cy="31" r="6" fill="#efe9df" stroke="#c4bcae" strokeWidth="0.5" />
    <circle cx="31" cy="31" r="6" fill="#15110e" stroke="#000" strokeWidth="0.5" />
  </svg>
)

export function Konane() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(konaneAdapter)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  const myStone: Stone = mySeat === 0 ? 'b' : 'w'   // seat 0 = Black/basalt, seat 1 = White/coral
  const oppStone: Stone = myStone === 'b' ? 'w' : 'b'
  const flip = mySeat !== 0

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (sel !== null) setSel(null); else setShowRules(false) },
  })

  const yourTurn = !s.winner && isMyTurn
  const opening = s.phase === 'open1' || s.phase === 'open2'

  // legal removals (opening) and per-stone jump moves (play) — for YOUR side
  const removals = useMemo(
    () => (yourTurn && opening) ? new Set(KO.openingRemovals(s, myStone)) : new Set<number>(),
    [yourTurn, opening, s, myStone],
  )
  const myMoves = useMemo(
    () => (yourTurn && !opening) ? KO.legalMoves(s.board, myStone) : [],
    [yourTurn, opening, s.board, myStone],
  )
  const movableFrom = useMemo(() => new Set(myMoves.map(m => m.from)), [myMoves])
  // landings available from the selected stone (map each terminal square to the LONGEST turn)
  const landings = useMemo(() => {
    if (sel === null) return new Map<number, Move>()
    const m = new Map<number, Move>()
    for (const mv of myMoves) if (mv.from === sel) {
      const land = mv.path[mv.path.length - 1]
      const prev = m.get(land)
      if (!prev || mv.path.length > prev.path.length) m.set(land, mv)
    }
    return m
  }, [sel, myMoves])

  function clickCell(i: number) {
    if (!yourTurn) return
    if (opening) {
      if (removals.has(i)) { dispatch({ from: i, path: [] }); setSel(null) }
      return
    }
    // play phase
    if (landings.has(i)) { const mv = landings.get(i)!; dispatch({ from: mv.from, path: mv.path }); setSel(null); return }
    if (movableFrom.has(i)) { setSel(prev => prev === i ? null : i); return }
    setSel(null)
  }

  const { b, w } = KO.counts(s.board)
  const myCount = myStone === 'b' ? b : w
  const oppCount = myStone === 'b' ? w : b
  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner === myStone

  let banner: string, bk = ''
  if (s.winner === myStone) { bk = 'win'; banner = `You win — ${oppLabel.toLowerCase()} is stranded` }
  else if (s.winner === oppStone) { bk = 'lose'; banner = `${oppLabel} wins — you are stranded` }
  else if (!yourTurn) { bk = 'foe'; banner = net.online ? `${oppLabel} is thinking…` : 'The rival is thinking…' }
  else if (s.phase === 'open1') { bk = 'you'; banner = 'Lift one of your centre stones' }
  else if (s.phase === 'open2') { bk = 'you'; banner = `Lift a stone beside the ${oppLabel.toLowerCase()}’s hole` }
  else if (sel !== null) { bk = 'you'; banner = 'Choose a landing square — or pick another stone' }
  else { bk = 'you'; banner = 'Select a stone to jump' }

  const order = flip
    ? Array.from({ length: N * N }, (_, k) => N * N - 1 - k)
    : Array.from({ length: N * N }, (_, k) => k)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Konane · Hawaiian checkers"
        title="Konane"
        subtitle="hop over the rival's pebbles to capture — strand them with no jump and you win"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={opening ? 'Opening' : '8 × 8 · capture'}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="ko-wrap">
          <div className="ko-board">
            {order.map((i) => {
              const v = s.board[i]
              const [r, c] = KO.rc(i)
              const dark = (r + c) % 2 === 0
              const cls = ['ko-cell', dark ? 'dk' : 'lt']
              if (s.last.includes(i)) cls.push('last')
              if (yourTurn && opening && removals.has(i)) cls.push('rm')
              if (yourTurn && !opening && movableFrom.has(i)) cls.push('movable')
              if (i === sel) cls.push('sel')
              const isLanding = landings.has(i)
              return (
                <div key={i} className={cls.join(' ')} onClick={() => clickCell(i)}>
                  {v && <div className={'ko-stone ' + v + (i === sel ? ' lift' : '')} />}
                  {!v && isLanding && <div className="ko-target" />}
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
            <div className={'sc ' + myStone + (s.turn === myStone && !s.winner ? ' on' : '')}>
              <span className={'sc-stone ' + myStone} /><span className="sc-name">You · {STONE_NAME[myStone]}</span><span className="sc-n">{myCount}</span>
            </div>
            <div className={'sc ' + oppStone + (s.turn === oppStone && !s.winner ? ' on' : '')}>
              <span className={'sc-stone ' + oppStone} /><span className="sc-name">{oppLabel} · {STONE_NAME[oppStone]}</span><span className="sc-n">{oppCount}</span>
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppLabel, onNew }: { won: boolean; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? `No jump for the ${oppLabel.toLowerCase()}` : 'No jump for you'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body"><p style={{ textAlign: 'center' }}>{won
        ? `The ${oppLabel.toLowerCase()} ran out of legal captures. In Konane, the last player able to jump wins.`
        : 'You ran out of legal captures. In Konane, the last player able to jump wins.'}</p></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Konane" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The papamu starts <b>full</b> — basalt and coral pebbles in a checkerboard, 32 each. <b>Black (basalt)</b> opens.</p>
        <p><b>Opening:</b> first the opener <b>lifts one of their own</b> stones from near the centre, then the other side lifts one of theirs <b>orthogonally adjacent</b> to that new hole.</p>
        <p><b>Play:</b> every move is a <b>capturing jump</b> — a stone hops <b>orthogonally</b> (never diagonally) over an adjacent enemy into the empty square beyond, removing it. You may <b>keep jumping</b> with the same stone in the <i>same straight line</i> over more enemies, or stop after any hop. Non-capturing moves are not allowed.</p>
        <p>A player who has <b>no legal jump</b> on their turn <b>loses</b>. Mobility is everything.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
