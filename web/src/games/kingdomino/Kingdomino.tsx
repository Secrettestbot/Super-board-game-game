/* KINGDOMINO — UI. Two 5x5 kingdoms (yours + the rival's), a draft lineup, and a
   place-then-claim turn flow vs a greedy AI. You place your previously-claimed domino
   (rotate with R / the buttons, tap a highlighted square), then claim a tile for next
   round. The AI (player 1) places + claims across many rounds, so its driver re-arms on
   s.tick (a monotonic counter that changes on every AI action). */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { kingdominoAdapter } from './net'
import * as KD from './logic'
import type { KingdomState, Cell, Tile, Terrain, Placement, Player } from './logic'

const TERRAIN_NAME: Record<Terrain, string> = {
  wheat: 'Wheat', forest: 'Forest', water: 'Water', grass: 'Grass', swamp: 'Swamp', mine: 'Mine',
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#232c3d" stroke="#43506c" strokeWidth="1.5" />
    <rect x="10" y="24" width="12" height="12" fill="#3f9b5b" />
    <rect x="22" y="24" width="12" height="12" fill="#4aa6d8" />
    <rect x="22" y="12" width="12" height="12" fill="#e8c45a" />
    <path d="M24 9 l1.6 2.4 2.8 -0.6 -1 2.7 1.6 2.4 -2.9 -0.2 -2 2.1 -0.8 -2.8 -2.7 -1 2.5 -1.5 0.2 -2.9z" fill="#f6d784" transform="translate(4 1) scale(0.9)" />
  </svg>
)

function CrownSvg({ size = 13 }: { size?: number }) {
  return (
    <svg className="kd-crown" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 6 L5 12 L10 4 L15 12 L18 6 L17 15 L3 15 Z" fill="var(--crown)" stroke="var(--crown-d)" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="2" cy="6" r="1.6" fill="var(--crown)" />
      <circle cx="18" cy="6" r="1.6" fill="var(--crown)" />
      <circle cx="10" cy="4" r="1.6" fill="var(--crown)" />
    </svg>
  )
}

function Crowns({ n, size }: { n: number; size?: number }) {
  if (n <= 0) return null
  return <span className="kd-crowns">{Array.from({ length: n }, (_, i) => <CrownSvg key={i} size={size} />)}</span>
}

function cellClasses(cell: Cell): string {
  if (cell == null) return 'kd-cell empty'
  return 'kd-cell t-' + cell.terrain
}

function DominoTile({ tile }: { tile: Tile }) {
  return (
    <div className="kd-domino">
      <div className={'kd-half t-' + tile.a.terrain}><Crowns n={tile.a.crowns} /></div>
      <div className={'kd-half t-' + tile.b.terrain}><Crowns n={tile.b.crowns} /></div>
    </div>
  )
}

/** Compute the two grid indices a ghost placement would occupy, or null. */
function ghostCells(p: Placement | null): Set<number> {
  if (p == null) return new Set()
  const [ar, ac] = KD.rc(p.anchor)
  const o = KD.ORIENTS[p.orient]
  const br = ar + o.dr, bc = ac + o.dc
  const set = new Set<number>([p.anchor])
  if (KD.inBounds(br, bc)) set.add(KD.idxOf(br, bc))
  return set
}

export function Kingdomino() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(kingdominoAdapter)
  const me = mySeat as Player // seat 0 / 1 == player index
  const oppSeat = (1 - me) as Player
  const [orient, setOrient] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [showResult, setShowResult] = useState(true)

  function newGame() {
    netNew()
    setOrient(0)
    setHover(null)
    setShowRules(false)
    setShowResult(true)
  }

  const yourTurn = s.phase !== 'over' && isMyTurn
  const placing = yourTurn && s.phase === 'place'
  const claiming = yourTurn && s.phase === 'claim'
  const finalRound = s.lineup.length === 0

  const you = s.players[me]
  const foe = s.players[oppSeat]
  const oppLabel = net.online ? `Player ${oppSeat + 1}` : 'Rival'

  // legal placements for the human's claimed tile, mapped to anchors by orientation
  const legal: Placement[] = placing && you.claimed != null ? KD.legalPlacements(you.grid, you.claimed) : []
  // legal anchors for the CURRENTLY selected orientation
  const legalForOrient = new Map<number, Placement>()
  for (const p of legal) if (p.orient === orient) legalForOrient.set(p.anchor, p)
  const anyLegal = legal.length > 0

  // ghost preview when hovering a legal anchor in the current orientation
  const hoverPlacement = hover != null ? legalForOrient.get(hover) ?? null : null
  const ghost = ghostCells(hoverPlacement)

  function rotate(dir: number) {
    setOrient((o) => ((o + dir) % 4 + 4) % 4)
  }

  function clickYourCell(i: number) {
    if (!placing || you.claimed == null) return
    const p = legalForOrient.get(i)
    if (p == null) return
    dispatch({ kind: 'place', placement: p })
    setOrient(0)
    setHover(null)
  }

  function discard() {
    if (!placing) return
    dispatch({ kind: 'place', placement: null })
    setOrient(0)
    setHover(null)
  }

  function claim(lineIndex: number) {
    if (!claiming) return
    const entry = s.lineup[lineIndex]
    if (entry == null || entry.claimedBy != null) return
    dispatch({ kind: 'claim', lineIndex })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { setShowRules(false); if (s.phase === 'over') setShowResult(false) },
    extra: (e) => {
      if (!placing) return false
      if (e.key === 'r' || e.key === 'R') { rotate(1); return true }
      if (e.key === 'e' || e.key === 'E') { rotate(-1); return true }
      return false
    },
  })

  // banner
  let banner = ''
  let bk = ''
  if (s.phase === 'over') {
    if (s.tie) { bk = ''; banner = `A draw — ${you.score} all` }
    else if (s.winner === me) { bk = 'win'; banner = `You win — ${you.score} to ${foe.score}` }
    else { bk = 'lose'; banner = `${oppLabel} wins — ${foe.score} to ${you.score}` }
  } else if (placing) {
    bk = 'you'
    banner = anyLegal ? 'Place your domino — tap a highlighted square (R to rotate)' : 'No legal spot — discard your domino'
  } else if (claiming) {
    bk = 'you'
    banner = 'Claim a tile for next round — lower numbers play first'
  } else {
    bk = 'foe'
    banner = s.phase === 'place' ? `${oppLabel} is placing…` : `${oppLabel} is claiming…`
  }

  const roundsLeft = Math.ceil(s.deck.length / 4) + (finalRound ? 0 : 1)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Kingdomino · tile-laying duel"
        title="Kingdomino"
        subtitle="grow a 5×5 realm domino by domino, then score region × crowns"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={s.phase === 'over' ? 'Game over' : `~${roundsLeft} round${roundsLeft === 1 ? '' : 's'} left`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>R · rotate &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="kd-realms">
          <Realm
            who="you"
            name="Your Kingdom"
            grid={you.grid}
            score={you.score}
            interactive={placing}
            legalAnchors={legalForOrient}
            ghost={ghost}
            onHover={setHover}
            onClick={clickYourCell}
          />
          <Realm
            who="foe"
            name={net.online ? `${oppLabel}'s Kingdom` : 'Rival Kingdom'}
            grid={foe.grid}
            score={foe.score}
            interactive={false}
            legalAnchors={new Map()}
            ghost={new Set()}
            onHover={() => {}}
            onClick={() => {}}
          />
        </div>

        <div className="kd-side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel">
            <div className="panel-l">Your tile to place</div>
            {you.claimed != null ? (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ClaimedPreview tile={you.claimed} orient={orient} />
                {placing && (
                  <>
                    <div className="kd-rotate-row">
                      <button className="kd-rotate-btn" onClick={() => rotate(-1)}>↺ Rotate</button>
                      <button className="kd-rotate-btn" onClick={() => rotate(1)}>Rotate ↻</button>
                    </div>
                    {!anyLegal && <button className="kd-discard-btn" onClick={discard}>No fit — discard tile</button>}
                  </>
                )}
              </div>
            ) : (
              <div className="kd-claimed-tile empty">none yet — claim one below</div>
            )}
          </div>

          <div className="panel">
            <div className="panel-l">Draft — claim for next round</div>
            <div className="kd-lineup">
              {s.lineup.length === 0 && <div className="kd-hint">Final placements — no tiles to claim.</div>}
              {s.lineup.map((entry, i) => {
                const tag = entry.claimedBy
                const cls =
                  'kd-draft-row' +
                  (claiming && tag == null ? ' claimable' : '') +
                  (tag === me ? ' claimed-you' : '') +
                  (tag === oppSeat ? ' claimed-foe' : '')
                return (
                  <div key={entry.tile.id} className={cls} onClick={() => claim(i)}>
                    <span className="kd-draft-num">{entry.tile.num}</span>
                    <DominoTile tile={entry.tile} />
                    {tag === me && <span className="kd-draft-tag you">You</span>}
                    {tag === oppSeat && <span className="kd-draft-tag foe">{oppLabel}</span>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel">
            <div className="kd-hint">
              Each region of one terrain scores <b>squares × crowns</b>. Crownless land is worth 0 — connect crowns into big matching regions. Fill the realm for <b>+10</b>.
            </div>
          </div>
        </div>
      </GameShell>

      {s.phase === 'over' && showResult && (
        <ResultModal s={s} me={me} oppSeat={oppSeat} oppLabel={oppLabel} onNew={newGame} onClose={() => setShowResult(false)} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Realm({
  who, name, grid, score, interactive, legalAnchors, ghost, onHover, onClick,
}: {
  who: 'you' | 'foe'
  name: string
  grid: Cell[]
  score: number
  interactive: boolean
  legalAnchors: Map<number, Placement>
  ghost: Set<number>
  onHover: (i: number | null) => void
  onClick: (i: number) => void
}) {
  return (
    <div className={'kd-realm ' + who}>
      <div className="kd-realm-head">
        <span className="kd-realm-name">{name}</span>
        <span className="kd-realm-score">score <b>{KD.scoreGrid(grid)}</b></span>
      </div>
      <div className="kd-grid">
        {grid.map((cell, i) => {
          const isLegal = interactive && cell == null && legalAnchors.has(i)
          const isGhost = ghost.has(i)
          let cls = cellClasses(cell)
          if (isLegal) cls += ' legal'
          if (isGhost) cls += ' ghost'
          return (
            <div
              key={i}
              className={cls}
              onMouseEnter={isLegal ? () => onHover(i) : undefined}
              onMouseLeave={isLegal ? () => onHover(null) : undefined}
              onClick={isLegal ? () => onClick(i) : undefined}
            >
              {cell != null && cell.terrain === 'castle' && <span className="castle-mark">♛</span>}
              {cell != null && cell.terrain !== 'castle' && <Crowns n={cell.crowns} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Shows the claimed domino in its current orientation (a then b along the offset). */
function ClaimedPreview({ tile, orient }: { tile: Tile; orient: number }) {
  const o = KD.ORIENTS[orient]
  // vertical when |dr| == 1
  const vertical = o.dr !== 0
  // when offset is negative, b comes first
  const reversed = o.dr < 0 || o.dc < 0
  const first = reversed ? tile.b : tile.a
  const second = reversed ? tile.a : tile.b
  return (
    <div className="kd-claimed-tile" style={{ flexDirection: vertical ? 'column' : 'row', alignSelf: 'flex-start' }}>
      <div className={'kd-half t-' + first.terrain} style={{ width: 52, height: 52 }}><Crowns n={first.crowns} /></div>
      <div className={'kd-half t-' + second.terrain} style={{ width: 52, height: 52 }}><Crowns n={second.crowns} /></div>
    </div>
  )
}

function ResultModal({ s, me, oppSeat, oppLabel, onNew, onClose }: { s: KingdomState; me: Player; oppSeat: Player; oppLabel: string; onNew: () => void; onClose: () => void }) {
  const you = s.players[me].score
  const foe = s.players[oppSeat].score
  const title = s.tie ? 'A draw' : s.winner === me ? 'You win!' : `${oppLabel} wins`
  return (
    <Modal
      eyebrow="Final tally"
      title={title}
      onClose={onClose}
      closeOnOverlay={true}
      actions={<button className="btn-modal" onClick={onNew}>New realm</button>}
    >
      <div className="modal-body">
        <div className="kd-scoretable">
          <div className="kd-st-row kd-st-you"><span>Your kingdom</span><b>{you}</b></div>
          <div className="kd-st-row kd-st-foe"><span>{oppLabel}'s kingdom</span><b>{foe}</b></div>
        </div>
        <p>Each single-terrain region scored its <b>size × crowns</b>; a full 5×5 adds +10 and the centered castle +5.</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Kingdomino" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin the reign</button>}>
      <div className="modal-body">
        <p>Grow a <b>5×5 kingdom</b> around your central castle, one two-square domino at a time, racing the rival monarch.</p>
        <p>Each round four dominoes are revealed, sorted by number. On your turn you first <b>place</b> the domino you claimed last round — it must touch your castle <i>or</i> a square of matching terrain, and fit inside the 5×5. Then you <b>claim</b> one of the four new tiles. The tile you take sets your seat next round: <b>lower numbers play first</b> but tend to be weaker.</p>
        <p>If a domino can't legally fit, it's discarded. When the deck runs out, both monarchs place their last tile and the realms are scored.</p>
        <p><b>Scoring:</b> every connected region of a single terrain scores <b>(squares) × (crowns in it)</b>. Crownless land scores nothing. Fill the whole realm for <b>+10</b>, and the centered castle is worth <b>+5</b>.</p>
        <p><b>Keys:</b> <kbd>R</kbd> rotate · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
