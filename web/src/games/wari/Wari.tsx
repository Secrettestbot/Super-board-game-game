/* WARI / OWARE — Abapa capture rules on the framework shell. Two rows of six carved
   pits, four seeds each, no end stores — captured seeds bank into a per-player count.
   You sow your bottom row counterclockwise; landing your last seed in a rival pit that
   becomes 2 or 3 captures it (and chains backward). The AI is alpha-beta depth 7; its
   turn re-arms on `${moveCount}-${turn}` via useAITurn's tick. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as W from './logic'
import type { WariState } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="11" width="42" height="26" rx="9" fill="#5a3a1c" stroke="#8a5a28" strokeWidth="1.5" />
    <ellipse cx="13" cy="19" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="24" cy="19" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="35" cy="19" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="13" cy="29" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="24" cy="29" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="35" cy="29" rx="4" ry="4.6" fill="#2a1808" />
    <circle cx="13" cy="19" r="1.6" fill="#d6a85a" />
    <circle cx="35" cy="29" r="1.6" fill="#d6a85a" />
    <circle cx="24" cy="29" r="1.6" fill="#d6a85a" />
  </svg>
)

// scatter up to a cap of seed dots inside a pit (deterministic per index)
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

export function Wari() {
  const [s, setS] = useState<WariState>(() => W.makeGame())
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(W.makeGame()); setShowRules(false) }

  useAITurn(s.winner == null && s.turn === 'ai', () => setS(p => W.aiTurn(p)), {
    delayMs: 640, tick: `${s.moveCount}-${s.turn}`,
  })
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = s.winner == null && s.turn === 'you'
  const legal = useMemo(
    () => (yourTurn ? new Set(W.legalMoves(s.pits, 'you')) : new Set<number>()),
    [yourTurn, s.pits],
  )
  const { you, ai } = W.capturedCounts(s)

  function clickPit(i: number) { if (yourTurn && legal.has(i)) setS(W.applyMove(s, i, 'you')) }

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = `You win — ${you} to ${ai}` }
  else if (s.winner === 'ai') { bk = 'lose'; banner = `The rival wins — ${ai} to ${you}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${you}–${ai}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — sow one of your pits' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  // AI pits 6..11 are drawn right→left (11..6) so the board reads counterclockwise.
  const aiRow = [11, 10, 9, 8, 7, 6]
  const youRow = [0, 1, 2, 3, 4, 5]
  const capSet = new Set(s.capturedPits)

  function Pit({ i, owner }: { i: number; owner: 'you' | 'ai' }) {
    const playable = owner === 'you' && legal.has(i)
    const cls = 'pit ' + owner +
      (playable ? ' playable' : '') +
      (s.last === i ? ' last' : '') +
      (capSet.has(i) ? ' captured' : '') +
      (s.pits[i] === 0 ? ' empty' : '')
    return (
      <button
        type="button"
        className={cls}
        onClick={() => clickPit(i)}
        disabled={!playable}
        aria-label={`${owner === 'you' ? 'Your' : 'Rival'} pit ${W.pitLabel(owner, i)}, ${s.pits[i]} seeds`}
      >
        <Seeds n={s.pits[i]} />
        <span className="pit-count">{s.pits[i]}</span>
        <span className="pit-num">{W.pitLabel(owner, i)}</span>
      </button>
    )
  }

  function Bowl({ side, n }: { side: 'you' | 'ai'; n: number }) {
    const on = s.winner == null && s.turn === side
    return (
      <div className={'bowl ' + side + (on ? ' on' : '')}>
        <span className="bowl-count">{n}</span>
        <span className="bowl-label">{side === 'you' ? 'You' : 'Rival'}</span>
        <span className="bowl-sub">captured</span>
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Wari · Oware · abapa rules"
        title="Wari"
        subtitle="sow seeds counterclockwise and capture the rival's pits as they fall to two or three"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="6 × 4 · capture"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="wa-wrap">
          <div className="wa-board">
            <Bowl side="ai" n={ai} />
            <div className="wa-pits">
              <div className="wa-row ai">{aiRow.map(i => <Pit key={i} i={i} owner="ai" />)}</div>
              <div className="wa-row you">{youRow.map(i => <Pit key={i} i={i} owner="you" />)}</div>
            </div>
            <Bowl side="you" n={you} />
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc ai' + (s.turn === 'ai' && s.winner == null ? ' on' : '')}>
              <span className="sc-dot ai" /><span className="sc-name">Rival</span><span className="sc-n">{ai}</span>
            </div>
            <div className={'sc you' + (s.turn === 'you' && s.winner == null ? ' on' : '')}>
              <span className="sc-dot you" /><span className="sc-name">You</span><span className="sc-n">{you}</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-you" style={{ width: `${(you / Math.max(1, you + ai)) * 100}%` }} /></div>
            <div className="sc-goal">first to 25 of 48 wins</div>
          </div>
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} you={you} ai={ai} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, you, ai, onNew }: { s: WariState; you: number; ai: number; onNew: () => void }) {
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
    <Modal eyebrow="How to play" title="Wari / Oware" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You own the <b>bottom six pits</b>. Each starts with four seeds — there are no stores; captured seeds bank into your <i>count</i>. To move, lift all the seeds from one of your pits and <b>sow</b> them one at a time counterclockwise around the board. On a full lap of twelve or more seeds the origin pit is <b>skipped</b>.</p>
        <p>If your last seed lands in a <i>rival pit</i> and leaves it holding exactly <b>two or three</b> seeds, you <b>capture</b> them. Then check the pit just before it (still the rival's row): if it is also two or three, capture it too — chaining backward until a pit isn't two or three.</p>
        <p><b>Grand slam:</b> a move that would capture <i>all</i> of the rival's seeds is sown but captures nothing. <b>Feeding:</b> if the rival has no seeds you must play a move that gives them some, when one exists.</p>
        <p>The game ends when a player can't move; the seeds left on the board go to whoever still has them. <b>Most seeds wins</b> — 25 of 48 clinches it, 24–24 is a draw.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
