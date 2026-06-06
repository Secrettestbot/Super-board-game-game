/* MAHJONG SOLITAIRE — UI (built for this codebase).
   A RACE: you (player 0) and an AI rival (player 1) each clear an IDENTICAL layered
   tile layout. Match free pairs of identical faces; first to clear wins, else most
   tiles removed. Free tiles glow; click two to match. The AI removes many pairs over
   time, so its driver re-arms on s.step (useAITurn tick). UI shows the end state. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as M from './logic'
import type { State, Tile, Board } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="9" y="6" width="22" height="30" rx="4" fill="#0f3d35" stroke="#1f6b5c" strokeWidth="1.5" />
    <rect x="13" y="10" width="22" height="30" rx="4" fill="#f4ecd8" stroke="#cdbf9a" strokeWidth="1.5" />
    <text x="24" y="31" textAnchor="middle" fontSize="18" fill="#1f6b5c" fontFamily="serif" fontWeight="700">發</text>
  </svg>
)

// ---- Face -> glyph + colour class ----------------------------------------

const CIRCLE = '①②③④⑤⑥⑦⑧⑨'
const WINDS = ['東', '南', '西', '北']
const DRAGONS = ['中', '發', '白']
const FLOWERS = ['梅', '蘭', '菊', '竹']
const SEASONS = ['春', '夏', '秋', '冬']

function faceGlyph(t: Tile): string {
  const f = t.face
  switch (f.suit) {
    case 'bam':
      return `${f.rank}竹` // n + 竹 marker handled in CSS; show number + stick
    case 'cir':
      return CIRCLE[f.rank - 1] ?? String(f.rank)
    case 'cha':
      return `${f.rank}萬` // n 萬
    case 'wind':
      return WINDS[f.rank - 1] ?? '?'
    case 'drag':
      return DRAGONS[f.rank - 1] ?? '?'
    case 'flower':
      return FLOWERS[f.rank - 1] ?? '花'
    case 'season':
      return SEASONS[f.rank - 1] ?? '季'
  }
}

function faceClass(t: Tile): string {
  return 'suit-' + t.face.suit
}

// ---- Tile geometry -> pixels ---------------------------------------------

const CELL = 30 // half-cell px; a tile spans 2 -> 60px wide visually minus overlap
const TILE_W = 56
const TILE_H = 74
const LAYER_DX = 5 // px shift right per layer (3D illusion)
const LAYER_DY = 6 // px shift up per layer

function tileStyle(t: Tile, bounds: { minX: number; minY: number }): React.CSSProperties {
  const px = (t.x - bounds.minX) * CELL + t.layer * LAYER_DX
  const py = (t.y - bounds.minY) * CELL - t.layer * LAYER_DY
  return {
    left: px,
    top: py,
    width: TILE_W,
    height: TILE_H,
    zIndex: t.layer * 100 + t.y * 2 + 10,
  }
}

function bounds(tiles: Tile[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let maxLayer = 0
  for (const t of tiles) {
    minX = Math.min(minX, t.x)
    minY = Math.min(minY, t.y)
    maxX = Math.max(maxX, t.x)
    maxY = Math.max(maxY, t.y)
    maxLayer = Math.max(maxLayer, t.layer)
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0 }
  const w = (maxX - minX) * CELL + TILE_W + maxLayer * LAYER_DX + 8
  const h = (maxY - minY) * CELL + TILE_H + maxLayer * LAYER_DY + 8
  return { minX, minY, w, h }
}

// ---- Board renderer -------------------------------------------------------

function BoardView({
  board,
  selection,
  onTile,
  hintIds,
  interactive,
}: {
  board: Board
  selection: number | null
  onTile?: (id: number) => void
  hintIds: Set<number>
  interactive: boolean
}) {
  const live = board.tiles.filter((t) => !t.removed)
  const bd = useMemo(() => bounds(board.tiles), [board.tiles])
  return (
    <div className="mj-board" style={{ width: bd.w, height: bd.h }}>
      {live
        .slice()
        .sort((a, b) => a.layer - b.layer || a.y - b.y || a.x - b.x)
        .map((t) => {
          const free = M.isFree(board, t)
          const cls =
            'mj-tile ' +
            faceClass(t) +
            (free ? ' free' : ' blocked') +
            (selection === t.id ? ' selected' : '') +
            (hintIds.has(t.id) ? ' hint' : '')
          return (
            <div
              key={t.id}
              className={cls}
              style={tileStyle(t, bd)}
              onClick={interactive && free && onTile ? () => onTile(t.id) : undefined}
            >
              <span className="mj-face">{faceGlyph(t)}</span>
            </div>
          )
        })}
    </div>
  )
}

// ---- Mini opponent progress ----------------------------------------------

function MiniBoard({ board }: { board: Board }) {
  const total = board.tiles.length
  const left = M.tilesLeft(board)
  const pct = total === 0 ? 100 : Math.round(((total - left) / total) * 100)
  return (
    <div className="mj-mini">
      <div className="mj-mini-grid">
        {board.tiles
          .slice()
          .sort((a, b) => a.layer - b.layer || a.y - b.y || a.x - b.x)
          .map((t) => (
            <span key={t.id} className={'mj-dot' + (t.removed ? ' gone' : M.isFree(board, t) ? ' free' : '')} />
          ))}
      </div>
      <div className="mj-mini-bar">
        <div className="mj-mini-fill foe" style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}

// ---- Main -----------------------------------------------------------------

export function MahjongSolitaire() {
  const [s, setS] = useState<State>(() => M.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [hintIds, setHintIds] = useState<Set<number>>(new Set())

  function newGame() {
    setS(M.makeGame())
    setShowRules(false)
    setHintIds(new Set())
  }
  function reshuffle() {
    // Re-deal the SAME-shaped layout with a fresh seed (both players still identical).
    newGame()
  }

  const you = s.boards[0]
  const foe = s.boards[1]
  const youSel = s.selection[0]

  // The AI removes many pairs over time -> re-arm on s.step. Active while it still has
  // a move to make and the race isn't decided.
  const aiActive = s.winner == null && M.legalPairs(foe).length > 0
  useAITurn(aiActive, () => setS((p) => M.aiTurn(p)), { delayMs: 620, tick: s.step })

  function tapTile(id: number) {
    setHintIds(new Set())
    setS((p) => M.selectTile(p, 0, id))
  }
  function showHint() {
    const pairs = M.legalPairs(you)
    if (pairs.length === 0) { setHintIds(new Set()); return }
    setHintIds(new Set([pairs[0][0].id, pairs[0][1].id]))
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { setShowRules(false); setS((p) => (p.selection[0] == null ? p : { ...p, selection: [null, p.selection[1]] })) },
    extra: (e) => {
      if (s.winner != null) return false
      if (e.key === 'h' || e.key === 'H') { showHint(); return true }
      if (e.key === 'r' || e.key === 'R') { reshuffle(); return true }
      return false
    },
  })

  const youLeft = M.tilesLeft(you)
  const foeLeft = M.tilesLeft(foe)
  const youStuck = M.isStuck(you)

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = youLeft === 0 ? 'You cleared the board — you win!' : 'You removed more tiles — you win!' }
  else if (s.winner === 1) { bk = 'lose'; banner = foeLeft === 0 ? 'The rival cleared first' : 'The rival removed more tiles' }
  else if (youStuck) { bk = 'foe'; banner = 'You are stuck — re-deal (R) to try again' }
  else { bk = 'you'; banner = youSel == null ? 'Match a free pair to clear the board' : 'Pick its match' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Mahjong Solitaire · clearing race"
        title="Mahjong Solitaire"
        subtitle="race the rival to clear the same turtle of tiles — match free pairs, drain the stack, finish first"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        newLabel="Re-deal"
        modeLeft={`You ${youLeft} left · Rival ${foeLeft} left`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · match &nbsp; H · hint &nbsp; R · re-deal &nbsp; N · new</>}
      >
        <div className="mj-wrap">
          <div className="mj-stage">
            <BoardView
              board={you}
              selection={youSel}
              onTile={tapTile}
              hintIds={hintIds}
              interactive={s.winner == null}
            />
          </div>
        </div>

        <div className="side">
          <div className="panel mj-score">
            <div className="mj-row on">
              <span className="mj-pawn you" />
              <span className="mj-who">You</span>
              <span className="mj-left">{youLeft}</span>
            </div>
            <div className="mj-sub">{youLeft === 0 ? 'cleared!' : youStuck ? 'stuck' : `${M.legalPairs(you).length} free pairs`}</div>

            <div className={'mj-row' + (aiActive ? ' on' : '')}>
              <span className="mj-pawn foe" />
              <span className="mj-who">Rival</span>
              <span className="mj-left">{foeLeft}</span>
            </div>
            <div className="mj-sub">{foeLeft === 0 ? 'cleared!' : M.isStuck(foe) ? 'stuck' : 'matching…'}</div>
          </div>

          <div className="panel mj-oppwrap">
            <div className="panel-l">rival board</div>
            <MiniBoard board={foe} />
          </div>

          <div className="panel mj-controls">
            <button className="mj-btn" onClick={showHint} disabled={s.winner != null || youStuck}>Hint</button>
            <button className="mj-btn ghost" onClick={reshuffle}>Re-deal</button>
            <div className="mj-tip">
              A tile is <b>free</b> when nothing sits on top and one side is open. Flowers match any flower; seasons match any season.
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && (
        <ResultModal winner={s.winner} youLeft={youLeft} foeLeft={foeLeft} onNew={newGame} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({
  winner,
  youLeft,
  foeLeft,
  onNew,
}: {
  winner: M.PlayerId
  youLeft: number
  foeLeft: number
  onNew: () => void
}) {
  const won = winner === 0
  return (
    <Modal
      eyebrow={won ? 'Stack drained' : 'Out-matched'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="mj-final">
        <div className="mj-final-row"><span className="you">You</span><b>{youLeft}</b> tiles left</div>
        <div className="mj-final-row"><span className="foe">Rival</span><b>{foeLeft}</b> tiles left</div>
        <p className="mj-final-note">
          {won
            ? youLeft === 0 ? 'You cleared the whole turtle first.' : 'Both got stuck — you had removed more.'
            : foeLeft === 0 ? 'The rival cleared first this time.' : 'Both got stuck — the rival had removed more.'}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Mahjong Solitaire" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Start matching</button>}>
      <div className="modal-body">
        <p>You and the <b>rival</b> each get the <b>same</b> shuffled stack of layered tiles. It's a <b>race</b>: first to clear all tiles wins. If you both get stuck, whoever removed <b>more</b> tiles wins.</p>
        <p>Remove tiles in <b>matching pairs</b>. Two tiles match if they show the <b>same face</b> — with one twist: <b>any flower matches any flower</b>, and <b>any season matches any season</b>.</p>
        <p>A tile is <b>free</b> (and glows) only when <b>nothing sits on top of it</b> and at least one of its <b>left/right edges is open</b>. Free pairs are the only ones you can take.</p>
        <p>Click a free tile to select it, then click its match. The layout is always <b>solvable</b>, but a careless order can strand tiles — use <kbd>H</kbd> for a hint or <kbd>R</kbd> to re-deal.</p>
        <p><b>Keys:</b> <kbd>H</kbd> hint · <kbd>R</kbd> re-deal · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect/close.</p>
      </div>
    </Modal>
  )
}
