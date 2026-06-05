/* App.jsx — main component for the Super Board Game Game selection screen */
const { useState, useMemo, useEffect, useRef } = React;

// --- helpers ---
const fmtTime = m => m < 60 ? `${m} min` : `${Math.floor(m/60)}h${m%60 ? ` ${m%60}m` : ''}`;
const COMPLEXITY_LABELS = ["", "Easy", "Light", "Medium", "Heavy", "Expert"];

// Bold display string for typography card.
// We use the game name directly, just split by spaces for line breaking.
function pickDisplay(name) {
  const parts = name.replace(/[!?'.]/g, '').split(/\s+/);
  return parts;
}

// Games that have a hand-built playable HTML page in /games.
// Map game.id → filename (relative to project root).
const PLAYABLE = {
  abalone: "games/Abalone.html",
  air_land_sea: "games/Air, Land &amp; Sea.html",
  alhambra: "games/Alhambra.html",
  alquerque: "games/Alquerque.html",
  amazons: "games/Amazons.html",
  ataxx: "games/Ataxx.html",
  azul: "games/Azul.html",
  backgammon: "games/Backgammon.html",
  bang_dice: "games/Bang! The Dice Game.html",
  battle_line: "games/Battle Line.html",
  battleship: "games/Battleship.html",
  blackjack: "games/Blackjack.html",
  blockade: "games/Blockade.html",
  blokus_duo: "games/Blokus Duo.html",
  boggle: "games/Boggle.html",
  breakthrough: "games/Breakthrough.html",
  calico: "games/Calico.html",
  canadian_checkers: "games/Canadian Checkers.html",
  cant_stop: "games/Can't Stop.html",
  carcassonne: "games/Carcassonne.html",
  carnac: "games/Carnac.html",
  cartographers: "games/Cartographers.html",
  cascadia: "games/Cascadia.html",
  catan_dice: "games/Catan Dice.html",
  cathedral: "games/Cathedral.html",
  checkers: "games/Checkers.html",
  chess: "games/Chess.html",
  chinese_checkers: "games/Chinese Checkers.html",
  clank: "games/Clank!.html",
  cockroach_poker: "games/Cockroach Poker.html",
  codenames_duet: "games/Codenames Duet.html",
  coloretto: "games/Coloretto.html",
  connect_four: "games/Connect Four.html",
  coup: "games/Coup.html",
  cribbage: "games/Cribbage.html",
  cryptid: "games/Cryptid.html",
  dara: "games/Dara.html",
  deep_sea_adventure: "games/Deep Sea Adventure.html",
  dominoes: "games/Dominoes.html",
  dots_boxes: "games/Dots and Boxes.html",
  dvonn: "games/DVONN.html",
  entropy: "games/Entropy.html",
  euchre: "games/Euchre.html",
  everdell: "games/Everdell.html",
  fanorona: "games/Fanorona.html",
  fox_hounds: "games/Fox and Hounds.html",
  fox_in_forest: "games/The Fox in the Forest.html",
  go: "games/Go.html",
  gomoku: "games/Gomoku.html",
  hanabi: "games/Hanabi.html",
  hanamikoji: "games/Hanamikoji.html",
  havannah: "games/Havannah.html",
  hearts: "games/Hearts.html",
  hex: "games/Hex.html",
  hive: "games/Hive.html",
  tafl: "games/Hnefatafl.html",
  ingenious: "games/Ingenious.html",
  isle_of_cats: "games/Isle of Cats.html",
  jaipur: "games/Jaipur.html",
  jotto: "games/Jotto.html",
  kalah: "games/Kalah.html",
  kamisado: "games/Kamisado.html",
  king_of_tokyo: "games/King of Tokyo.html",
  kingdomino: "games/Kingdomino.html",
  konane: "games/Konane.html",
  liars_dice: "games/Liar's Dice.html",
  lines_of_action: "games/Lines of Action.html",
  lost_cities: "games/Lost Cities.html",
  love_letter: "games/Love Letter.html",
  ludo: "games/Ludo.html",
  machi_koro: "games/Machi Koro.html",
  mahjong_solitaire: "games/Mahjong Solitaire.html",
  mancala: "games/Mancala.html",
  mastermind: "games/Mastermind.html",
  mijnlieff: "games/Mijnlieff.html",
  mille_bornes: "games/Mille Bornes.html",
  minesweeper: "games/Minesweeper.html",
  morris: "games/Nine Men's Morris.html",
  nim: "games/Nim.html",
  no_thanks: "games/No Thanks!.html",
  onitama: "games/Onitama.html",
  parade: "games/Parade.html",
  parcheesi: "games/Parcheesi.html",
  parks: "games/Parks.html",
  patchwork: "games/Patchwork.html",
  pentago: "games/Pentago.html",
  pente: "games/Pente.html",
  perudo: "games/Perudo.html",
  photosynthesis: "games/Photosynthesis.html",
  pickomino: "games/Pickomino.html",
  pig: "games/Pig.html",
  point_salad: "games/Point Salad.html",
  pong_hau_ki: "games/Pong Hau K'i.html",
  port_royal: "games/Port Royal.html",
  power_grid: "games/Power Grid.html",
  quacks: "games/Quacks of Quedlinburg.html",
  quarto: "games/Quarto.html",
  quixo: "games/Quixo.html",
  quoridor: "games/Quoridor.html",
  qwirkle: "games/Qwirkle.html",
  qwixx: "games/Qwixx.html",
  radlands: "games/Radlands.html",
  railroad_ink: "games/Railroad Ink.html",
  raptor: "games/Raptor.html",
  reversi: "games/Reversi-Othello.html",
  ur: "games/Royal Game of Ur.html",
  rummikub: "games/Rummikub.html",
  sagrada: "games/Sagrada.html",
  santorini: "games/Santorini.html",
  senet: "games/Senet.html",
  sequence: "games/Sequence.html",
  seven_wonders_duel: "games/Seven Wonders Duel.html",
  shobu: "games/Shobu.html",
  shogi: "games/Shogi.html",
  shut_the_box: "games/Shut the Box.html",
  skull: "games/Skull.html",
  skull_king: "games/Skull King.html",
  snakes_ladders: "games/Snakes & Ladders.html",
  spades: "games/Spades.html",
  splendor: "games/Splendor.html",
  star_realms: "games/Star Realms.html",
  stone_age: "games/Stone Age.html",
  stratego: "games/Stratego.html",
  sudoku: "games/Sudoku.html",
  surakarta: "games/Surakarta.html",
  sushi_go: "games/Sushi Go!.html",
  tablut: "games/Tablut.html",
  tak: "games/Tak.html",
  the_crew: "games/The Crew.html",
  the_mind: "games/The Mind.html",
  tictactoe: "games/Tic-Tac-Toe.html",
  tiny_towns: "games/Tiny Towns.html",
  trax: "games/Trax.html",
  tsuro: "games/Tsuro.html",
  twixt: "games/TwixT.html",
  wari: "games/Wari.html",
  watergate: "games/Watergate.html",
  welcome_to: "games/Welcome To.html",
  wingspan_card: "games/Wingspan Card.html",
  word_game: "games/Word Game.html",
  xiangqi: "games/Xiangqi.html",
  yahtzee: "games/Yahtzee.html",
  yinsh: "games/Yinsh.html",
  yote: "games/Yote.html",
  zertz: "games/ZERTZ.html",
  zombie_dice: "games/Zombie Dice.html",
};

function launchGame(game) {
  const url = PLAYABLE[game.id];
  if (url) {
    window.location.href = url;
  } else {
    alert(`${game.name} isn't built yet — coming in a future volume.`);
  }
}

// Saved games (mock data — in a real app these come from disk)
const RESUMES = [
  { id: "chess", name: "Chess", variant: "Standard", turn: 14, when: "2 hrs ago" },
  { id: "azul", name: "Azul", variant: "Standard", turn: 6, when: "Yesterday" },
  { id: "hanabi", name: "Hanabi", variant: "Standard", turn: 22, when: "3 days ago" },
];

// ============== TYPOGRAPHIC ART ==============
function GameTypo({ name, lines }) {
  const parts = pickDisplay(name);
  // arrange into 1-3 stacked words; tighten size based on longest part
  const longest = Math.max(...parts.map(p => p.length));
  let scale = 1;
  if (longest > 11) scale = 0.55;
  else if (longest > 8) scale = 0.7;
  else if (longest > 5) scale = 0.88;
  return (
    <div className="game-typo" style={{ fontSize: `clamp(22px, ${4*scale}vw + ${8*scale}px, ${52*scale}px)` }}>
      {parts.map((p, i) => (
        <div key={i} style={{ display: 'block' }}>
          {i === 0 ? <span style={{ fontStyle: 'italic' }}>{p}</span> : p}
        </div>
      ))}
    </div>
  );
}

// ============== GAME CARD ==============
function GameCard({ game, onOpen, density }) {
  const cat = window.CATEGORIES.find(c => c.id === game.cat);
  return (
    <div className="game-card" onClick={() => onOpen(game)} role="button" tabIndex={0}
         onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen(game)}>
      <div className="game-card-art">
        <div className="game-corner-l">№ {String(game.id).slice(0,3).toUpperCase()}</div>
        <div className="game-corner">{cat ? cat.label.split(' ')[0].toUpperCase() : ''}</div>
        <GameTypo name={game.name} />
      </div>
      <div className="game-card-foot">
        <div className="name">{game.name}</div>
        <div className="meta">
          <span title="Estimated playtime">{fmtTime(game.time)}</span>
          <span title="Complexity">
            <span className="dot-row">
              {[1,2,3,4,5].map(i => <span key={i} className={"d" + (i <= game.complex ? " on" : "")} />)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ============== MODAL ==============
function GameModal({ game, onClose, onPlay }) {
  const [variant, setVariant] = useState(0);
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!game) return null;
  const cat = window.CATEGORIES.find(c => c.id === game.cat);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
        </button>
        <div className="modal-art">
          <div className="modal-art-eyebrow">{cat ? cat.label : ""}</div>
          <div className="modal-art-typo">
            <GameTypo name={game.name} />
          </div>
          <div className="modal-art-foot">
            <span>2 Players</span>
            <span>№ {String(game.id).slice(0,3).toUpperCase()}</span>
          </div>
        </div>
        <div className="modal-body">
          <div className="modal-cat">{cat ? cat.label : ""}</div>
          <div className="modal-name">{game.name}</div>
          <p className="modal-desc">{game.desc}</p>
          <div className="modal-stats">
            <div>
              <div className="modal-stat-label">Players</div>
              <div className="modal-stat-val">2</div>
            </div>
            <div>
              <div className="modal-stat-label">Time</div>
              <div className="modal-stat-val">{fmtTime(game.time)}</div>
            </div>
            <div>
              <div className="modal-stat-label">Complexity</div>
              <div className="modal-stat-val">{COMPLEXITY_LABELS[game.complex]}</div>
            </div>
          </div>
          <div className="modal-variants-label">Choose a variant — {game.variants.length} available</div>
          <div className="modal-variants">
            {game.variants.map((v, i) => (
              <div key={i}
                   className="modal-variant"
                   aria-pressed={variant === i}
                   onClick={() => setVariant(i)}>
                <div className="radio"></div>
                <div className="name">{v}</div>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Tutorial</button>
            <button className="btn-primary" onClick={() => onPlay(game, variant)}>
              Start Game
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7 L11 7 M7 3 L11 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== APP ==============
function App() {
  const tweaks = window.useTweaks ? window.useTweaks({
    theme: "light",
    density: "comfortable",
    showThumbs: true,
    sortOrder: "alpha",
    layout: "grid",
    accent: "clay",
  }) : [{
    theme: "light", density: "comfortable", showThumbs: true,
    sortOrder: "alpha", layout: "grid", accent: "clay"
  }, () => {}];
  const [t, setT] = tweaks;

  const [query, setQuery] = useState("");
  const [filterTime, setFilterTime] = useState("all");
  const [filterComplex, setFilterComplex] = useState("all");
  const [filterPlayers, setFilterPlayers] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [open, setOpen] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.accent = t.accent;
  }, [t.theme, t.accent]);

  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Featured pick — a strong hero
  const featured = useMemo(() => window.GAMES.find(g => g.id === 'go'), []);

  const filtered = useMemo(() => {
    let games = window.GAMES.slice();
    if (query.trim()) {
      const q = query.toLowerCase();
      games = games.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.desc.toLowerCase().includes(q) ||
        g.variants.some(v => v.toLowerCase().includes(q))
      );
    }
    if (filterTime !== "all") {
      games = games.filter(g => {
        if (filterTime === "short") return g.time <= 15;
        if (filterTime === "medium") return g.time > 15 && g.time <= 30;
        if (filterTime === "long") return g.time > 30;
        return true;
      });
    }
    if (filterComplex !== "all") {
      games = games.filter(g => {
        if (filterComplex === "easy") return g.complex <= 2;
        if (filterComplex === "medium") return g.complex === 3;
        if (filterComplex === "hard") return g.complex >= 4;
        return true;
      });
    }
    if (filterPlayers !== "all") {
      games = games.filter(g => {
        const max = g.maxPlayers || 2;
        if (filterPlayers === "two") return max === 2;
        if (filterPlayers === "many") return max >= 3;
        return true;
      });
    }
    if (filterCat !== "all") games = games.filter(g => g.cat === filterCat);

    if (t.sortOrder === "alpha") games.sort((a,b) => a.name.localeCompare(b.name));
    else if (t.sortOrder === "category") games.sort((a,b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
    else if (t.sortOrder === "popularity") games.sort((a,b) => a.complex - b.complex || a.name.localeCompare(b.name));
    else if (t.sortOrder === "players") games.sort((a,b) => (b.maxPlayers || 2) - (a.maxPlayers || 2) || a.name.localeCompare(b.name));
    else if (t.sortOrder === "time") games.sort((a,b) => a.time - b.time || a.name.localeCompare(b.name));
    else if (t.sortOrder === "variants") games.sort((a,b) => b.variants.length - a.variants.length || a.name.localeCompare(b.name));
    return games;
  }, [query, filterTime, filterComplex, filterPlayers, filterCat, t.sortOrder]);

  // Group by category for shelves layout
  const grouped = useMemo(() => {
    const g = {};
    for (const game of filtered) (g[game.cat] = g[game.cat] || []).push(game);
    return g;
  }, [filtered]);

  const totalGames = window.GAMES.length;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="app">
      {/* MASTHEAD */}
      <header className="masthead">
        <div className="masthead-left">
          <div className="row"><span>Vol. I</span><span>·</span><span>Issue {totalGames}</span></div>
          <div className="row"><span>Est. 2026</span></div>
        </div>
        <div>
          <h1 className="masthead-title">The Super Board Game <span className="amp">&amp;</span> Game</h1>
          <div className="masthead-sub">A Cabinet of Two-Player Diversions · {totalGames} Games · {window.CATEGORIES.length} Houses</div>
        </div>
        <div className="masthead-right">
          <span className="pill"><span className="dot"></span>{today}</span>
        </div>
      </header>

      {/* SEARCH + FILTER */}
      <div className="searchbar">
        <div className="search-input">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input ref={searchRef} placeholder="Search 230+ games — chess, hex, dice..." value={query} onChange={e => setQuery(e.target.value)} />
          <span className="search-kbd">⌘ K</span>
        </div>
        <div className="filter-chips">
          {[
            ["all","Any"],["short","≤ 15 min"],["medium","15–30"],["long","30+"]
          ].map(([k,l]) => (
            <button key={k} className="chip" aria-pressed={filterTime === k} onClick={() => setFilterTime(k)}>{l}</button>
          ))}
          <span style={{ width: 1, background: 'var(--rule)', alignSelf: 'stretch' }}></span>
          {[
            ["all","All Levels"],["easy","Easy"],["medium","Medium"],["hard","Heavy"]
          ].map(([k,l]) => (
            <button key={k} className="chip" aria-pressed={filterComplex === k} onClick={() => setFilterComplex(k)}>{l}</button>
          ))}
          <span style={{ width: 1, background: 'var(--rule)', alignSelf: 'stretch' }}></span>
          {[
            ["all","Any Players"],["two","2 Players"],["many","3+ Players"]
          ].map(([k,l]) => (
            <button key={k} className="chip" aria-pressed={filterPlayers === k} onClick={() => setFilterPlayers(k)}>{l}</button>
          ))}
        </div>
      </div>

      {/* RESUME STRIP */}
      <section className="resume-strip">
        <div className="resume-header">
          <h2 className="section-title">Resume a Game</h2>
          <span className="section-meta">{RESUMES.length} suspended</span>
        </div>
        <div className="resume-row">
          {RESUMES.map(r => {
            const game = window.GAMES.find(g => g.id === r.id);
            if (!game) return null;
            return (
              <div key={r.id} className="resume-card" onClick={() => setOpen(game)}>
                <div className="resume-thumb">{game.name[0]}</div>
                <div className="resume-info">
                  <div className="resume-name">{r.name}</div>
                  <div className="resume-meta"><span className="turn">Turn {r.turn}</span> · {r.variant} · {r.when}</div>
                </div>
              </div>
            );
          })}
          <div className="resume-card" style={{ borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            + New Save Slot
          </div>
        </div>
      </section>

      {/* FEATURED */}
      {featured && (
        <section className="featured">
          <div>
            <div className="featured-eyebrow">Game of the Day</div>
            <h2 className="featured-title">Go</h2>
            <p className="featured-desc">Two thousand years of strategy distilled into 361 intersections. Place stones, surround territory, and discover why this ancient game still resists the deepest analysis.</p>
            <div className="featured-meta">
              <span><b>2</b> Players</span>
              <span><b>30–60</b> Min</span>
              <span><b>Expert</b> Depth</span>
              <span><b>3</b> Boards</span>
            </div>
            <button className="featured-cta" onClick={() => setOpen(featured)}>
              View Game
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7 L11 7 M7 3 L11 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <div className="featured-art">
            <div className="featured-typo">G<span className="accent">o</span></div>
          </div>
        </section>
      )}

      {/* CATALOG */}
      <section className="catalog">
        <div className="catalog-header">
          <div>
            <h2 className="section-title">The Library</h2>
            <div className="cat-blurb">Browse by category, or jump straight to a game.</div>
          </div>
          <div className="catalog-tools">
            <span>Showing {filtered.length} of {totalGames}</span>
          </div>
        </div>

        {/* Category jump-nav */}
        <div className="filter-chips" style={{ marginBottom: 24 }}>
          <button className="chip" aria-pressed={filterCat === "all"} onClick={() => setFilterCat("all")}>
            All <span className="count">{totalGames}</span>
          </button>
          {window.CATEGORIES.map(c => {
            const count = window.GAMES.filter(g => g.cat === c.id).length;
            if (!count) return null;
            return (
              <button key={c.id} className="chip" aria-pressed={filterCat === c.id} onClick={() => setFilterCat(c.id)}>
                {c.label} <span className="count">{count}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && <div className="empty">No games match your filters.</div>}

        {/* Layouts */}
        {filtered.length > 0 && t.layout === "grid" && (
          <div className={"grid" + (t.density === "compact" ? " density-compact" : "")}>
            {filtered.map(g => <GameCard key={g.id} game={g} onOpen={setOpen} density={t.density} />)}
          </div>
        )}

        {filtered.length > 0 && t.layout === "list" && (
          <div className="list-layout">
            {filtered.map(g => {
              const cat = window.CATEGORIES.find(c => c.id === g.cat);
              return (
                <div key={g.id} className="list-row" onClick={() => setOpen(g)}>
                  <div className="list-thumb">{g.name[0]}</div>
                  <div>
                    <div className="list-name">{g.name}</div>
                    <div className="list-desc">{g.desc}</div>
                  </div>
                  <div className="list-meta">{cat ? cat.label : ""}</div>
                  <div className="list-meta">{fmtTime(g.time)}</div>
                  <div className="list-meta">{COMPLEXITY_LABELS[g.complex]}</div>
                  <div className="list-meta">{g.variants.length} variant{g.variants.length>1?'s':''}</div>
                </div>
              );
            })}
          </div>
        )}

        {filtered.length > 0 && t.layout === "shelves" && (
          <div>
            {window.CATEGORIES.map(cat => {
              const items = grouped[cat.id];
              if (!items || !items.length) return null;
              return (
                <div key={cat.id} className="shelf">
                  <div className="shelf-head">
                    <div>
                      <h3 className="section-title" style={{ fontSize: 24 }}>{cat.label}</h3>
                      <div className="cat-blurb">{cat.blurb}</div>
                    </div>
                    <span className="section-meta">{items.length} games</span>
                  </div>
                  <div className="shelf-row">
                    {items.map(g => <GameCard key={g.id} game={g} onOpen={setOpen} density={t.density} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <footer className="footer">
        <span>Super Board Game Game · Volume I</span>
        <span>2-Player · Turn-Based · Suspendable</span>
        <span>Press ⌘K to search</span>
      </footer>

      {open && <GameModal game={open} onClose={() => setOpen(null)} onPlay={(g) => { launchGame(g); }} />}

      {/* TWEAKS PANEL */}
      {window.TweaksPanel && (
        <window.TweaksPanel title="Tweaks">
          <window.TweakSection title="Appearance">
            <window.TweakRadio label="Theme" value={t.theme} options={[["light","Light"],["dark","Dark"]]} onChange={v => setT('theme', v)} />
            <window.TweakSelect label="Accent" value={t.accent} options={[["clay","Clay"],["moss","Moss"],["indigo","Indigo"],["ochre","Ochre"],["plum","Plum"]]} onChange={v => setT('accent', v)} />
          </window.TweakSection>
          <window.TweakSection title="Layout">
            <window.TweakRadio label="View" value={t.layout} options={[["grid","Grid"],["list","List"],["shelves","Shelves"]]} onChange={v => setT('layout', v)} />
            <window.TweakRadio label="Density" value={t.density} options={[["comfortable","Comfortable"],["compact","Compact"]]} onChange={v => setT('density', v)} />
            <window.TweakToggle label="Show thumbnails" checked={t.showThumbs} onChange={v => setT('showThumbs', v)} />
          </window.TweakSection>
          <window.TweakSection title="Sort">
            <window.TweakSelect label="Order" value={t.sortOrder} options={[["alpha","A–Z"],["category","Category"],["popularity","Easiest first"],["players","Players (most first)"],["time","Shortest first"],["variants","Most variants"]]} onChange={v => setT('sortOrder', v)} />
          </window.TweakSection>
        </window.TweaksPanel>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
