# Taking Super Board Game Game Mobile

**Status:** analysis and planning only — no code changes proposed here have been made.
**Scope:** what it would take to run the 244-game library as an iOS + Android app.
**Distribution:** **non-commercial, personal use.** Not for sale, not for public store
distribution. This is a load-bearing assumption — several conclusions below depend on it, and
they are marked *(personal-use)* where they do.
**Date:** August 2026

> **If this is ever distributed publicly — even free, even open source — re-read
> §5 and §7.1.** Store review, the Play target-API deadline, EU accessibility law and the
> trademark question all switch back on the moment the app leaves your own devices.

---

## 1. The short version

The game *logic* is in good shape and is the valuable asset. The problem is that this
program's entire input/output model — a TTY that you `print()` to and `input()` from —
**does not exist on iOS at all**, and is not a user-facing surface on Android. This is not a
styling problem that a mobile-friendly theme can solve. Per the CPython iOS documentation,
mobile devices "do not provide a TTY-style console and do not provide stdin, stdout or
stderr."

So the port is not "make the terminal look nice on a phone." It is:

1. **Separate the rules from the terminal.** Today they are interleaved — 64 game modules
   stop and ask a human a question from inside `make_move()`, a method the engine calls
   expecting a pure state transition.
2. **Build a real touch UI** for roughly a half-dozen interaction families.
3. **Do per-game triage** across 244 games / 514 variations. This is the bulk of the cost and
   it does not compress well.

There is an important asset already in the repo: `design/` contains a high-fidelity React
design handoff for the library shell and ~90 games. **It is a parallel reimplementation, not
a port** — its rules live in `*_logic.jsx`, written independently of the Python. Reconciling
those two codebases is a decision that has to be made early (§4.1), because it changes
everything downstream.

**What personal use changes:** it removes the app-store constraints, which is what made
embedding Python unattractive — so the recommendation is to **keep the Python** rather than
port 145k lines to TypeScript (§4.2). **What it does not change:** items 1 and 2 above. The
64 blocking modules and the touch UI still have to be built, because those are consequences
of the event loop and the screen, not of the store.

---

## 2. What exists today

Measured from the current tree, not estimated.

| | |
|---|---|
| Game modules | 244 registered (`games/*.py`), 514 game+variation combinations |
| Game code | 145,417 lines |
| Engine | 1,416 lines (`engine/base.py` 246, `engine/menu.py` 1,133) |
| `engine/menu.py` split | 747 lines are the `GAME_REGISTRY` data table; 386 lines are terminal UI |
| Third-party dependencies | **none** — pure stdlib (`random`, `copy`, `collections`, `itertools`, `json`, `re`, `heapq`, `abc`) |
| Type annotations | none |
| Tutorial text | 244 tutorials, ~482 KB of prose |
| Design handoff | `design/` — React/JSX prototypes, 29 files, ~5,310 lines (shell + 6 example games) |

**Terminal coupling, counted:**

| Signal | Count |
|---|---|
| `print()` calls | 6,814 |
| `input_with_quit()` calls | 740 |
| Raw `input()` calls | 47 |
| `clear_screen()` calls | 168 |
| `os.system()` calls | 1 |
| Files using raw ANSI escape codes | 30 |
| Files using box-drawing characters | 26 |
| Literal input prompts | 695, across 224 of 244 modules |

**What the architecture gets right**, and which the port should preserve:

- `BaseGame` already defines a clean contract: `setup / display / get_move / make_move /
  check_game_over / get_state / load_state`.
- `get_state()` / `load_state()` already round-trip through JSON. State is small — median
  1.1 KB, 90th percentile 3.8 KB, largest 21.5 KB (Innovation). This is a ready-made
  save-game and cloud-sync payload.
- The AI is cheap. At `hard` difficulty on desktop CPython the worst single move across all
  244 games is **341 ms** (Tic-Tac-Toe 3×3); only 4 games exceed 100 ms and none exceed 1 s.
  Even at a 3–5× mobile/interpreted penalty this stays inside a "the opponent is thinking"
  animation. **AI performance is not a porting risk.**
- No network calls anywhere. Fully offline by construction — a genuine product advantage.

---

## 3. The blockers, in order of severity

### 3.1 Blocking I/O inside the rules engine — the hard one

The engine's contract is that `make_move(move)` applies a move and returns a bool. In 64
modules it instead *stops and asks the human a follow-up question* via `input_with_quit()`:

```
make_move          64 modules
check_game_over     6 modules
setup               3 modules
get_ai_move         1 module
                   ─────────
                   66 distinct modules
```

Examples: `coup` (challenge/block prompts mid-resolution), `ticket_to_ride_card` (ticket
selection during `setup`), `race_for_the_galaxy` (role choice from inside `get_ai_move`),
`battleship`, `hearts`, `yahtzee`, `power_grid`, `sudoku`, `minesweeper`.

A terminal can do this because `input()` blocks the whole program. **A touch UI cannot.** A
mobile app has an event loop; you cannot block it waiting for a tap without freezing the
frame. Every one of these needs to become an explicit state machine:

```
make_move(move) -> Result
    where Result is either  APPLIED(new_state)
                     or     NEEDS_INPUT(prompt_spec)   # UI renders it, calls back
```

This is the single largest and least mechanical piece of work. It cannot be automated,
because deciding what the intermediate states *are* requires understanding each game's rules.
**Estimate: 64 modules × meaningful redesign each.**

### 3.2 Five games bypass the engine loop entirely

`battleship`, `blackjack`, `ludo`, `parcheesi`, `ur` override `play()` and run their own
loop. Any headless engine must either absorb these or they get rewritten. They are also the
games most likely to hide extra terminal assumptions.

### 3.3 The screens do not fit a phone

Rendered width of one `display()` call, measured across all 244 games:

- median **60 columns**, 90th percentile **83**, maximum **188** (Samurai)
- median **24 rows**, maximum **121**
- **217 of 244 games (89%) render wider than 40 columns**

A phone in portrait at a legible font size gives roughly 30–40 columns. So the cheapest
conceivable option — ship the existing terminal UI inside a mobile terminal emulator — fails
for the overwhelming majority of the library. This measurement is the main justification for
building a real UI rather than a shim.

### 3.4 Filesystem assumptions

`engine/base.py` computes `SAVE_DIR` as a `saves/` folder **next to the source code**. On both
iOS and Android the app bundle is read-only; writes must go to the platform's designated
container (`Application Support` / `getFilesDir()`). One-line change, but it will fail 100% of
the time until made, and it needs a migration story once real users have saves.

### 3.5 Interaction grammar is text-shaped

The 695 literal prompts break down roughly as:

| Grammar | Prompts |
|---|---|
| Coordinate / move strings (`"c3 d3"`, `"e2 e3"`, `"3,4"`, `"P*e3"`) | 312 |
| Acknowledgement (`"Press Enter to continue..."`) | 226 |
| Index into a list (`"Replace which card? (1-4)"`) | 72 |
| Menu letter / yes-no | 72 |
| Free text (a word) | 9 |
| Numeric amount (a bid) | 4 |

The 226 "Press Enter" prompts are the easy case — they become tap-to-continue, or better,
disappear into animation timing. The 312 coordinate prompts are the interesting ones: on a
phone nobody should ever type `c3 d3`. That interaction must become *tap the piece, see legal
destinations highlight, tap one* — which requires something the engine does not currently
expose: **a legal-move enumerator**.

### 3.6 There is no `get_legal_moves()`

Today the only way to know whether a move is legal is to attempt it and see if `make_move`
returns `False`. Touch UI needs the opposite: given a tapped piece, *show me every square it
can go to* before the player commits.

Some AI implementations already enumerate moves internally and could be refactored to expose
it. Many do not. This is a per-game addition to the `BaseGame` contract and is a prerequisite
for the tap-tap interaction model in §6.

---

## 4. Strategy options

### 4.1 The decision that comes first: which codebase is the source of truth?

The repo contains two implementations of overlapping games:

- **Python** — 244 games, complete, and (as of the recent audit) verified to run to completion
  across every game and variation, with save/resume round-tripping.
- **`design/*_logic.jsx`** — an independent JS reimplementation, ~90 games claimed, 6 present
  in this repo. High-fidelity visual design, and its README explicitly says "treat that file
  as the spec" for game behaviour.

These will have diverged in rules and edge cases. **Do not plan to maintain both.** The three
honest positions:

1. **Python is truth; the JSX is a visual spec only.** Keeps the audited, tested logic. Costs
   a Python runtime on device (§4.2 option B — which personal use makes the easy answer) or
   a transpile effort.
2. **JS is truth; retire the Python.** Best mobile-native path, but discards the 145k lines of
   audited logic and the bug-fix work, and the JSX covers ~90 games not 244.
3. **Port Python → TypeScript game by game, with the Python as the conformance oracle.** Most
   expensive up front, best long-term. The Python suite can be used to generate golden test
   vectors (seeded game transcripts) that the TS port must reproduce — this is a genuinely
   strong option because the state is already JSON-serializable.

For a personal build the answer is **(1): the Python is the source of truth, and the JSX is a
visual spec.** It keeps the audited logic and the 244-game coverage, and it costs nothing to
decide. Option (3) is the right call only if this later goes public. Either way, make the
choice explicitly rather than by drift — the failure mode is quietly maintaining both.

### 4.2 Runtime options

| Option | What it is | Verdict *(personal-use)* |
|---|---|---|
| **A. Terminal emulator app** | Ship the TTY UI inside a mobile terminal | **Rejected.** 89% of games exceed a phone's usable column count (§3.3). The store objection no longer applies, but the screen still does |
| **B. Python-native mobile framework** | Kivy (+Buildozer) or BeeWare (Briefcase + Toga) — Python end to end, packaged with an embedded interpreter | **Recommended.** Keeps all 145k lines of audited logic. Buildozer is the simplest route to an Android APK; iOS packaging requires a Mac either way. Briefcase covers both platforms from one config |
| **C. Embedded CPython + hand-written native UI** | Bundle libPython, Swift/Kotlin UI calls into it | Viable, more control, but two native UIs to build. Reach for it only if B's widget layer proves too limiting |
| **D. Python → WASM (Pyodide) in a webview** | Run the Python unmodified in a browser runtime | **Rejected.** Multi-megabyte runtime and slow cold start, paid for logic that is already cheap (§2) |
| **E. Port logic to TypeScript, React Native** | One codebase, native shell, JS logic | **No longer recommended** — see below |
| **F. Flutter / Dart** | One codebase, excellent rendering | Same port cost as E, and discards the existing React prototypes |

**Recommendation: B.** For a personal build this is close to clear-cut, and it is a change
from what the store-facing analysis would say:

- The two strongest arguments for porting to TypeScript were *sidestepping the App Store
  interpreter grey area* and *binary size*. Personal use removes the first entirely and makes
  the second nearly irrelevant.
- What remains is a straight cost comparison, and porting 145,000 lines of audited game logic
  to another language is by far the most expensive thing in this document. Avoiding it is
  worth a great deal.
- The audit that just ran verified this Python — every game, every variation, save/resume
  included. A rewrite discards that evidence and has to re-earn it.

**Option E is still the better answer if this ever goes public**, and §4.1's conformance-oracle
idea (seeded transcripts as golden vectors) is the way to do it. It is simply not worth paying
for now.

---

## 5. Platform-specific requirements

### 5.1 iOS

- **No console I/O.** Per CPython's iOS documentation, iOS provides no TTY and no stdin,
  stdout or stderr. `print()`/`input()` are not a user interface. `stdout`/`stderr` *can* be
  redirected to the system log for debugging only.
- **No subprocess, multiprocessing, or IPC.** An iOS app that attempts to create a subprocess
  "will either lock up, or crash." Not currently used by this codebase — keep it that way.
- **Embedded mode only.** Python on iOS is usable only by writing a native app and embedding
  `libPython`.
**These constraints hold regardless of how you distribute** — they are properties of the OS:

- No console I/O, no subprocess, embedded mode only (above).

**These are App Store review rules and do not apply to a personal build** *(personal-use)*:

- **Guideline 2.5.2** — *"Apps should be self-contained in their bundles… nor may they
  download, install, or execute code which introduces or changes features or functionality of
  the app."* This is the rule that makes embedding an interpreter a grey area, and it is a
  review rule, not an OS restriction.
- **Guideline 4.2 (minimum functionality)** and **4.7 (HTML5 mini-games)** — likewise.
- The claim that the Python stdlib "must be modified" to pass review is specifically about
  Apple's *automated review checks*. **Skip review, skip the patching.** This was the main
  ongoing tax on embedding Python, and personal use removes it.

**How you actually get it onto your own iPhone** *(personal-use)*:

| Route | Cost | Signing lifetime | Notes |
|---|---|---|---|
| Free Apple ID ("personal team") | free | **7 days**, then re-sign | also capped at 3 apps; fine for tinkering, tedious for daily use |
| Apple Developer Program | $99/yr | 1 year | the practical choice if you actually want to play it |
| TestFlight | included with the above | 90 days per build | easiest way to also get it onto family devices |

A Mac is required to build and sign for iOS in every case.

### 5.2 Android

- **The Google Play target-API deadline does not apply** *(personal-use)*. Requiring
  Android 16 (API 36) for new apps and updates from 31 August 2026 is a **Play Store policy**,
  enforced at submission. A sideloaded APK is not submitted, so it is not enforced. You still
  want a reasonably current `targetSdk` for behavioural correctness, but there is no deadline
  hanging over you.
- **Sideloading is genuinely easy here** — `buildozer android debug deploy` builds and pushes
  an APK straight to a connected device. No account, no fee, no review. This is the single
  biggest practical advantage of the personal-use scope, and it is why Android is the
  sensible platform to build first.
- Android does have a stdout, but it goes to logcat — again, not a user interface.
- Larger device/OS matrix than iOS, but for a personal build you only care about *your*
  devices. Still plan for back-button handling and aggressive process death (§7.3).

### 5.3 Both

- **Touch targets:** Apple HIG specifies a minimum 44×44 pt; Material Design specifies 48×48
  dp with 8 dp spacing. A 19×19 Go board or a 24×24 TwixT board cannot present every
  intersection at 44 pt on a phone — those games need pan/zoom, or a magnifier loupe, or a
  tablet-only designation. This needs a decision per large-board game.
- **Accessibility** — the European Accessibility Act applies to products placed on the EU
  market, so a personal build is **out of scope legally** *(personal-use)*. It is still worth
  doing the cheap parts: the current colour-only piece differentiation (inherited from the
  ANSI colouring) is hard to read for a meaningful fraction of people, and adding a shape or
  glyph alongside colour costs almost nothing at design time and a lot to retrofit. Full
  screen-reader labelling of board state across 244 games is a large project and a reasonable
  thing to skip.

---

## 6. Touch control design

Reusable interaction families, so that 244 games do not become 244 bespoke UIs. **Caveat:
I attempted to classify the library automatically twice, by code keywords and by prompt
grammar, and the two runs disagreed substantially** (e.g. Chess landed in different buckets).
The families below are sound; the per-game assignment needs manual triage, and that triage is
itself part of the work.

| Family | Gesture model | Engine support needed |
|---|---|---|
| **Single-target grid** (Connect Four, Reversi, Go, Gomoku, Minesweeper) | Tap a cell. Long-press to flag/preview. | Legal-cell set |
| **Source → destination** (Chess, Checkers, Xiangqi, Shogi, Abalone, Amazons) | Tap piece → legal destinations highlight → tap one. Drag-and-drop as an alternative, never the only path. | `get_legal_moves(from)` |
| **Card hand** (Hearts, Spades, Love Letter, Coup, Splendor) | Horizontally scrollable fan; tap to select, tap a zone to commit; the illegal cards dimmed. | Legal-play filter |
| **Dice / push-your-luck** (Yahtzee, Pig, Backgammon, Liar's Dice) | Big roll button; tap individual dice to hold; explicit Bank action. | Existing state is sufficient |
| **Tile with orientation** (Blokus, Cathedral, Tsuro, Carcassonne, Pentago) | Pick piece → rotate/flip control → ghost preview on the board → confirm. **Rotation must be a button, not a gesture** — pinch/twist conflicts with pan/zoom. | Placement validity preview |
| **Action menu / worker placement** (Power Grid, Res Arcana, Targi, Nusfjord) | Bottom sheet listing legal actions, then a sub-sheet for parameters. This is where the §3.1 state machine work pays off. | Explicit action enumeration |
| **Free text** (Boggle, Word Game, Jotto, Codenames Duet) | OS keyboard, with an on-screen letter tray for Boggle-style grids. | Dictionary validation (exists) |

**Cross-cutting touch rules:**

- **Confirmation for destructive/irreversible moves.** A misplaced tap in chess is a lost
  game. Either a confirm step or an undo affordance — and undo needs engine support the
  codebase does not have today (state snapshots are cheap, at ~1 KB, so this is feasible).
- **No hover.** Any information currently conveyed by "look at the board text" needs an
  explicit tap-to-inspect.
- **The 226 "Press Enter to continue" prompts** should mostly not become taps. They exist to
  paginate a scrolling terminal. On mobile most become animation beats or transient toasts;
  keeping them all as taps would make the games feel like paperwork.
- **Landscape vs portrait** must be decided per family — board games generally want portrait,
  card games with a wide tableau generally want landscape.

---

## 7. Considerations that are easy to miss

### 7.1 Content
- **Third-party game designs** — several games are recognizable implementations of
  commercial, in-copyright titles (Wingspan, Splendor, Azul, Res Arcana, Patchwork, Power
  Grid, Ticket to Ride, Carcassonne, and more). Mechanics are generally not copyrightable;
  *names, artwork and themes* are trademarked.
  **For a private, non-commercial build on your own devices this is not a practical concern**
  *(personal-use)* — no distribution, no commerce, no dilution. It becomes a real question
  again the moment the app is published, given away, or open-sourced with the names intact.
  Worth knowing where the line is rather than being surprised by it later. If publishing ever
  becomes interesting, the cheap mitigation is renaming and re-theming; the mechanics can
  stay.
- The README advertises **115 games; the registry actually contains 244.** No longer a store
  metadata problem, but still worth fixing so the project describes itself accurately.
- 482 KB of tutorial prose is a localization surface. For a personal build, English-only is
  obviously fine.

### 7.2 Persistence and sync
- Saves are small JSON (§2) — well suited to iCloud/Play Games sync.
- Needs a **schema version field**, which `get_state()` does not currently emit. Without it,
  any rules fix silently corrupts existing saves. Add before launch, not after.
- Mobile apps are killed without warning. Autosave must happen on every state transition, not
  on an explicit "suspend" action as the terminal version does.

### 7.3 Lifecycle
- The desktop assumption "the process lives until the player quits" is false on mobile.
  Backgrounding, incoming calls, and low-memory kills all need the game to resume exactly
  where it was — which the existing `get_state`/`load_state` supports, and which the recent
  audit verified round-trips correctly for all 244 games. **This is the single most valuable
  thing already in place.**

### 7.4 Non-determinism
- `games/splendor.py` calls `random.seed()` with no argument inside deck generation, reseeding
  the global RNG from system entropy. This makes runs unreproducible and would break both
  seeded replay and any golden-vector conformance testing (§4.1 option 3). Worth fixing
  regardless of platform.

### 7.5 Fairness and feel
- The engine currently sleeps 0.5 s to simulate AI thinking. On mobile that should be a real
  animation, and it should scale with move complexity so the AI feels considered rather than
  laggy.
- Several fixes from the recent audit introduced turn caps and repetition draws to guarantee
  termination. These are correct, but on mobile a game that ends in "draw by repetition" needs
  an explanation in the UI or it reads as a bug.

### 7.6 Scope — the biggest lever you have *(personal-use)*
- Nothing about a personal build requires all 244 games. **The per-game cost is the dominant
  cost of this project** (§9), and it is close to linear, so scope is the one variable with
  real leverage.
- A far better first target: **the ten or fifteen games you actually play.** That is a
  finished, useful app in a fraction of the time, and it exercises every part of the
  architecture — engine refactor, touch families, save/resume — before committing to volume.
- The library can then grow opportunistically, one game at a time, when you want a specific
  one on your phone. This is a much better fit for a personal project than a 244-game
  migration that has to be finished before anything is playable.
- Because there is no store listing, **there is no penalty for shipping a partial library** —
  the menu simply lists what exists. Nothing about the registry design makes this awkward.

---

## 8. What does *not* need to change

Worth stating explicitly, because it bounds the work:

- The rules engines themselves. 145k lines of game logic, recently audited to run to
  completion across all 244 games × 514 variations, with clean save/resume. Whether it is
  executed as Python or ported to TypeScript, **the logic is the asset and it is sound.**
- The AI. Fast enough for mobile with large margin.
- The state model. Already JSON, already small, already round-trips.
- The `GAME_REGISTRY` table (747 lines) — this is data, and it maps almost directly onto the
  design handoff's `games-data.js` catalog.

---

## 9. Suggested phasing

Sequenced to de-risk early rather than to look fast.

**Phase 0 — Decisions (blocking everything).**
Source-of-truth codebase (§4.1 — for personal use, the Python). Runtime option (§4.2 — Kivy or
BeeWare). **Which games you actually want** (§7.6). Target device classes (phone-only vs
phone+tablet, and what happens to 19×19 Go). Legal review is *not* required for a private
build (§7.1).

**Phase 1 — Engine separation, no UI.**
Extract a headless core from `engine/`. Add `get_legal_moves()` and a versioned state schema.
Convert the 64 blocking-`make_move` modules to explicit state machines (§3.1). Fix `SAVE_DIR`.
This is valuable on its own and is a prerequisite for every option in §4.2.

**Phase 2 — One game per interaction family, end to end.**
Six or seven games (§6), installed on a real device — for personal use that means a
`buildozer` deploy on Android, and a signing round-trip on iOS if you want it there too.
Validates the touch model and the build/signing routine before committing to volume.

**Phase 3 — Volume port.**
The remaining games, family by family. This is where the per-game triage cost lands and it is
roughly linear in game count — the honest planning assumption is that **game count is the
dominant cost of the project**, not the engine work. For a personal build this phase is
optional and open-ended: port games when you want them, rather than treating 244 as a target
(§7.6).

**Phase 4 — Polish.** *(what would have been "store readiness")*
Cheap accessibility wins (shape alongside colour), device sync if you want it across your own
devices, and a signing routine you can live with — on iOS that most likely means the $99/yr
developer account rather than re-signing every 7 days (§5.1).

**On effort:** I am deliberately not giving a total figure. The engine work in Phase 1 is
estimable (64 modules of known shape plus ~1,400 lines of engine) and is unavoidable at any
scope. Phase 3 is not estimable until Phase 2 has produced a real per-game cost from a
representative sample — and for a personal build, Phase 3 does not need a fixed end point at
all. Anyone quoting a total before Phase 2 is guessing.

---

## References

- Apple, *App Store Review Guidelines* (2.5.2, 4.2, 4.7) — https://developer.apple.com/app-store/review/guidelines/
- Python, *Using Python on iOS* — https://docs.python.org/3/using/ios.html
- PEP 730, *Adding iOS as a supported platform* — https://peps.python.org/pep-0730/
- PEP 738, *Adding Android as a supported platform* — https://peps.python.org/pep-0738/
- Google Play, *Target API level requirements* — https://support.google.com/googleplay/android-developer/answer/11926878
  *(store policy; does not apply to a sideloaded personal build — §5.2)*
- Buildozer, *Packaging for Android* — https://buildozer.readthedocs.io/
- Kivy, *Create a package for Android* — https://kivy.org/doc/stable/guide/packaging-android.html
- BeeWare, *Briefcase* — https://briefcase.readthedocs.io/
- Pyodide, *Downloading and deploying* — https://pyodide.org/en/stable/usage/downloading-and-deploying.html
- `design/README.md` in this repository — the existing React design handoff

The Apple and Google references above describe **store** requirements. They are recorded here
because they bound a future public release, not because they gate a personal build.
