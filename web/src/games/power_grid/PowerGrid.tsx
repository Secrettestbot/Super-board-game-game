/* POWER GRID — UI. Seat-relative: you play `mySeat` (0 solo / host, the open seat as a
   guest), the other seat is the rival utility (an AI locally, a remote opponent online).

   Each ROUND has five phases: AUCTION (buy a power plant at its listed cost in turn order)
   -> RESOURCES (buy fuel at prices that rise as supply drains) -> BUILD (connect cities;
   connection + slot cost) -> BUREAU (run plants, burn fuel, power cities, earn from the
   payout table). The game ends when a player connects 7 cities; most cities powered wins
   (tie -> money).

   Online play is host-authoritative via useGameSession(powerGridAdapter): the host runs the
   real logic, guests send kinded intents and render a per-seat view. An unfilled seat is
   driven by the existing greedy AI (the hook re-arms on adapter.tickKey). MONEY is hidden:
   a guest only ever sees its own cash; an opponent's money shows as "?". */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { powerGridAdapter } from './net'
import * as PG from './logic'
import type { State, Player, Plant, FuelId, ResourceId } from './logic'

const { RESOURCES } = PG

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="11" fill="#16202b" stroke="#36c5d6" strokeWidth="1.5" />
    <path d="M26 8 L15 27 L23 27 L20 40 L34 20 L25 20 Z" fill="#ffd23f" stroke="#caa21f" strokeWidth="1" strokeLinejoin="round" />
    <circle cx="12" cy="38" r="2.4" fill="#5fe0a0" />
    <circle cx="38" cy="34" r="2.4" fill="#ff7a59" />
  </svg>
)

const FUEL_GLYPH: Record<FuelId, string> = {
  coal: '⬛', oil: '🛢️', garbage: '♻️', uranium: '☢️', wind: '🌬️',
}
const RES_GLYPH: Record<ResourceId, string> = { coal: '⬛', oil: '🛢️', garbage: '♻️', uranium: '☢️' }

export function PowerGrid() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(powerGridAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  const foeSeat = mySeat === 0 ? 1 : 0
  const you = s.players[mySeat]
  const foe = s.players[foeSeat]
  const foeName = net.online ? 'Opponent' : foe.name
  const yours = s.winner == null && isMyTurn

  // ----- player actions (always submit intents for your own seat) -----
  function clickPlant(i: number) {
    if (yours && s.phase === 'auction' && PG.canBuyPlant(s, mySeat, i)) dispatch({ kind: 'buyPlant', plantId: s.market[i].id })
  }
  function pass() { if (yours && s.phase === 'auction') dispatch({ kind: 'passAuction' }) }
  function buyFuel(r: ResourceId) {
    if (yours && s.phase === 'resources' && PG.canBuyResource(s, mySeat, r, 1)) dispatch({ kind: 'buyResource', res: r, qty: 1 })
  }
  function doneResources() { if (yours && s.phase === 'resources') dispatch({ kind: 'endResources' }) }
  function clickCity(id: string) {
    if (yours && s.phase === 'build' && PG.canBuildCity(s, mySeat, id)) dispatch({ kind: 'buildCity', cityId: id })
  }
  function doneBuild() { if (yours && s.phase === 'build') dispatch({ kind: 'endBuild' }) }
  function powerAll() {
    if (yours && s.phase === 'bureau') dispatch({ kind: 'power', plantIds: you.plants.map(pl => pl.id) })
  }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (yours && s.phase === 'auction') { pass(); return true }
        if (yours && s.phase === 'resources') { doneResources(); return true }
        if (yours && s.phase === 'build') { doneBuild(); return true }
        if (yours && s.phase === 'bureau') { powerAll(); return true }
      }
      return false
    },
  })

  // ----- banner (relative to your seat) -----
  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = `You powered ${you.powered} cities — you win!` }
  else if (s.winner === foeSeat) { bk = 'lose'; banner = `${foeName} powered ${foe.powered} cities — you lose.` }
  else if (yours) {
    bk = 'you'
    banner =
      s.phase === 'auction' ? 'Auction — buy a power plant or pass'
      : s.phase === 'resources' ? 'Buy fuel for your plants'
      : s.phase === 'build' ? 'Connect cities to your network'
      : 'Bureaucracy — power your cities'
  } else { bk = 'foe'; banner = `${foeName} is taking their turn…` }

  const phaseLabel =
    s.phase === 'auction' ? 'Auction' : s.phase === 'resources' ? 'Resources'
    : s.phase === 'build' ? 'Build' : s.phase === 'bureau' ? 'Bureaucracy' : 'Game Over'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Power Grid · network economy"
        title="Power Grid"
        subtitle="auction plants, hoard fuel, wire up cities, and out-power the rival utility"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Round {s.round} · Step {s.step} · {phaseLabel}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · act &nbsp; space · done/power &nbsp; N · new</>}
      >
        <div className="pg-main">
          <Map s={s} mySeat={mySeat} can={yours && s.phase === 'build'} onCity={clickCity} />

          <div className="pg-markets">
            <PlantMarket s={s} you={you} can={yours && s.phase === 'auction'} onPick={clickPlant} />
            <ResourceMarket s={s} you={you} mySeat={mySeat} can={yours && s.phase === 'resources'} onBuy={buyFuel} />
          </div>

          <PhaseBar
            s={s} mySeat={mySeat} yours={yours}
            onPass={pass} onDoneRes={doneResources} onDoneBuild={doneBuild} onPower={powerAll}
          />
        </div>

        <div className="side">
          <PlayerCard p={you} name={you.name} you active={s.turn === mySeat && s.winner == null} />
          <PlayerCard p={foe} name={foeName} you={false} active={s.turn === foeSeat && s.winner == null} />
          <OnlineBar net={net} />
          <div className="panel pg-log" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} mySeat={mySeat} foeName={foeName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

// ---------- helpers ----------

/** Render a money value, masking hidden (redacted) cash from other seats as "?". */
function money(m: number): string {
  return m < 0 ? '?' : `${m}`
}

// ---------- map ----------

function Map({ s, mySeat, can, onCity }: { s: State; mySeat: number; can: boolean; onCity: (id: string) => void }) {
  const cityOwner = (id: string): number | null => {
    for (let i = 0; i < s.players.length; i++) if (s.players[i].network.includes(id)) return i
    return null
  }
  return (
    <div className="pg-map">
      <svg viewBox="0 0 100 92" className="pg-map-svg" preserveAspectRatio="xMidYMid meet">
        {Object.entries(s.links).map(([k, cost]) => {
          const [a, b] = k.split('|')
          const ca = s.cities.find(c => c.id === a)!
          const cb = s.cities.find(c => c.id === b)!
          const mx = (ca.x + cb.x) / 2, my = (ca.y + cb.y) / 2
          return (
            <g key={k}>
              <line x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y} className="pg-link" />
              <text x={mx} y={my} className="pg-link-cost">{cost}</text>
            </g>
          )
        })}
        {s.cities.map(c => {
          const owner = cityOwner(c.id)
          const buildable = can && PG.canBuildCity(s, mySeat, c.id)
          const cost = PG.buildCost(s, mySeat, c.id)
          const cls = `pg-city${owner === mySeat ? ' you' : owner != null ? ' foe' : ''}${buildable ? ' buildable' : ''}`
          return (
            <g key={c.id} className={cls} onClick={() => buildable && onCity(c.id)} role={buildable ? 'button' : undefined}>
              <circle cx={c.x} cy={c.y} r={3.4} className="pg-city-dot" />
              <text x={c.x} y={c.y - 5} className="pg-city-name">{c.name}</text>
              {buildable && cost != null && <text x={c.x} y={c.y + 7.5} className="pg-city-cost">{cost}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ---------- plant market ----------

function PlantCard({ plant, afford, can, onPick }: {
  plant: Plant; afford: boolean; can: boolean; onPick: () => void
}) {
  const selectable = can && afford
  return (
    <div
      className={`pg-plant${selectable ? ' selectable' : ''}${!afford ? ' dim' : ''}`}
      onClick={() => selectable && onPick()}
      role={selectable ? 'button' : undefined}
    >
      <div className="pg-plant-cost">{plant.cost}</div>
      <div className="pg-plant-body">
        <div className={`pg-fuel ${plant.fuel}`}>
          <span className="g">{FUEL_GLYPH[plant.fuel]}</span>
          {plant.fuel === 'wind' ? 'free' : `${plant.burn} ${plant.fuel}`}
        </div>
        <div className="pg-plant-cap"><b>{plant.capacity}</b><span>cities</span></div>
      </div>
    </div>
  )
}

function PlantMarket({ s, you, can, onPick }: {
  s: State; you: Player; can: boolean; onPick: (i: number) => void
}) {
  return (
    <div className="panel pg-market">
      <div className="pg-market-head"><span className="pg-mk-title">Plant Market</span>
        <span className="pg-mk-sub">cost · fuel · capacity</span></div>
      <div className="pg-plants">
        {s.market.map((plant, i) => (
          <PlantCard key={plant.id} plant={plant}
            afford={you.money >= plant.cost && you.plants.length < 3}
            can={can} onPick={() => onPick(i)} />
        ))}
        {s.market.length === 0 && <div className="pg-empty">deck exhausted</div>}
      </div>
    </div>
  )
}

// ---------- resource market ----------

function ResourceMarket({ s, you, mySeat, can, onBuy }: {
  s: State; you: Player; mySeat: number; can: boolean; onBuy: (r: ResourceId) => void
}) {
  return (
    <div className="panel pg-market">
      <div className="pg-market-head"><span className="pg-mk-title">Fuel Market</span>
        <span className="pg-mk-sub">price rises as supply drains</span></div>
      <div className="pg-fuels">
        {RESOURCES.map(r => {
          const remaining = s.supply[r]
          const price = PG.resourcePrice(r, remaining)
          const ok = can && PG.canBuyResource(s, mySeat, r, 1)
          return (
            <div key={r} className={`pg-fuelrow ${r}${ok ? ' buyable' : ''}`}
              onClick={() => ok && onBuy(r)} role={ok ? 'button' : undefined}>
              <span className="pg-fuel-glyph">{RES_GLYPH[r]}</span>
              <span className="pg-fuel-name">{r}</span>
              <span className="pg-fuel-supply">{remaining} left</span>
              <span className="pg-fuel-price">{remaining > 0 ? `${price}` : '—'}<small>/unit</small></span>
              <span className="pg-fuel-have">you: {you.res[r]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- phase bar ----------

function PhaseBar({ s, mySeat, yours, onPass, onDoneRes, onDoneBuild, onPower }: {
  s: State; mySeat: number; yours: boolean
  onPass: () => void; onDoneRes: () => void; onDoneBuild: () => void; onPower: () => void
}) {
  const you = s.players[mySeat]
  let info = ''
  if (s.phase === 'auction') info = you.plants.length >= 3 ? 'Your plant slots are full (3).' : `You hold ${you.plants.length}/3 plants.`
  else if (s.phase === 'resources') info = 'Click a fuel to buy 1 unit. Stock fuel for the bureau phase.'
  else if (s.phase === 'build') info = `Step ${s.step} slot cost ${PG.SLOT_COST[s.step]} + connection. Click a lit city.`
  else if (s.phase === 'bureau') info = `You can power up to ${PG.bestPowered(you)} cities with your fuel.`
  return (
    <div className="pg-phasebar">
      <div className="pg-phase-info">{info}</div>
      <div className="pg-phase-btns">
        <button className="pg-btn" disabled={!(yours && s.phase === 'auction')} onClick={onPass}>Pass auction</button>
        <button className="pg-btn" disabled={!(yours && s.phase === 'resources')} onClick={onDoneRes}>Done buying fuel</button>
        <button className="pg-btn" disabled={!(yours && s.phase === 'build')} onClick={onDoneBuild}>Done building</button>
        <button className="pg-btn primary" disabled={!(yours && s.phase === 'bureau')} onClick={onPower}>Power cities</button>
      </div>
    </div>
  )
}

// ---------- player card ----------

function PlayerCard({ p, name, you, active }: { p: Player; name: string; you: boolean; active: boolean }) {
  return (
    <div className={`panel pg-player${you ? ' you-p' : ''}${active ? ' active' : ''}`}>
      <div className="pg-p-head">
        <span className={'pg-p-name ' + (you ? 'you' : 'foe')}>{name}</span>
        <span className="pg-p-money">{money(p.money)}<small>elektro</small></span>
      </div>
      <div className="pg-p-stats">
        <span className="pg-chip cities">{p.network.length}<small>cities</small></span>
        <span className="pg-chip plants">{p.plants.length}<small>plants</small></span>
        <span className="pg-chip powered">{p.powered}<small>powered</small></span>
      </div>
      <div className="pg-p-plants">
        {p.plants.length
          ? p.plants.map(pl => (
              <span key={pl.id} className={`pg-pchip ${pl.fuel}`} title={`cost ${pl.cost} · ${pl.fuel} · cap ${pl.capacity}`}>
                {FUEL_GLYPH[pl.fuel]}<b>{pl.capacity}</b>
              </span>
            ))
          : <span className="pg-p-empty">no plants yet</span>}
      </div>
      <div className="pg-p-fuels">
        {RESOURCES.map(r => (
          <span key={r} className={`pg-fchip ${r}`}>{RES_GLYPH[r]}{p.res[r]}</span>
        ))}
      </div>
    </div>
  )
}

// ---------- modals ----------

function ResultModal({ s, mySeat, foeName, onNew }: { s: State; mySeat: number; foeName: string; onNew: () => void }) {
  const won = s.winner === mySeat
  const foeSeat = mySeat === 0 ? 1 : 0
  const you = s.players[mySeat]
  const foe = s.players[foeSeat]
  return (
    <Modal
      eyebrow={won ? 'Grid secured' : 'Out-powered'}
      title={won ? 'You Win' : `${foeName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{won
          ? 'Your utility wired the most cities and kept the lights on — a model of efficient power.'
          : 'The rival utility powered more cities. Buy fuel-efficient plants and expand faster next time.'}</p>
      </div>
      <div className="finalsc">
        <span className="you">You {you.powered} powered · {money(you.money)}₠</span>
        <span className="foe">{foeName} {foe.powered} powered · {money(foe.money)}₠</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Power Grid" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin!</button>}>
      <div className="modal-body">
        <p>Build a network of <b>cities</b> and buy <b>power plants</b> to light them up for income. First to connect <b>7 cities</b> ends the game; whoever can <b>power the most cities</b> wins (tie → most money).</p>
        <p>Each round runs five phases:</p>
        <p><b>1 · Auction</b> — buy one face-up plant at its listed cost (or pass). Each plant lists a cost, the fuel it burns (coal/oil/garbage/uranium, or wind = free) and how many cities it can power. Hold up to 3 plants.</p>
        <p><b>2 · Resources</b> — buy fuel. Prices <b>rise as supply drains</b>, so stock early.</p>
        <p><b>3 · Build</b> — connect new cities: pay the cheapest connection cost from your network plus the city slot cost (which rises in Step 2).</p>
        <p><b>4 · Bureaucracy</b> — run your plants: each burns its fuel to power up to its capacity in cities. Earn Elektro from the payout table by total cities powered.</p>
        <p><b>Keys:</b> <kbd>click</kbd> act · <kbd>Space</kbd> done / power · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
