/* KALAH (6, 4) — the standard modern Mancala on the framework shell. A carved
   clay board: two rows of six rounded pits and a tall store (kalah) at each end.
   You sow your bottom row counterclockwise into your right store; landing the
   last seed in your store earns another turn — so the alpha-beta AI may sow
   several times in a row. Its turn re-arms on the `moveCount-turn` useAITurn tick. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as K from './logic'
import type { State } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="10" width="42" height="28" rx="13" fill="#6e3b27" stroke="#94553a" strokeWidth="1.5" />
    <ellipse cx="10.5" cy="24" rx="3.6" ry="6.6" fill="#3a1d11" />
    <ellipse cx="37.5" cy="24" rx="3.6" ry="6.6" fill="#3a1d11" />
    <circle cx="20" cy="18.5" r="2.3" fill="#e7c79a" />
    <circle cx="27" cy="18.5" r="2.3" fill="#d9a86e" />
    <circle cx="20" cy="29.5" r="2.3" fill="#d9a86e" />
    <circle cx="27" cy="29.5" r="2.3" fill="#e7c79a" />
  </svg>
)

// up to a cap of seed dots scattered inside a pit / store
function Seeds({ n }: { n: number }) {
  const dots = Math.min(n, 14)
  return (
    <span className="kl-seedfield" aria-hidden="true">
      {Array.from({ length: dots }).map((_, k) => (
        <span key={k} className={'kl-seed s' + (k % 4)} />
      ))}
    </span>
  )
}

export function Kalah() {
  const [s, setS] = useState<State>(() => K.makeGame())
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    setS(K.makeGame())
    setShowRules(false)
  }

  // Extra-turn rule: landing in your own store keeps the same player to move, so
  // the AI may sow several times. The tick changes on every sub-move (moveCount)
  // so consecutive AI moves keep firing.
  useAITurn(s.winner == null && s.turn === 'ai', () => setS(p => K.aiTurn(p)), {
    delayMs: 620,
    tick: `${s.moveCount}-${s.turn}`,
  })
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0
  }, [s.log])
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
  })

  const yourTurn = s.winner == null && s.turn === 'you'
  const legal = useMemo(
    () => (yourTurn ? new Set(K.legalMoves(s, 'you')) : new Set<number>()),
    [yourTurn, s],
  )
  const { you, ai } = K.storeCounts(s.pits)

  function clickPit(i: number) {
    if (yourTurn && legal.has(i)) setS(K.applyMove(s, i, 'you'))
  }

  let banner: string
  let bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = `You win — ${you} to ${ai}` }
  else if (s.winner === 'ai') { bk = 'lose'; banner = `The rival wins — ${ai} to ${you}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${you}–${ai}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — sow one of your pits' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  // AI pits drawn right -> left over 12..7 so the board reads counterclockwise
  const aiRow = [12, 11, 10, 9, 8, 7]
  const youRow = [0, 1, 2, 3, 4, 5]

  function Pit({ i, owner }: { i: number; owner: 'you' | 'ai' }) {
    const playable = owner === 'you' && legal.has(i)
    return (
      <button
        type="button"
        className={
          'kl-pit ' + owner +
          (playable ? ' playable' : '') +
          (s.last === i ? ' last' : '') +
          (s.pits[i] === 0 ? ' empty' : '')
        }
        onClick={() => clickPit(i)}
        disabled={!playable}
        aria-label={`${owner === 'you' ? 'Your' : 'Rival'} pit ${K.pitLabel(owner, i)}, ${s.pits[i]} seeds`}
      >
        <Seeds n={s.pits[i]} />
        <span className="kl-count">{s.pits[i]}</span>
        <span className="kl-num">{K.pitLabel(owner, i)}</span>
      </button>
    )
  }

  function Store({ side, n }: { side: 'you' | 'ai'; n: number }) {
    const on = s.winner == null && s.turn === side
    return (
      <div className={'kl-store ' + side + (on ? ' on' : '')}>
        <Seeds n={n} />
        <span className="kl-store-count">{n}</span>
        <span className="kl-store-label">{side === 'you' ? 'You' : 'Rival'}</span>
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Mancala family · Kalah"
        title="Kalah"
        subtitle="sow counterclockwise, bank seeds in your store, snatch extra turns and captures"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="6 × 4 · Kalah rules"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="kl-wrap">
          <div className="kl-board">
            <Store side="ai" n={ai} />
            <div className="kl-pits">
              <div className="kl-row ai">{aiRow.map(i => <Pit key={i} i={i} owner="ai" />)}</div>
              <div className="kl-row you">{youRow.map(i => <Pit key={i} i={i} owner="you" />)}</div>
            </div>
            <Store side="you" n={you} />
          </div>
        </div>

        <div className="kl-side">
          <div className="kl-panel kl-scoreboard">
            <div className={'kl-sc ai' + (s.turn === 'ai' && s.winner == null ? ' on' : '')}>
              <span className="kl-sc-dot ai" /><span className="kl-sc-name">Rival</span><span className="kl-sc-n">{ai}</span>
            </div>
            <div className={'kl-sc you' + (s.turn === 'you' && s.winner == null ? ' on' : '')}>
              <span className="kl-sc-dot you" /><span className="kl-sc-name">You</span><span className="kl-sc-n">{you}</span>
            </div>
            <div className="kl-bar"><div className="kl-bar-you" style={{ width: `${(you / Math.max(1, you + ai)) * 100}%` }} /></div>
          </div>
          <div className="kl-panel kl-logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'kl-log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} you={you} ai={ai} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, you, ai, onNew }: { s: State; you: number; ai: number; onNew: () => void }) {
  const won = s.winner === 'you'
  const draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Seeds banked' : 'Out-sown'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="kl-finalsc"><span className="you">You {you}</span><span className="foe">Rival {ai}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      eyebrow="How to play"
      title="Kalah"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}
    >
      <div className="modal-body">
        <p>You own the <b>bottom six pits</b> and the <b>store (kalah) on the right</b>. Each pit starts with four seeds. To move, lift all the seeds from one of your pits and <b>sow</b> them one at a time counterclockwise — along your row, into your store, then across the rival's row — but never into the rival's store.</p>
        <p>If your last seed lands in <i>your own store</i>, you take an <b>extra turn</b>.</p>
        <p>If your last seed lands in an <i>empty pit on your own side</i> and the pit directly opposite holds seeds, you <b>capture</b> both — that seed and all the opposite ones — into your store.</p>
        <p>When all six pits on <i>either</i> side are empty the game ends; each player sweeps the seeds left on their own side into their store. <b>Most seeds wins.</b></p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
