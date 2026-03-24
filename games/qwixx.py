"""Qwixx - Dice rolling row-marking game.

Roll 6 colored dice, mark numbers on 4 colored rows. Rows must be marked
left-to-right. Lock rows when reaching the end. Score based on marks per row.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Row definitions: color, numbers, direction
ROWS = [
    {"color": "Red",    "numbers": list(range(2, 13)), "lock_val": 12},
    {"color": "Yellow", "numbers": list(range(2, 13)), "lock_val": 12},
    {"color": "Green",  "numbers": list(range(12, 1, -1)), "lock_val": 2},
    {"color": "Blue",   "numbers": list(range(12, 1, -1)), "lock_val": 2},
]

# Scoring: number of marks -> points
SCORE_TABLE = {0: 0, 1: 1, 2: 3, 3: 6, 4: 10, 5: 15, 6: 21, 7: 28, 8: 36,
               9: 45, 10: 55, 11: 66, 12: 78}

BIG_POINTS_TABLE = {0: 0, 1: 2, 2: 5, 3: 9, 4: 14, 5: 20, 6: 27, 7: 35,
                    8: 44, 9: 54, 10: 65, 11: 77, 12: 90}

COLOR_SYMBOLS = {"Red": "R", "Yellow": "Y", "Green": "G", "Blue": "B"}
DICE_COLORS = ["White1", "White2", "Red", "Yellow", "Green", "Blue"]


class QwixxGame(BaseGame):
    """Qwixx - Fast dice rolling and number marking game."""

    name = "Qwixx"
    description = "Roll dice and mark numbers on colored rows left-to-right"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Qwixx",
        "big_points": "Big Points Variant",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.score_table = BIG_POINTS_TABLE if self.variation == "big_points" else SCORE_TABLE
        # Per-player: marks[row_idx] = list of marked number indices
        self.marks = {}
        self.penalties = {}
        self.locked_rows = []  # indices of locked rows
        self.dice = {}
        self.phase = "roll"  # roll, white_phase, color_phase
        self.active_player = 1  # who rolled
        self.white_sum = 0
        self.white_used = {}  # player -> bool, did they use white combo
        self.color_used = False
        self.log = []
        self.round_number = 0

    def setup(self):
        for p in [1, 2]:
            sp = str(p)
            self.marks[sp] = {i: [] for i in range(4)}
            self.penalties[sp] = 0
        self.locked_rows = []
        self.dice = {}
        self.phase = "roll"
        self.active_player = 1
        self.round_number = 1
        self.white_used = {"1": False, "2": False}
        self.color_used = False
        self.log = ["Game started! Player 1 rolls first."]

    def _roll_dice(self):
        self.dice = {}
        for d in DICE_COLORS:
            self.dice[d] = random.randint(1, 6)

    def _can_mark(self, player, row_idx, number):
        """Check if a player can mark a number on a row."""
        sp = str(player)
        if row_idx in self.locked_rows:
            return False
        row_nums = ROWS[row_idx]["numbers"]
        if number not in row_nums:
            return False
        num_pos = row_nums.index(number)
        marked = self.marks[sp][row_idx]
        if num_pos in marked:
            return False
        # Must be to the right of all existing marks
        if marked and num_pos <= max(marked):
            return False
        # To mark the last number (lock), need at least 5 marks in that row
        if num_pos == len(row_nums) - 1:
            if len(marked) < 5:
                return False
        return True

    def _mark_number(self, player, row_idx, number):
        sp = str(player)
        row_nums = ROWS[row_idx]["numbers"]
        num_pos = row_nums.index(number)
        self.marks[sp][row_idx].append(num_pos)
        self.marks[sp][row_idx].sort()
        # Check if this locks the row
        if num_pos == len(row_nums) - 1:
            self.locked_rows.append(row_idx)
            self.log.append(f"{ROWS[row_idx]['color']} row locked by {self.players[player-1]}!")

    def _get_white_options(self, player):
        """Get valid options for the white dice combination (all players)."""
        white_sum = self.dice["White1"] + self.dice["White2"]
        options = []
        for ri in range(4):
            if self._can_mark(player, ri, white_sum):
                options.append((ri, white_sum))
        return options

    def _get_color_options(self, player):
        """Get valid color dice + white combos for the active player."""
        options = []
        for color in ["Red", "Yellow", "Green", "Blue"]:
            ri = ["Red", "Yellow", "Green", "Blue"].index(color)
            for white in ["White1", "White2"]:
                total = self.dice[color] + self.dice[white]
                if self._can_mark(player, ri, total):
                    if (ri, total) not in options:
                        options.append((ri, total))
        return options

    def _calc_score(self, player):
        sp = str(player)
        total = 0
        for ri in range(4):
            count = len(self.marks[sp][ri])
            # If this player locked the row, add +1 for lock mark
            total += self.score_table.get(count, 0)
        total -= self.penalties[sp] * 5
        return total

    def display(self):
        clear_screen()
        variant_label = "Big Points" if self.variation == "big_points" else "Standard"
        print(f"{'=' * 65}")
        print(f"  QWIXX - {variant_label} | Round {self.round_number}")
        print(f"{'=' * 65}")

        for p in [1, 2]:
            sp = str(p)
            marker = " << ROLLING" if p == self.active_player and self.phase == "roll" else ""
            if p == self.current_player:
                marker += " (your turn)"
            score = self._calc_score(p)
            print(f"\n  {self.players[p-1]} | Score: {score} | Penalties: {self.penalties[sp]}{marker}")
            for ri in range(4):
                row = ROWS[ri]
                locked = ri in self.locked_rows
                lock_str = " [LOCKED]" if locked else ""
                sym = COLOR_SYMBOLS[row["color"]]
                cells = []
                for ni, num in enumerate(row["numbers"]):
                    if ni in self.marks[sp][ri]:
                        cells.append(f"[{num:2d}]")
                    else:
                        cells.append(f" {num:2d} ")
                row_str = " ".join(cells)
                print(f"    {sym}: {row_str}{lock_str}")

        if self.dice:
            print(f"\n  Dice: ", end="")
            for d in DICE_COLORS:
                label = d if len(d) <= 6 else d[:2]
                print(f"{label}={self.dice[d]}  ", end="")
            print(f"\n  White sum: {self.dice['White1'] + self.dice['White2']}")

        print(f"\n  Phase: {self.phase} | Active roller: {self.players[self.active_player-1]}")
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if self.phase == "roll":
            if cp != self.active_player:
                return {"action": "skip_roll"}
            input_with_quit("  Press Enter to roll dice...")
            return {"action": "roll"}

        elif self.phase == "white_phase":
            white_sum = self.dice["White1"] + self.dice["White2"]
            options = self._get_white_options(cp)
            print(f"  {self.players[cp-1]}: White sum is {white_sum}.")
            if options:
                print("  Mark a row with the white sum?")
                for i, (ri, val) in enumerate(options):
                    print(f"    [{i+1}] {ROWS[ri]['color']} row - mark {val}")
                print(f"    [0] Pass")
                choice = input_with_quit("  Choice: ").strip()
                try:
                    idx = int(choice)
                    if idx == 0:
                        return {"action": "white_pass"}
                    if 1 <= idx <= len(options):
                        ri, val = options[idx - 1]
                        return {"action": "white_mark", "row": ri, "number": val}
                except ValueError:
                    pass
                return None
            else:
                print("  No valid white options.")
                input_with_quit("  Press Enter to continue...")
                return {"action": "white_pass"}

        elif self.phase == "color_phase":
            if cp != self.active_player:
                return {"action": "color_skip"}
            options = self._get_color_options(cp)
            if options:
                print(f"  {self.players[cp-1]}: Choose a color+white combo to mark.")
                for i, (ri, val) in enumerate(options):
                    print(f"    [{i+1}] {ROWS[ri]['color']} row - mark {val}")
                print(f"    [0] Pass (take penalty)")
                choice = input_with_quit("  Choice: ").strip()
                try:
                    idx = int(choice)
                    if idx == 0:
                        return {"action": "color_pass"}
                    if 1 <= idx <= len(options):
                        ri, val = options[idx - 1]
                        return {"action": "color_mark", "row": ri, "number": val}
                except ValueError:
                    pass
                return None
            else:
                print("  No valid color options. Taking penalty.")
                input_with_quit("  Press Enter...")
                return {"action": "color_pass"}
        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move.get("action")

        if action == "roll":
            self._roll_dice()
            self.phase = "white_phase"
            self.white_used = {"1": False, "2": False}
            self.color_used = False
            self.current_player = 1  # Both get white phase, start with P1
            self.log.append(f"{self.players[self.active_player-1]} rolled the dice.")
            return True

        if action == "skip_roll":
            # Non-active player waits for roll
            self.current_player = self.active_player
            return True

        if action == "white_mark":
            ri, number = move["row"], move["number"]
            if not self._can_mark(cp, ri, number):
                return False
            self._mark_number(cp, ri, number)
            self.white_used[sp] = True
            self.log.append(f"{self.players[cp-1]} marked {number} on {ROWS[ri]['color']}.")
            # Switch to other player for white phase or advance
            return self._advance_white()

        if action == "white_pass":
            self.white_used[sp] = False
            return self._advance_white()

        if action == "color_mark":
            ri, number = move["row"], move["number"]
            if not self._can_mark(cp, ri, number):
                return False
            self._mark_number(cp, ri, number)
            self.color_used = True
            self.log.append(f"{self.players[cp-1]} marked {number} on {ROWS[ri]['color']}.")
            return self._advance_round()

        if action == "color_pass":
            # Active player takes penalty if they didn't use white either
            if not self.white_used[sp] and not self.color_used:
                self.penalties[sp] += 1
                self.log.append(f"{self.players[cp-1]} takes a penalty!")
            return self._advance_round()

        if action == "color_skip":
            # Non-active player doesn't get color phase
            self.current_player = self.active_player
            return True

        return False

    def _advance_white(self):
        """After a white phase action, move to next player or color phase."""
        if self.current_player == 1:
            self.current_player = 2
        else:
            # Both done with white, move to color phase
            self.phase = "color_phase"
            self.current_player = self.active_player
        return True

    def _advance_round(self):
        """After color phase, advance to next round."""
        self.active_player = 2 if self.active_player == 1 else 1
        self.phase = "roll"
        self.current_player = self.active_player
        self.round_number += 1
        return True

    def check_game_over(self):
        # Game ends when 2 rows are locked OR any player has 4 penalties
        if len(self.locked_rows) >= 2:
            self.game_over = True
        for p in [1, 2]:
            if self.penalties[str(p)] >= 4:
                self.game_over = True
        if self.round_number > 40:
            self.game_over = True

        if self.game_over:
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
            "marks": self.marks,
            "penalties": self.penalties,
            "locked_rows": self.locked_rows,
            "dice": self.dice,
            "phase": self.phase,
            "active_player": self.active_player,
            "white_used": self.white_used,
            "color_used": self.color_used,
            "round_number": self.round_number,
            "log": self.log,
        }

    def load_state(self, state):
        self.marks = state["marks"]
        self.penalties = state["penalties"]
        self.locked_rows = state["locked_rows"]
        self.dice = state["dice"]
        self.phase = state["phase"]
        self.active_player = state["active_player"]
        self.white_used = state["white_used"]
        self.color_used = state["color_used"]
        self.round_number = state.get("round_number", 1)
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  QWIXX - Tutorial
============================================================

  OVERVIEW:
  Qwixx is a dice-rolling game where players mark numbers
  on four colored rows. The goal is to mark as many numbers
  as possible to score points.

  ROWS:
  - Red (2-12, left to right)
  - Yellow (2-12, left to right)
  - Green (12-2, right to left)
  - Blue (12-2, right to left)

  RULES:
  - Numbers must be marked left-to-right in each row
  - You can skip numbers, but can never go back
  - Active player rolls 6 dice (2 white + 4 colored)
  - ALL players may use the white dice sum on any row
  - ONLY the active player may use one colored die + one white die
  - If active player marks nothing, they take a penalty (-5 pts)
  - To lock a row (mark the last number), need 5+ marks first

  SCORING:
  - More marks = exponentially more points per row
  - Each penalty costs 5 points
  - Game ends when 2 rows lock or someone gets 4 penalties

  BIG POINTS VARIANT:
  - Higher scoring table for more dramatic point swings
============================================================
"""
