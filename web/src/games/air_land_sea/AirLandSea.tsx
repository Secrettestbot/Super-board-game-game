/* AIR, LAND & SEA — UI (built for this codebase). Three theaters — AIR · LAND · SEA — run across
   a campaign map. You (lower) and the enemy (upper) stack cards on your side of each theater.
   Pick a card from your hand, choose FACE-UP (into its own theater, ability fires) or FACE-DOWN
   (any theater, strength 2), then click a theater to deploy. Withdraw to concede a losing battle.
   Win two of three theaters to take the battle; first to 12 VP wins the war.

   ONLINE: seat-relative via useGameSession. "You" is always the local seat (mySeat); the other
   seat is the opponent (the AI in solo, a remote human online). Your hand, the scoreboard and the
   banners are all read from mySeat's perspective; the opponent's hand and the face-down deck never
   cross the wire (see net.ts redactFor). isMyTurn gates every action; the host owes the "next
   battle" advance between battles. Solo play (mySeat 0, opponent is the AI) is unchanged. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { airLandSeaAdapter } from './net'
import * as ALS from './logic'
import type { State, Card, Seat, Placed } from './logic'

const THEATERS = ALS.THEATERS
const THEATER_LABEL: Record<string, string> = { air: 'Air', land: 'Land', sea: 'Sea' }
const THEATER_ICON: Record<string, string> = { air: '✈', land: '⊞', sea: '⚓' }

const ABILITY_TEXT: Record<string, string> = {
  none: 'No ability.',
  reinforce: 'No special ability — plain strength.',
  maneuver: 'No special ability — plain strength.',
  support: '+3 to your strength in both adjacent theaters.',
  ambush: 'Counts double in its own theater.',
  escalation: 'Each of your face-down cards is worth +1.',
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#16242b" stroke="#2c4a57" strokeWidth="1.5" />
    <path d="M6 30 L20 22 L20 30 Z" fill="#5fa8c8" />
    <path d="M6 38 H42 V42 H6 Z" fill="#2f6f86" />
    <rect x="22" y="24" width="20" height="9" rx="1.5" fill="#7d9b54" />
    <circle cx="34" cy="12" r="4.5" fill="#d9b24a" />
    <path d="M30 16 L38 16 L36 21 L32 21 Z" fill="#c89a3a" />
  </svg>
)

export function AirLandSea() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(airLandSeaAdapter)
  const me = mySeat as Seat
  const foe: Seat = me === 0 ? 1 : 0
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)          // selected card id
  const [faceDown, setFaceDown] = useState(false)               // pending placement mode

  function newGame() { netNew(); setSel(null); setFaceDown(false); setShowRules(false) }
  function next() { dispatch({ kind: 'next' }); setSel(null); setFaceDown(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setSel(null); setShowRules(false) },
    extra: (e) => {
      if (e.key === 'f' || e.key === 'F') { setFaceDown(v => !v); return true }
      return false
    },
  })

  const yourTurn = s.winner == null && s.phase === 'battle' && isMyTurn
  const myHand = s.hands[me]
  const selCard: Card | null = sel != null ? myHand.find(c => c.id === sel) ?? null : null
  const oppLabel = net.online ? 'Opponent' : 'Enemy'

  // Which theaters can the selected card legally deploy to in the current mode?
  function legalForSel(): number[] {
    if (!yourTurn || selCard == null) return []
    if (faceDown) return [0, 1, 2]
    return [THEATERS.indexOf(selCard.theater)] // face-up only into its own theater
  }
  const legalTheaters = legalForSel()

  function pick(id: number) {
    if (!yourTurn) return
    setSel(prev => (prev === id ? null : id))
  }
  function deploy(theaterIndex: number) {
    if (!yourTurn || selCard == null) return
    if (!legalTheaters.includes(theaterIndex)) return
    dispatch({ kind: 'deploy', cardId: selCard.id, theater: theaterIndex, faceDown })
    setSel(null)
    setFaceDown(false)
  }
  function doWithdraw() {
    if (yourTurn) { dispatch({ kind: 'withdraw' }); setSel(null); setFaceDown(false) }
  }

  // Who would win ties at THIS instant (live preview): the seat NOT to move defends.
  const defender: Seat = s.turn === 0 ? 1 : 0

  const r = s.battleResult
  const youWonBattle = r?.winner === me

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You reached 12 VP — the war is won!' }
  else if (s.winner === foe) { bk = 'lose'; banner = `${oppLabel} reached 12 VP — you lose the war` }
  else if (s.phase === 'battleOver') {
    bk = youWonBattle ? 'win' : 'lose'
    banner = youWonBattle
      ? `You won the battle (+${r?.vpAwarded} VP). Begin the next battle.`
      : `${oppLabel} won the battle (+${r?.vpAwarded} VP). Begin the next battle.`
  }
  else if (yourTurn) {
    bk = 'you'
    banner = selCard == null
      ? 'Your turn — choose a card from your hand'
      : faceDown
        ? 'Face-down · click any theater to deploy (strength 2)'
        : `Face-up · deploy ${selCard.name} ${selCard.value} to ${THEATER_LABEL[selCard.theater]}`
  }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is deploying…` : 'The enemy is deploying…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Air · Land · Sea"
        title="Air, Land & Sea"
        subtitle="deploy across three theaters of war — control two of three to take the battle; first to 12 victory points wins"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Battle ${s.battleNo} · VP ${s.vp[me]}–${s.vp[foe]}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>F · flip &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="als-field">
          <div className="als-row">
            {THEATERS.map((theater, ti) => (
              <TheaterColumn
                key={theater}
                theater={theater}
                index={ti}
                youStack={s.theaters[ti][me]}
                foeStack={s.theaters[ti][foe]}
                strYou={ALS.theaterStrength(s, me, ti)}
                strFoe={ALS.theaterStrength(s, foe, ti)}
                youControl={ALS.theaterControl(s, ti, defender) === me}
                oppLabel={oppLabel}
                live={legalTheaters.includes(ti)}
                onDeploy={() => deploy(ti)}
              />
            ))}
          </div>

          {/* placement mode toggle */}
          <div className="als-mode">
            <button
              className={'als-flip' + (faceDown ? '' : ' on')}
              disabled={!yourTurn}
              onClick={() => setFaceDown(false)}
            >Face-up · ability</button>
            <button
              className={'als-flip' + (faceDown ? ' on' : '')}
              disabled={!yourTurn}
              onClick={() => setFaceDown(true)}
            >Face-down · strength 2</button>
            <button className="als-withdraw" disabled={!yourTurn} onClick={doWithdraw}>Withdraw</button>
          </div>

          {/* your hand */}
          <div className="als-hand">
            {myHand
              .slice()
              .sort((a, b) => THEATERS.indexOf(a.theater) - THEATERS.indexOf(b.theater) || a.value - b.value)
              .map(c => (
                <button
                  key={c.id}
                  className={'als-card t-' + c.theater + (sel === c.id ? ' sel' : '')}
                  onClick={() => pick(c.id)}
                  disabled={!yourTurn}
                  title={`${c.name} ${c.value} (${THEATER_LABEL[c.theater]}) — ${ABILITY_TEXT[c.ability]}`}
                >
                  <span className="als-c-top">
                    <span className="als-c-val">{c.value}</span>
                    <span className="als-c-icon">{THEATER_ICON[c.theater]}</span>
                  </span>
                  <span className="als-c-name">{c.name}</span>
                  <span className="als-c-ability">{ABILITY_TEXT[c.ability]}</span>
                </button>
              ))}
            {myHand.length === 0 && <div className="als-empty">No cards in hand.</div>}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel als-scoreboard">
            <ScoreRow name="You" vp={s.vp[me]} on={s.turn === me && s.winner == null && s.phase === 'battle'} you />
            <ScoreRow name={oppLabel} vp={s.vp[foe]} on={s.turn === foe && s.winner == null && s.phase === 'battle'} />
            <div className="als-vpline"><span>Target</span><span>{ALS.WIN_VP} VP</span></div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.phase === 'battleOver' && s.winner == null && (
        isMyTurn
          ? <BattleModal s={s} me={me} oppLabel={oppLabel} onNext={next} onNew={newGame} />
          : <WaitModal oppLabel={oppLabel} />
      )}
      {s.winner != null && <ResultModal s={s} me={me} foe={foe} won={s.winner === me} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlacedCard({ p, theaterIndex }: { p: Placed; theaterIndex: number }) {
  if (p.faceDown) {
    return (
      <div className="als-placed facedown" title="Face-down · strength 2">
        <span className="als-fd-mark">★</span>
        <span className="als-fd-val">2</span>
      </div>
    )
  }
  const c = p.card
  const ambush = c.ability === 'ambush' && THEATERS.indexOf(c.theater) === theaterIndex
  return (
    <div className={'als-placed t-' + c.theater} title={`${c.name} ${c.value}`}>
      <span className="als-p-val">{ambush ? c.value * 2 : c.value}</span>
      <span className="als-p-name">{c.name}</span>
    </div>
  )
}

function Stack({ cards, theaterIndex, foe }: { cards: Placed[]; theaterIndex: number; foe?: boolean }) {
  return (
    <div className={'als-stack' + (foe ? ' foe' : '')}>
      {cards.length === 0
        ? <div className="als-stack-empty" />
        : cards.map((p, i) => <PlacedCard key={i} p={p} theaterIndex={theaterIndex} />)}
    </div>
  )
}

function TheaterColumn({ theater, index, youStack, foeStack, strYou, strFoe, youControl, oppLabel, live, onDeploy }: {
  theater: string; index: number; youStack: Placed[]; foeStack: Placed[]; strYou: number; strFoe: number
  youControl: boolean; oppLabel: string; live: boolean; onDeploy: () => void
}) {
  let cls = 'als-theater t-' + theater
  if (live) cls += ' live'
  cls += youControl ? ' ctrl-you' : ' ctrl-foe'
  return (
    <div className={cls} onClick={live ? onDeploy : undefined}>
      <div className="als-th-foe-str">
        <span className={'als-str' + (!youControl ? ' lead' : '')}>{strFoe}</span>
      </div>
      <Stack cards={foeStack} theaterIndex={index} foe />

      <div className="als-th-head">
        <span className="als-th-icon">{THEATER_ICON[theater]}</span>
        <span className="als-th-name">{THEATER_LABEL[theater]}</span>
        <span className={'als-th-flag ' + (youControl ? 'you' : 'foe')}>{youControl ? 'You' : oppLabel}</span>
      </div>

      <Stack cards={youStack} theaterIndex={index} />
      <div className="als-th-you-str">
        <span className={'als-str' + (youControl ? ' lead' : '')}>{strYou}</span>
      </div>
    </div>
  )
}

function ScoreRow({ name, vp, on, you }: { name: string; vp: number; on: boolean; you?: boolean }) {
  return (
    <div className={'als-sc' + (on ? ' on' : '') + (you ? ' you' : ' foe')}>
      <span className="als-sc-name">{name}</span>
      <span className="als-sc-vp">
        <span className="als-sc-n">{vp}</span>
        <span className="als-sc-l">VP</span>
      </span>
    </div>
  )
}

function BattleModal({ s, me, oppLabel, onNext, onNew }: { s: State; me: Seat; oppLabel: string; onNext: () => void; onNew: () => void }) {
  const r = s.battleResult!
  const foe: Seat = me === 0 ? 1 : 0
  const youWon = r.winner === me
  return (
    <Modal
      eyebrow={r.byWithdrawal ? 'Withdrawal' : 'Battle resolved'}
      title={youWon ? 'You won the battle' : `${oppLabel} won the battle`}
      closeOnOverlay={false}
      actions={<>
        <button className="btn-modal ghost" onClick={onNew}>New war</button>
        <button className="btn-modal" onClick={onNext}>Next battle</button>
      </>}
    >
      <div className="modal-body">
        <div className="als-result-row">
          {THEATERS.map((t, i) => (
            <div key={t} className={'als-res-th ' + (r.control[i] === me ? 'you' : 'foe')}>
              <span>{THEATER_LABEL[t]}</span>
              <b>{r.control[i] === me ? 'You' : oppLabel}</b>
            </div>
          ))}
        </div>
        <p className="als-res-line">
          Strength <b className="you">{r.strength[me]}</b> – <b className="foe">{r.strength[foe]}</b>.
          {' '}{youWon ? 'You' : oppLabel} gained <b>+{r.vpAwarded} VP</b>
          {r.byWithdrawal ? ' by withdrawal' : ''}. Score now <b>{s.vp[me]}–{s.vp[foe]}</b>.
        </p>
      </div>
    </Modal>
  )
}

function WaitModal({ oppLabel }: { oppLabel: string }) {
  return (
    <Modal eyebrow="Battle resolved" title="Standby" closeOnOverlay={false} actions={null}>
      <div className="modal-body"><p>Waiting for {oppLabel.toLowerCase()} (host) to begin the next battle…</p></div>
    </Modal>
  )
}

function ResultModal({ s, me, foe, won, oppLabel, onNew }: { s: State; me: Seat; foe: Seat; won: boolean; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'The war is won' : 'The war is lost'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>New war</button>}
    >
      <div className="als-final"><span className="you">You {s.vp[me]}</span><span className="foe">{oppLabel} {s.vp[foe]}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Air, Land & Sea" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>To arms</button>}>
      <div className="modal-body">
        <p>Three <b>theaters</b> — Air · Land · Sea — stand between the two commands. Each battle you're dealt 6 cards. On your turn you <b>must</b> do one of:</p>
        <p>· Play a card <b>face-up</b> into its <b>own</b> theater, triggering its ability.<br />
           · Play a card <b>face-down</b> into <b>any</b> theater as a generic <b>strength-2</b> card (no ability).<br />
           · <b>Withdraw</b> — concede the battle (the later you withdraw, the more VP the enemy takes: 2 / 3 / 4).</p>
        <p><b>Abilities:</b> <b>Support</b> (+3 to both adjacent theaters) · <b>Ambush</b> (counts double in its theater) · <b>Escalation</b> (each of your face-down cards +1). Other cards are plain strength.</p>
        <p>When both hands empty (or someone withdraws), you <b>control</b> a theater if your strength there is strictly higher — <b>ties go to the defender</b> (the player who didn't end the battle). <b>Control two of three</b> to win the battle (+6 VP when fought out).</p>
        <p>First to <b>12 VP</b> across battles wins the war.</p>
        <p><b>Keys:</b> <kbd>F</kbd> flip face-up/down · <kbd>N</kbd> new war · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
