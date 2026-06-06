/* LibraryApp — the Super Board Game Game selection screen.
   Ported from design/shell/app.jsx. window.GAMES / window.CATEGORIES / window.useTweaks
   / window.Tweak* globals became ESM imports; the PLAYABLE map + launchGame now live in
   data/playable.ts and navigate to each game's built page (or show a "coming soon"
   notice for games not yet ported). */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Game } from '../types'
import { GAMES, CATEGORIES } from '../data/games'
import { PLAYABLE } from '../data/playable'
import { GameCard } from './GameCard'
import { GameModal } from './GameModal'
import { fmtTime, COMPLEXITY_LABELS } from './helpers'
import { useTweaks } from './tweaks/useTweaks'
import { TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakToggle } from './tweaks/TweaksPanel'

function launchGame(game: Game) {
  const url = PLAYABLE[game.id]
  if (url) {
    window.location.href = url
  } else {
    alert(`${game.name} isn't built yet — coming in a future volume.`)
  }
}

// Saved games (mock data — in a real app these come from disk)
const RESUMES = [
  { id: "chess", name: "Chess", variant: "Standard", turn: 14, when: "2 hrs ago" },
  { id: "azul", name: "Azul", variant: "Standard", turn: 6, when: "Yesterday" },
  { id: "hanabi", name: "Hanabi", variant: "Standard", turn: 22, when: "3 days ago" },
]

export function LibraryApp() {
  const [t, setT] = useTweaks({
    theme: "light",
    density: "comfortable",
    showThumbs: true,
    sortOrder: "alpha",
    layout: "grid",
    accent: "clay",
  })

  const [query, setQuery] = useState("")
  const [filterTime, setFilterTime] = useState("all")
  const [filterComplex, setFilterComplex] = useState("all")
  const [filterPlayers, setFilterPlayers] = useState("all")
  const [filterCat, setFilterCat] = useState("all")
  const [open, setOpen] = useState<Game | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = t.theme
    document.documentElement.dataset.accent = t.accent
  }, [t.theme, t.accent])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Featured pick — a strong hero
  const featured = useMemo(() => GAMES.find(g => g.id === 'go'), [])

  const filtered = useMemo(() => {
    let games = GAMES.slice()
    if (query.trim()) {
      const q = query.toLowerCase()
      games = games.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.desc.toLowerCase().includes(q) ||
        g.variants.some(v => v.toLowerCase().includes(q))
      )
    }
    if (filterTime !== "all") {
      games = games.filter(g => {
        if (filterTime === "short") return g.time <= 15
        if (filterTime === "medium") return g.time > 15 && g.time <= 30
        if (filterTime === "long") return g.time > 30
        return true
      })
    }
    if (filterComplex !== "all") {
      games = games.filter(g => {
        if (filterComplex === "easy") return g.complex <= 2
        if (filterComplex === "medium") return g.complex === 3
        if (filterComplex === "hard") return g.complex >= 4
        return true
      })
    }
    if (filterPlayers !== "all") {
      games = games.filter(g => {
        const max = g.maxPlayers || 2
        if (filterPlayers === "two") return max === 2
        if (filterPlayers === "many") return max >= 3
        return true
      })
    }
    if (filterCat !== "all") games = games.filter(g => g.cat === filterCat)

    if (t.sortOrder === "alpha") games.sort((a, b) => a.name.localeCompare(b.name))
    else if (t.sortOrder === "category") games.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name))
    else if (t.sortOrder === "popularity") games.sort((a, b) => a.complex - b.complex || a.name.localeCompare(b.name))
    else if (t.sortOrder === "players") games.sort((a, b) => (b.maxPlayers || 2) - (a.maxPlayers || 2) || a.name.localeCompare(b.name))
    else if (t.sortOrder === "time") games.sort((a, b) => a.time - b.time || a.name.localeCompare(b.name))
    else if (t.sortOrder === "variants") games.sort((a, b) => b.variants.length - a.variants.length || a.name.localeCompare(b.name))
    return games
  }, [query, filterTime, filterComplex, filterPlayers, filterCat, t.sortOrder])

  // Group by category for shelves layout
  const grouped = useMemo(() => {
    const g: Record<string, Game[]> = {}
    for (const game of filtered) (g[game.cat] = g[game.cat] || []).push(game)
    return g
  }, [filtered])

  const totalGames = GAMES.length
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

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
          <div className="masthead-sub">A Cabinet of Two-Player Diversions · {totalGames} Games · {CATEGORIES.length} Houses</div>
        </div>
        <div className="masthead-right">
          <span className="pill"><span className="dot"></span>{today}</span>
        </div>
      </header>

      {/* SEARCH + FILTER */}
      <div className="searchbar">
        <div className="search-input">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input ref={searchRef} placeholder="Search 230+ games — chess, hex, dice..." value={query} onChange={e => setQuery(e.target.value)} />
          <span className="search-kbd">⌘ K</span>
        </div>
        <div className="filter-chips">
          {[["all", "Any"], ["short", "≤ 15 min"], ["medium", "15–30"], ["long", "30+"]].map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={filterTime === k} onClick={() => setFilterTime(k)}>{l}</button>
          ))}
          <span style={{ width: 1, background: 'var(--rule)', alignSelf: 'stretch' }}></span>
          {[["all", "All Levels"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Heavy"]].map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={filterComplex === k} onClick={() => setFilterComplex(k)}>{l}</button>
          ))}
          <span style={{ width: 1, background: 'var(--rule)', alignSelf: 'stretch' }}></span>
          {[["all", "Any Players"], ["two", "2 Players"], ["many", "3+ Players"]].map(([k, l]) => (
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
            const game = GAMES.find(g => g.id === r.id)
            if (!game) return null
            return (
              <div key={r.id} className="resume-card" onClick={() => setOpen(game)}>
                <div className="resume-thumb">{game.name[0]}</div>
                <div className="resume-info">
                  <div className="resume-name">{r.name}</div>
                  <div className="resume-meta"><span className="turn">Turn {r.turn}</span> · {r.variant} · {r.when}</div>
                </div>
              </div>
            )
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
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7 L11 7 M7 3 L11 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
          {CATEGORIES.map(c => {
            const count = GAMES.filter(g => g.cat === c.id).length
            if (!count) return null
            return (
              <button key={c.id} className="chip" aria-pressed={filterCat === c.id} onClick={() => setFilterCat(c.id)}>
                {c.label} <span className="count">{count}</span>
              </button>
            )
          })}
        </div>

        {filtered.length === 0 && <div className="empty">No games match your filters.</div>}

        {/* Layouts */}
        {filtered.length > 0 && t.layout === "grid" && (
          <div className={"grid" + (t.density === "compact" ? " density-compact" : "")}>
            {filtered.map(g => <GameCard key={g.id} game={g} onOpen={setOpen} />)}
          </div>
        )}

        {filtered.length > 0 && t.layout === "list" && (
          <div className="list-layout">
            {filtered.map(g => {
              const cat = CATEGORIES.find(c => c.id === g.cat)
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
                  <div className="list-meta">{g.variants.length} variant{g.variants.length > 1 ? 's' : ''}</div>
                </div>
              )
            })}
          </div>
        )}

        {filtered.length > 0 && t.layout === "shelves" && (
          <div>
            {CATEGORIES.map(cat => {
              const items = grouped[cat.id]
              if (!items || !items.length) return null
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
                    {items.map(g => <GameCard key={g.id} game={g} onOpen={setOpen} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <footer className="footer">
        <span>Super Board Game Game · Volume I</span>
        <span>2-Player · Turn-Based · Suspendable</span>
        <span>Press ⌘K to search</span>
      </footer>

      {open && <GameModal game={open} onClose={() => setOpen(null)} onPlay={(g) => { launchGame(g) }} />}

      {/* TWEAKS PANEL */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance">
          <TweakRadio label="Theme" value={t.theme} options={[["light", "Light"], ["dark", "Dark"]].map(([value, label]) => ({ value, label }))} onChange={v => setT('theme', v)} />
          <TweakSelect label="Accent" value={t.accent} options={[["clay", "Clay"], ["moss", "Moss"], ["indigo", "Indigo"], ["ochre", "Ochre"], ["plum", "Plum"]].map(([value, label]) => ({ value, label }))} onChange={v => setT('accent', v)} />
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio label="View" value={t.layout} options={[["grid", "Grid"], ["list", "List"], ["shelves", "Shelves"]].map(([value, label]) => ({ value, label }))} onChange={v => setT('layout', v)} />
          <TweakRadio label="Density" value={t.density} options={[["comfortable", "Comfortable"], ["compact", "Compact"]].map(([value, label]) => ({ value, label }))} onChange={v => setT('density', v)} />
          <TweakToggle label="Show thumbnails" value={t.showThumbs} onChange={v => setT('showThumbs', v)} />
        </TweakSection>
        <TweakSection label="Sort">
          <TweakSelect label="Order" value={t.sortOrder} options={[["alpha", "A–Z"], ["category", "Category"], ["popularity", "Easiest first"], ["players", "Players (most first)"], ["time", "Shortest first"], ["variants", "Most variants"]].map(([value, label]) => ({ value, label }))} onChange={v => setT('sortOrder', v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  )
}
