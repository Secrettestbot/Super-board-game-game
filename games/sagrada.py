"""Sagrada - A dice-drafting stained glass window game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


COLORS = ["R", "Y", "B", "G", "P"]  # Red, Yellow, Blue, Green, Purple
COLOR_NAMES = {"R": "Red", "Y": "Yellow", "B": "Blue", "G": "Green", "P": "Purple"}

# Window pattern cards define constraints on specific cells
# Each pattern is a 4x5 grid where each cell is either:
#   None (no constraint), a color letter, or a digit 1-6
STANDARD_PATTERNS = [
    {
        "name": "Virtus",
        "difficulty": 5,
        "grid": [
            [4, None, "G", None, None],
            [None, None, None, 5, "G"],
            [None, None, None, None, None],
            [None, "G", None, 3, None],
        ],
    },
    {
        "name": "Lux Astram",
        "difficulty": 5,
        "grid": [
            [None, "P", None, None, None],
            [5, None, None, "P", None],
            [None, None, 6, None, "P"],
            [None, None, None, None, 4],
        ],
    },
    {
        "name": "Firmitas",
        "difficulty": 5,
        "grid": [
            [None, None, "R", None, None],
            [None, 4, None, "R", None],
            [None, None, None, None, 5],
            ["R", None, None, None, None],
        ],
    },
    {
        "name": "Chromatic",
        "difficulty": 4,
        "grid": [
            [None, None, None, None, None],
            [None, None, None, None, None],
            ["R", "Y", "B", "G", "P"],
            [None, None, None, None, None],
        ],
    },
]

BEGINNER_PATTERNS = [
    {
        "name": "Dawn",
        "difficulty": 3,
        "grid": [
            [None, None, None, None, None],
            [None, None, None, None, None],
            [None, None, None, None, None],
            [None, None, None, None, None],
        ],
    },
    {
        "name": "Sunrise",
        "difficulty": 3,
        "grid": [
            [None, None, None, None, None],
            [None, "Y", None, None, None],
            [None, None, None, None, None],
            [None, None, None, None, None],
        ],
    },
]

# Public objectives
PUBLIC_OBJECTIVES = [
    {"name": "Row Color Variety", "desc": "5 pts per row with no repeated colors",
     "id": "row_color"},
    {"name": "Column Color Variety", "desc": "4 pts per column with no repeated colors",
     "id": "col_color"},
    {"name": "Row Shade Variety", "desc": "5 pts per row with no repeated values",
     "id": "row_shade"},
    {"name": "Column Shade Variety", "desc": "4 pts per column with no repeated values",
     "id": "col_shade"},
    {"name": "Light Shades", "desc": "Sets of 1 & 2 values (2 pts per set)",
     "id": "light_shades"},
    {"name": "Dark Shades", "desc": "Sets of 5 & 6 values (2 pts per set)",
     "id": "dark_shades"},
    {"name": "Color Diagonals", "desc": "Count of dice sharing color with diagonal neighbor",
     "id": "color_diag"},
]

# Private objectives: score sum of values of dice of a specific color
PRIVATE_COLORS = ["R", "Y", "B", "G", "P"]


def roll_dice(count):
    """Roll count dice, each with a random color and value 1-6."""
    dice = []
    for _ in range(count):
        color = random.choice(COLORS)
        value = random.randint(1, 6)
        dice.append({"color": color, "value": value})
    return dice


class SagradaGame(BaseGame):
    """Sagrada: Draft dice to build a stained glass window."""

    name = "Sagrada"
    description = "A dice-drafting stained glass window game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Sagrada (pattern constraints, full scoring)",
        "beginner": "Beginner mode (open patterns, simplified objectives)",
    }

    ROWS = 4
    COLS = 5

    def __init__(self, variation=None):
        super().__init__(variation)
        # Player windows: 4x5 grids, each cell is None or {"color": str, "value": int}
        self.windows = [
            [[None for _ in range(self.COLS)] for _ in range(self.ROWS)]
            for _ in range(2)
        ]
        # Pattern constraints for each player
        self.patterns = [None, None]
        self.pattern_names = ["", ""]
        self.favor_tokens = [0, 0]  # from pattern difficulty
        # Dice pool for current round
        self.draft_pool = []
        self.round_number = 0
        self.max_rounds = 10
        self.turn_in_round = 0  # 0-3: P1, P2, P2, P1 (snake draft)
        self.public_objectives = []
        self.private_objectives = [None, None]  # color for each player
        self.scores = [0, 0]
        self.passed_this_round = [False, False]

    def setup(self):
        """Initialize the game."""
        # Select patterns for each player
        if self.variation == "beginner":
            patterns = list(BEGINNER_PATTERNS)
        else:
            patterns = list(STANDARD_PATTERNS)
        random.shuffle(patterns)

        for p in range(2):
            pat = patterns[p % len(patterns)]
            self.patterns[p] = [row[:] for row in pat["grid"]]
            self.pattern_names[p] = pat["name"]
            self.favor_tokens[p] = pat["difficulty"]

        # Select public objectives (2 for standard, 1 for beginner)
        obj_pool = list(PUBLIC_OBJECTIVES)
        random.shuffle(obj_pool)
        if self.variation == "beginner":
            self.public_objectives = [obj_pool[0]]
        else:
            self.public_objectives = obj_pool[:2]

        # Assign private objectives
        priv_colors = list(PRIVATE_COLORS)
        random.shuffle(priv_colors)
        self.private_objectives = [priv_colors[0], priv_colors[1]]

        self.round_number = 0
        self.scores = [0, 0]
        self._start_new_round()

    def _start_new_round(self):
        """Start a new round by rolling dice."""
        self.round_number += 1
        # Roll 2*players + 1 = 5 dice
        num_dice = 5
        self.draft_pool = roll_dice(num_dice)
        self.turn_in_round = 0
        self.passed_this_round = [False, False]

    def _current_drafter(self):
        """Return player index (0 or 1) for current turn in snake draft."""
        # Snake draft: P1, P2, P2, P1
        order = [0, 1, 1, 0]
        if self.turn_in_round < len(order):
            return order[self.turn_in_round]
        return 0

    def display(self):
        """Display the game state."""
        var_label = "Standard" if self.variation != "beginner" else "Beginner"
        print(f"\n  === Sagrada ({var_label}) === Round {self.round_number}/{self.max_rounds}")

        # Public objectives
        print("  Public Objectives:")
        for obj in self.public_objectives:
            print(f"    - {obj['name']}: {obj['desc']}")

        # Draft pool
        print("\n  --- Draft Pool ---")
        if self.draft_pool:
            for i, die in enumerate(self.draft_pool):
                print(f"  Die {i + 1}: {die['color']}{die['value']}", end="  ")
            print()
        else:
            print("  (empty)")

        drafter = self._current_drafter()
        print(f"\n  Current drafter: {self.players[drafter]}")
        print(f"  Turn {self.turn_in_round + 1}/4 in round (snake: P1,P2,P2,P1)")

        # Display both windows
        for p in range(2):
            self._display_window(p)

    def _display_window(self, p):
        """Display one player's window."""
        priv_color = self.private_objectives[p]
        print(f"\n  --- {self.players[p]}'s Window: \"{self.pattern_names[p]}\" ---")
        print(f"  Private objective: {COLOR_NAMES[priv_color]} ({priv_color})")
        print(f"  Favor tokens: {self.favor_tokens[p]}")
        print(f"       1    2    3    4    5")
        for r in range(self.ROWS):
            row_str = f"  {r + 1}:  "
            for c in range(self.COLS):
                cell = self.windows[p][r][c]
                constraint = self.patterns[p][r][c]
                if cell:
                    # Show placed die
                    row_str += f"[{cell['color']}{cell['value']}] "
                elif constraint:
                    # Show constraint
                    row_str += f"({constraint:>2}) "
                else:
                    row_str += " ..  "
            print(row_str)

    def _is_valid_placement(self, p, row, col, die):
        """Check if placing a die at (row, col) is valid."""
        # Cell must be empty
        if self.windows[p][row][col] is not None:
            return False

        # Check pattern constraint
        constraint = self.patterns[p][row][col]
        if constraint is not None:
            if isinstance(constraint, int):
                if die["value"] != constraint:
                    return False
            elif isinstance(constraint, str):
                if die["color"] != constraint:
                    return False

        # First die must be on edge or corner
        has_any_die = any(
            self.windows[p][r][c] is not None
            for r in range(self.ROWS) for c in range(self.COLS)
        )
        if not has_any_die:
            if row > 0 and row < self.ROWS - 1 and col > 0 and col < self.COLS - 1:
                return False
            return True

        # Must be adjacent (orthogonal or diagonal) to at least one die
        has_neighbor = False
        for dr in [-1, 0, 1]:
            for dc in [-1, 0, 1]:
                if dr == 0 and dc == 0:
                    continue
                nr, nc = row + dr, col + dc
                if 0 <= nr < self.ROWS and 0 <= nc < self.COLS:
                    if self.windows[p][nr][nc] is not None:
                        has_neighbor = True
        if not has_neighbor:
            return False

        # Orthogonal adjacency constraint: no same color or same value
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = row + dr, col + dc
            if 0 <= nr < self.ROWS and 0 <= nc < self.COLS:
                adj = self.windows[p][nr][nc]
                if adj is not None:
                    if adj["color"] == die["color"]:
                        return False
                    if adj["value"] == die["value"]:
                        return False

        return True

    def _has_valid_placement(self, p):
        """Check if player p can place any die from the pool."""
        for die in self.draft_pool:
            for r in range(self.ROWS):
                for c in range(self.COLS):
                    if self._is_valid_placement(p, r, c, die):
                        return True
        return False

    def get_move(self):
        """Get move from current drafter."""
        p = self._current_drafter()
        self.current_player = p + 1

        if not self._has_valid_placement(p):
            print(f"\n  {self.players[p]} has no valid placements. Auto-passing.")
            input_with_quit("  Press Enter to continue...")
            return "pass"

        print(f"\n  {self.players[p]}, draft a die and place it.")
        print("  Format: die_num row col")
        print("  e.g. '2 1 3' = take die 2, place at row 1 col 3")
        print("  Type 'pass' to skip your turn.")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        p = self._current_drafter()

        if move.lower() == "pass":
            self.passed_this_round[p] = True
            self._advance_turn()
            return True

        try:
            parts = move.split()
            if len(parts) != 3:
                return False
            die_idx = int(parts[0]) - 1
            row = int(parts[1]) - 1
            col = int(parts[2]) - 1
        except (ValueError, IndexError):
            return False

        # Validate
        if die_idx < 0 or die_idx >= len(self.draft_pool):
            return False
        if row < 0 or row >= self.ROWS or col < 0 or col >= self.COLS:
            return False

        die = self.draft_pool[die_idx]
        if not self._is_valid_placement(p, row, col, die):
            print("  Invalid placement! Check constraints and adjacency rules.")
            return False

        # Place the die
        self.windows[p][row][col] = {"color": die["color"], "value": die["value"]}
        self.draft_pool.pop(die_idx)

        self._advance_turn()
        return True

    def _advance_turn(self):
        """Advance to next turn in round or next round."""
        self.turn_in_round += 1
        if self.turn_in_round >= 4 or not self.draft_pool:
            # Round over
            if self.round_number >= self.max_rounds:
                self._final_scoring()
            else:
                self._start_new_round()

    def _final_scoring(self):
        """Calculate final scores."""
        for p in range(2):
            score = 0

            # Public objectives
            for obj in self.public_objectives:
                score += self._score_objective(p, obj["id"])

            # Private objective: sum of values of dice matching private color
            priv_color = self.private_objectives[p]
            for r in range(self.ROWS):
                for c in range(self.COLS):
                    cell = self.windows[p][r][c]
                    if cell and cell["color"] == priv_color:
                        score += cell["value"]

            # Remaining favor tokens: +1 each
            score += self.favor_tokens[p]

            # Penalty: -1 per empty cell
            for r in range(self.ROWS):
                for c in range(self.COLS):
                    if self.windows[p][r][c] is None:
                        score -= 1

            self.scores[p] = max(0, score)

        self.game_over = True
        if self.scores[0] > self.scores[1]:
            self.winner = 1
        elif self.scores[1] > self.scores[0]:
            self.winner = 2
        else:
            self.winner = None

    def _score_objective(self, p, obj_id):
        """Score a public objective for a player."""
        window = self.windows[p]

        if obj_id == "row_color":
            score = 0
            for r in range(self.ROWS):
                colors = []
                full = True
                for c in range(self.COLS):
                    if window[r][c]:
                        colors.append(window[r][c]["color"])
                    else:
                        full = False
                if full and len(set(colors)) == len(colors):
                    score += 5
            return score

        elif obj_id == "col_color":
            score = 0
            for c in range(self.COLS):
                colors = []
                full = True
                for r in range(self.ROWS):
                    if window[r][c]:
                        colors.append(window[r][c]["color"])
                    else:
                        full = False
                if full and len(set(colors)) == len(colors):
                    score += 4
            return score

        elif obj_id == "row_shade":
            score = 0
            for r in range(self.ROWS):
                values = []
                full = True
                for c in range(self.COLS):
                    if window[r][c]:
                        values.append(window[r][c]["value"])
                    else:
                        full = False
                if full and len(set(values)) == len(values):
                    score += 5
            return score

        elif obj_id == "col_shade":
            score = 0
            for c in range(self.COLS):
                values = []
                full = True
                for r in range(self.ROWS):
                    if window[r][c]:
                        values.append(window[r][c]["value"])
                    else:
                        full = False
                if full and len(set(values)) == len(values):
                    score += 4
            return score

        elif obj_id == "light_shades":
            ones = sum(1 for r in range(self.ROWS) for c in range(self.COLS)
                       if window[r][c] and window[r][c]["value"] == 1)
            twos = sum(1 for r in range(self.ROWS) for c in range(self.COLS)
                       if window[r][c] and window[r][c]["value"] == 2)
            return min(ones, twos) * 2

        elif obj_id == "dark_shades":
            fives = sum(1 for r in range(self.ROWS) for c in range(self.COLS)
                        if window[r][c] and window[r][c]["value"] == 5)
            sixes = sum(1 for r in range(self.ROWS) for c in range(self.COLS)
                        if window[r][c] and window[r][c]["value"] == 6)
            return min(fives, sixes) * 2

        elif obj_id == "color_diag":
            count = 0
            for r in range(self.ROWS):
                for c in range(self.COLS):
                    if not window[r][c]:
                        continue
                    color = window[r][c]["color"]
                    for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < self.ROWS and 0 <= nc < self.COLS:
                            if window[nr][nc] and window[nr][nc]["color"] == color:
                                count += 1
                                break  # only count this die once
            return count

        return 0

    def check_game_over(self):
        """Game over is handled in _advance_turn. No-op here."""
        pass

    def get_state(self):
        """Return serializable game state."""
        return {
            "windows": [
                [
                    [cell if cell else None for cell in row]
                    for row in self.windows[p]
                ]
                for p in range(2)
            ],
            "patterns": [
                [list(row) for row in self.patterns[p]]
                for p in range(2)
            ],
            "pattern_names": list(self.pattern_names),
            "favor_tokens": list(self.favor_tokens),
            "draft_pool": list(self.draft_pool),
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "turn_in_round": self.turn_in_round,
            "public_objectives": [{"name": o["name"], "desc": o["desc"], "id": o["id"]}
                                  for o in self.public_objectives],
            "private_objectives": list(self.private_objectives),
            "scores": list(self.scores),
            "passed_this_round": list(self.passed_this_round),
        }

    def load_state(self, state):
        """Restore game state."""
        self.windows = [
            [
                [cell if cell else None for cell in row]
                for row in state["windows"][p]
            ]
            for p in range(2)
        ]
        self.patterns = [
            [list(row) for row in state["patterns"][p]]
            for p in range(2)
        ]
        self.pattern_names = list(state["pattern_names"])
        self.favor_tokens = list(state["favor_tokens"])
        self.draft_pool = list(state["draft_pool"])
        self.round_number = state["round_number"]
        self.max_rounds = state["max_rounds"]
        self.turn_in_round = state["turn_in_round"]
        self.public_objectives = list(state["public_objectives"])
        self.private_objectives = list(state["private_objectives"])
        self.scores = list(state["scores"])
        self.passed_this_round = list(state["passed_this_round"])

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==================================================
  Sagrada - Tutorial
==================================================

  OVERVIEW:
  In Sagrada, you draft colored dice and place them
  on your 4x5 window grid to build a stained glass
  masterpiece. Follow placement rules and score
  points from objectives.

  DICE:
  Each die has a color (R/Y/B/G/P) and a value (1-6).
  Shown as "R3" = Red 3, "B5" = Blue 5, etc.

  WINDOW PATTERN:
  Your window has constraints shown in parentheses:
  - A number (e.g., "4") means only that value
  - A letter (e.g., "G") means only that color
  - ".." means no constraint

  PLACEMENT RULES:
  1. First die must go on an edge/corner cell.
  2. Each subsequent die must be adjacent (including
     diagonally) to at least one existing die.
  3. No two orthogonally adjacent dice may share
     the same COLOR.
  4. No two orthogonally adjacent dice may share
     the same VALUE.
  5. Die must satisfy any pattern constraint on
     the cell.

  DRAFTING:
  Each round, 5 dice are rolled. Players draft in
  snake order: P1, P2, P2, P1. Remaining die is
  discarded.

  MOVE FORMAT:
  die_num row col
  - die_num: which die from the pool (1-based)
  - row: row on your window (1-4)
  - col: column on your window (1-5)
  Type 'pass' to skip your turn.

  Example: "2 1 3" = take die #2, place at row 1
  column 3.

  SCORING:
  - Public objectives (shared): various patterns
    of colors and values on your window.
  - Private objective: sum of all values of dice
    matching your secret color.
  - +1 per remaining favor token
  - -1 per empty cell on your window

  GAME LENGTH:
  10 rounds. Highest score wins.

  FAVOR TOKENS:
  Based on your pattern difficulty. Can be spent
  (in a future update) on special tool powers.

==================================================
"""
