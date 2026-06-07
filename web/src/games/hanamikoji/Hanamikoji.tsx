/* HANAMIKOJI — UI. An elegant Kyoto hanamachi: seven geisha tracks down the center, your hand of
   item cards below, four lacquer action markers at your side. Pick a marker, select the cards it
   needs, and confirm. When the opponent offers a Gift or stages a Competition, a modal lets you
   choose which cards come to your side. Control 4 geisha or 11 charm to win.

   Online-capable: useGameSession runs the authoritative logic; the view is seat-relative so a guest
   can play seat 1. "You" is always mySeat; the rival is the other seat (an AI locally, a remote
   "Opponent" online). isMyTurn gates every action. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { hanamikojiAdapter } from './net'
import * as H from './logic'
import type { Geisha, Marker, Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="9" fill="#241036" stroke="#5b3b7a" strokeWidth="1.5" />
    <path d="M24 9 L33 18 L24 27 L15 18 Z" fill="none" stroke="#e6b94e" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="24" cy="18" r="3" fill="#d36c8e" />
    <path d="M14 34 q10 -6 20 0" fill="none" stroke="#e6b94e" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const MARKER_META: Record<Marker, { label: string; need: number; hint: string }> = {
  secret: { label: 'Secret', need: 1, hint: 'Hide 1 card — applied to your side at round end.' },
  tradeoff: { label: 'Trade-off', need: 2, hint: 'Discard 2 cards from the round.' },
  gift: { label: 'Gift', need: 3, hint: 'Reveal 3 — the opponent keeps 1, you get the other 2.' },
  competition: { label: 'Competition', need: 4, hint: 'Reveal 2 pairs — the opponent keeps one pair, you get the other.' },
}

const other = (p: Player): Player => (p === 0 ? 1 : 0)

export function Hanamikoji() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(hanamikojiAdapter)
  const me = mySeat as Player
  const foe = other(me)
  const foeName = net.online ? 'Opponent' : 'AI'

  const [showRules, setShowRules] = useState(false)
  const [marker, setMarker] = useState<Marker | null>(null)   // marker you're committing to
  const [sel, setSel] = useState<number[]>([])                // selected hand indices

  function newGame() { netNew(); setShowRules(false); setMarker(null); setSel([]) }

  // It's your action turn when the game is live, no choice pends, and the seat to move is yours.
  const yourTurn = s.winner === null && !s.roundOver && s.pending === null && isMyTurn
  // You must resolve a pending gift/competition that the opponent revealed against you.
  const youChoosing = s.pending !== null && s.pending.chooser === me
  // Between rounds you advance the game if you are the next starter.
  const youAdvance = s.winner === null && s.roundOver && isMyTurn

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setMarker(null); setSel([]) },
  })

  function chooseMarker(m: Marker) {
    if (!yourTurn || s.used[me][m]) return
    setMarker(m); setSel([])
  }

  function toggleCard(i: number) {
    if (!yourTurn || marker == null) return
    const need = MARKER_META[marker].need
    setSel(prev => {
      if (prev.includes(i)) return prev.filter(x => x !== i)
      if (prev.length >= need) return prev          // already full — ignore
      return prev.concat([i])
    })
  }

  function confirm() {
    if (!yourTurn || marker == null) return
    const need = MARKER_META[marker].need
    if (sel.length !== need) return
    const hand = s.hands[me]
    const cards = sel.map(i => hand[i]) as Geisha[]
    if (marker === 'secret') dispatch({ kind: 'secret', card: cards[0] })
    else if (marker === 'tradeoff') dispatch({ kind: 'tradeoff', cards })
    else if (marker === 'gift') dispatch({ kind: 'gift', cards })
    else dispatch({ kind: 'competition', pairs: [[cards[0], cards[1]], [cards[2], cards[3]]] })
    setMarker(null); setSel([])
  }

  // You choosing on the opponent's reveal: option index -> choose intent.
  function pickOption(i: number) {
    if (!youChoosing) return
    dispatch({ kind: 'choose', choiceIndex: i })
  }

  function nextRound() {
    if (!youAdvance) return
    dispatch({ kind: 'next' }); setMarker(null); setSel([])
  }

  const youT = H.tally(s.favor, me), foeT = H.tally(s.favor, foe)

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You win the favor of the hanamachi' }
  else if (s.winner === foe) { bk = 'lose'; banner = `The ${foeName} wins the favor of the hanamachi` }
  else if (s.roundOver) { bk = ''; banner = 'Round complete — secrets revealed' }
  else if (youChoosing && s.pending != null) {
    bk = 'you'; banner = s.pending.kind === 'gift' ? `The ${foeName} offers a gift — take one card` : `The ${foeName} stages a competition — take one pair`
  }
  else if (yourTurn && marker == null) { bk = 'you'; banner = 'Your turn — choose an action marker' }
  else if (yourTurn) { bk = 'you'; banner = `Select ${MARKER_META[marker!].need} card${MARKER_META[marker!].need > 1 ? 's' : ''} — ${MARKER_META[marker!].label}` }
  else { bk = 'foe'; banner = net.online ? 'Waiting for the opponent…' : 'The AI considers its move…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Hanamikoji · the geisha's favor"
        title="Hanamikoji"
        subtitle="court seven geisha with delicate gifts and bluffs — win four of them, or eleven charm"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Round {s.round} · you {youT.geisha}g/{youT.charm}c · {foeName} {foeT.geisha}g/{foeT.charm}c</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="hk-wrap">
          {/* geisha tracks — your side at the bottom, the opponent's at the top */}
          <div className="hk-tracks">
            {Array.from({ length: H.GEISHA_COUNT }, (_, gi) => {
              const g = gi as Geisha
              const myCount = s.placed[me][g]
              const foeCount = s.placed[foe][g]
              const owner = s.favor[g]
              return (
                <div key={gi} className={'hk-geisha' + (owner === me ? ' own-you' : owner === foe ? ' own-foe' : '')}>
                  <div className="hk-side foe">
                    {dots(foeCount, 'foe')}
                  </div>
                  <div className="hk-token">
                    <div className="hk-charm">{H.CHARM[g]}</div>
                    <div className="hk-gname">{H.GEISHA_NAMES[g]}</div>
                    <div className={'hk-favor' + (owner === me ? ' you' : owner === foe ? ' foe' : '')}>
                      {owner === me ? 'YOU' : owner === foe ? (net.online ? 'OPP' : 'AI') : '—'}
                    </div>
                  </div>
                  <div className="hk-side you">
                    {dots(myCount, 'you')}
                  </div>
                </div>
              )
            })}
          </div>

          {/* your hand */}
          <div className="hk-hand-area">
            <div className="hk-hand-label">Your hand · {s.hands[me].length}</div>
            <div className="hk-hand">
              {s.hands[me].map((g, i) => {
                const selected = sel.includes(i)
                const selectable = yourTurn && marker != null
                return (
                  <button
                    key={i}
                    className={'hk-card g' + g + (selected ? ' sel' : '') + (selectable ? ' selectable' : '')}
                    disabled={!selectable}
                    onClick={() => toggleCard(i)}
                  >
                    <span className="hk-card-charm">{H.CHARM[g]}</span>
                    <span className="hk-card-name">{H.GEISHA_NAMES[g]}</span>
                  </button>
                )
              })}
              {s.hands[me].length === 0 && <div className="hk-card empty">—</div>}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel hk-markers">
            <div className="panel-l">Your action markers</div>
            {H.MARKERS.map(m => {
              const used = s.used[me][m]
              const active = marker === m
              const meta = MARKER_META[m]
              return (
                <button
                  key={m}
                  className={'hk-marker' + (used ? ' used' : '') + (active ? ' active' : '')}
                  disabled={used || !yourTurn}
                  onClick={() => chooseMarker(m)}
                  title={meta.hint}
                >
                  <span className="hk-mk-name">{meta.label}</span>
                  <span className="hk-mk-need">{used ? 'used' : `${meta.need} card${meta.need > 1 ? 's' : ''}`}</span>
                </button>
              )
            })}
            {marker != null && yourTurn && (
              <button className="hk-confirm" disabled={sel.length !== MARKER_META[marker].need} onClick={confirm}>
                Confirm {MARKER_META[marker].label} ({sel.length}/{MARKER_META[marker].need})
              </button>
            )}
          </div>

          <div className="panel hk-aimark">
            <div className="panel-l">{foeName} markers</div>
            <div className="hk-aimark-row">
              {H.MARKERS.map(m => (
                <span key={m} className={'hk-pip' + (s.used[foe][m] ? ' used' : '')} title={MARKER_META[m].label}>
                  {MARKER_META[m].label[0]}
                </span>
              ))}
            </div>
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {youChoosing && s.pending != null && (
        <Modal
          eyebrow={s.pending.kind === 'gift' ? 'The Gift' : 'The Competition'}
          title={s.pending.kind === 'gift' ? 'Take one card' : 'Take one pair'}
          closeOnOverlay={false}
          actions={<span className="hk-modal-note">Pick the option you want for your side.</span>}
        >
          <div className="modal-body">
            <p>{s.pending.kind === 'gift'
              ? `The ${foeName} revealed three cards. Choose one for your side; the ${foeName} keeps the other two.`
              : `The ${foeName} revealed two pairs. Choose one pair for your side; the ${foeName} keeps the other.`}</p>
          </div>
          <div className="hk-options">
            {s.pending.options.map((opt, i) => (
              <button key={i} className="hk-option" onClick={() => pickOption(i)}>
                {opt.map((g, j) => (
                  <span key={j} className={'hk-card g' + g + ' mini'}>
                    <span className="hk-card-charm">{H.CHARM[g]}</span>
                    <span className="hk-card-name">{H.GEISHA_NAMES[g]}</span>
                  </span>
                ))}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {s.winner !== null && <ResultModal won={s.winner === me} foeName={foeName} you={youT} foe={foeT} onNew={newGame} />}
      {s.winner === null && s.roundOver && (
        <RoundModal round={s.round} foeName={foeName} you={youT} foe={foeT} canAdvance={youAdvance} onNext={nextRound} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function dots(n: number, cls: string) {
  const out = []
  for (let i = 0; i < n; i++) out.push(<span key={i} className={'hk-dot ' + cls} />)
  if (n === 0) out.push(<span key="e" className="hk-dot empty" />)
  return out
}

type Tally = { geisha: number; charm: number }

function ResultModal({ won, foeName, you, foe, onNew }: { won: boolean; foeName: string; you: Tally; foe: Tally; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'The geisha favor you' : `The ${foeName} is favored`}
      title={won ? 'You Win' : `${foeName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="hk-final">
        <span className="you">You · {you.geisha} geisha / {you.charm} charm</span>
        <span className="foe">{foeName} · {foe.geisha} geisha / {foe.charm} charm</span>
      </div>
    </Modal>
  )
}

function RoundModal({ round, foeName, you, foe, canAdvance, onNext }: { round: number; foeName: string; you: Tally; foe: Tally; canAdvance: boolean; onNext: () => void }) {
  const lead = you.geisha === foe.geisha ? 'even' : you.geisha > foe.geisha ? 'you' : 'foe'
  return (
    <Modal
      eyebrow={`Round ${round} complete`}
      title={lead === 'you' ? 'You Lead' : lead === 'foe' ? `The ${foeName} Leads` : 'Even Standing'}
      closeOnOverlay={false}
      actions={
        canAdvance
          ? <button className="btn-modal" onClick={onNext}>Next round</button>
          : <span className="hk-modal-note">Waiting for the {foeName} to deal the next round…</span>
      }
    >
      <div className="hk-final">
        <span className="you">You · {you.geisha} geisha / {you.charm} charm</span>
        <span className="foe">{foeName} · {foe.geisha} geisha / {foe.charm} charm</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Hanamikoji" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Seven geisha hold charm <b>2,2,2,3,3,4,5</b>. Each round one item card is set aside unseen, you and the opponent are dealt six, and you draw one more at the start of each of your turns. Spend your <b>four action markers</b>, one each, alternating:</p>
        <p><b>Secret</b> — hide 1 card, revealed for your side at round end. <b>Trade-off</b> — discard 2 cards from the round. <b>Gift</b> — reveal 3; the opponent keeps 1, you get 2. <b>Competition</b> — reveal 2 pairs; the opponent keeps one pair, you get the other.</p>
        <p>When all markers are spent, each geisha goes to whoever placed <b>more</b> of its cards (ties keep the prior owner). Favor carries between rounds. Win when you hold <b>4 geisha</b> or <b>11 charm</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
