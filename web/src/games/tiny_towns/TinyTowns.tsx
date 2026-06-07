/* TINY TOWNS — UI.
   Ported from design/examples/builder_tiny_towns/tinytowns.jsx onto the framework shell,
   now wired to the netplay layer via useGameSession. Tiny Towns (this build) is a solitaire
   pattern-builder: a single 4x4 town, no AI and no opponent. It still goes through the
   uniform session so it shares the OnlineBar / host machinery; with one seat, the local
   player is always seat 0 (mySeat) and on the move, and a would-be guest of a 1-seat table
   is rejected by the session. Place resources and raise buildings; everything is public. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { tinyTownsAdapter } from './net'
import * as TN from './logic'
import type { BuildingKey, Res } from './logic'

const RES_NAME: Record<Res, string> = { wood: "Wood", brick: "Brick", glass: "Glass", wheat: "Wheat", stone: "Stone" }
const B_ICON: Record<BuildingKey, string> = { cottage: "⌂", farm: "≋", well: "○", chapel: "✚", tavern: "⚑" }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1c1810" stroke="#4a3d28" strokeWidth="1.5" />
    <rect x="12" y="24" width="11" height="12" fill="#c0573f" /><path d="M11 24 L17.5 17 L24 24 Z" fill="#8a3c2a" />
    <rect x="26" y="20" width="10" height="16" fill="#d8a83e" /><path d="M25 20 L31 14 L37 20 Z" fill="#a87d24" />
  </svg>
)

function Pattern({ pattern }: { pattern: [number, number, Res][] }) {
  const maxR = Math.max(...pattern.map(c => c[0])), maxC = Math.max(...pattern.map(c => c[1]))
  const map: Record<string, Res> = {}; pattern.forEach(c => map[c[0] + "_" + c[1]] = c[2])
  const rows: (Res | null)[][] = []
  for (let r = 0; r <= maxR; r++) { const row: (Res | null)[] = []; for (let c = 0; c <= maxC; c++) row.push(map[r + "_" + c] || null); rows.push(row) }
  return (
    <div className="pat" style={{ gridTemplateColumns: `repeat(${maxC + 1}, 1fr)` }}>
      {rows.flat().map((res, i) => <span key={i} className={"pcell" + (res ? " r-" + res : " blank")}></span>)}
    </div>
  )
}

export function TinyTowns() {
  const { state: g, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(tinyTownsAdapter)
  const [buildMode, setBuildMode] = useState<BuildingKey | null>(null)
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setBuildMode(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setBuildMode(null) },
  })

  const playing = g.status === "playing"
  const yourTurn = playing && isMyTurn // gates all interaction
  const buildable = playing ? TN.buildableKeys(g.grid) : []
  const candidates = buildMode ? new Set<number>(([] as number[]).concat(...TN.matches(g.grid, buildMode))) : new Set<number>()

  function clickCell(i: number) {
    if (!yourTurn) return
    if (buildMode) {
      if (candidates.has(i)) { dispatch({ kind: 'build', key: buildMode, cell: i }); setBuildMode(null) }
      return
    }
    if (g.resource && g.grid[i] === null) dispatch({ kind: 'place', cell: i })
  }
  function pickBuild(key: string) {
    if (!yourTurn || !buildable.includes(key)) return
    setBuildMode(m => m === key ? null : (key as BuildingKey))
  }

  let banner: string, bk = ""
  if (g.status === "over") { bk = "win"; banner = `Town complete — ${g.score!.total} point${Math.abs(g.score!.total) === 1 ? "" : "s"}` }
  else if (!yourTurn) { bk = "foe"; banner = net.online ? "Opponent's town…" : "Waiting…" }
  else if (buildMode) { bk = "you"; banner = `Place your ${TN.BUILDINGS[buildMode].name} — tap a highlighted square` }
  else if (g.resource) { bk = "you"; banner = `Place the ${RES_NAME[g.resource]}` }
  else { bk = "you"; banner = "Town full — build to free a square, or end the town" }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Tiny Towns · pattern builder"
        title="Tiny Towns"
        subtitle="place the resources you're dealt, match a pattern, and raise a building"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Turn ${g.turn}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="boardside">
          <div className="supply">
            <span className="supply-l">To place</span>
            {g.resource ? <div className={"restile big r-" + g.resource}><span>{RES_NAME[g.resource]}</span></div> : <div className="restile big empty">—</div>}
          </div>
          <div className={"town" + (buildMode ? " building" : "")}>
            {g.grid.map((v, i) => {
              const cls = ["tcell"]
              if (!v) cls.push("empty")
              if (buildMode && candidates.has(i)) cls.push("candidate")
              if (!buildMode && yourTurn && g.resource && !v) cls.push("placeable")
              return (
                <div key={i} className={cls.join(" ")} onClick={() => clickCell(i)}>
                  {v && v.t === "r" && <div className={"restile r-" + v.r}><span>{RES_NAME[v.r]}</span></div>}
                  {v && v.t === "b" && <div className={"btile b-" + v.b}><span className="bi">{B_ICON[v.b]}</span><span className="bn">{TN.BUILDINGS[v.b].name}</span></div>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel">
            <div className="panel-l">Buildings</div>
            <div className="blist">
              {(Object.keys(TN.BUILDINGS) as BuildingKey[]).map(k => {
                const B = TN.BUILDINGS[k]
                const can = yourTurn && buildable.includes(k)
                return (
                  <div key={k} className={"brow" + (can ? " can" : "") + (buildMode === k ? " active" : "")} onClick={() => pickBuild(k)}>
                    <Pattern pattern={B.pattern} />
                    <div className="brow-txt"><div className="brow-name">{B_ICON[k]} {B.name}</div><div className="brow-desc">{B.desc}</div></div>
                    {can && <span className="brow-go">build</span>}
                  </div>
                )
              })}
            </div>
          </div>
          {playing && yourTurn && <button className="endbtn" onClick={() => dispatch({ kind: 'end' })}>End town &amp; score</button>}
        </div>
      </GameShell>

      {g.status === "over" && <ScoreModal score={g.score!} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ScoreModal({ score, onNew }: { score: NonNullable<TN.TinyState['score']>; onNew: () => void }) {
  const b = score.breakdown, bc = score.bcount
  const rows: [string, number, number][] = [
    ["Cottages", bc.cottage, b.cottage], ["Farms", bc.farm, b.farm], ["Chapels", bc.chapel, b.chapel],
    ["Wells", bc.well, b.well], ["Taverns", bc.tavern, b.tavern], ["Empty squares", score.empties, b.empty],
  ].filter(r => r[1] || r[2]) as [string, number, number][]
  return (
    <Modal eyebrow="Final tally" title={`${score.total} points`} closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Build another</button>}>
      <div className="scoretable">
        {rows.map((r, i) => <div key={i} className="st-row"><span>{r[0]}</span><span className="st-n">{r[1]}</span><span className={"st-p" + (r[2] < 0 ? " neg" : "")}>{r[2] >= 0 ? "+" : ""}{r[2]}</span></div>)}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Tiny Towns" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Each turn a resource is named — you <b>must</b> place it on an empty square of your 4×4 town. You don't choose which resource comes; only where it goes.</p>
        <p>When the exact <b>pattern</b> for a building appears (in any rotation or mirror), tap that building, then tap a square in the pattern: the resources clear and the building rises there.</p>
        <p>Score at the end: <i>Cottage</i> +3, <i>Farm</i> +4, <i>Chapel</i> +1 per cottage, <i>Well</i> +1 per adjacent cottage, <i>Taverns</i> 2/5/9/14/20 for a set. Every <b>empty square costs −1</b>.</p>
        <p>Buildings clear their squares, making room to keep going. End the town whenever you like.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
