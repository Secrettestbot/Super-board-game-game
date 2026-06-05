/* HANAMIKOJI — UI. An elegant Kyoto hanamachi: seven geisha tracks down the center, your hand of
   item cards below, four lacquer action markers at your side. Pick a marker, select the cards it
   needs, and confirm. When the AI offers a Gift or stages a Competition, a modal lets you choose
   which cards come to your side. Control 4 geisha or 11 charm to win. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as H from './logic'
import type { HanamikojiState, Geisha, Marker, Player } from './logic'

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
  gift: { label: 'Gift', need: 3, hint: 'Reveal 3 — the AI keeps 1, you get the other 2.' },
  competition: { label: 'Competition', need: 4, hint: 'Reveal 2 pairs — the AI keeps one pair, you get the other.' },
}

export function Hanamikoji() {
  const [s, setS] = useState<HanamikojiState>(() => H.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [marker, setMarker] = useState<Marker | null>(null)   // marker you're committing to
  const [sel, setSel] = useState<number[]>([])                // selected hand indices

  function newGame() { setS(H.makeGame()); setShowRules(false); setMarker(null); setSel([]) }

  const yourTurn = s.winner === null && !s.roundOver && s.pending === null && s.turn === 0
  const aiActive =
    s.winner === null && !s.roundOver &&
    ((s.pending !== null && s.pending.chooser === 1) || (s.pending === null && s.turn === 1))

  // The AI both acts and resolves choices on your reveals; a monotone tick re-arms the timer.
  const tick = aiTick(s)
  useAITurn(aiActive, () => setS(p => stepAI(p)), { delayMs: 720, tick })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setMarker(null); setSel([]) },
  })

  function chooseMarker(m: Marker) {
    if (!yourTurn || s.used[0][m]) return
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
    const hand = s.hands[0]
    const cards = sel.map(i => hand[i]) as Geisha[]
    let ns = s
    if (marker === 'secret') ns = H.secret(s, cards[0])
    else if (marker === 'tradeoff') ns = H.tradeoff(s, cards)
    else if (marker === 'gift') ns = H.gift(s, cards)
    else ns = H.competition(s, [[cards[0], cards[1]], [cards[2], cards[3]]])
    setS(ns); setMarker(null); setSel([])
  }

  // You choosing on the AI's reveal: option index -> opponentChoose.
  function pickOption(i: number) {
    if (s.pending == null || s.pending.chooser !== 0) return
    setS(H.opponentChoose(s, i))
  }

  function nextRound() { setS(H.nextRound(s)); setMarker(null); setSel([]) }

  const youT = H.tally(s.favor, 0), foeT = H.tally(s.favor, 1)

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You win the favor of the hanamachi' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The AI wins the favor of the hanamachi' }
  else if (s.roundOver) { bk = ''; banner = 'Round complete — secrets revealed' }
  else if (s.pending !== null && s.pending.chooser === 0) {
    bk = 'you'; banner = s.pending.kind === 'gift' ? 'The AI offers a gift — take one card' : 'The AI stages a competition — take one pair'
  }
  else if (yourTurn && marker == null) { bk = 'you'; banner = 'Your turn — choose an action marker' }
  else if (yourTurn) { bk = 'you'; banner = `Select ${MARKER_META[marker!].need} card${MARKER_META[marker!].need > 1 ? 's' : ''} — ${MARKER_META[marker!].label}` }
  else { bk = 'foe'; banner = 'The AI considers its move…' }

  const youChoosing = s.pending !== null && s.pending.chooser === 0

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Hanamikoji · the geisha's favor"
        title="Hanamikoji"
        subtitle="court seven geisha with delicate gifts and bluffs — win four of them, or eleven charm"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Round {s.round} · you {youT.geisha}g/{youT.charm}c · AI {foeT.geisha}g/{foeT.charm}c</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="hk-wrap">
          {/* geisha tracks */}
          <div className="hk-tracks">
            {Array.from({ length: H.GEISHA_COUNT }, (_, gi) => {
              const g = gi as Geisha
              const myCount = s.placed[0][g]
              const foeCount = s.placed[1][g]
              const owner = s.favor[g]
              return (
                <div key={gi} className={'hk-geisha' + (owner === 0 ? ' own-you' : owner === 1 ? ' own-foe' : '')}>
                  <div className="hk-side foe">
                    {dots(foeCount, 'foe')}
                  </div>
                  <div className="hk-token">
                    <div className="hk-charm">{H.CHARM[g]}</div>
                    <div className="hk-gname">{H.GEISHA_NAMES[g]}</div>
                    <div className={'hk-favor' + (owner === 0 ? ' you' : owner === 1 ? ' foe' : '')}>
                      {owner === 0 ? 'YOU' : owner === 1 ? 'AI' : '—'}
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
            <div className="hk-hand-label">Your hand · {s.hands[0].length}</div>
            <div className="hk-hand">
              {s.hands[0].map((g, i) => {
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
              {s.hands[0].length === 0 && <div className="hk-card empty">—</div>}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel hk-markers">
            <div className="panel-l">Your action markers</div>
            {H.MARKERS.map(m => {
              const used = s.used[0][m]
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
            <div className="panel-l">AI markers</div>
            <div className="hk-aimark-row">
              {H.MARKERS.map(m => (
                <span key={m} className={'hk-pip' + (s.used[1][m] ? ' used' : '')} title={MARKER_META[m].label}>
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
              ? 'The AI revealed three cards. Choose one for your side; the AI keeps the other two.'
              : 'The AI revealed two pairs. Choose one pair for your side; the AI keeps the other.'}</p>
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

      {s.winner !== null && <ResultModal s={s} onNew={newGame} />}
      {s.winner === null && s.roundOver && <RoundModal s={s} onNext={nextRound} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

// A monotone counter that changes on every AI action / choice so useAITurn re-arms.
function aiTick(s: HanamikojiState): number {
  let placed = 0
  for (const p of [0, 1]) for (let g = 0; g < H.GEISHA_COUNT; g++) placed += s.placed[p][g]
  let used = 0
  for (const p of [0, 1]) for (const m of H.MARKERS) if (s.used[p][m]) used++
  const pend = s.pending == null ? 0 : 1
  return placed * 100 + used * 4 + pend + s.round * 10000
}

// One AI step: resolve its pending choice, else take an action.
function stepAI(s: HanamikojiState): HanamikojiState {
  if (s.pending != null && s.pending.chooser === 1) return H.aiChoose(s)
  if (s.pending == null && s.turn === 1) return H.aiAction(s)
  return s
}

function dots(n: number, cls: string) {
  const out = []
  for (let i = 0; i < n; i++) out.push(<span key={i} className={'hk-dot ' + cls} />)
  if (n === 0) out.push(<span key="e" className="hk-dot empty" />)
  return out
}

function ResultModal({ s, onNew }: { s: HanamikojiState; onNew: () => void }) {
  const won = s.winner === 0
  const y = H.tally(s.favor, 0), f = H.tally(s.favor, 1)
  return (
    <Modal
      eyebrow={won ? 'The geisha favor you' : 'The AI is favored'}
      title={won ? 'You Win' : 'AI Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="hk-final">
        <span className="you">You · {y.geisha} geisha / {y.charm} charm</span>
        <span className="foe">AI · {f.geisha} geisha / {f.charm} charm</span>
      </div>
    </Modal>
  )
}

function RoundModal({ s, onNext }: { s: HanamikojiState; onNext: () => void }) {
  const y = H.tally(s.favor, 0), f = H.tally(s.favor, 1)
  const lead: Player | null = y.geisha === f.geisha ? null : y.geisha > f.geisha ? 0 : 1
  return (
    <Modal
      eyebrow={`Round ${s.round} complete`}
      title={lead === 0 ? 'You Lead' : lead === 1 ? 'The AI Leads' : 'Even Standing'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNext}>Next round</button>}
    >
      <div className="hk-final">
        <span className="you">You · {y.geisha} geisha / {y.charm} charm</span>
        <span className="foe">AI · {f.geisha} geisha / {f.charm} charm</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Hanamikoji" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Seven geisha hold charm <b>2,2,2,3,3,4,5</b>. Each round one item card is set aside unseen, you and the AI are dealt six, and you draw one more at the start of each of your turns. Spend your <b>four action markers</b>, one each, alternating:</p>
        <p><b>Secret</b> — hide 1 card, revealed for your side at round end. <b>Trade-off</b> — discard 2 cards from the round. <b>Gift</b> — reveal 3; the opponent keeps 1, you get 2. <b>Competition</b> — reveal 2 pairs; the opponent keeps one pair, you get the other.</p>
        <p>When all markers are spent, each geisha goes to whoever placed <b>more</b> of its cards (ties keep the prior owner). Favor carries between rounds. Win when you hold <b>4 geisha</b> or <b>11 charm</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
