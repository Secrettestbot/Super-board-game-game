/* KONANE — Hawaiian Checkers (UI, built for this codebase). A black lava papamu on the framework
   shell, basalt + coral pebbles, vs a mobility-driven alpha-beta AI. Opening removals are hinted;
   in play a selected stone shows its legal jump landings. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as KO from './logic'
import type { KonaneState, Move } from './logic'

const { N } = KO

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
  const [s, setS] = useState<KonaneState>(() => KO.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { setS(KO.makeGame()); setSel(null); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'w', () => setS(p => KO.aiMove(p)), { delayMs: 520, tick: s.phase })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (sel !== null) setSel(null); else setShowRules(false) },
  })

  const yourTurn = !s.winner && s.turn === 'b'
  const opening = s.phase === 'open1' || s.phase === 'open2'

  // legal removals (opening) and per-stone jump moves (play)
  const removals = useMemo(
    () => (yourTurn && opening) ? new Set(KO.openingRemovals(s, 'b')) : new Set<number>(),
    [yourTurn, opening, s],
  )
  const myMoves = useMemo(
    () => (yourTurn && !opening) ? KO.legalMoves(s.board, 'b') : [],
    [yourTurn, opening, s.board],
  )
  const movableFrom = useMemo(() => new Set(myMoves.map(m => m.from)), [myMoves])
  // landings available from the selected stone (only the immediate next legal landings)
  const landings = useMemo(() => {
    if (sel === null) return new Map<number, Move>()
    const m = new Map<number, Move>()
    // map each reachable terminal square to the LONGEST turn that ends there, so a click takes
    // the full line of captures available in that direction.
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
      if (removals.has(i)) { setS(KO.move(s, 'b', { from: i, path: [] })); setSel(null) }
      return
    }
    // play phase
    if (landings.has(i)) { setS(KO.move(s, 'b', landings.get(i)!)); setSel(null); return }
    if (movableFrom.has(i)) { setSel(prev => prev === i ? null : i); return }
    setSel(null)
  }

  const { b, w } = KO.counts(s.board)

  let banner: string, bk = ''
  if (s.winner === 'b') { bk = 'win'; banner = 'You win — the rival is stranded' }
  else if (s.winner === 'w') { bk = 'lose'; banner = 'The rival wins — you are stranded' }
  else if (!yourTurn) { bk = 'foe'; banner = 'The rival is thinking…' }
  else if (s.phase === 'open1') { bk = 'you'; banner = 'Lift one of your centre stones' }
  else if (s.phase === 'open2') { bk = 'you'; banner = 'Lift a stone beside the rival’s hole' }
  else if (sel !== null) { bk = 'you'; banner = 'Choose a landing square — or pick another stone' }
  else { bk = 'you'; banner = 'Select a stone to jump' }

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
            {s.board.map((v, i) => {
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
          <div className="panel scoreboard">
            <div className={'sc b' + (s.turn === 'b' && !s.winner ? ' on' : '')}>
              <span className="sc-stone b" /><span className="sc-name">You · Basalt</span><span className="sc-n">{b}</span>
            </div>
            <div className={'sc w' + (s.turn === 'w' && !s.winner ? ' on' : '')}>
              <span className="sc-stone w" /><span className="sc-name">Rival · Coral</span><span className="sc-n">{w}</span>
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

function ResultModal({ s, onNew }: { s: KonaneState; onNew: () => void }) {
  const won = s.winner === 'b'
  return (
    <Modal
      eyebrow={won ? 'No jump for the rival' : 'No jump for you'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body"><p style={{ textAlign: 'center' }}>{won
        ? 'The rival ran out of legal captures. In Konane, the last player able to jump wins.'
        : 'You ran out of legal captures. In Konane, the last player able to jump wins.'}</p></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Konane" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The papamu starts <b>full</b> — basalt and coral pebbles in a checkerboard, 32 each. You are <b>Black (basalt)</b> and open.</p>
        <p><b>Opening:</b> first you <b>lift one of your own</b> stones from near the centre, then the rival lifts one of theirs <b>orthogonally adjacent</b> to that new hole.</p>
        <p><b>Play:</b> every move is a <b>capturing jump</b> — a stone hops <b>orthogonally</b> (never diagonally) over an adjacent enemy into the empty square beyond, removing it. You may <b>keep jumping</b> with the same stone in the <i>same straight line</i> over more enemies, or stop after any hop. Non-capturing moves are not allowed.</p>
        <p>A player who has <b>no legal jump</b> on their turn <b>loses</b>. Mobility is everything.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
