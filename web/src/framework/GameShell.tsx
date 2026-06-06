import type { ReactNode } from 'react'

export interface GameShellProps {
  /** Where the "library" back-link points. Defaults to the library page. */
  backHref?: string
  /** The game's SVG logo mark (rendered in the masthead title block). */
  mark: ReactNode
  eyebrow: string
  title: string
  subtitle: string
  onRules: () => void
  onNew: () => void
  /** Label for the primary action button. Defaults to "New Game". */
  newLabel?: string
  /** Left status text in the modebar, e.g. "Round 3 / 13". */
  modeLeft: ReactNode
  /** Center banner — current prompt / turn / result. */
  banner: ReactNode
  /** Modifier on the banner: "you" | "foe" | "win" | "lose". */
  bannerClass?: string
  /** Right keyboard hint, e.g. "space · roll   N · new". */
  modeRight: ReactNode
  /** The play area (board + side panels). */
  children: ReactNode
}

/**
 * The shared page skeleton every game reuses: masthead (back-link, title block,
 * Rules + New Game tools) + modebar (status / banner / key hints) + stage. Themed
 * entirely through the token contract in tokens.css. Modals are rendered by the
 * game as siblings (see Modal).
 */
export function GameShell({
  backHref = '../index.html',
  mark,
  eyebrow,
  title,
  subtitle,
  onRules,
  onNew,
  newLabel = 'New Game',
  modeLeft,
  banner,
  bannerClass = '',
  modeRight,
  children,
}: GameShellProps) {
  return (
    <div className="app">
      <header className="masthead">
        <a className="back-link" href={backHref}>
          <svg width="13" height="13" viewBox="0 0 14 14">
            <path d="M11 7 L3 7 M7 3 L3 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          library
        </a>
        <div className="title-block">
          {mark}
          <div className="title-stack">
            <div className="title-eyebrow">{eyebrow}</div>
            <h1 className="title-main">{title}</h1>
            <div className="title-sub">{subtitle}</div>
          </div>
        </div>
        <div className="tools">
          <button className="tool-btn" onClick={onRules}>Rules</button>
          <button className="tool-btn primary" onClick={onNew}>{newLabel}</button>
        </div>
      </header>

      <div className="modebar">
        <div className="mb-l">{modeLeft}</div>
        <div className={'turn-banner ' + bannerClass}>{banner}</div>
        <div className="mb-r">{modeRight}</div>
      </div>

      <div className="stage">{children}</div>
    </div>
  )
}
