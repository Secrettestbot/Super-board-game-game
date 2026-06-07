/* KALAH (6, 4) — the standard modern Mancala on the framework shell. A carved
   clay board: two rows of six rounded pits and a tall store (kalah) at each end.
   You sow your pits counterclockwise into your store; landing the last seed in your
   store earns another turn — so a player may sow several times in a row. Online play
   is host-authoritative via useGameSession; the AI fills any empty seat. The board is
   shown seat-relative — your pits sit on the bottom row whichever seat you hold. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { kalahAdapter } from './net'
import * as K from './logic'
import type { State, Side } from './logic'

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
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(kalahAdapter)
  const mySide: Side = mySeat === 0 ? 'you' : 'ai'
  const oppSide: Side = mySide === 'you' ? 'ai' : 'you'
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    netNew()
    setShowRules(false)
  }

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0
  }, [s.log])
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
  })

  const yourTurn = s.winner == null && isMyTurn
  const legal = useMemo(
    () => (yourTurn ? new Set(K.legalMoves(s, mySide)) : new Set<number>()),
    [yourTurn, s, mySide],
  )
  const counts = K.storeCounts(s.pits)
  const myScore = counts[mySide]
  const oppScore = counts[oppSide]

  const oppName = net.online ? 'Opponent' : 'Rival'
  const thinking = net.online ? 'is taking their turn…' : 'is thinking…'

  function clickPit(i: number) {
    if (yourTurn && legal.has(i)) dispatch({ pit: i })
  }

  // result relative to mySeat
  const iWon = s.winner === mySide
  const oppWon = s.winner === oppSide

  let banner: string
  let bk = ''
  if (iWon) { bk = 'win'; banner = `You win — ${myScore} to ${oppScore}` }
  else if (oppWon) { bk = 'lose'; banner = `${oppName} wins — ${oppScore} to ${myScore}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${myScore}–${oppScore}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — sow one of your pits' }
  else { bk = 'foe'; banner = `${oppName} ${thinking}` }

  // Render seat-relative: my pits/store on the bottom, opponent's on top. Indices are
  // the raw board indices for `mySide` / `oppSide`; pits drawn counterclockwise.
  const myPitIdx = mySide === 'you' ? K.YOUR_PITS : K.AI_PITS
  const oppPitIdx = oppSide === 'you' ? K.YOUR_PITS : K.AI_PITS
  // bottom row reads left->right in sowing order; top row reads right->left so the
  // board reads counterclockwise around the loop.
  const youRow = myPitIdx.slice()
  const aiRow = oppPitIdx.slice().reverse()
  const myStoreN = mySide === 'you' ? s.pits[K.YOUR_STORE] : s.pits[K.AI_STORE]
  const oppStoreN = oppSide === 'you' ? s.pits[K.YOUR_STORE] : s.pits[K.AI_STORE]

  function Pit({ i, owner }: { i: number; owner: 'mine' | 'opp' }) {
    const side: Side = owner === 'mine' ? mySide : oppSide
    const playable = owner === 'mine' && legal.has(i)
    return (
      <button
        type="button"
        className={
          'kl-pit ' + (owner === 'mine' ? 'you' : 'ai') +
          (playable ? ' playable' : '') +
          (s.last === i ? ' last' : '') +
          (s.pits[i] === 0 ? ' empty' : '')
        }
        onClick={() => clickPit(i)}
        disabled={!playable}
        aria-label={`${owner === 'mine' ? 'Your' : oppName} pit ${K.pitLabel(side, i)}, ${s.pits[i]} seeds`}
      >
        <Seeds n={s.pits[i]} />
        <span className="kl-count">{s.pits[i]}</span>
        <span className="kl-num">{K.pitLabel(side, i)}</span>
      </button>
    )
  }

  function Store({ owner, n }: { owner: 'mine' | 'opp'; n: number }) {
    const side: Side = owner === 'mine' ? mySide : oppSide
    const on = s.winner == null && s.turn === side
    return (
      <div className={'kl-store ' + (owner === 'mine' ? 'you' : 'ai') + (on ? ' on' : '')}>
        <Seeds n={n} />
        <span className="kl-store-count">{n}</span>
        <span className="kl-store-label">{owner === 'mine' ? 'You' : oppName}</span>
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
            <Store owner="opp" n={oppStoreN} />
            <div className="kl-pits">
              <div className="kl-row ai">{aiRow.map(i => <Pit key={i} i={i} owner="opp" />)}</div>
              <div className="kl-row you">{youRow.map(i => <Pit key={i} i={i} owner="mine" />)}</div>
            </div>
            <Store owner="mine" n={myStoreN} />
          </div>
        </div>

        <div className="kl-side">
          <div className="kl-panel">
            <OnlineBar net={net} />
          </div>
          <div className="kl-panel kl-scoreboard">
            <div className={'kl-sc ai' + (s.turn === oppSide && s.winner == null ? ' on' : '')}>
              <span className="kl-sc-dot ai" /><span className="kl-sc-name">{oppName}</span><span className="kl-sc-n">{oppScore}</span>
            </div>
            <div className={'kl-sc you' + (s.turn === mySide && s.winner == null ? ' on' : '')}>
              <span className="kl-sc-dot you" /><span className="kl-sc-name">You</span><span className="kl-sc-n">{myScore}</span>
            </div>
            <div className="kl-bar"><div className="kl-bar-you" style={{ width: `${(myScore / Math.max(1, myScore + oppScore)) * 100}%` }} /></div>
          </div>
          <div className="kl-panel kl-logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'kl-log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={iWon} draw={s.winner === 'draw'} myScore={myScore} oppScore={oppScore} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, draw, myScore, oppScore, oppName, onNew }: { won: boolean; draw: boolean; myScore: number; oppScore: number; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Seeds banked' : 'Out-sown'}
      title={draw ? 'A Tie' : won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="kl-finalsc"><span className="you">You {myScore}</span><span className="foe">{oppName} {oppScore}</span></div>
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
