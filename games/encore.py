"""Encore! - Roll dice, cross off colored squares on your score sheet.

Complete rows and columns for bonus points. Each color has its own
scoring track. Strategic choices about which dice to use.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Standard sheet: 7 columns x 15 rows with colored cells
# Colors: Red (R), Yellow (Y), Blue (B), Green (G), Orange (O)
COLORS = ["Red", "Yellow", "Blue", "Green", "Orange"]
COLOR_ABBREV = {"Red": "R", "Yellow": "Y", "Blue": "B", "Green": "G", "Orange": "O"}

_C = {"R": "Red", "Y": "Yellow", "B": "Blue", "G": "Green", "O": "Orange"}

def _expand(rows):
    return [[_C[ch] for ch in row] for row in rows]

STANDARD_LAYOUT = _expand([
    "RRYYYBB", "RRRYB BB"[:7].replace(" ",""), "ORRYBBG", "OORYB GG"[:7].replace(" ",""),
    "OOOYGGG", "OORYB GG"[:7].replace(" ",""), "ORRYBBG", "RRRYBBB",
    "RRYYYBB", "RYYG GGB"[:7].replace(" ",""), "YYGGGBB", "YGGOO BB"[:7].replace(" ",""),
    "GGOOO BB"[:7].replace(" ",""), "GOORRR B"[:7].replace(" ",""), "OORRRRR",
])
# Fix the layout with explicit strings
STANDARD_LAYOUT = _expand([
    "RRYYYBB", "RRRYBBB", "ORRYBBG", "OORYBGG",
    "OOOYGGG", "OORYBGG", "ORRYBBG", "RRRYBBB",
    "RRYYYBB", "RYYG GGB"[:7], "YYGGGBB", "YGGOOBB",
    "GGOOO BB"[:7], "GOORRR B"[:7], "OORRRRR",
])
STANDARD_LAYOUT = _expand([
    "RRYYYBB", "RRRYBBB", "ORRYBBG", "OORYBGG", "OOOYGGG",
    "OORYBGG", "ORRYBBG", "RRRYBBB", "RRYYYBB", "RYYG GGB"[:7],
    "YYGGGBB", "YGGOOBB", "GGOOBBB"[:7], "GOORRRB", "OORRRRR",
])
# Just define them directly and correctly
STANDARD_LAYOUT = [
    ["Red","Red","Yellow","Yellow","Yellow","Blue","Blue"],
    ["Red","Red","Red","Yellow","Blue","Blue","Blue"],
    ["Orange","Red","Red","Yellow","Blue","Blue","Green"],
    ["Orange","Orange","Red","Yellow","Blue","Green","Green"],
    ["Orange","Orange","Orange","Yellow","Green","Green","Green"],
    ["Orange","Orange","Red","Yellow","Blue","Green","Green"],
    ["Orange","Red","Red","Yellow","Blue","Blue","Green"],
    ["Red","Red","Red","Yellow","Blue","Blue","Blue"],
    ["Red","Red","Yellow","Yellow","Yellow","Blue","Blue"],
    ["Red","Yellow","Yellow","Green","Green","Green","Blue"],
    ["Yellow","Yellow","Green","Green","Green","Blue","Blue"],
    ["Yellow","Green","Green","Orange","Orange","Blue","Blue"],
    ["Green","Green","Orange","Orange","Orange","Blue","Blue"],
    ["Green","Orange","Orange","Red","Red","Red","Blue"],
    ["Orange","Orange","Red","Red","Red","Red","Red"],
]
SECOND_LAYOUT = [
    ["Blue","Blue","Green","Green","Green","Red","Red"],
    ["Blue","Blue","Blue","Green","Red","Red","Red"],
    ["Yellow","Blue","Blue","Green","Red","Red","Orange"],
    ["Yellow","Yellow","Blue","Green","Red","Orange","Orange"],
    ["Yellow","Yellow","Yellow","Green","Orange","Orange","Orange"],
    ["Yellow","Yellow","Red","Green","Blue","Orange","Orange"],
    ["Yellow","Red","Red","Green","Blue","Blue","Orange"],
    ["Red","Red","Red","Green","Blue","Blue","Blue"],
    ["Red","Red","Green","Green","Green","Blue","Blue"],
    ["Red","Green","Green","Orange","Orange","Orange","Blue"],
    ["Green","Green","Orange","Orange","Orange","Blue","Blue"],
    ["Green","Orange","Orange","Yellow","Yellow","Blue","Blue"],
    ["Orange","Orange","Yellow","Yellow","Yellow","Blue","Blue"],
    ["Orange","Yellow","Yellow","Red","Red","Red","Blue"],
    ["Yellow","Yellow","Red","Red","Red","Red","Red"],
]

ROWS = 15
COLS = 7

# Column completion bonus points
COL_BONUSES = [5, 3, 3, 5, 3, 3, 5]

# Row completion: first player to complete gets higher bonus
ROW_BONUS_FIRST = [0] * ROWS  # row completion just counts for color scoring

# Color scoring: points for number of X's in that color
COLOR_SCORE_TABLE = {
    # crosses: points
    0: 0, 1: 1, 2: 3, 3: 6, 4: 10, 5: 15, 6: 21, 7: 28, 8: 36,
    9: 45, 10: 55, 11: 66, 12: 78, 13: 91, 14: 105, 15: 120,
    16: 136, 17: 153, 18: 171, 19: 190, 20: 210, 21: 231,
}

# Star bonus: completing a column gives a star; stars score
STAR_SCORES = [0, 0, 2, 4, 6, 9, 12, 16]

# Number dice: 1-6
# Color dice: one of the 5 colors


class EncoreGame(BaseGame):
    """Encore! - Dice rolling and sheet crossing game."""

    name = "Encore!"
    description = "Roll dice, cross off colored squares to complete rows and columns"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Encore",
        "second": "Encore! Second Edition",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.second_ed = (self.variation == "second")
        self.layout = SECOND_LAYOUT if self.second_ed else STANDARD_LAYOUT
        # Player sheets: True = crossed off
        self.sheets = {}
        self.scores = {"1": 0, "2": 0}
        self.number_dice = []  # 2 number dice results
        self.color_dice = []  # 3 color dice results
        self.round_number = 0
        self.max_rounds = 30
        self.phase = "roll"  # roll, active_choose, passive_choose, round_end
        self.active_player = 1
        self.jokers = {"1": 8, "2": 8}  # wildcard uses
        self.completed_cols = {"1": set(), "2": set()}
        self.completed_rows = {"1": set(), "2": set()}
        self.log = []

    def setup(self):
        self.sheets = {
            "1": [[False] * COLS for _ in range(ROWS)],
            "2": [[False] * COLS for _ in range(ROWS)],
        }
        self.scores = {"1": 0, "2": 0}
        self.round_number = 0
        self.phase = "roll"
        self.active_player = 1
        self.current_player = 1
        self.jokers = {"1": 8, "2": 8}
        self.completed_cols = {"1": set(), "2": set()}
        self.completed_rows = {"1": set(), "2": set()}
        self.log = ["Encore! begins!"]

    def _roll_dice(self):
        self.number_dice = [random.randint(1, 6), random.randint(1, 6)]
        self.color_dice = [random.choice(COLORS) for _ in range(3)]

    def _get_valid_crosses(self, player, color, count):
        """Find all valid sets of 'count' adjacent cells of 'color' to cross."""
        sp = str(player)
        sheet = self.sheets[sp]
        valid = []
        # Find groups of 'count' horizontally adjacent uncrossed cells of the right color
        for r in range(ROWS):
            for c in range(COLS - count + 1):
                cells = []
                ok = True
                for i in range(count):
                    if self.layout[r][c + i] == color and not sheet[r][c + i]:
                        cells.append((r, c + i))
                    else:
                        ok = False
                        break
                if ok and len(cells) == count:
                    valid.append(cells)
        # Also vertical adjacent
        for c in range(COLS):
            for r in range(ROWS - count + 1):
                cells = []
                ok = True
                for i in range(count):
                    if self.layout[r + i][c] == color and not sheet[r + i][c]:
                        cells.append((r + i, c))
                    else:
                        ok = False
                        break
                if ok and len(cells) == count:
                    valid.append(cells)
        return valid

    def _cross_cells(self, player, cells):
        """Cross off specific cells."""
        sp = str(player)
        for r, c in cells:
            self.sheets[sp][r][c] = True
        # Check row/column completion
        for r in range(ROWS):
            if r not in self.completed_rows[sp]:
                if all(self.sheets[sp][r][c] for c in range(COLS)):
                    self.completed_rows[sp].add(r)
        for c in range(COLS):
            if c not in self.completed_cols[sp]:
                if all(self.sheets[sp][r][c] for r in range(ROWS)):
                    self.completed_cols[sp].add(c)

    def _calc_score(self, player):
        """Calculate total score for a player."""
        sp = str(player)
        sheet = self.sheets[sp]
        total = 0

        # Color scoring
        for color in COLORS:
            count = 0
            for r in range(ROWS):
                for c in range(COLS):
                    if self.layout[r][c] == color and sheet[r][c]:
                        count += 1
            total += COLOR_SCORE_TABLE.get(count, count * 10)

        # Column bonuses
        for c in self.completed_cols[sp]:
            total += COL_BONUSES[c]

        # Completed rows bonus (1 pt per completed row)
        total += len(self.completed_rows[sp]) * 2

        # Joker penalty: -2 per unused joker... actually no penalty, just bonus for using them
        return total

    def display(self):
        clear_screen()
        edition = "Second Edition" if self.second_ed else "Standard"
        print(f"{'=' * 65}")
        print(f"  ENCORE! - {edition} | Round {self.round_number}/{self.max_rounds}")
        print(f"{'=' * 65}")

        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            active = " (Active)" if p == self.active_player else " (Passive)"
            score = self._calc_score(p)
            print(f"  {self.players[p-1]}{active}: Score={score} | "
                  f"Jokers={self.jokers[sp]}{marker}")
            sheet = self.sheets[sp]
            # Column headers
            col_header = "       " + "  ".join(f"C{c}" for c in range(COLS))
            print(col_header)
            bonus_str = "       " + "  ".join(f"{COL_BONUSES[c]:2d}" for c in range(COLS))
            print(f"  Bonus:{bonus_str[7:]}")
            for r in range(ROWS):
                row_s = f"  R{r:2d}  "
                for c in range(COLS):
                    color = self.layout[r][c]
                    abbrev = COLOR_ABBREV[color]
                    if sheet[r][c]:
                        row_s += " X "
                    else:
                        row_s += f" {abbrev} "
                complete = " *" if r in self.completed_rows[sp] else ""
                row_s += complete
                print(row_s)
            # Column completion markers
            comp_str = "       "
            for c in range(COLS):
                comp_str += " * " if c in self.completed_cols[sp] else " . "
            print(comp_str)
            print()

        # Dice
        if self.number_dice:
            nums = ", ".join(str(d) for d in self.number_dice)
            cols = ", ".join(self.color_dice)
            print(f"  Number dice: [{nums}]  Color dice: [{cols}]")
            # Show valid combos
            combos = self._get_combos()
            if combos:
                print(f"  Valid combos: color + number = cross that many adjacent cells")
                for i, (color, count) in enumerate(combos):
                    print(f"    [{i+1}] {color} x {count}")
        print()
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def _get_combos(self):
        """Get all color+number combinations from current dice."""
        combos = set()
        for color in self.color_dice:
            for num in self.number_dice:
                combos.add((color, num))
        return sorted(combos)

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if self.phase == "roll":
            input_with_quit("  Press Enter to roll dice...")
            return {"action": "roll"}

        elif self.phase in ("active_choose", "passive_choose"):
            is_active = (cp == self.active_player)
            role = "Active" if is_active else "Passive"
            print(f"  {self.players[cp-1]} ({role}), choose a combo to cross off cells.")

            combos = self._get_combos()
            if not is_active:
                # Passive player can only use one number die + one color die
                pass  # same combos available

            print("  Choose combo number, or 'j' to use joker, or '0' to pass:")
            val = input_with_quit("  Choice: ").strip().lower()

            if val == '0':
                return {"action": "pass"}
            if val == 'j' and self.jokers[sp] > 0:
                print("  Joker: choose any color and any number (1-6).")
                jc = input_with_quit("  Color (R/Y/B/G/O): ").strip().upper()
                color_map = {"R": "Red", "Y": "Yellow", "B": "Blue",
                             "G": "Green", "O": "Orange"}
                if jc not in color_map:
                    return None
                jn = input_with_quit("  Number (1-6): ").strip()
                try:
                    num = int(jn)
                    if 1 <= num <= 6:
                        return {"action": "joker", "color": color_map[jc], "count": num}
                except ValueError:
                    pass
                return None

            try:
                idx = int(val) - 1
                if 0 <= idx < len(combos):
                    color, count = combos[idx]
                    return {"action": "cross", "color": color, "count": count}
            except ValueError:
                pass
            return None

        elif self.phase == "place":
            # Player chose a combo, now pick where to place
            return None  # handled inline

        elif self.phase == "round_end":
            input_with_quit("  Press Enter for next round...")
            return {"action": "next_round"}

        return None

    def _choose_placement(self, player, color, count):
        """Let player choose where to place their crosses. Returns True if placed."""
        sp = str(player)
        valid = self._get_valid_crosses(player, color, count)
        if not valid:
            print(f"  No valid placement for {count} {color} cells!")
            input_with_quit("  Press Enter...")
            return False

        print(f"  Choose {count} adjacent {color} cells to cross off:")
        for i, cells in enumerate(valid[:20]):  # limit display
            cell_strs = [f"({r},{c})" for r, c in cells]
            print(f"    [{i+1}] {' '.join(cell_strs)}")
        if len(valid) > 20:
            print(f"    ... and {len(valid) - 20} more options")

        val = input_with_quit("  Choice: ").strip()
        try:
            idx = int(val) - 1
            if 0 <= idx < len(valid):
                self._cross_cells(player, valid[idx])
                return True
        except ValueError:
            pass
        return False

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move["action"]

        if action == "roll":
            self.round_number += 1
            self._roll_dice()
            self.phase = "active_choose"
            self.current_player = self.active_player
            self.log.append(f"Round {self.round_number}: Dice rolled!")
            return True

        if action == "cross":
            color = move["color"]
            count = move["count"]
            valid = self._get_valid_crosses(cp, color, count)
            if not valid:
                self.log.append(f"{self.players[cp-1]} has no valid placement, passing.")
                return self._advance_phase()

            # Auto-place if only one option
            if len(valid) == 1:
                self._cross_cells(cp, valid[0])
                cells_str = " ".join(f"({r},{c})" for r, c in valid[0])
                self.log.append(f"{self.players[cp-1]} crossed {count} {color} at {cells_str}.")
                return self._advance_phase()

            # Show placement options
            print(f"  Choose where to place {count} {color} cells:")
            for i, cells in enumerate(valid[:20]):
                cell_strs = [f"({r},{c})" for r, c in cells]
                print(f"    [{i+1}] {' '.join(cell_strs)}")
            val = input_with_quit("  Choice: ").strip()
            try:
                idx = int(val) - 1
                if 0 <= idx < len(valid):
                    self._cross_cells(cp, valid[idx])
                    cells_str = " ".join(f"({r},{c})" for r, c in valid[idx])
                    self.log.append(
                        f"{self.players[cp-1]} crossed {count} {color} at {cells_str}.")
                    return self._advance_phase()
            except ValueError:
                pass
            return False

        if action == "joker":
            color = move["color"]
            count = move["count"]
            self.jokers[sp] -= 1
            valid = self._get_valid_crosses(cp, color, count)
            if not valid:
                self.log.append(f"{self.players[cp-1]} used joker but no valid placement.")
                return self._advance_phase()
            if len(valid) == 1:
                self._cross_cells(cp, valid[0])
                self.log.append(f"{self.players[cp-1]} used joker: {count} {color}.")
                return self._advance_phase()
            print(f"  Choose where to place {count} {color} cells:")
            for i, cells in enumerate(valid[:20]):
                cell_strs = [f"({r},{c})" for r, c in cells]
                print(f"    [{i+1}] {' '.join(cell_strs)}")
            val = input_with_quit("  Choice: ").strip()
            try:
                idx = int(val) - 1
                if 0 <= idx < len(valid):
                    self._cross_cells(cp, valid[idx])
                    self.log.append(f"{self.players[cp-1]} used joker: {count} {color}.")
                    return self._advance_phase()
            except ValueError:
                pass
            return False

        if action == "pass":
            self.log.append(f"{self.players[cp-1]} passed.")
            return self._advance_phase()

        if action == "next_round":
            if self.round_number >= self.max_rounds:
                self.game_over = True
                return True
            # Switch active player
            self.active_player = 2 if self.active_player == 1 else 1
            self.current_player = self.active_player
            self.phase = "roll"
            return True

        return False

    def _advance_phase(self):
        """Move to next phase after a player chooses."""
        if self.phase == "active_choose":
            # Passive player's turn
            passive = 2 if self.active_player == 1 else 1
            self.current_player = passive
            self.phase = "passive_choose"
            return True
        elif self.phase == "passive_choose":
            self.phase = "round_end"
            self.current_player = self.active_player
            return True
        return True

    def check_game_over(self):
        if self.game_over:
            s1 = self._calc_score(1)
            s2 = self._calc_score(2)
            self.scores = {"1": s1, "2": s2}
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
        # Also check if any player completed all rows
        for p in [1, 2]:
            sp = str(p)
            if len(self.completed_rows[sp]) >= ROWS:
                self.game_over = True
                s1 = self._calc_score(1)
                s2 = self._calc_score(2)
                if s1 > s2:
                    self.winner = 1
                elif s2 > s1:
                    self.winner = 2
                else:
                    self.winner = None

    def get_state(self):
        return {
            "sheets": self.sheets,
            "scores": self.scores,
            "number_dice": self.number_dice,
            "color_dice": self.color_dice,
            "round_number": self.round_number,
            "phase": self.phase,
            "active_player": self.active_player,
            "jokers": self.jokers,
            "completed_cols": {k: list(v) for k, v in self.completed_cols.items()},
            "completed_rows": {k: list(v) for k, v in self.completed_rows.items()},
            "log": self.log,
        }

    def load_state(self, state):
        self.sheets = state["sheets"]
        self.scores = state["scores"]
        self.number_dice = state["number_dice"]
        self.color_dice = state["color_dice"]
        self.round_number = state["round_number"]
        self.phase = state["phase"]
        self.active_player = state["active_player"]
        self.jokers = state["jokers"]
        self.completed_cols = {k: set(v) for k, v in state["completed_cols"].items()}
        self.completed_rows = {k: set(v) for k, v in state["completed_rows"].items()}
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  ENCORE! - Tutorial
============================================================

  OVERVIEW:
  Roll dice and cross off colored squares on your score sheet.
  Complete rows and columns for bonus points. Each color has
  its own scoring track.

  DICE:
  - 2 Number dice (1-6): determine HOW MANY cells to cross
  - 3 Color dice: determine WHICH color to cross

  EACH ROUND:
  1. Active player rolls all 5 dice
  2. Active player picks one color + one number combo
     and crosses off that many adjacent cells of that color
  3. Passive player also picks a combo and crosses off cells

  CROSSING RULES:
  - Must cross off cells in a straight line (horizontal or vertical)
  - All cells must be adjacent and the same color
  - Cannot cross already-crossed cells

  JOKERS:
  - Each player starts with 8 jokers
  - Use a joker to pick ANY color and ANY number (1-6)

  SCORING:
  - Each color: more crosses = exponentially more points
    (1=1, 2=3, 3=6, 4=10, 5=15, ...)
  - Column completion: bonus points (5/3/3/5/3/3/5)
  - Row completion: 2 bonus points each

  WINNING: After 30 rounds (or a player completes all rows),
  highest score wins!
============================================================
"""
