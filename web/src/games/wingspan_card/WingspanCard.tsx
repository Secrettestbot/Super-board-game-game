/* WINGSPAN (card engine) — UI. Build an aviary across three habitat rows by taking ONE
   action per cube: play a bird, gain food, lay eggs, or draw cards — each scaling with the
   birds already in its row.

   Online-capable via useGameSession(wingspanCardAdapter): the hook drives the AI for any
   empty seat (no local useAITurn) and, when online, redacts the opponent's private hand and
   the face-down deck so they never reach you. Everything below is rendered relative to
   mySeat — your board, hand, food, eggs, score and the result banner are always "yours",
   and the other seat is the rival/opponent. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { wingspanCardAdapter } from './net'
import * as WS from './logic'
import type { Player, Habitat, BirdDef, PlacedBird } from './logic'

const { BIRD, HABITATS, ROW_SIZE } = WS

const HAB_LABEL: Record<Habitat, { name: string; act: string }> = {
  forest:    { name: 'Forest',    act: 'gain food' },
  grassland: { name: 'Grassland', act: 'lay eggs' },
  wetland:   { name: 'Wetland',   act: 'draw cards' },
}

const POWER_TEXT: Record<string, string> = {
  food: 'When activated: +1 food',
  egg:  'When activated: +1 egg here',
  draw: 'When activated: +1 card',
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="11" fill="#324438" stroke="#e7b24a" strokeWidth="1.5" />
    <path d="M12 31 q6 -13 16 -13 q-2 6 -8 9 q7 -2 11 -8 q-1 9 -10 12 q5 0 9 -3 q-4 8 -14 8 q-7 0 -4 -5 Z" fill="#aee3b6" />
    <circle cx="30" cy="17" r="1.8" fill="#1c2922" />
    <path d="M33 16 l5 -2 l-4 4 Z" fill="#e7b24a" />
  </svg>
)

export function WingspanCard() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(wingspanCardAdapter)
  const oppSeat = 1 - mySeat // 2-player game: the other aviary
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  const you = s.players[mySeat]
  const foe = s.players[oppSeat]
  const yourTurn = s.winner == null && isMyTurn && you.cubesLeft > 0
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  function canPlay(id: string): boolean {
    if (!yourTurn) return false
    const def = BIRD[id]
    if (!def) return false
    if (WS.rowCount(you, def.habitat) >= ROW_SIZE) return false
    if (you.food < def.cost) return false
    if (WS.totalEggs(you) < WS.eggCost(you, def.habitat)) return false
    return true
  }

  function play(id: string) {
    if (!yourTurn) return
    const def = BIRD[id]
    if (!def) return
    dispatch({ kind: 'play', cardId: id, habitat: def.habitat })
  }
  function doAction(h: Habitat) {
    if (!yourTurn) return
    if (h === 'forest') dispatch({ kind: 'food' })
    else if (h === 'grassland') dispatch({ kind: 'eggs' })
    else dispatch({ kind: 'draw' })
  }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === 'f' || e.key === 'F') { doAction('forest'); return true }
      if (e.key === 'e' || e.key === 'E') { doAction('grassland'); return true }
      if (e.key === 'd' || e.key === 'D') { doAction('wetland'); return true }
      return false
    },
  })

  const scMine = WS.scorePlayer(s, mySeat)
  const scOpp = WS.scorePlayer(s, oppSeat)

  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = `You built the finer aviary — ${scMine} to ${scOpp}!` }
  else if (s.winner === oppSeat) { bk = 'lose'; banner = `${oppLabel}'s aviary scored higher — ${scOpp} to ${scMine}.` }
  else if (s.winner === -1) { bk = ''; banner = `A tie — ${scMine} apiece. A draw of feathers.` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — play a bird, or take a habitat action' }
  else { bk = 'foe'; banner = net.online ? `Waiting for the ${oppLabel.toLowerCase()}…` : `The ${oppLabel} is taking their turn…` }

  const turnsTaken = (WS.TURNS_EACH - you.cubesLeft) + (WS.TURNS_EACH - foe.cubesLeft)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Wingspan · engine-building"
        title="Wingspan"
        subtitle="play birds across forest, grassland & wetland — run the food→eggs→cards engine to out-score the rival"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Turns &nbsp;{turnsTaken}/{2 * WS.TURNS_EACH}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>F · food &nbsp; E · eggs &nbsp; D · draw &nbsp; N · new</>}
      >
        <div className="ws-main">
          <div className="ws-resbar">
            <div className="ws-stat"><span className="ws-stat-v">{you.food}</span><span className="ws-stat-l">🌰 food</span></div>
            <div className="ws-stat"><span className="ws-stat-v">{WS.totalEggs(you)}</span><span className="ws-stat-l">🥚 eggs</span></div>
            <div className="ws-stat"><span className="ws-stat-v">{scMine}</span><span className="ws-stat-l">points</span></div>
            <div className="ws-cubes" title={`${you.cubesLeft} action cubes left`}>
              {Array.from({ length: WS.TURNS_EACH }).map((_, i) => (
                <div key={i} className={'ws-cube' + (i >= you.cubesLeft ? ' spent' : '')} />
              ))}
            </div>
          </div>

          <div className="ws-board">
            {HABITATS.map(h => {
              const row = you.rows[h]
              const gain = WS.produce(you, h)
              const actDisabled = !yourTurn
              return (
                <div key={h} className={'ws-habitat ' + h}>
                  <div className="ws-h-head">
                    <span className="ws-h-name">{HAB_LABEL[h].name}</span>
                    <span className="ws-h-act">{HAB_LABEL[h].act}</span>
                    <span className="ws-h-gain">+{gain}</span>
                    <button className="ws-h-btn" disabled={actDisabled} onClick={() => doAction(h)}>
                      {HAB_LABEL[h].act}
                    </button>
                  </div>
                  <div className="ws-row">
                    {Array.from({ length: ROW_SIZE }).map((_, i) => {
                      const b = row[i] as PlacedBird | undefined
                      return <BirdSlot key={i} idx={i} bird={b} />
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div>
            <div className="ws-hand-l">Your hand — click a bird to play it into its habitat</div>
            <div className="ws-hand">
              {you.hand.length === 0 && <span className="ws-hand-empty">No cards — draw in the wetland.</span>}
              {you.hand.map((id, i) => {
                const def = BIRD[id]
                if (!def) return null
                const playable = canPlay(id)
                return <HandCard key={id + i} def={def} playable={playable} onClick={() => playable && play(id)} />
              })}
            </div>
          </div>

          <div className="panel" style={{ background: 'transparent', border: 'none', padding: 0 }}>
            <div className="ws-hand-l">Card tray — drawing in the wetland takes from here first</div>
            <div className="ws-tray">
              {s.tray.length === 0 && <span className="ws-hand-empty">Tray empty.</span>}
              {s.tray.map((id, i) => {
                const def = BIRD[id]
                if (!def) return null
                return (
                  <div key={id + i} className={'ws-tray-card ' + def.habitat} title={`${def.name} · ${def.habitat}`}>
                    <span className="ws-tray-glyph">{def.short}</span>
                    <span className="ws-tray-name">{def.name}</span>
                    <span className="ws-tray-pts">{def.points}pt</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="ws-scorebox">
            <div className="ws-sc you"><div className="ws-sc-v">{scMine}</div><div className="ws-sc-l">You</div></div>
            <div className="ws-sc foe"><div className="ws-sc-v">{scOpp}</div><div className="ws-sc-l">{oppLabel}</div></div>
          </div>

          <FoePanel p={foe} label={oppLabel} active={s.winner == null && !isMyTurn} score={scOpp} />

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={s.winner === mySeat} tie={s.winner === -1} mine={scMine} opp={scOpp} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function BirdSlot({ idx, bird }: { idx: number; bird: PlacedBird | undefined }) {
  if (!bird) {
    return (
      <div className="ws-slot">
        <span className="ws-slot-idx">{idx + 1}</span>
        <span className="ws-slot-empty">empty</span>
      </div>
    )
  }
  const def = BIRD[bird.defId]
  return (
    <div className="ws-slot filled">
      <span className="ws-slot-idx">{idx + 1}</span>
      <span className="ws-bird-glyph">{def.short}</span>
      <span className="ws-bird-name">{def.name}</span>
      <span className="ws-bird-stats">
        <span className="ws-bird-pts">{def.points}</span>
        {bird.eggs > 0 && <span className="ws-bird-eggs">{bird.eggs}/{def.capacity}</span>}
        {def.power && <span className="ws-bird-pw" title={POWER_TEXT[def.power]}>{def.power === 'food' ? '🌰' : def.power === 'egg' ? '🥚' : '🃏'}</span>}
      </span>
    </div>
  )
}

function HandCard({ def, playable, onClick }: { def: BirdDef; playable: boolean; onClick: () => void }) {
  return (
    <button
      className={`ws-card ${def.habitat} ${playable ? 'playable' : 'locked'}`}
      onClick={onClick}
      disabled={!playable}
      title={def.power ? POWER_TEXT[def.power] : 'No special power'}
    >
      <div className="ws-card-top">
        <span className="ws-card-glyph">{def.short}</span>
        <span className="ws-card-name">{def.name}</span>
        <span className="ws-card-hab">{def.habitat.slice(0, 4)}</span>
      </div>
      <div className="ws-card-stats">
        <span className="ws-card-cost">{def.cost}</span>
        <span className="ws-card-pts">{def.points}</span>
        <span className="ws-card-cap">{def.capacity}</span>
      </div>
      <div className="ws-card-pw">{def.power ? POWER_TEXT[def.power] : ' '}</div>
    </button>
  )
}

function FoePanel({ p, label, active, score }: { p: Player; label: string; active: boolean; score: number }) {
  return (
    <div className={'ws-foe' + (active ? ' active' : '')}>
      <div className="ws-foe-head">
        <span className="ws-foe-name">{label}</span>
        <span className="ws-foe-score">{score} pts</span>
      </div>
      <div className="ws-foe-res">
        <span>🌰 <b>{p.food}</b> food</span>
        <span>🥚 <b>{WS.totalEggs(p)}</b> eggs</span>
        <span>🃏 <b>{p.hand.length}</b> cards</span>
        <span>cubes <b>{p.cubesLeft}</b></span>
      </div>
      <div className="ws-foe-rows">
        {HABITATS.map(h => {
          const row = p.rows[h]
          return (
            <div key={h} className="ws-foe-rowline">
              <span className="ws-foe-rowtag">{h[0].toUpperCase()}</span>
              {row.length === 0
                ? <span className="ws-foe-empty">—</span>
                : row.map((b, i) => (
                    <span key={i} className={'ws-foe-chip ' + h} title={BIRD[b.defId].name}>
                      {BIRD[b.defId].short}{b.eggs > 0 && <small>{b.eggs}</small>}
                    </span>
                  ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResultModal({ won, tie, mine, opp, oppLabel, onNew }: { won: boolean; tie: boolean; mine: number; opp: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={tie ? 'Even flight' : won ? 'Best in show' : 'Out-classed'}
      title={tie ? 'A Tie' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{tie
          ? 'Both aviaries scored exactly the same — a rare and beautiful equilibrium.'
          : won
            ? 'Your engine hummed: food fed your birds, your birds laid eggs, and your aviary out-scored the rival. A naturalist triumph!'
            : `The ${oppLabel.toLowerCase()} ran a tighter engine this time. Play more high-value birds and keep those eggs flowing.`}</p>
      </div>
      <div className="finalsc">
        <span className="you">You {mine}</span>
        <span className="foe">{oppLabel} {opp}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Wingspan" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Take flight!</button>}>
      <div className="modal-body">
        <p>You start with <b>4 bird cards</b>, <b>2 food</b>, and <b>8 action cubes</b>. Each turn you spend one cube on <b>one</b> of four actions:</p>
        <p><b style={{ color: 'var(--forest-hi)' }}>Play a bird</b> — click a card in your hand to place it in the leftmost open slot of its habitat, paying its <b>🌰 food cost</b> (plus an <b>egg tax</b> once a row gets crowded).</p>
        <p><b style={{ color: 'var(--forest-hi)' }}>Forest · gain food</b>, <b style={{ color: 'var(--grass-hi)' }}>Grassland · lay eggs</b>, <b style={{ color: 'var(--water-hi)' }}>Wetland · draw cards</b> — each yields <b>1 + the birds already in that row</b> (the engine!) and then triggers that row's bird powers left-to-right.</p>
        <p>Each bird shows <b>🌰 cost · points · 🥚 egg capacity</b> and maybe a power: <b>🌰</b> +food, <b>🥚</b> +egg, <b>🃏</b> +card when its habitat action fires.</p>
        <p><b>Scoring:</b> bird points + eggs sitting on birds + 1 pt per 3 leftover food. After both players spend all 8 cubes, the higher score wins.</p>
        <p><b>Keys:</b> <kbd>F</kbd> food · <kbd>E</kbd> eggs · <kbd>D</kbd> draw · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
