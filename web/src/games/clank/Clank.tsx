/* CLANK! — UI. A simplified 2-player deckbuilding dungeon crawl. You (player 0) play your
   whole hand to pool SKILL / SWORDS / BOOTS, buy cards from the Dungeon Row market, move your
   pawn down the room track (fighting past blocked passages with swords), grab an artifact, and
   climb back to the Surface to escape — all before the dragon's clank-driven attacks kill you.
   The AI takes its FULL turn greedily in one call; its driver re-arms on s.actions (the tick). */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as CK from './logic'
import type { ClankState, CardDef, Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="9" fill="#1a130d" stroke="#a85a14" strokeWidth="1.5" />
    {/* torch flame */}
    <path d="M24 9 C20 14 21.5 18 24 20 C26.5 18 28 14 24 9 Z" fill="#ffb45e" />
    <path d="M24 13 C22 16 23 19 24 20.4 C25 19 26 16 24 13 Z" fill="#e8852b" />
    {/* dragon scale chevrons */}
    <path d="M13 30 L24 24 L35 30" fill="none" stroke="#c98bff" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M13 36 L24 30 L35 36" fill="none" stroke="#6fc7ff" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
)

export function Clank() {
  const [s, setS] = useState<ClankState>(() => CK.makeGame())
  const [showRules, setShowRules] = useState(false)
  const apply = (fn: (st: ClankState) => void) =>
    setS(prev => { const n = structuredClone(prev); fn(n); return n })

  function newGame() { setS(CK.makeGame()); setShowRules(false) }

  const yourTurn = s.winner == null && s.turn === 0
  const aiActive = s.winner == null && s.turn === 1
  // The AI runs its WHOLE turn in one call; re-arm via the monotonic action counter.
  useAITurn(aiActive, () => apply(st => CK.aiTurn(st)), { delayMs: 650, tick: s.actions })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const you = s.players[0], foe = s.players[1]

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You escaped richer — victory!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The AI out-plundered you — defeat' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — play, buy, move, grab, escape' }
  else { bk = 'foe'; banner = 'The AI delves into the dark…' }

  function play(id: number) { if (yourTurn) apply(st => CK.playCard(st, id)) }
  function playAll() { if (yourTurn) apply(st => CK.playHand(st)) }
  function buy(i: number) { if (yourTurn) apply(st => CK.buyCard(st, 0, i)) }
  function move(room: number) { if (yourTurn) apply(st => CK.move(st, 0, room)) }
  function grab() { if (yourTurn) apply(st => CK.grabArtifact(st, 0)) }
  function endTurn() { if (yourTurn) apply(st => CK.endTurn(st)) }

  const onArtifact = s.rooms[you.room].artifact != null && you.artifact == null
  const dragonClock = s.turnCount % CK.DRAGON_INTERVAL

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Clank! · dungeon deckbuilder"
        title="Clank!"
        subtitle="delve a torchlit dungeon, snatch an artifact, and flee to the surface before the dragon's roar finds your noise"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>HP <span style={{ color: 'var(--you)' }}>{you.health}</span> – <span style={{ color: 'var(--foe)' }}>{foe.health}</span></>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="ck-wrap">
          {/* ---- foe vitals ---- */}
          <div className="ck-foeline">
            <div className="ck-pname foe"><span className="lab">AI</span></div>
            <span className="ck-sect-h" style={{ margin: 0 }}>{s.rooms[foe.room].name}</span>
            <div className="ck-vitals">
              <span className={'ck-vital hp' + (foe.health <= 4 ? ' hurt' : '')}><span className="vk">HP</span>{foe.health}</span>
              <span className="ck-vital clank"><span className="vk">Clank</span>{foe.clank}</span>
              <span className="ck-vital gold"><span className="vk">Gold</span>{foe.gold}</span>
              {foe.artifact != null && <span className="ck-vital carry"><span className="vk">Carrying</span>{foe.artifact}</span>}
            </div>
          </div>

          {/* ---- dungeon map ---- */}
          <div className="ck-sect-h">Dungeon — move with boots (fight blocked passages with swords)</div>
          <div className="ck-map">
            {s.rooms.map(r => {
              const movable = CK.canMove(s, 0, r.id)
              const youHere = you.room === r.id
              const foeHere = foe.room === r.id
              return (
                <div key={r.id}
                  className={'ck-room' + (r.id === CK.START_ROOM ? ' start' : '') + (r.id >= 6 ? ' deep' : '') + (movable ? ' movable' : '')}
                  onClick={movable ? () => move(r.id) : undefined}>
                  <span className="rdepth">{r.id === 0 ? 'Exit' : 'Depth ' + r.id}</span>
                  <span className="rname">{r.name}</span>
                  {r.swordCost > 0 && <span className="rgate">⚔ {r.swordCost} to enter</span>}
                  {r.artifact != null && <span className="rartifact">◆ {r.artifact} pts</span>}
                  <div className="ck-pawns">
                    {youHere && <span className={'ck-pawn you' + (you.artifact != null ? ' carry' : '')}>Y</span>}
                    {foeHere && <span className={'ck-pawn foe' + (foe.artifact != null ? ' carry' : '')}>A</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ---- market ---- */}
          <div className="ck-sect-h">Dungeon Row — buy with Skill</div>
          <div className="ck-row">
            {s.market.map((c, i) => {
              if (c == null) return <div key={'e' + i} className="ck-card disabled" style={{ width: 118 }} />
              const d = CK.def(c)
              const can = yourTurn && s.skill >= d.cost
              return <Card key={c.id} d={d} cost={d.cost}
                className={'buyable' + (can ? ' btn' : ' disabled')}
                onClick={can ? () => buy(i) : undefined} />
            })}
          </div>

          {/* ---- your vitals + pools ---- */}
          <div className="ck-youline">
            <div className="ck-pname you"><span className="lab">You</span></div>
            <span className="ck-sect-h" style={{ margin: 0 }}>{s.rooms[you.room].name}</span>
            <div className="ck-pools">
              <span className="ck-pool skill"><span className="pk">Skill</span>{s.skill}</span>
              <span className="ck-pool swords"><span className="pk">Swords</span>{s.swords}</span>
              <span className="ck-pool boots"><span className="pk">Boots</span>{s.boots}</span>
            </div>
          </div>
          <div className="ck-youline" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <div className="ck-vitals" style={{ marginLeft: 0 }}>
              <span className={'ck-vital hp' + (you.health <= 4 ? ' hurt' : '')}><span className="vk">HP</span>{you.health}</span>
              <span className="ck-vital clank"><span className="vk">Clank</span>{you.clank}</span>
              <span className="ck-vital gold"><span className="vk">Gold</span>{you.gold}</span>
              {you.artifact != null && <span className="ck-vital carry"><span className="vk">Carrying</span>{you.artifact}</span>}
            </div>
          </div>

          {/* ---- your hand ---- */}
          <div className="ck-sect-h">Your hand</div>
          <div className="ck-row">
            {you.hand.length === 0 && <span className="ck-empty-note">hand resolved — buy, move, then end turn</span>}
            {you.hand.map(c => (
              <Card key={c.id} d={CK.def(c)} variant="small"
                className={yourTurn ? ' btn' : ' disabled'}
                onClick={yourTurn ? () => play(c.id) : undefined} />
            ))}
          </div>

          {/* ---- actions ---- */}
          <div className="ck-actions">
            <button className="ck-btn primary" disabled={!yourTurn || you.hand.length === 0} onClick={playAll}>Play hand</button>
            <button className="ck-btn grab" disabled={!yourTurn || !onArtifact} onClick={grab}>
              Grab artifact{onArtifact ? ` (${s.rooms[you.room].artifact})` : ''}
            </button>
            <button className="ck-btn" disabled={!yourTurn} onClick={endTurn}>End turn</button>
            {you.artifact != null && you.room !== CK.START_ROOM &&
              <span className="ck-empty-note">carrying an artifact — climb back to the Surface to escape</span>}
          </div>
        </div>

        {/* ---- side panel ---- */}
        <div className="side">
          <div className="panel ck-bigstat">
            <div className="col you"><div className="nm">Your score</div><div className="v">{CK.scorePlayer(s, 0)}</div><div className="sub">{you.escaped ? 'escaped' : 'in dungeon'}</div></div>
            <div className="col foe"><div className="nm">AI score</div><div className="v">{CK.scorePlayer(s, 1)}</div><div className="sub">{foe.escaped ? 'escaped' : 'in dungeon'}</div></div>
          </div>
          <div className="panel">
            <div className="panel-l">Dragon</div>
            <div className="ck-dragon" style={{ marginTop: 6 }}>
              <span>roars in</span>
              <span className="meter">
                {Array.from({ length: CK.DRAGON_INTERVAL }, (_, i) =>
                  <span key={i} className={'pip' + (i < dragonClock ? ' on' : '')} />)}
              </span>
              <span>{CK.DRAGON_INTERVAL - dragonClock} turns</span>
            </div>
            <div className="ck-counts" style={{ marginTop: 8 }}>
              <div className="cr"><span>Attacks so far</span><b>{s.dragonAttacks}</b></div>
              <div className="cr"><span>Your clank (dmg)</span><b>{you.clank}</b></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-l">Deck</div>
            <div className="ck-counts" style={{ marginTop: 6 }}>
              <div className="cr"><span>Your draw pile</span><b>{you.deck.length}</b></div>
              <div className="cr"><span>Your discard</span><b>{you.discard.length}</b></div>
              <div className="cr"><span>Market deck</span><b>{s.marketDeck.length}</b></div>
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Card({ d, cost, className = '', variant, onClick }: {
  d: CardDef; cost?: number; className?: string; variant?: 'small'; onClick?: () => void
}) {
  const tags: Array<[string, string]> = []
  if (d.skill) tags.push(['s', '+' + d.skill + ' Sk'])
  if (d.swords) tags.push(['w', '+' + d.swords + ' Sw'])
  if (d.boots) tags.push(['b', '+' + d.boots + ' Bt'])
  if (d.gold) tags.push(['g', '+' + d.gold + ' G'])
  if (d.clank) tags.push(['cl', '+' + d.clank + ' Cl'])
  if (d.points) tags.push(['vp', d.points + ' VP'])
  // dominant accent color stripe
  const accent = d.swords ? ' cl-swords' : d.boots ? ' cl-boots' : d.gold ? ' cl-gold' : ' cl-skill'
  const v = variant === 'small' ? ' small' : ''
  return (
    <button type="button" className={'ck-card' + accent + v + ' ' + className} disabled={!onClick} onClick={onClick}>
      {cost != null && <span className="ck-cost">{cost}</span>}
      <div className="cn">{d.name}</div>
      <div className="cb">{d.blurb}</div>
      {tags.length > 0 && <div className="ctags">{tags.map(([cl, tx], i) => <span key={i} className={'ck-tag ' + cl}>{tx}</span>)}</div>}
    </button>
  )
}

function ResultModal({ s, onNew }: { s: ClankState; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'The surface light is yours' : 'The dark keeps you'}
      title={won ? 'You Win' : 'AI Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>New delve</button>}
    >
      <div className="finalsc">
        <span className="you">You {CK.scorePlayer(s, 0)}</span>
        <span className="foe">AI {CK.scorePlayer(s, 1)}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Clank!"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Delve</button>}>
      <div className="modal-body">
        <p>You and the AI each own a 10-card deck. Each turn, <b>play your hand</b> to pool three
          resources: <span style={{ color: 'var(--skill)' }}>Skill</span> (buy cards),
          <span style={{ color: 'var(--swords)' }}> Swords</span> (fight past blocked passages), and
          <span style={{ color: 'var(--boots)' }}> Boots</span> (move your pawn).</p>
        <p>Spend Skill in the <b>Dungeon Row</b> market; bought cards go to your discard and shuffle
          back in when your deck empties. Spend Boots to <b>move</b> between adjacent rooms — deeper rooms
          may be <b>blocked</b> and cost Swords to enter.</p>
        <p>Descend to a room with an <b style={{ color: 'var(--gold)' }}>◆ artifact</b>, <b>grab</b> it,
          then climb back to the <b>Surface</b> to <b>escape</b> and bank it. Deeper artifacts score more.</p>
        <p>Some cards add <b style={{ color: 'var(--clank)' }}>Clank</b> (noise). Every {CK.DRAGON_INTERVAL} turns
          the <b>dragon attacks</b>: you lose health equal to your clank. The game ends when someone escapes
          or the dragon kills everyone — highest score (artifact + gold + card VP) wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
