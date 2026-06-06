import type { Game } from '../types'
import { CATEGORIES } from '../data/games'
import { GameTypo } from './GameTypo'
import { fmtTime } from './helpers'

export function GameCard({ game, onOpen }: { game: Game; onOpen: (g: Game) => void }) {
  const cat = CATEGORIES.find(c => c.id === game.cat)
  return (
    <div className="game-card" onClick={() => onOpen(game)} role="button" tabIndex={0}
         onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen(game)}>
      <div className="game-card-art">
        <div className="game-corner-l">№ {String(game.id).slice(0, 3).toUpperCase()}</div>
        <div className="game-corner">{cat ? cat.label.split(' ')[0].toUpperCase() : ''}</div>
        <GameTypo name={game.name} />
      </div>
      <div className="game-card-foot">
        <div className="name">{game.name}</div>
        <div className="meta">
          <span title="Estimated playtime">{fmtTime(game.time)}</span>
          <span title="Complexity">
            <span className="dot-row">
              {[1, 2, 3, 4, 5].map(i => <span key={i} className={"d" + (i <= game.complex ? " on" : "")} />)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
