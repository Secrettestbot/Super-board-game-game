/* CARCASSONNE — UI. A growing tile tableau you build vs a greedy AI — or, online,
   against a remote opponent in the rival seat.
   Your turn: a tile is drawn; rotate it (R), then click a highlighted legal slot to
   place it. If the just-placed tile has a free feature, optionally drop one of your
   meeples on it (or skip). Completed cities/roads/cloisters score and free their
   meeples. Empty seats are filled by the AI via useGameSession's driver.

   Seat-relative: "you" is mySeat (0 host / 1 guest); your tile, score, meeples and the
   result are read from that seat, and the opponent is the other one. Solo play is
   unchanged (mySeat is 0, the rival seat is AI). */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { carcassonneAdapter } from './net'
import * as CC from './logic'
import type { CarcassonneState, TileDef, PlacedTile, Segment, Placement, Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#2c3124" stroke="#525a3e" strokeWidth="1.5" />
    <path d="M10 30 h28 v8 h-28 z" fill="#7ba35a" />
    <path d="M16 14 h16 v16 h-16 z" fill="#c9794e" stroke="#9a5333" strokeWidth="1.2" />
    <path d="M18 14 v-3 h3 v3 M27 14 v-3 h3 v3" fill="#c9794e" />
    <rect x="22" y="30" width="4" height="8" fill="#d8c79a" />
    <path d="M37 12 l1.4 2 2.3 -0.5 -0.9 2.2 1.4 2 -2.4 -0.2 -1.6 1.7 -0.6 -2.3 -2.2 -0.8 2-1.2 0.1-2.3z" fill="#f3cf78" />
  </svg>
)

// ---- geometry of the visible tableau ----
interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

/** Bounding box of all placed tiles, padded by one ring so legal slots are visible. */
function boardBounds(s: CarcassonneState): Bounds {
  let minX = 0, maxX = 0, minY = 0, maxY = 0
  for (const k of Object.keys(s.board)) {
    const [x, y] = CC.parseKey(k)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX: minX - 1, maxX: maxX + 1, minY: minY - 1, maxY: maxY + 1 }
}

const DIR_CLASS = ['n', 'e', 's', 'w'] as const

/** Render a placed (or preview) tile: edge wedges, road bars, cloister, pennant, meeples. */
function TileView({ placed, className = '' }: { placed: PlacedTile; className?: string }) {
  const { def, rotation, meeples } = placed
  // edge types in the four screen directions
  const edges = [0, 1, 2, 3].map((dir) => CC.edgeAt(def, rotation, dir))
  // does the tile carry a pennant on any city segment?
  const pennant = def.segments.some((sg) => sg.kind === 'city' && sg.pennant)
  const hasCloister = def.segments.some((sg) => sg.kind === 'cloister')
  return (
    <div className={'cc-tile ' + (def.id.startsWith('start') ? 'start ' : '') + className}>
      {edges.map((e, dir) => (
        <div key={dir} className={'cc-edge ' + DIR_CLASS[dir] + ' ' + e} />
      ))}
      {/* road bars for any road edge */}
      {edges.map((e, dir) => (e === 'road' ? <div key={'r' + dir} className={'cc-road-bar ' + DIR_CLASS[dir]} /> : null))}
      {hasCloister && <div className="cc-cloister" />}
      {pennant && <div className="cc-pennant" />}
      {/* meeples, drawn at the centroid of their segment */}
      {Object.keys(meeples).map((segIdStr) => {
        const segId = Number(segIdStr)
        const owner = meeples[segId]
        const seg = def.segments.find((sg) => sg.id === segId)
        if (seg == null) return null
        const pos = segCentroid(seg, rotation)
        return (
          <div
            key={segId}
            className={'cc-meeple p' + owner}
            style={{ left: `calc(${pos.x}% - var(--cell) * 0.15)`, top: `calc(${pos.y}% - var(--cell) * 0.18)` }}
          />
        )
      })}
    </div>
  )
}

/** Approx centroid (in % of tile) of a segment, for placing a meeple/spot marker. */
function segCentroid(seg: Segment, rotation: number): { x: number; y: number } {
  if (seg.kind === 'cloister') return { x: 50, y: 50 }
  const pts = CC.rotatedSegEdges(seg, rotation).map((e) => {
    switch (e) {
      case 0: return { x: 50, y: 22 } // N
      case 1: return { x: 78, y: 50 } // E
      case 2: return { x: 50, y: 78 } // S
      default: return { x: 22, y: 50 } // W
    }
  })
  if (pts.length === 0) return { x: 50, y: 50 }
  const x = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const y = pts.reduce((a, p) => a + p.y, 0) / pts.length
  // pull toward centre a touch
  return { x: x * 0.7 + 50 * 0.3, y: y * 0.7 + 50 * 0.3 }
}

export function Carcassonne() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(carcassonneAdapter)
  const me = mySeat as Player // seat 0 = player 0, seat 1 = player 1
  const opp = (me === 0 ? 1 : 0) as Player
  const [rotation, setRotation] = useState(0)
  // a pending placement awaiting the meeple decision (your turn only)
  const [pending, setPending] = useState<Placement | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [showResult, setShowResult] = useState(true)

  function newGame() {
    netNew()
    setRotation(0)
    setPending(null)
    setHover(null)
    setShowRules(false)
    setShowResult(true)
  }

  // The AI driver for any empty seat lives inside useGameSession; no useAITurn here.
  const yourTurn = s.winner == null && isMyTurn && s.current != null
  const choosingMeeple = yourTurn && pending != null

  const you = s.players[me]
  const foe = s.players[opp]
  const oppName = net.online ? 'Opponent' : 'Rival'

  // legal placements for the current rotation (only while choosing a position)
  const legal: Placement[] = yourTurn && s.current != null && pending == null ? CC.legalPlacements(s, s.current) : []
  const legalForRot = new Map<string, Placement>()
  for (const p of legal) if (p.rotation === rotation) legalForRot.set(CC.key(p.x, p.y), p)
  const anyLegalThisRot = legalForRot.size > 0
  const anyLegalAny = legal.length > 0

  // if the current rotation has no legal slot but another does, nudge rotation hint
  const bounds = boardBounds(s)

  function rotate(dir: number) {
    if (pending != null) return
    setRotation((r) => ((r + dir) % 4 + 4) % 4)
  }

  function clickSlot(x: number, y: number) {
    if (!yourTurn || s.current == null || pending != null) return
    const p = legalForRot.get(CC.key(x, y))
    if (p == null) return
    // stage the placement; let the player choose a meeple next
    setPending(p)
    setHover(null)
  }

  // segments of the current tile that are free to claim at the pending placement
  function freeSegments(): Segment[] {
    if (s.current == null || pending == null) return []
    if (you.meeplesLeft <= 0) return []
    return s.current.segments.filter((seg) => isFreeAt(s, s.current!, pending, seg))
  }

  function placeWithMeeple(segId: number | null) {
    if (s.current == null || pending == null) return
    dispatch({ x: pending.x, y: pending.y, rotation: pending.rotation, meepleSegId: segId })
    setPending(null)
    setRotation(0)
    setHover(null)
  }

  function undoPending() {
    setPending(null)
    setHover(null)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => {
      setShowRules(false)
      if (pending != null) undoPending()
      else if (s.winner != null) setShowResult(false)
    },
    extra: (e) => {
      if (!yourTurn) return false
      if (pending == null && (e.key === 'r' || e.key === 'R')) { rotate(1); return true }
      if (pending == null && (e.key === 'e' || e.key === 'E')) { rotate(-1); return true }
      if (choosingMeeple && (e.key === ' ' || e.key === 'Enter')) { placeWithMeeple(null); return true }
      return false
    },
  })

  // banner
  let banner = ''
  let bk = ''
  if (s.winner != null) {
    if (s.winner === 'tie') { bk = ''; banner = `A draw — ${you.score} all` }
    else if (s.winner === me) { bk = 'win'; banner = `You win — ${you.score} to ${foe.score}` }
    else { bk = 'lose'; banner = `${oppName === 'Opponent' ? 'Your opponent' : 'The rival'} wins — ${foe.score} to ${you.score}` }
  } else if (choosingMeeple) {
    bk = 'you'
    const free = freeSegments()
    banner = free.length > 0 ? 'Drop a meeple on a feature — or skip' : 'No free feature — confirming placement'
  } else if (yourTurn) {
    bk = 'you'
    banner = anyLegalThisRot
      ? 'Place your tile — click a glowing slot (R to rotate)'
      : anyLegalAny ? 'Rotate (R) — no legal slot at this angle' : 'No legal placement — tile will be discarded'
  } else {
    bk = 'foe'
    banner = net.online ? 'Your opponent is laying a tile…' : 'The rival is laying a tile…'
  }

  const tilesLeft = s.deck.length + (s.current != null ? 1 : 0)
  const free = choosingMeeple ? freeSegments() : []

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Carcassonne · tile-laying duel"
        title="Carcassonne"
        subtitle="lay the land edge-to-edge, claim cities, roads & cloisters with your meeples"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={s.winner != null ? 'Game over' : <span className="cc-deck-count">tiles left <b>{tilesLeft}</b></span>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>R · rotate &nbsp; Space · skip meeple &nbsp; N · new</>}
      >
        <div className="cc-board-wrap">
          <div
            className="cc-board"
            style={{
              gridTemplateColumns: `repeat(${bounds.maxX - bounds.minX + 1}, var(--cell))`,
              gridTemplateRows: `repeat(${bounds.maxY - bounds.minY + 1}, var(--cell))`,
            }}
          >
            {rangeCells(bounds).map(({ x, y }) => {
              const k = CC.key(x, y)
              const placed = s.board[k]
              const gridStyle = { gridColumn: x - bounds.minX + 1, gridRow: y - bounds.minY + 1 }
              if (placed != null) {
                // if this is the pending placement preview, overlay meeple spots
                const isPending = pending != null && pending.x === x && pending.y === y
                return (
                  <div key={k} className="cc-cell" style={gridStyle}>
                    <TileView placed={placed} />
                    {isPending && free.map((seg) => {
                      const pos = segCentroid(seg, pending!.rotation)
                      return (
                        <div
                          key={seg.id}
                          className="cc-meeple-spot"
                          style={{ left: `calc(${pos.x}% - var(--cell) * 0.17)`, top: `calc(${pos.y}% - var(--cell) * 0.17)` }}
                          title={`Claim this ${seg.kind}`}
                          onClick={() => placeWithMeeple(seg.id)}
                        />
                      )
                    })}
                  </div>
                )
              }
              // empty cell — maybe a legal slot (only when choosing position)
              const legalP = legalForRot.get(k)
              const isLegal = pending == null && legalP != null
              const isGhost = isLegal && hover === k
              if (isLegal && s.current != null) {
                return (
                  <div
                    key={k}
                    className={'cc-cell legal' + (isGhost ? ' ghost' : '')}
                    style={gridStyle}
                    onMouseEnter={() => setHover(k)}
                    onMouseLeave={() => setHover((h) => (h === k ? null : h))}
                    onClick={() => clickSlot(x, y)}
                  >
                    {isGhost && (
                      <TileView placed={{ def: s.current, rotation, meeples: {} }} className="ghost-preview" />
                    )}
                  </div>
                )
              }
              return <div key={k} className="cc-cell empty" style={gridStyle} />
            })}
          </div>
        </div>

        <div className="cc-side">
          <div className="cc-panel">
            <div className="cc-panel-l">{yourTurn ? 'Your tile' : 'Current tile'}</div>
            {s.current != null ? (
              <div className="cc-current">
                <div className="cc-current-tile">
                  <TileView placed={{ def: s.current, rotation: pending != null ? pending.rotation : rotation, meeples: {} }} />
                </div>
                {yourTurn && pending == null && (
                  <div className="cc-rotate-row">
                    <button className="cc-btn" onClick={() => rotate(-1)}>↺ Rotate</button>
                    <button className="cc-btn" onClick={() => rotate(1)}>Rotate ↻</button>
                  </div>
                )}
                {choosingMeeple && (
                  <div className="cc-rotate-row">
                    <button className="cc-btn skip" onClick={() => placeWithMeeple(null)}>Skip meeple</button>
                    <button className="cc-btn" onClick={undoPending}>↩ Reposition</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="cc-hint">No tile in hand.</div>
            )}
          </div>

          <div className="cc-panel">
            <OnlineBar net={net} />
          </div>

          <div className="cc-panel">
            <div className="cc-panel-l">Scores</div>
            <div className="cc-scores">
              <ScoreRow who="you" name="You" p={you} active={s.turn === me && s.winner == null} player={me} />
              <ScoreRow who="foe" name={oppName} p={foe} active={s.turn === opp && s.winner == null} player={opp} />
            </div>
          </div>

          <div className="cc-panel">
            <div className="cc-hint">
              Match every touching edge: <b>city–city</b>, <b>road–road</b>, <b>field–field</b>. Claim a feature with a meeple — a finished <b>city</b> scores 2/tile (+2 a pennant), a <b>road</b> 1/tile, a <b>cloister</b> 9 when ringed. Finishing returns the meeple.
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && showResult && (
        <ResultModal s={s} me={me} opp={opp} oppName={oppName} onNew={newGame} onClose={() => setShowResult(false)} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

/** Does segment `seg` of `tile` placed at `p` belong to a currently-unoccupied feature? */
function isFreeAt(s: CarcassonneState, tile: TileDef, p: Placement, seg: Segment): boolean {
  // build a probe state with the tile placed (no meeple) to test occupancy
  const board: Record<string, PlacedTile> = {}
  for (const k of Object.keys(s.board)) {
    const pl = s.board[k]
    board[k] = { def: pl.def, rotation: pl.rotation, meeples: { ...pl.meeples } }
  }
  board[CC.key(p.x, p.y)] = { def: tile, rotation: p.rotation, meeples: {} }
  const probe: CarcassonneState = { ...s, board }
  return CC.isFeatureUnoccupied(probe, p.x, p.y, seg)
}

function ScoreRow({ who, name, p, active, player }: { who: 'you' | 'foe'; name: string; p: { score: number; meeplesLeft: number }; active: boolean; player: Player }) {
  return (
    <div className={'cc-score-row ' + who + (active ? ' active' : '')}>
      <span className="cc-score-name">{name}</span>
      <span className="cc-meeple-count">
        {Array.from({ length: CC.MEEPLES_PER_PLAYER }, (_, i) => (
          <span key={i} className={'cc-mini-meeple p' + player + (i >= p.meeplesLeft ? ' spent' : '')} />
        ))}
      </span>
      <span className="cc-score-pts">{p.score}</span>
    </div>
  )
}

function ResultModal({ s, me, opp, oppName, onNew, onClose }: { s: CarcassonneState; me: Player; opp: Player; oppName: string; onNew: () => void; onClose: () => void }) {
  const you = s.players[me].score
  const foe = s.players[opp].score
  const title = s.winner === 'tie' ? 'A draw' : s.winner === me ? 'You win!' : `${oppName} wins`
  return (
    <Modal
      eyebrow="Final tally"
      title={title}
      onClose={onClose}
      closeOnOverlay={true}
      actions={<button className="btn-modal" onClick={onNew}>New countryside</button>}
    >
      <div className="modal-body">
        <div className="cc-scoretable">
          <div className="cc-st-row cc-st-you"><span>You</span><b>{you}</b></div>
          <div className="cc-st-row cc-st-foe"><span>{oppName}</span><b>{foe}</b></div>
        </div>
        <p>Incomplete cities, roads and cloisters were scored at reduced value, and every meeple came home.</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Carcassonne" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Lay the first tile</button>}>
      <div className="modal-body">
        <p>Build a medieval countryside one square tile at a time, racing a rival lord. Each tile edge is a <b>city</b>, a <b>road</b> or a <b>field</b>, and some tiles hold a <b>cloister</b> in the middle.</p>
        <p>On your turn a tile is drawn. <b>Rotate</b> it (<kbd>R</kbd>) and drop it on a glowing slot — every edge it touches must <b>match</b> its neighbour. Then you may place one of your <b>meeples</b> on a feature of that tile that nobody already owns: a knight in a city, a robber on a road, a monk on a cloister.</p>
        <p>When a feature is <b>finished</b> it scores and its meeple returns: a <b>city</b> = 2 points per tile (+2 for a pennant), a <b>road</b> = 1 per tile, a <b>cloister</b> = 9 once its 8 neighbours are all placed. If two players tie for most meeples on a feature, both score it.</p>
        <p>When the tiles run out, unfinished features score at reduced value (city &amp; road 1/tile, cloister 1 per surrounding tile). Most points wins.</p>
        <p><b>Keys:</b> <kbd>R</kbd>/<kbd>E</kbd> rotate · <kbd>Space</kbd> skip meeple · <kbd>Esc</kbd> reposition/close · <kbd>N</kbd> new · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}

/** All (x,y) cells in the padded bounds, row-major. */
function rangeCells(b: Bounds): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) out.push({ x, y })
  }
  return out
}
