/* PARADE — UI (built for this codebase). An Alice-in-Wonderland card-shedding game
   for you + 2 others (AI in solo, remote humans online). The parade line runs across
   the top; your clickable hand below; each player's collected pile (sorted by colour)
   and live score on the side. Hover a hand card to preview which cards it would capture.
   Lowest score wins.

   Online: host-authoritative via useGameSession(paradeAdapter). The view is seat-relative
   off mySeat — your hand/collected come from mySeat, isMyTurn gates play, and empty seats
   are driven by the existing AI (the hook handles that). Solo play is identical to before
   (mySeat = 0, seats 1 & 2 are AI). */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { paradeAdapter } from './net'
import * as P from './logic'
import type { State, Card } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="6" y="9" width="13" height="30" rx="3" fill="#e8557a" stroke="#fff" strokeWidth="1.4" transform="rotate(-8 12 24)" />
    <rect x="17" y="6" width="13" height="30" rx="3" fill="#5aa0e8" stroke="#fff" strokeWidth="1.4" />
    <rect x="28" y="9" width="13" height="30" rx="3" fill="#5ec47a" stroke="#fff" strokeWidth="1.4" transform="rotate(8 36 24)" />
    <circle cx="23.5" cy="20" r="3.4" fill="#fff" />
  </svg>
)

const COLOR_VAR: Record<string, string> = {
  red: 'var(--c-red)', blue: 'var(--c-blue)', green: 'var(--c-green)',
  purple: 'var(--c-purple)', orange: 'var(--c-orange)', teal: 'var(--c-teal)',
}

/** Seat-relative display name: "You" for your own seat; online uses generic player
 *  labels (others are remote humans), solo keeps the Wonderland characters. */
function seatName(seat: number, mySeat: number, online: boolean): string {
  if (seat === mySeat) return 'You'
  if (online) return `Player ${seat + 1}`
  return seat === (mySeat + 1) % P.NUM_PLAYERS ? 'Alice' : 'Hatter'
}

function CardChip({ c, size, dim, ghost }: { c: Card; size?: 'big' | 'mini'; dim?: boolean; ghost?: boolean }) {
  return (
    <span
      className={'pd-card' + (size === 'big' ? ' big' : size === 'mini' ? ' mini' : '') + (dim ? ' dim' : '') + (ghost ? ' doomed' : '')}
      style={{ ['--cc' as string]: COLOR_VAR[c.color] }}
    >
      <span className="pd-cv">{c.value}</span>
    </span>
  )
}

export function Parade() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(paradeAdapter)
  const [showRules, setShowRules] = useState(false)
  const [hover, setHover] = useState<number | null>(null)

  function newGame() {
    netNew(); setShowRules(false); setHover(null)
  }

  const over = s.phase === 'over' && s.winner != null
  const yourTurn = !over && isMyTurn

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
  })

  function play(handIndex: number) {
    if (!yourTurn) return
    const card = s.hands[mySeat]?.[handIndex]
    if (card == null) return
    dispatch({ kind: 'play', cardId: card.id })
    setHover(null)
  }

  const sc = P.scores(s)
  const doomedIds = new Set<number>(
    yourTurn && hover != null ? P.previewCapture(s, mySeat, hover).map(c => c.id) : []
  )

  const myHand = s.hands[mySeat] ?? []

  // banner — relative to mySeat
  let banner = '', bk = ''
  if (over && s.winner != null) {
    if (s.winner === mySeat) { bk = 'win'; banner = `You win with ${sc[mySeat]} — the lowest!` }
    else { bk = 'lose'; banner = `${seatName(s.winner, mySeat, net.online)} wins with ${sc[s.winner]}.` }
  } else if (yourTurn) {
    bk = 'you'
    banner = s.phase === 'final' ? 'Final lap — play one last card (no draw).' : 'Your turn — play a card to the parade.'
  } else if (s.turn != null) {
    bk = 'foe'
    banner = net.online
      ? `Waiting for ${seatName(s.turn, mySeat, true)}…`
      : `${seatName(s.turn, mySeat, false)} is choosing…`
  }

  const safeN = yourTurn && hover != null ? (myHand[hover]?.value ?? 0) : -1

  const modeLeft = s.phase === 'final'
    ? 'Final lap — no drawing'
    : `${s.deck.length} in the deck`

  const seatOrder = [mySeat, (mySeat + 1) % P.NUM_PLAYERS, (mySeat + 2) % P.NUM_PLAYERS]

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Parade · Wonderland card-shedding"
        title="Parade"
        subtitle="play to the end of the line — your number spares the leaders; everything cheaper or matching colour is swept up as penalty. Lowest score wins."
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={modeLeft}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="pd-main">
          <div className="pd-paradewrap">
            <div className="pd-paradelabel">The Parade <span className="pd-front">front →</span></div>
            <div className="pd-parade">
              {s.parade.map((c, i) => (
                <CardChip key={c.id} c={c}
                  dim={safeN >= 0 && i < safeN}
                  ghost={doomedIds.has(c.id)} />
              ))}
              {s.parade.length === 0 && <span className="pd-empty">— empty —</span>}
            </div>
          </div>

          <div className="pd-handwrap">
            <div className="pd-handlabel">Your Hand {yourTurn && <span className="pd-hint">click a card to play</span>}</div>
            <div className="pd-hand">
              {myHand.map((c, i) => (
                <button
                  key={c.id}
                  className={'pd-handcard' + (yourTurn ? ' live' : '') + (hover === i ? ' on' : '')}
                  style={{ ['--cc' as string]: COLOR_VAR[c.color] }}
                  disabled={!yourTurn}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(h => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onClick={() => play(i)}
                >
                  <span className="pd-cv">{c.value}</span>
                  <span className="pd-cc">{c.color}</span>
                </button>
              ))}
              {myHand.length === 0 && <span className="pd-empty">— no cards —</span>}
            </div>
            {yourTurn && hover != null && (
              <div className="pd-preview">
                {doomedIds.size === 0
                  ? 'Captures nothing — the parade marches on.'
                  : `Captures ${doomedIds.size} card${doomedIds.size > 1 ? 's' : ''} (penalty).`}
              </div>
            )}
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />
          {seatOrder.map(seat => (
            <PlayerPanel key={seat} s={s} seat={seat} mySeat={mySeat} online={net.online} score={sc[seat]}
              active={s.turn === seat && s.winner == null && s.phase !== 'over'}
              best={over && s.winner === seat} />
          ))}
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {over && s.winner != null && <ResultModal s={s} sc={sc} mySeat={mySeat} online={net.online} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlayerPanel({ s, seat, mySeat, online, score, active, best }: { s: State; seat: number; mySeat: number; online: boolean; score: number; active: boolean; best: boolean }) {
  const bd = P.colorBreakdown(s, seat)
  const isYou = seat === mySeat
  const total = s.collected[seat].length
  return (
    <div className={'panel pp' + (isYou ? ' you' : ' ai') + (active ? ' on' : '') + (best ? ' best' : '')}>
      <div className="pp-head">
        <span className="pp-name">{seatName(seat, mySeat, online)}</span>
        <span className="pp-count">{total} card{total === 1 ? '' : 's'}</span>
        <span className="pp-score">{score}</span>
      </div>
      <div className="pp-colors">
        {bd.map(b => (
          <span key={b.color} className={'pp-col' + (b.count === 0 ? ' off' : b.majority ? ' maj' : ' face')}
            style={{ ['--cc' as string]: COLOR_VAR[b.color] }}
            title={`${b.color}: ${b.count} card${b.count === 1 ? '' : 's'} → ${b.points} pt${b.points === 1 ? '' : 's'}`}>
            <span className="pp-dot" />
            <span className="pp-cn">{b.count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function ResultModal({ s, sc, mySeat, online, onNew }: { s: State; sc: number[]; mySeat: number; online: boolean; onNew: () => void }) {
  const won = s.winner === mySeat
  const order = [0, 1, 2].slice().sort((a, b) => sc[a] - sc[b])
  return (
    <Modal
      eyebrow={won ? 'Cards shed cleverly' : 'Swept into the pile'}
      title={won ? 'You Win' : `${seatName(s.winner ?? 0, mySeat, online)} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {order.map(seat => (
          <span key={seat} className={seat === mySeat ? 'you' : 'foe'}>
            {seatName(seat, mySeat, online)} {sc[seat]}
          </span>
        ))}
      </div>
      <p className="finalsub">Lowest score wins. For each colour, the player holding the most cards scores just 1 each; everyone else pays full face value.</p>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Parade" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Six colours of cards numbered <b>0–10</b> march in a <b>parade</b>. You hold <b>5</b> cards; on your turn play one to the <b>end</b> of the line.</p>
        <p>The card's number <b>N</b> spares the <b>first N</b> cards at the front. Among the rest, you <b>capture</b> every card that is the <b>same colour</b> or has a <b>value ≤ your card</b>. Captured cards become <b>penalty</b> points in front of you. Then draw back up to 5.</p>
        <p>The game ends when someone collects <b>all six colours</b> or the deck empties — then one final lap with <b>no drawing</b>, and each player adds all but <b>2</b> hand cards to their pile.</p>
        <p>Scoring per colour: whoever holds the <b>most</b> counts just <b>1 each</b> (ties for most both count); everyone else counts <b>face value</b>. <b>Lowest total wins.</b></p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
