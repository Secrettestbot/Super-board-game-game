/* CASCADIA — UI (built for this codebase). You (player 0) build a personal hex tableau of
   habitat tiles vs a greedy AI (player 1). Draft one of four tile+token pairs, place the
   habitat tile in an empty hex adjacent to your tableau, then seat the wildlife token on a
   tile whose slot allows it (or set it aside). Live score breakdown on the right. The game
   runs a fixed number of placements so it always ends. The AI takes one placement per turn,
   so its driver re-arms on s.step (useAITurn tick). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as C from './logic'
import type { CascadiaState, Tableau, Animal, Terrain, Hex, Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#13201b" stroke="#2f4a39" strokeWidth="1.5" />
    <polygon points="24,8 35,14.5 35,27.5 24,34 13,27.5 13,14.5" fill="#2f7d4f" stroke="#4fae72" strokeWidth="1.2" />
    <polygon points="24,16 30,19.5 30,26.5 24,30 18,26.5 18,19.5" fill="#c9a23e" />
    <circle cx="24" cy="40" r="3.4" fill="#d4607a" stroke="#f48ca3" strokeWidth="1" />
  </svg>
)

const ANIMAL_GLYPH: Record<Animal, string> = { bear: 'B', elk: 'E', salmon: 'S', hawk: 'H', fox: 'F' }
const ANIMAL_LABEL: Record<Animal, string> = { bear: 'Bear', elk: 'Elk', salmon: 'Salmon', hawk: 'Hawk', fox: 'Fox' }
const TERRAIN_LABEL: Record<Terrain, string> = { forest: 'Forest', wetland: 'Wetland', river: 'River', mountain: 'Mountain', prairie: 'Prairie' }

// ---- axial -> pixel (pointy-top). hw = hex width in px; matches CSS clip ratio. ----
function axialToPx(q: number, r: number, hw: number) {
  const hh = hw * 1.1547
  const x = hw * (q + r / 2)
  const y = hh * 0.75 * r
  return { x, y }
}

/** Render one player's tableau as absolutely-positioned hexes. Interaction only on yours. */
function TableauView({
  tab, foe, hw, slots, sel, onSlot, animTargets, onAnimal,
}: {
  tab: Tableau
  foe?: boolean
  hw: number
  /** empty legal tile placements to render as slots (only during your tile-placement phase) */
  slots?: Hex[]
  sel?: Hex | null
  onSlot?: (h: Hex) => void
  /** hexes that can host the pending token (animal-placement phase) */
  animTargets?: Hex[]
  onAnimal?: (h: Hex) => void
}) {
  const placedKeys = Object.keys(tab)
  // compute bounds (placed + slots) to centre the board
  const all: { q: number; r: number }[] = placedKeys.map(C.parseHex)
  for (const s of slots ?? []) all.push(s)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const hh = hw * 1.1547
  for (const c of all) {
    const { x, y } = axialToPx(c.q, c.r, hw)
    minX = Math.min(minX, x - hw / 2); maxX = Math.max(maxX, x + hw / 2)
    minY = Math.min(minY, y - hh / 2); maxY = Math.max(maxY, y + hh / 2)
  }
  if (!isFinite(minX)) { minX = 0; maxX = hw; minY = 0; maxY = hh }
  const pad = hw * 0.4
  const w = maxX - minX + pad * 2
  const h = maxY - minY + pad * 2
  const offX = -minX + pad
  const offY = -minY + pad

  const slotSet = new Set((slots ?? []).map(s => C.hexKey(s.q, s.r)))
  const animSet = new Set((animTargets ?? []).map(s => C.hexKey(s.q, s.r)))

  const items: React.ReactNode[] = []
  // placed tiles
  for (const k of placedKeys) {
    const t = tab[k]
    const { q, r } = C.parseHex(k)
    const { x, y } = axialToPx(q, r, hw)
    const isAnim = animSet.has(k)
    items.push(
      <div
        key={'t' + k}
        className={'cs-hex placed' + (isAnim ? ' placeable-anim' : '')}
        style={{ left: x + offX, top: y + offY, ['--hw' as string]: hw + 'px' }}
        onClick={isAnim && onAnimal ? () => onAnimal({ q, r }) : undefined}
      >
        {t.terrains.length === 1 ? (
          <div className={'cs-terr one ' + t.terrains[0]} />
        ) : (
          <>
            <div className={'cs-terr two-a ' + t.terrains[0]} />
            <div className={'cs-terr two-b ' + t.terrains[1]} />
          </>
        )}
        <div className="cs-slots">
          {t.slots.map((a, i) => (
            <span key={i} className="cs-slotdot" style={{ background: `var(--a-${a})` }} />
          ))}
        </div>
        {t.placedAnimal != null && (
          <div className={'cs-token ' + t.placedAnimal}>{ANIMAL_GLYPH[t.placedAnimal]}</div>
        )}
      </div>,
    )
  }
  // empty placement slots
  for (const s of slots ?? []) {
    const k = C.hexKey(s.q, s.r)
    if (!slotSet.has(k)) continue
    const { x, y } = axialToPx(s.q, s.r, hw)
    const isSel = sel != null && sel.q === s.q && sel.r === s.r
    items.push(
      <div
        key={'s' + k}
        className={'cs-hex cs-slot active' + (isSel ? ' sel' : '')}
        style={{ left: x + offX, top: y + offY, ['--hw' as string]: hw + 'px' }}
        onClick={onSlot ? () => onSlot(s) : undefined}
      />,
    )
  }

  return (
    <div className={'cs-board' + (foe ? ' foe' : '')} style={{ minWidth: w, minHeight: h }}>
      {items}
    </div>
  )
}

function MiniHex({ terrains, slots }: { terrains: Terrain[]; slots: Animal[] }) {
  return (
    <div className="cs-minihex">
      {terrains.length === 1 ? (
        <div className={'cs-terr one ' + terrains[0]} />
      ) : (
        <>
          <div className={'cs-terr two-a ' + terrains[0]} />
          <div className={'cs-terr two-b ' + terrains[1]} />
        </>
      )}
      <div className="cs-mini-slots">
        {slots.map((a, i) => <span key={i} className="cs-slotdot" style={{ background: `var(--a-${a})` }} />)}
      </div>
    </div>
  )
}

type Phase = 'pick' | 'place' | 'animal'

export function Cascadia() {
  const [s, setS] = useState<CascadiaState>(() => C.makeGame())
  const [showRules, setShowRules] = useState(false)
  // human turn sub-state
  const [phase, setPhase] = useState<Phase>('pick')
  const [marketIdx, setMarketIdx] = useState<number | null>(null)
  const [tileHex, setTileHex] = useState<Hex | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    setS(C.makeGame()); setShowRules(false); setPhase('pick'); setMarketIdx(null); setTileHex(null)
  }
  function resetTurn() { setPhase('pick'); setMarketIdx(null); setTileHex(null) }

  // AI takes one placement per turn; re-arm on s.step.
  useAITurn(s.winner == null && s.turn === 1, () => setS(p => C.aiTurn(p)), { delayMs: 620, tick: s.step })
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else resetTurn() },
  })

  const yourTurn = s.winner == null && s.turn === 0

  // derived placement options
  const yourSlots = yourTurn && phase === 'place' ? C.legalTilePlacements(s.tableaus[0]) : []
  // For the animal phase: simulate the tile already placed so legal spots include it.
  const pendingToken: Animal | null = marketIdx != null ? s.market[marketIdx].token : null
  let animTargets: Hex[] = []
  let projectedTab: Tableau = s.tableaus[0]
  if (yourTurn && phase === 'animal' && marketIdx != null && tileHex != null) {
    const pair = s.market[marketIdx]
    const k = C.hexKey(tileHex.q, tileHex.r)
    projectedTab = {
      ...s.tableaus[0],
      [k]: { terrains: pair.tile.terrains.slice(), slots: pair.tile.slots.slice(), rotation: 0, placedAnimal: null },
    }
    if (pendingToken != null) animTargets = C.legalAnimalSpots(projectedTab, pendingToken)
  }

  function pickMarket(i: number) {
    if (!yourTurn || phase !== 'pick') return
    setMarketIdx(i); setPhase('place'); setTileHex(null)
  }
  function pickSlot(h: Hex) {
    if (!yourTurn || phase !== 'place') return
    setTileHex(h); setPhase('animal')
  }
  function pickAnimal(h: Hex) {
    if (!yourTurn || phase !== 'animal' || marketIdx == null || tileHex == null) return
    setS(C.placePair(s, 0, marketIdx, tileHex, 0, h))
    resetTurn()
  }
  function setAside() {
    if (!yourTurn || phase !== 'animal' || marketIdx == null || tileHex == null) return
    setS(C.placePair(s, 0, marketIdx, tileHex, 0, null))
    resetTurn()
  }

  // banner
  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = `You win — ${s.scores[0]} to ${s.scores[1]}!` }
  else if (s.winner === 1) { bk = 'lose'; banner = `Rival wins — ${s.scores[1]} to ${s.scores[0]}` }
  else if (yourTurn) {
    bk = 'you'
    banner = phase === 'pick' ? 'Draft a tile + token pair'
      : phase === 'place' ? 'Place the habitat tile on a highlighted hex'
      : 'Seat the wildlife token — or set it aside'
  } else { bk = 'foe'; banner = 'The rival is building their wilderness…' }

  const round = Math.ceil((C.TILES_EACH * 2 - s.turnsLeft + 1) / 2)
  const youBd = C.scoreBreakdown(s.tableaus[0])
  const foeBd = C.scoreBreakdown(s.tableaus[1])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Cascadia · tile & token drafting"
        title="Cascadia"
        subtitle="draft paired habitat tiles and wildlife tokens, weave the longest corridors, and place animals where they thrive"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${Math.min(round, C.TILES_EACH)} / ${C.TILES_EACH} · You ${youBd.total} · Rival ${foeBd.total}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · draft &amp; place &nbsp; Esc · cancel &nbsp; N · new</>}
      >
        <div className="cs-main">
          <div className="cs-tabwrap">
            <TableauView
              tab={projectedTab}
              hw={64}
              slots={yourSlots}
              sel={tileHex}
              onSlot={pickSlot}
              animTargets={animTargets}
              onAnimal={pickAnimal}
            />
          </div>

          <div>
            <div className="cs-secthead">Market — four tile + token pairs</div>
            <div className="cs-market">
              {s.market.map((p, i) => {
                const pickable = yourTurn && phase === 'pick'
                return (
                  <div
                    key={i}
                    className={'cs-pair' + (pickable ? ' pick' : '') + (marketIdx === i ? ' sel' : '') + (!yourTurn ? ' dim' : '')}
                    onClick={pickable ? () => pickMarket(i) : undefined}
                  >
                    <MiniHex terrains={p.tile.terrains} slots={p.tile.slots} />
                    <div className="cs-tok-chip">
                      <span className={'cs-tok-disc ' + p.token}>{ANIMAL_GLYPH[p.token]}</span>
                      {ANIMAL_LABEL[p.token]}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div className="cs-secthead">Rival's tableau</div>
            <div className="cs-tabwrap foe">
              <TableauView tab={s.tableaus[1]} foe hw={34} />
            </div>
          </div>
        </div>

        <div className="cs-side">
          {yourTurn && phase === 'animal' && (
            <div className="cs-asidebar">
              {pendingToken != null && <span className={'cs-tok-disc ' + pendingToken}>{ANIMAL_GLYPH[pendingToken]}</span>}
              <span>{animTargets.length ? 'Place on a glowing tile' : 'No legal slot'}</span>
              <button onClick={setAside}>Set aside</button>
            </div>
          )}

          <ScorePanel name="You" cls="you" bd={youBd} active={yourTurn} />
          <ScorePanel name="Rival" cls="foe" bd={foeBd} active={s.turn === 1 && s.winner == null} />

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} scores={s.scores} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ScorePanel({ name, cls, bd, active }: {
  name: string; cls: 'you' | 'foe'
  bd: ReturnType<typeof C.scoreBreakdown>; active: boolean
}) {
  return (
    <div className="panel" style={active ? { boxShadow: `0 0 0 1px var(--${cls})` } : undefined}>
      <div className="cs-scorehd">
        <span className={'nm ' + cls}>{name}</span>
        <span className="tot" style={{ color: `var(--${cls})` }}>{bd.total}</span>
      </div>
      <div className="cs-sbtable">
        <div className="cs-sbsub">Wildlife {bd.wildlife.total}</div>
        {C.ANIMALS.map(a => (
          <div className="cs-sbrow" key={a}>
            <span className="cs-sblabel"><span className="cs-dot" style={{ background: `var(--a-${a})` }} />{ANIMAL_LABEL[a]}</span>
            <span className="cs-sbval">{bd.wildlife.byAnimal[a]}</span>
          </div>
        ))}
        <div className="cs-sbsub">Corridors {bd.corridor.total}</div>
        {C.TERRAINS.map(t => (
          <div className="cs-sbrow" key={t}>
            <span className="cs-sblabel"><span className="cs-swatch" style={{ background: `var(--t-${t})` }} />{TERRAIN_LABEL[t]}</span>
            <span className="cs-sbval">{bd.corridor.byTerrain[t]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultModal({ winner, scores, onNew }: { winner: Player; scores: [number, number]; onNew: () => void }) {
  const won = winner === 0
  return (
    <Modal
      eyebrow={won ? 'Wilderness thrives' : 'Outbuilt'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {scores[0]}</span>
        <span className="foe">Rival {scores[1]}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Cascadia" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Into the wild</button>}>
      <div className="modal-body">
        <p>Build your own tableau of hexagonal <b>habitat tiles</b>. Each tile shows one or two of five <b>terrains</b> (forest, wetland, river, mountain, prairie) and one to three <b>wildlife slots</b> — the animals it can host.</p>
        <p>The <b>market</b> offers four <b>tile + token pairs</b>. On your turn: pick a pair, place its habitat tile on a highlighted hex adjacent to your tableau, then seat the paired wildlife token on any of your tiles whose slot allows it — or <b>set it aside</b>. The pairing is the tension: the tile you want may carry an animal you can't place well.</p>
        <p><b>Wildlife scoring:</b> <b>Bears</b> score for each adjacent pair · <b>Elk</b> for straight lines · <b>Salmon</b> for connected runs · <b>Hawks</b> only when they sit alone · <b>Foxes</b> for the variety of animals beside them.</p>
        <p><b>Corridors:</b> for each terrain, your largest connected group scores its size, plus a bonus to the single biggest corridor. Highest total over <b>{C.TILES_EACH} tiles each</b> wins.</p>
        <p><b>Keys:</b> <kbd>Esc</kbd> cancel · <kbd>N</kbd> new game · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
