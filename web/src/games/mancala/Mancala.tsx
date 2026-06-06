/* MANCALA — Kalah (6/4) UI on the framework shell. A carved-timber board: two rows of six
   rounded pits plus a big end store each. You sow your bottom row counterclockwise into your
   right store; landing your last seed in your store earns another turn — so the alpha-beta AI
   may sow several times in a row. The AI turn re-arms on `${moveCount}-${turn}` (useAITurn tick). */

import { useEffect, useMemo, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as MC from './logic'
import type { MancalaState } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="9" width="42" height="30" rx="14" fill="#5a3a1e" stroke="#7a5230" strokeWidth="1.5" />
    <ellipse cx="11" cy="24" rx="4" ry="7" fill="#33200f" />
    <ellipse cx="37" cy="24" rx="4" ry="7" fill="#33200f" />
    <circle cx="20" cy="18" r="2.4" fill="#caa46a" />
    <circle cx="27" cy="18" r="2.4" fill="#caa46a" />
    <circle cx="20" cy="30" r="2.4" fill="#caa46a" />
    <circle cx="27" cy="30" r="2.4" fill="#caa46a" />
  </svg>
)

// render up to a cap of seed dots, scattered deterministically inside a pit
function Seeds({ n }: { n: number }) {
  const dots = Math.min(n, 12)
  return (
    <span className="seedfield">
      {Array.from({ length: dots }).map((_, k) => (
        <span key={k} className={'seed s' + (k % 4)} />
      ))}
    </span>
  )
}

export function Mancala() {
  const [s, setS] = useState<MancalaState>(() => MC.makeGame())
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(MC.makeGame()); setShowRules(false) }

  // Extra turns: landing in your own store keeps it the same player's turn, so the AI may
  // sow several times. Re-arm the timer on each sub-move via the moveCount/turn tick.
  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => MC.aiMove(p)), { delayMs: 620, tick: `${s.moveCount}-${s.turn}` })
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'you'
  const legal = useMemo(
    () => (yourTurn ? new Set(MC.legalMoves(s.pits, 'you')) : new Set<number>()),
    [yourTurn, s.pits],
  )
  const { you, ai } = MC.storeCounts(s.pits)

  function clickPit(i: number) { if (yourTurn && legal.has(i)) setS(MC.move(s, i, 'you')) }

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = `You win — ${you} to ${ai}` }
  else if (s.winner === 'ai') { bk = 'lose'; banner = `The rival wins — ${ai} to ${you}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${you}–${ai}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — sow one of your pits' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  // AI pits are drawn right→left over indices 12..7 so the board reads counterclockwise
  const aiRow = [12, 11, 10, 9, 8, 7]
  const youRow = [0, 1, 2, 3, 4, 5]

  function Pit({ i, owner }: { i: number; owner: 'you' | 'ai' }) {
    const playable = owner === 'you' && legal.has(i)
    return (
      <button
        type="button"
        className={'pit ' + owner + (playable ? ' playable' : '') + (s.last === i ? ' last' : '') + (s.pits[i] === 0 ? ' empty' : '')}
        onClick={() => clickPit(i)}
        disabled={!playable}
        aria-label={`${owner === 'you' ? 'Your' : 'Rival'} pit ${MC.pitLabel(owner, i)}, ${s.pits[i]} seeds`}
      >
        <Seeds n={s.pits[i]} />
        <span className="pit-count">{s.pits[i]}</span>
        <span className="pit-num">{MC.pitLabel(owner, i)}</span>
      </button>
    )
  }

  function Store({ side, n }: { side: 'you' | 'ai'; n: number }) {
    const on = !s.winner && s.turn === side
    return (
      <div className={'store ' + side + (on ? ' on' : '')}>
        <Seeds n={n} />
        <span className="store-count">{n}</span>
        <span className="store-label">{side === 'you' ? 'You' : 'Rival'}</span>
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Mancala · Kalah rules"
        title="Mancala"
        subtitle="sow your seeds counterclockwise, bank them in your store, and capture across the board"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="6 × 4 · Kalah"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="mc-wrap">
          <div className="mc-board">
            <Store side="ai" n={ai} />
            <div className="mc-pits">
              <div className="mc-row ai">{aiRow.map(i => <Pit key={i} i={i} owner="ai" />)}</div>
              <div className="mc-row you">{youRow.map(i => <Pit key={i} i={i} owner="you" />)}</div>
            </div>
            <Store side="you" n={you} />
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc ai' + (s.turn === 'ai' && !s.winner ? ' on' : '')}>
              <span className="sc-dot ai" /><span className="sc-name">Rival</span><span className="sc-n">{ai}</span>
            </div>
            <div className={'sc you' + (s.turn === 'you' && !s.winner ? ' on' : '')}>
              <span className="sc-dot you" /><span className="sc-name">You</span><span className="sc-n">{you}</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-you" style={{ width: `${(you / Math.max(1, you + ai)) * 100}%` }} /></div>
          </div>
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} you={you} ai={ai} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, you, ai, onNew }: { s: MancalaState; you: number; ai: number; onNew: () => void }) {
  const won = s.winner === 'you', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Seeds banked' : 'Out-sown'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">Rival {ai}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Mancala" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You own the <b>bottom six pits</b> and the <b>store on the right</b>. Each pit starts with four seeds. To move, lift all the seeds from one of your pits and <b>sow</b> them one at a time counterclockwise — along your row, into your store, then across the rival's row — but never into the rival's store.</p>
        <p>If your last seed lands in <i>your own store</i>, you take an <b>extra turn</b>.</p>
        <p>If your last seed lands in an <i>empty pit on your own side</i> and the pit directly opposite holds seeds, you <b>capture</b> both — that seed and all the opposite ones — into your store.</p>
        <p>When all six pits on <i>either</i> side are empty the game ends; each player banks the seeds left on their own side. <b>Most seeds wins.</b></p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
