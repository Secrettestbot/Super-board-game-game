"""Azul: Stained Glass of Sintra - Draft colored glass to fill windows.

Draft colored glass pieces from factories and fill window columns.
Score for completed columns and color patterns.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Glass colors
COLORS = ["Red", "Blue", "Yellow", "Purple", "Orange"]
COLOR_SYM = {"Red": "R", "Blue": "B", "Yellow": "Y", "Purple": "P",
             "Orange": "O", None: "."}

# Window pattern: 5 columns x 4 rows, each cell accepts specific colors
# Standard patterns per column (which colors are allowed)
WINDOW_PATTERNS = [
    ["Red", "Blue", "Yellow", "Purple"],      # Column 0
    ["Blue", "Yellow", "Purple", "Orange"],    # Column 1
    ["Yellow", "Purple", "Orange", "Red"],     # Column 2
    ["Purple", "Orange", "Red", "Blue"],       # Column 3
    ["Orange", "Red", "Blue", "Yellow"],       # Column 4
]

# Summer pavilion: any color goes anywhere, bonus for sets
SUMMER_PATTERNS = [
    [None, None, None, None],
    [None, None, None, None],
    [None, None, None, None],
    [None, None, None, None],
    [None, None, None, None],
]

NUM_FACTORIES = 5
TILES_PER_FACTORY = 4
WINDOW_ROWS = 4
WINDOW_COLS = 5


class AzulStainedGlassGame(BaseGame):
    """Azul: Stained Glass - Draft colored glass to fill windows."""

    name = "Azul Stained Glass"
    description = "Draft colored glass pieces to fill stained glass windows"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "summer": "Summer Pavilion Rules",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.summer_mode = self.variation == "summer"
        self.bag = []
        self.factories = []
        self.center = []  # center pool
        self.windows = {}  # player -> 5x4 grid of placed colors
        self.glazier = {}  # player -> current column (0-4)
        self.broken = {}   # player -> list of broken pieces (penalty)
        self.score = {}
        self.round_number = 0
        self.first_player_taken = False
        self.first_player_next = 1
        self.phase = "draft"
        self.log = []

    def setup(self):
        # 20 tiles of each color = 100 total
        self.bag = COLORS * 20
        random.shuffle(self.bag)
        self.center = []
        self.first_player_taken = False

        for p in [1, 2]:
            sp = str(p)
            self.windows[sp] = [
                [None] * WINDOW_ROWS for _ in range(WINDOW_COLS)
            ]
            self.glazier[sp] = 0
            self.broken[sp] = []
            self.score[sp] = 0

        self.round_number = 1
        self.phase = "draft"
        self.first_player_next = 1
        self._fill_factories()
        self.log = ["Game started! Draft glass from factories."]

    def _fill_factories(self):
        """Fill factories with tiles from the bag."""
        self.factories = []
        for _ in range(NUM_FACTORIES):
            factory = []
            for _ in range(TILES_PER_FACTORY):
                if not self.bag:
                    break
                factory.append(self.bag.pop())
            self.factories.append(factory)
        self.center = []
        self.first_player_taken = False

    def _get_pattern(self, col, row):
        """Get the required color for a window cell."""
        if self.summer_mode:
            return None  # any color
        return WINDOW_PATTERNS[col][row]

    def _can_place(self, player, col, row, color):
        """Check if a color can be placed at this window position."""
        sp = str(player)
        if self.windows[sp][col][row] is not None:
            return False
        required = self._get_pattern(col, row)
        if required is not None and required != color:
            return False
        return True

    def _valid_columns_for_color(self, player, color):
        """Get columns where at least one cell can accept this color."""
        valid = []
        for col in range(WINDOW_COLS):
            for row in range(WINDOW_ROWS):
                if self._can_place(player, col, row, color):
                    valid.append(col)
                    break
        return valid

    def _place_in_column(self, player, col, color, count):
        """Place tiles in a column, overflow goes to broken."""
        sp = str(player)
        placed = 0
        for row in range(WINDOW_ROWS):
            if placed >= count:
                break
            if self._can_place(player, col, row, color):
                self.windows[sp][col][row] = color
                placed += 1
        # Overflow to broken
        overflow = count - placed
        for _ in range(overflow):
            self.broken[sp].append(color)

    def _score_round(self, player):
        """Score completed columns and adjacency."""
        sp = str(player)
        points = 0
        for col in range(WINDOW_COLS):
            if all(self.windows[sp][col][r] is not None
                   for r in range(WINDOW_ROWS)):
                points += 4 + col  # 4-8 points per column

        # Summer mode: bonus for color sets
        if self.summer_mode:
            for color in COLORS:
                count = sum(
                    1 for c in range(WINDOW_COLS)
                    for r in range(WINDOW_ROWS)
                    if self.windows[sp][c][r] == color
                )
                if count >= 4:
                    points += 3

        # Penalty for broken pieces
        penalty_values = [0, 1, 2, 4, 6, 8, 11, 14]
        broken_count = len(self.broken[sp])
        penalty = penalty_values[min(broken_count, 7)]
        points -= penalty
        self.broken[sp] = []
        return max(0, points)

    def _is_round_over(self):
        """Round ends when all factories and center are empty."""
        if self.center:
            return False
        for f in self.factories:
            if f:
                return False
        return True

    def _calc_final_score(self, player):
        """Calculate final game score."""
        sp = str(player)
        score = self.score[sp]
        # Bonus for each complete column
        for col in range(WINDOW_COLS):
            if all(self.windows[sp][col][r] is not None
                   for r in range(WINDOW_ROWS)):
                score += 2  # end-game column bonus
        # Bonus for each complete row
        for row in range(WINDOW_ROWS):
            if all(self.windows[sp][col][row] is not None
                   for col in range(WINDOW_COLS)):
                score += 3  # row bonus
        # Bonus for each color with 5+ placed
        for color in COLORS:
            count = sum(
                1 for c in range(WINDOW_COLS)
                for r in range(WINDOW_ROWS)
                if self.windows[sp][c][r] == color
            )
            if count >= 5:
                score += 5
        return score

    def display(self):
        clear_screen()
        variant = "Summer Pavilion" if self.summer_mode else "Standard"
        print(f"{'=' * 65}")
        print(f"  AZUL: STAINED GLASS - {variant} | Round {self.round_number}")
        print(f"{'=' * 65}")

        # Factories
        print("\n  Factories:")
        for i, f in enumerate(self.factories):
            tiles = " ".join(COLOR_SYM[c] for c in f) if f else "(empty)"
            print(f"    [{i+1}] {tiles}")
        center_str = " ".join(COLOR_SYM[c] for c in self.center) if self.center else "(empty)"
        fp = " +1st" if not self.first_player_taken else ""
        print(f"    [0] Center: {center_str}{fp}")

        for p in [1, 2]:
            sp = str(p)
            marker = " << your turn" if p == self.current_player else ""
            print(f"\n  {self.players[p-1]} | Score: {self.score[sp]} | "
                  f"Broken: {len(self.broken[sp])}{marker}")
            # Window display
            header = "    Col: " + "  ".join(f" {c+1}" for c in range(WINDOW_COLS))
            print(header)
            for row in range(WINDOW_ROWS):
                cells = []
                for col in range(WINDOW_COLS):
                    placed = self.windows[sp][col][row]
                    if placed:
                        cells.append(f" {COLOR_SYM[placed]} ")
                    else:
                        required = self._get_pattern(col, row)
                        if required:
                            cells.append(f"({COLOR_SYM[required]})")
                        else:
                            cells.append(" . ")
                print(f"    R{row+1}: " + " ".join(cells))
            if self.broken[sp]:
                br = " ".join(COLOR_SYM[c] for c in self.broken[sp])
                print(f"    Broken: {br}")

        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if self.phase == "draft":
            print(f"  {self.players[cp-1]}, pick tiles.")
            print(f"  Choose a factory (1-{NUM_FACTORIES}) or center (0):")
            src = input_with_quit("  Source: ").strip()
            try:
                si = int(src)
            except ValueError:
                return None

            if si == 0:
                # Center
                if not self.center:
                    print("  Center is empty!")
                    return None
                available_colors = list(set(self.center))
                print(f"  Colors in center: {', '.join(available_colors)}")
                color = input_with_quit("  Pick which color? ").strip().title()
                if color not in available_colors:
                    return None
            else:
                fi = si - 1
                if fi < 0 or fi >= len(self.factories) or not self.factories[fi]:
                    return None
                available_colors = list(set(self.factories[fi]))
                print(f"  Colors: {', '.join(available_colors)}")
                color = input_with_quit("  Pick which color? ").strip().title()
                if color not in available_colors:
                    return None

            # Choose column
            valid_cols = self._valid_columns_for_color(cp, color)
            if not valid_cols:
                print(f"  No valid column for {color}. All go to broken.")
                return {"action": "draft", "source": si, "color": color,
                        "column": -1}

            print(f"  Valid columns: {', '.join(str(c+1) for c in valid_cols)}")
            col = input_with_quit("  Column (or 0 for broken): ").strip()
            try:
                ci = int(col) - 1
                if ci == -1 or ci in valid_cols:
                    return {"action": "draft", "source": si, "color": color,
                            "column": ci}
            except ValueError:
                pass
            return None

        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move.get("action")

        if action == "draft":
            source = move["source"]
            color = move["color"]
            column = move["column"]

            # Collect tiles
            taken = []
            remainder = []

            if source == 0:
                # From center
                if not self.first_player_taken:
                    self.first_player_taken = True
                    self.first_player_next = cp
                    self.broken[sp].append("first")  # marker penalty
                for c in self.center:
                    if c == color:
                        taken.append(c)
                    else:
                        remainder.append(c)
                self.center = remainder
            else:
                fi = source - 1
                if fi < 0 or fi >= len(self.factories):
                    return False
                factory = self.factories[fi]
                for c in factory:
                    if c == color:
                        taken.append(c)
                    else:
                        remainder.append(c)
                self.factories[fi] = []
                self.center.extend(remainder)

            if not taken:
                return False

            count = len(taken)
            if column >= 0:
                self._place_in_column(cp, column, color, count)
                self.log.append(
                    f"{self.players[cp-1]} took {count} {color} "
                    f"-> col {column+1}")
            else:
                for t in taken:
                    self.broken[sp].append(t)
                self.log.append(
                    f"{self.players[cp-1]} took {count} {color} -> broken")

            return True

        return False

    def check_game_over(self):
        if not self._is_round_over():
            return

        # Score the round
        for p in [1, 2]:
            pts = self._score_round(p)
            self.score[str(p)] += pts

        # Check if game is over (6 rounds or bag empty)
        if self.round_number >= 6 or not self.bag:
            self.game_over = True
            s1 = self._calc_final_score(1)
            s2 = self._calc_final_score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
            self.log.append(f"Final: {self.players[0]}={s1}, "
                            f"{self.players[1]}={s2}")
        else:
            # New round
            self.round_number += 1
            self.current_player = self.first_player_next
            self._fill_factories()
            self.log.append(f"Round {self.round_number} begins!")

    def get_state(self):
        return {
            "bag": self.bag,
            "factories": self.factories,
            "center": self.center,
            "windows": self.windows,
            "glazier": self.glazier,
            "broken": self.broken,
            "score": self.score,
            "round_number": self.round_number,
            "first_player_taken": self.first_player_taken,
            "first_player_next": self.first_player_next,
            "phase": self.phase,
            "log": self.log,
        }

    def load_state(self, state):
        self.bag = state["bag"]
        self.factories = state["factories"]
        self.center = state["center"]
        self.windows = state["windows"]
        self.glazier = state["glazier"]
        self.broken = state["broken"]
        self.score = state["score"]
        self.round_number = state["round_number"]
        self.first_player_taken = state["first_player_taken"]
        self.first_player_next = state["first_player_next"]
        self.phase = state["phase"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  AZUL: STAINED GLASS OF SINTRA - Tutorial
============================================================

  OVERVIEW:
  Draft colored glass tiles from shared factories to fill
  your stained glass window. Score for completed columns,
  rows, and color collections.

  SETUP:
  - 5 factories, each with 4 random tiles
  - A shared center pool (starts empty)
  - Each player has a 5x4 window grid

  DRAFTING:
  - Pick ALL tiles of ONE color from a factory or center
  - Remaining factory tiles go to the center
  - First to take from center gets a penalty marker
    but goes first next round

  PLACING:
  - Place drafted tiles into one column of your window
  - Standard mode: cells require specific colors (shown)
  - Summer mode: any color goes anywhere
  - Overflow goes to your broken area (penalty)

  SCORING PER ROUND:
  - 4-8 points per completed column
  - Summer: +3 for having 4+ of any single color
  - Penalty for broken pieces

  END-GAME BONUSES:
  - +2 per complete column
  - +3 per complete row
  - +5 per color with 5+ tiles placed

  SUMMER PAVILION:
  - No color restrictions on window placement
  - Bonus scoring for color sets of 4+
============================================================
"""
