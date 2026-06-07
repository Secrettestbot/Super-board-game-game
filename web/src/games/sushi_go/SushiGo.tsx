/* SUSHI GO! — UI (built for this codebase). A card-drafting party game on the framework
   shell: you are seat 0; two AI fill seats 1 and 2. Each turn ALL three players pick one
   card at once — you click a card in your hand, the AI choose silently, then the table
   reveals together and hands pass to the left. Three rounds, then pudding settles the score.

   The AI step resolves BOTH opponents in one onStep when it's their turn, and reveal also
   advances state, so the AI driver re-arms on s.step (useAITurn tick). */

import { useState, useRef, useEffect } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { sushiGoAdapter } from './net'
import * as SG from './logic'
import type { SushiState, Card, Kind } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="11" fill="#26203a" stroke="#4a3f6e" strokeWidth="1.5" />
    <ellipse cx="24" cy="30" rx="14" ry="6.5" fill="#fff3e2" stroke="#e7c89c" strokeWidth="1.2" />
    <rect x="13" y="18" width="22" height="13" rx="6.5" fill="#1f1a30" />
    <circle cx="24" cy="22.5" r="6.5" fill="#ff8aa6" stroke="#d65f80" strokeWidth="1.2" />
    <circle cx="24" cy="22.5" r="2.6" fill="#b03e60" />
    <rect x="33" y="9" width="3" height="24" rx="1.5" transform="rotate(20 34 21)" fill="#caa86f" />
  </svg>
)

// ---- card visuals -------------------------------------------------------------

const ICON: Record<Kind, string> = {
  tempura: '🍤', sashimi: '🐟', dumpling: '🥟', maki: '🍙',
  nigiri: '🍣', wasabi: '🟢', chopsticks: '🥢', pudding: '🍮',
}

function cardLabel(c: Card): string {
  if (c.kind === 'nigiri') return c.val === 3 ? 'Squid' : c.val === 2 ? 'Salmon' : 'Egg'
  if (c.kind === 'maki') return `Maki ${c.val}`
  return c.kind.charAt(0).toUpperCase() + c.kind.slice(1)
}

function CardChip({
  c, onClick, selected, dim, small,
}: { c: Card; onClick?: () => void; selected?: boolean; dim?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      className={'sg-card k-' + c.kind + (selected ? ' sel' : '') + (dim ? ' dim' : '') + (small ? ' small' : '')}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="sg-ic">{ICON[c.kind]}</span>
      <span className="sg-lbl">{cardLabel(c)}</span>
      {c.kind === 'maki' && <span className="sg-badge">{'•'.repeat(c.val ?? 1)}</span>}
    </button>
  )
}

// Group a collection into stacked piles for compact display.
function pileKey(c: Card): string { return c.kind === 'nigiri' || c.kind === 'maki' ? `${c.kind}-${c.val}` : c.kind }
function groupCollection(cards: Card[]): { rep: Card; n: number }[] {
  const order: string[] = []
  const map = new Map<string, { rep: Card; n: number }>()
  for (const c of cards) {
    const k = pileKey(c)
    if (!map.has(k)) { map.set(k, { rep: c, n: 0 }); order.push(k) }
    map.get(k)!.n++
  }
  return order.map(k => map.get(k)!)
}

/** Seat-relative display name: your seat reads "You"; others read "Opponent"/"Player N"
 *  online, or their solo label (AI 1 / AI 2) when offline. */
function displayName(seat: number, mySeat: number, online: boolean, numSeats: number): string {
  if (seat === mySeat) return 'You'
  if (!online) return SG.seatName(seat)
  return numSeats <= 2 ? 'Opponent' : `Player ${seat + 1}`
}

/** Label for the winning seat (resolved from the logic's string label) relative to you. */
function oppLabel(winnerLabel: string, mySeat: number, online: boolean): string {
  if (!online) return winnerLabel
  // winnerLabel is one of SEAT_NAMES; map back to a seat index for a relative label.
  const seat = SG.SEAT_NAMES.indexOf(winnerLabel)
  if (seat < 0 || seat === mySeat) return winnerLabel
  return SG.NPLAYERS <= 2 ? 'Opponent' : `Player ${seat + 1}`
}

export function SushiGo() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(sushiGoAdapter)
  const [showRules, setShowRules] = useState(false)
  // Chopsticks staging for your seat: when armed, the first click selects card A,
  // the second click selects card B and commits a double-pick.
  const [chopArmed, setChopArmed] = useState(false)
  const [firstPick, setFirstPick] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    netNew(); setShowRules(false); setChopArmed(false); setFirstPick(null)
  }

  // The AI driver lives inside useGameSession (it fills any unowned seat). The reveal is
  // folded into the move that completes the turn by the adapter, so nothing extra is needed.

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  // Seat-relative: "you" are mySeat. yourTurn gates your pick; you've picked iff your
  // pending slot is filled.
  const yourTurn = s.phase === 'draft' && isMyTurn && s.pending[mySeat] == null
  const myHand = s.hands[mySeat]
  const numSeats = s.hands.length
  // Seats other than yours, rendered as the opponents' row.
  const foeSeats = Array.from({ length: numSeats }, (_, i) => i).filter(i => i !== mySeat)
  const nameOf = (seat: number) => displayName(seat, mySeat, net.online, numSeats)

  function commitSingle(cardId: number) {
    if (!yourTurn) return
    dispatch({ kind: 'pick', cardId })
  }
  function commitDouble(aId: number, bId: number) {
    if (!yourTurn) return
    dispatch({ kind: 'pick', cardId: aId, extraId: bId })
    setChopArmed(false); setFirstPick(null)
  }

  function onCardClick(cardId: number) {
    if (!yourTurn) return
    if (chopArmed && SG.hasChopsticks(s, mySeat) && myHand.length >= 2) {
      if (firstPick == null) { setFirstPick(cardId); return }
      if (firstPick === cardId) { setFirstPick(null); return } // toggle off
      commitDouble(firstPick, cardId); return
    }
    commitSingle(cardId)
  }

  function toggleChop() {
    if (!yourTurn || !SG.hasChopsticks(s, mySeat) || myHand.length < 2) return
    setChopArmed(a => !a); setFirstPick(null)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setChopArmed(false); setFirstPick(null) },
    extra: (e) => {
      if (s.phase !== 'draft' || !yourTurn) return false
      if ((e.key === 'c' || e.key === 'C') && SG.hasChopsticks(s, mySeat) && myHand.length >= 2) { toggleChop(); return true }
      const n = Number(e.key)
      if (n >= 1 && n <= myHand.length) { onCardClick(myHand[n - 1].id); return true }
      return false
    },
  })

  // ---- banner -----------------------------------------------------------------
  // Seat-relative: you win iff the winning label is YOUR seat's label.
  const iWon = s.winner === SG.seatName(mySeat)
  let banner: string, bk = ''
  if (s.phase === 'gameEnd') {
    if (iWon) { bk = 'win'; banner = `You win with ${s.scores[mySeat]} points!` }
    else if (s.winner === 'Tie') { bk = ''; banner = 'The table ties!' }
    else { bk = 'lose'; banner = `${oppLabel(s.winner, mySeat, net.online)} wins — you scored ${s.scores[mySeat]}` }
  } else if (yourTurn) {
    bk = 'you'
    banner = chopArmed
      ? (firstPick == null ? 'Chopsticks: pick your FIRST card' : 'Chopsticks: pick your SECOND card')
      : `Round ${s.round} — draft a card to keep`
  } else {
    bk = 'foe'; banner = 'The table is choosing…'
  }

  const cardsLeft = myHand.length
  const leader = (() => {
    const m = Math.max(...s.scores)
    return s.scores.indexOf(m)
  })()

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Sushi Go! · card drafting"
        title="Sushi Go!"
        subtitle="draft and pass — keep one card, pass the rest left, and build the tastiest plate over three rounds before the conveyor empties"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Round {Math.min(s.round, SG.ROUNDS)} / {SG.ROUNDS} · {cardsLeft} card{cardsLeft === 1 ? '' : 's'} left</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>1-9 · keep &nbsp; C · chopsticks &nbsp; N · new</>}
      >
        <div className="sg-wrap">
          {/* opponents' plates */}
          <div className="sg-foes">
            {foeSeats.map(seat => (
              <Plate key={seat} s={s} seat={seat} on={!yourTurn} leader={leader} name={nameOf(seat)} />
            ))}
          </div>

          {/* your plate */}
          <Plate s={s} seat={mySeat} on={yourTurn} leader={leader} name="You" you />

          {/* your hand */}
          <div className="sg-handzone">
            <div className="sg-handhead">
              <span className="sg-handlabel">Your hand</span>
              {SG.hasChopsticks(s, mySeat) && yourTurn && myHand.length >= 2 && (
                <button className={'sg-chopbtn' + (chopArmed ? ' on' : '')} onClick={toggleChop}>
                  🥢 {chopArmed ? 'taking two…' : 'use chopsticks'}
                </button>
              )}
              {s.pending[mySeat] != null && s.phase === 'draft' && <span className="sg-locked">locked in ✓</span>}
            </div>
            <div className="sg-hand">
              {myHand.length === 0
                ? <div className="sg-empty">hand passed — waiting…</div>
                : myHand.map((c, i) => (
                  <div key={c.id} className="sg-handslot">
                    <CardChip
                      c={c}
                      onClick={yourTurn ? () => onCardClick(c.id) : undefined}
                      selected={chopArmed && firstPick === c.id}
                      dim={!yourTurn}
                    />
                    <span className="sg-num">{i + 1}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />
          <div className="panel sg-score">
            {Array.from({ length: numSeats }, (_, seat) => seat).map(seat => (
              <div key={seat} className={'sg-srow' + (seat === leader && s.phase === 'gameEnd' ? ' lead' : '') + (s.phase !== 'gameEnd' && ((seat === mySeat) === yourTurn) ? ' on' : '')}>
                <span className={'sg-pawn ' + (seat === mySeat ? 'you' : 'foe')} />
                <span className="sg-name">{nameOf(seat)}</span>
                <span className="sg-pud" title="puddings banked">🍮 {s.puddings[seat]}</span>
                <span className="sg-pts">{s.scores[seat]}</span>
              </div>
            ))}
            {s.phase !== 'gameEnd' && (
              <div className="sg-roundnote">last round: {Array.from({ length: numSeats }, (_, i) => `${nameOf(i).split(' ')[0]} ${s.roundScores[i]}`).join(' · ')}</div>
            )}
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.phase === 'gameEnd' && <ResultModal s={s} onNew={newGame} mySeat={mySeat} online={net.online} nameOf={nameOf} iWon={iWon} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Plate({ s, seat, on, leader, name, you }: { s: SushiState; seat: number; on: boolean; leader: number; name: string; you?: boolean }) {
  const piles = groupCollection(s.collected[seat])
  const picked = s.phase === 'draft' && s.pending[seat] != null
  const makiTotal = SG.makiIcons(s.collected[seat])
  return (
    <div className={'sg-plate' + (you ? ' you' : '') + (on ? ' active' : '') + (seat === leader && s.phase === 'gameEnd' ? ' winner' : '')}>
      <div className="sg-platehead">
        <span className={'sg-pawn ' + (you ? 'you' : 'foe')} />
        <span className="sg-pname">{name}</span>
        <span className="sg-platemeta">
          {makiTotal > 0 && <span className="sg-makicount">🍙×{makiTotal}</span>}
          <span className="sg-platescore">{s.scores[seat]}</span>
        </span>
        {picked && !you && <span className="sg-chip-picked">picked ✓</span>}
      </div>
      <div className="sg-piles">
        {piles.length === 0
          ? <div className="sg-empty mini">no cards yet</div>
          : piles.map((p, i) => (
            <div key={i} className="sg-pile">
              <CardChip c={p.rep} small />
              {p.n > 1 && <span className="sg-stackn">×{p.n}</span>}
            </div>
          ))}
      </div>
    </div>
  )
}

function ResultModal({ s, onNew, mySeat, online, nameOf, iWon }: {
  s: SushiState; onNew: () => void; mySeat: number; online: boolean; nameOf: (seat: number) => string; iWon: boolean
}) {
  const tie = s.winner === 'Tie'
  const numSeats = s.hands.length
  const title = iWon ? 'You Win!' : tie ? 'A Tie' : `${oppLabel(s.winner ?? '', mySeat, online)} Wins`
  return (
    <Modal
      eyebrow={iWon ? 'Oishii!' : tie ? 'Dead heat' : 'Itadakimasu'}
      title={title}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <div className="sg-final">
          {Array.from({ length: numSeats }, (_, i) => i).map(i => (
            <div key={i} className={'sg-finalrow' + (s.winner === SG.seatName(i) ? ' win' : '')}>
              <span className={i === mySeat ? 'you' : 'foe'}>{nameOf(i)}</span>
              <span className="sg-finalpts">{s.scores[i]} pts</span>
              <span className="sg-finalpud">🍮 {s.puddings[i]}</span>
            </div>
          ))}
        </div>
        <p className="sg-finalnote">Three rounds plated, puddings counted. {iWon ? 'A masterful drafting run.' : tie ? 'Right down to the last roll.' : 'Better luck on the next conveyor.'}</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Sushi Go!" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Let's eat</button>}>
      <div className="modal-body">
        <p>Over <b>three rounds</b>, everyone is dealt a hand. Each turn <b>all players keep one card</b> at the same time, then <b>pass the rest to the left</b>. Repeat until the cards run out, then score the round.</p>
        <p><b>Tempura</b> — each pair = 5. <b>Sashimi</b> — each set of three = 10. <b>Dumpling</b> — 1/2/3/4/5+ = 1/3/6/10/15.</p>
        <p><b>Maki rolls</b> — at round end the most icons scores 6, second-most scores 3 (ties split). <b>Nigiri</b> — egg 1, salmon 2, squid 3. <b>Wasabi</b> triples the value of the <i>next</i> nigiri you keep after it.</p>
        <p><b>Chopsticks</b> — on a later turn, press <kbd>C</kbd> then pick two cards (a chopsticks card goes back into the hand). <b>Pudding</b> is scored only at the end: most +6, fewest -6.</p>
        <p><b>Keys:</b> <kbd>1</kbd>-<kbd>9</kbd> keep that card · <kbd>C</kbd> chopsticks · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
