/* WINGSPAN (card engine) — UI. You (player 0) vs a greedy AI (1). Build an aviary
   across three habitat rows by taking ONE action per cube: play a bird, gain food,
   lay eggs, or draw cards — each scaling with the birds already in its row. The AI
   takes ONE action per turn; useAITurn re-arms on a tick that changes every AI move. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as WS from './logic'
import type { State, Player, Habitat, BirdDef, PlacedBird } from './logic'

const { BIRD, HABITATS, ROW_SIZE, makeGame } = WS

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
  const [s, setS] = useState<State>(() => makeGame())
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(makeGame()); setShowRules(false) }

  const you = s.players[0]
  const yourTurn = s.winner == null && s.turn === 0 && you.cubesLeft > 0

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
    setS(p => {
      if (p.turn !== 0 || p.winner != null) return p
      const def = BIRD[id]
      if (!def) return p
      return WS.playBird(p, 0, id, def.habitat)
    })
  }
  function doAction(h: Habitat) {
    setS(p => {
      if (p.turn !== 0 || p.winner != null || p.players[0].cubesLeft <= 0) return p
      if (h === 'forest') return WS.gainFood(p, 0)
      if (h === 'grassland') return WS.layEggs(p, 0)
      return WS.drawCards(p, 0)
    })
  }

  // AI driver: tick changes on every AI mutation so single-action turns don't stall.
  const aiActive = s.winner == null && s.turn === 1 && s.players[1].cubesLeft > 0
  const tick = `${s.turn}-${s.players.map(p => p.cubesLeft).join('.')}-${s.players.map(p => p.food).join('.')}-${s.log.length}`
  useAITurn(aiActive, () => setS(p => (p.turn === 1 && p.winner == null ? WS.aiTurn(p) : p)), { delayMs: 620, tick })

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

  const liveScores = [WS.scorePlayer(s, 0), WS.scorePlayer(s, 1)]

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = `You built the finer aviary — ${liveScores[0]} to ${liveScores[1]}!` }
  else if (s.winner === 1) { bk = 'lose'; banner = `The Rival's aviary scored higher — ${liveScores[1]} to ${liveScores[0]}.` }
  else if (s.winner === -1) { bk = ''; banner = `A tie — ${liveScores[0]} apiece. A draw of feathers.` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — play a bird, or take a habitat action' }
  else { bk = 'foe'; banner = 'The Rival is taking their turn…' }

  const turnsTaken = (WS.TURNS_EACH - you.cubesLeft) + (WS.TURNS_EACH - s.players[1].cubesLeft)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Wingspan · engine-building"
        title="Wingspan"
        subtitle="play birds across forest, grassland & wetland — run the food→eggs→cards engine to out-score the Rival"
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
            <div className="ws-stat"><span className="ws-stat-v">{liveScores[0]}</span><span className="ws-stat-l">points</span></div>
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
          <div className="ws-scorebox">
            <div className="ws-sc you"><div className="ws-sc-v">{liveScores[0]}</div><div className="ws-sc-l">You</div></div>
            <div className="ws-sc foe"><div className="ws-sc-v">{liveScores[1]}</div><div className="ws-sc-l">Rival</div></div>
          </div>

          <FoePanel p={s.players[1]} active={s.turn === 1 && s.winner == null} score={liveScores[1]} />

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} scores={liveScores} onNew={newGame} />}
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
      <div className="ws-card-pw">{def.power ? POWER_TEXT[def.power] : ' '}</div>
    </button>
  )
}

function FoePanel({ p, active, score }: { p: Player; active: boolean; score: number }) {
  return (
    <div className={'ws-foe' + (active ? ' active' : '')}>
      <div className="ws-foe-head">
        <span className="ws-foe-name">{p.name}</span>
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

function ResultModal({ s, scores, onNew }: { s: State; scores: number[]; onNew: () => void }) {
  const won = s.winner === 0
  const tie = s.winner === -1
  return (
    <Modal
      eyebrow={tie ? 'Even flight' : won ? 'Best in show' : 'Out-classed'}
      title={tie ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{tie
          ? 'Both aviaries scored exactly the same — a rare and beautiful equilibrium.'
          : won
            ? 'Your engine hummed: food fed your birds, your birds laid eggs, and your aviary out-scored the Rival. A naturalist triumph!'
            : 'The Rival ran a tighter engine this time. Play more high-value birds and keep those eggs flowing.'}</p>
      </div>
      <div className="finalsc">
        <span className="you">You {scores[0]}</span>
        <span className="foe">Rival {scores[1]}</span>
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
