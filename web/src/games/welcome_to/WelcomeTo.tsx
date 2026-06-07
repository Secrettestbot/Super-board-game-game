/* WELCOME TO... — UI (built for this codebase). Flip-and-write neighborhood building on the
   framework shell, vs a greedy AI that fills its own sheet. Each round flips three number+effect
   pairs; you pick a pair, then choose an empty lot on one of your three streets (strictly
   ascending). The AI takes many turns over a game, so its driver re-arms on s.step. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { welcomeToAdapter } from './net'
import * as W from './logic'
import type { EffectKind, Placement, Sheet } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#3a6ea5" stroke="#5b8bc4" strokeWidth="1.5" />
    <path d="M9 28 L17 20 L25 28 Z" fill="#ff8fa3" />
    <rect x="11" y="28" width="12" height="9" fill="#ffd6a5" />
    <path d="M23 26 L31 18 L39 26 Z" fill="#7ad7c4" />
    <rect x="25" y="26" width="12" height="11" fill="#fff3c4" />
    <circle cx="38" cy="11" r="3.4" fill="#ffe17a" stroke="#d8a40f" strokeWidth="1" />
  </svg>
)

const EFFECT_LABEL: Record<EffectKind, string> = {
  fence: 'Fence', pool: 'Pool', park: 'Park', bis: 'Bis', temp: 'Temp', estate: 'Estate',
}
const EFFECT_ICON: Record<EffectKind, string> = {
  fence: '▥', pool: '≈', park: '🌳', bis: '⧉', temp: '±', estate: '$',
}
const EFFECT_HINT: Record<EffectKind, string> = {
  fence: 'splits estates (fence to the right of the lot)',
  pool: 'fills a pool if the lot has a slot (+3)',
  park: 'advances the park track on that street',
  bis: 'write a duplicate of a neighbor (−3 penalty)',
  temp: 'adjust the number by ±1 or ±2',
  estate: 'raises the estate-value bonus',
}

export function WelcomeTo() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(welcomeToAdapter)
  const foeSeat = mySeat === 0 ? 1 : 0
  const [showRules, setShowRules] = useState(false)
  const [pickedPair, setPickedPair] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    netNew(); setShowRules(false); setPickedPair(null)
  }

  // The AI driver lives in useGameSession (re-armed by adapter.tickKey on every action).
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])
  // Drop a stale pair selection whenever a new round flips.
  useEffect(() => { setPickedPair(null) }, [s.step])

  const yourTurn = s.winner == null && isMyTurn
  const youSheet = s.sheets[mySeat]
  const aiSheet = s.sheets[foeSeat]

  // Auto-refuse if it's your turn and you literally can't place anything.
  useEffect(() => {
    if (yourTurn && !s.picked[mySeat] && !W.canPlaceAny(youSheet, s.flips)) {
      const id = setTimeout(() => dispatch({ kind: 'refuse' }), 700)
      return () => clearTimeout(id)
    }
  }, [yourTurn, s.picked, mySeat, youSheet, s.flips, dispatch])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setPickedPair(null) },
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        const i = Number(e.key) - 1
        if (i < s.flips.length) { setPickedPair(i); return true }
      }
      if (e.key === 'Escape') { setPickedPair(null); return true }
      return false
    },
  })

  // Legal placements for the currently-picked pair (highlighted lots).
  const activePair = pickedPair != null ? s.flips[pickedPair] : null
  const legal: Placement[] = activePair
    ? W.legalPlacements(youSheet, activePair.number, activePair.effect)
    : []
  const legalKey = (si: number, li: number) => si * 100 + li
  const legalSet = new Set(legal.map(p => legalKey(p.streetIndex, p.lotIndex)))

  function lotMap(si: number, li: number): Placement | undefined {
    return legal.find(p => p.streetIndex === si && p.lotIndex === li)
  }

  function clickLot(si: number, li: number) {
    if (!yourTurn || pickedPair == null) return
    const pl = lotMap(si, li)
    if (pl == null) return
    dispatch({ kind: 'pick', pairIndex: pickedPair, streetIndex: si, lotIndex: li, number: pl.number, fenceSide: 'right' })
    setPickedPair(null)
  }

  const foeName = net.online ? `Player ${foeSeat + 1}` : 'Rival'
  const youScore = s.scores[mySeat]
  const foeScore = s.scores[foeSeat]

  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = `You win — ${youScore} to ${foeScore}!` }
  else if (s.winner === foeSeat) { bk = 'lose'; banner = `${foeName} wins — ${foeScore} to ${youScore}` }
  else if (s.winner === 'draw') { bk = ''; banner = `Tied ${youScore}–${foeScore}` }
  else if (yourTurn) {
    bk = 'you'
    banner = !W.canPlaceAny(youSheet, s.flips)
      ? 'No legal build — permit refused…'
      : pickedPair == null ? 'Pick a number+effect pair' : 'Click a glowing lot to build'
  } else { bk = 'foe'; banner = net.online ? `${foeName} is planning their block…` : 'The rival is planning their block…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Welcome To… · flip and write"
        title="Welcome To…"
        subtitle="build three streets of an ascending postwar suburb — pair a number with an effect, complete estates, fill pools, and edge out the rival"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${youScore} · ${foeName} ${foeScore}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>1·2·3 pick &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="wt-main">
          {/* Your sheet */}
          <div className={'wt-sheet' + (yourTurn ? ' active' : '')}>
            <div className="wt-sheet-head">
              <span className="wt-pin you" />
              <span className="wt-sheet-name">Your neighborhood</span>
              <span className="wt-sheet-score">{youScore}</span>
            </div>
            {youSheet.streets.map((st, si) => (
              <div className="wt-street" key={si}>
                <div className="wt-street-tag">St {si + 1}</div>
                <div className="wt-lots">
                  {st.values.map((v, li) => {
                    const pl = lotMap(si, li)
                    const isLegal = legalSet.has(legalKey(si, li))
                    return (
                      <div
                        key={li}
                        className={
                          'wt-lot' +
                          (v != null ? ' filled' : '') +
                          (st.pools[li] ? ' pooled' : '') +
                          (st.poolFilled[li] ? ' pool-on' : '') +
                          (st.fencesRight[li] ? ' fence-r' : '') +
                          (isLegal ? ' legal' : '')
                        }
                        onClick={() => clickLot(si, li)}
                        title={st.pools[li] ? 'has a pool slot' : undefined}
                      >
                        <span className="wt-num">{v != null ? v : pl ? pl.number : ''}</span>
                        {st.pools[li] && <span className="wt-pool" />}
                      </div>
                    )
                  })}
                </div>
                <div className="wt-park" title="park track">🌳{st.park}</div>
              </div>
            ))}
            <div className="wt-tracks">
              <span className="wt-chip">Estate ${W.ESTATE_TRACK[youSheet.estate]}</span>
              <span className="wt-chip warn">Bis {youSheet.bis}</span>
              <span className="wt-chip warn">Refusals {youSheet.refusals}/3</span>
            </div>
          </div>

          {/* Center column: pairs + plans + opponent */}
          <div className="wt-side">
            <div className="panel wt-pairs">
              <div className="wt-pl">this round — choose one pair</div>
              <div className="wt-pair-row">
                {s.flips.map((pair, i) => {
                  const placeable = W.legalPlacements(youSheet, pair.number, pair.effect).length > 0
                  return (
                    <button
                      key={i}
                      className={
                        'wt-pair' +
                        (pickedPair === i ? ' sel' : '') +
                        (!placeable ? ' dead' : '')
                      }
                      disabled={!yourTurn || !placeable}
                      onClick={() => setPickedPair(i)}
                    >
                      <span className="wt-pair-num">{pair.number}</span>
                      <span className={'wt-pair-eff e-' + pair.effect}>
                        {EFFECT_ICON[pair.effect]} {EFFECT_LABEL[pair.effect]}
                      </span>
                    </button>
                  )
                })}
              </div>
              {activePair && (
                <div className="wt-eff-hint">{EFFECT_HINT[activePair.effect]}</div>
              )}
              {yourTurn && pickedPair == null && (
                <div className="wt-eff-hint dim">Pick a pair (or press 1/2/3), then click a glowing lot.</div>
              )}
            </div>

            <div className="panel wt-plans">
              <div className="wt-pl">city plans</div>
              {s.plans.map(p => {
                const owner = p.done[mySeat] ? 'you' : p.done[foeSeat] ? 'foe' : ''
                return (
                  <div key={p.id} className={'wt-plan' + (owner ? ' claimed ' + owner : '')}>
                    <span className="wt-plan-label">{p.label}</span>
                    <span className="wt-plan-bonus">+{p.bonus}</span>
                    <span className="wt-plan-tag">{owner === 'you' ? 'You' : owner === 'foe' ? foeName : 'open'}</span>
                  </div>
                )
              })}
            </div>

            <OppSummary name={foeName} sheet={aiSheet} score={foeScore} active={s.turn === foeSeat && !s.picked[foeSeat] && s.winner == null} />

            <OnlineBar net={net} />

            <div className="panel logbox wt-log" ref={logRef}>
              {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && (
        <ResultModal
          won={s.winner === mySeat}
          draw={s.winner === 'draw'}
          foeName={foeName}
          youScore={youScore}
          foeScore={foeScore}
          onNew={newGame}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function OppSummary({ name, sheet, score, active }: { name: string; sheet: Sheet; score: number; active: boolean }) {
  return (
    <div className={'panel wt-opp' + (active ? ' active' : '')}>
      <div className="wt-opp-head">
        <span className="wt-pin foe" />
        <span className="wt-sheet-name">{name}</span>
        <span className="wt-sheet-score">{score}</span>
      </div>
      <div className="wt-opp-streets">
        {sheet.streets.map((st, si) => {
          const filled = st.values.filter(v => v != null).length
          return (
            <div key={si} className="wt-opp-row">
              <span className="wt-opp-tag">St {si + 1}</span>
              <span className="wt-opp-bar">
                <span className="wt-opp-fill" style={{ width: `${(filled / st.values.length) * 100}%` }} />
              </span>
              <span className="wt-opp-frac">{filled}/{st.values.length}</span>
            </div>
          )
        })}
      </div>
      <div className="wt-tracks small">
        <span className="wt-chip">Estate ${W.ESTATE_TRACK[sheet.estate]}</span>
        <span className="wt-chip warn">Refusals {sheet.refusals}/3</span>
      </div>
    </div>
  )
}

function ResultModal({ won, draw, foeName, youScore, foeScore, onNew }: { won: boolean; draw: boolean; foeName: string; youScore: number; foeScore: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'A tied block' : won ? 'Best neighborhood on the block' : `${foeName} built better`}
      title={draw ? 'Tie Game' : won ? 'You Win' : `${foeName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {youScore}</span>
        <span className="vs">·</span>
        <span className="foe">{foeName} {foeScore}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Welcome To…" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Build out</button>}>
      <div className="modal-body">
        <p>You and the rival each build your own three <b>streets</b> of houses (10, 11 and 12 lots). Every round flips three <b>number + effect</b> pairs.</p>
        <p>Choose one pair, then write its number into an empty lot. Within a street, numbers must rise <b>strictly left to right</b>. The paired effect resolves where you build:</p>
        <p>
          <b>{EFFECT_ICON.fence} Fence</b> splits estates · <b>{EFFECT_ICON.pool} Pool</b> fills a pool slot (+3) ·
          <b> {EFFECT_ICON.park} Park</b> advances that street's park track · <b>{EFFECT_ICON.bis} Bis</b> writes a duplicate of a neighbor (−3) ·
          <b> {EFFECT_ICON.temp} Temp</b> shifts the number ±1/2 · <b>{EFFECT_ICON.estate} Estate</b> raises estate value.
        </p>
        <p><b>Estates</b> are runs of houses between fences (or street edges) and score by size. <b>City plans</b> grant a bonus to whoever completes them first.</p>
        <p>Can't legally build any flipped number? You take a <b>permit refusal</b>. The game ends on a full neighborhood, all city plans claimed, or 3 refusals — highest score wins.</p>
        <p><b>Keys:</b> <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> pick a pair · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
