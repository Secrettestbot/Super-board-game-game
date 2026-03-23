"""That's Pretty Clever (Ganz Schon Clever) - Roll dice, pick to score.

Roll 6 colored dice, choose one each turn to mark on your scoring sheet.
Combos chain into bonus actions. Each color area scores differently.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

COLORS = ["Yellow", "Blue", "Green", "Orange", "Purple", "White"]
COLOR_ABBREV = {"Yellow": "Y", "Blue": "B", "Green": "G",
                "Orange": "O", "Purple": "P", "White": "W"}

# Yellow: 4x4 grid, mark specific numbers for column bonuses
YELLOW_GRID = [
    [3, 6, 5, 0],
    [2, 1, 0, 5],
    [1, 0, 2, 4],
    [0, 3, 4, 6],
]
YELLOW_COL_SCORES = [10, 14, 16, 20]

# Blue: 2-12 range, mark sum of blue+white dice
BLUE_CELLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
BLUE_SCORES = [0, 1, 2, 4, 6, 9, 12, 16, 20, 25, 30, 36]

# Green: mark cells left to right, need >= threshold
GREEN_THRESHOLDS = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 6]
GREEN_SCORES = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66]

# Orange: write dice values, multiply some
ORANGE_SLOTS = 11
ORANGE_MULTIPLIERS = [1, 1, 1, 2, 1, 1, 3, 1, 1, 2, 1]

# Purple: ascending sequence, each must be > previous (or 6 resets)
PURPLE_SLOTS = 11
PURPLE_SCORES = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66]


class ThatsPrettyCleverGame(BaseGame):
    """That's Pretty Clever - Dice selection and combo scoring."""

    name = "That's Pretty Clever"
    description = "Roll dice, pick one to score on colored areas with chain combos"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (Ganz Schon Clever)",
        "twice": "Twice as Clever",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.twice = (self.variation == "twice")
        self.total_rounds = 6 if not self.twice else 6
        self.round_number = 0
        self.dice = {}
        self.chosen_dice = []
        self.rerolls = {"1": 1, "2": 1}
        self.plus_ones = {"1": 1, "2": 1}
        # Scoring sheets
        self.sheets = {}
        self.phase = "roll"  # roll, choose, opponent_pick, round_end
        self.picks_left = 0
        self.available_dice = []
        self.silver_tray = []  # dice lower than chosen go to opponent
        self.log = []

    def _init_sheet(self):
        return {
            "yellow": [[False]*4 for _ in range(4)],
            "blue": [False]*11,
            "green": 0,  # how many cells marked
            "orange": [None]*ORANGE_SLOTS,
            "orange_count": 0,
            "purple": [None]*PURPLE_SLOTS,
            "purple_count": 0,
            "foxes": 0,  # count of fox bonuses earned
            "rerolls": 1,
            "plus_ones": 1,
        }

    def setup(self):
        self.sheets = {"1": self._init_sheet(), "2": self._init_sheet()}
        self.round_number = 0
        self.log = ["That's Pretty Clever begins!"]
        self._start_round()

    def _start_round(self):
        self.round_number += 1
        self.phase = "roll"
        self.picks_left = 3
        self.silver_tray = []
        self.chosen_dice = []
        self._roll_dice()

    def _roll_dice(self):
        self.dice = {}
        for color in COLORS:
            if color not in self.chosen_dice:
                self.dice[color] = random.randint(1, 6)
        self.available_dice = list(self.dice.keys())

    def _score_color(self, player, color):
        """Calculate score for one color area."""
        sheet = self.sheets[str(player)]
        if color == "yellow":
            total = 0
            for c in range(4):
                col_full = all(sheet["yellow"][r][c] for r in range(4))
                if col_full:
                    total += YELLOW_COL_SCORES[c]
            return total
        elif color == "blue":
            marked = sum(1 for x in sheet["blue"] if x)
            return BLUE_SCORES[marked]
        elif color == "green":
            return GREEN_SCORES[sheet["green"]]
        elif color == "orange":
            total = 0
            for i in range(sheet["orange_count"]):
                val = sheet["orange"][i] or 0
                total += val * ORANGE_MULTIPLIERS[i]
            return total
        elif color == "purple":
            return PURPLE_SCORES[sheet["purple_count"]]
        return 0

    def _total_score(self, player):
        sp = str(player)
        total = 0
        for color in ["yellow", "blue", "green", "orange", "purple"]:
            total += self._score_color(player, color)
        # Fox bonus: each fox = lowest color score
        if self.sheets[sp]["foxes"] > 0:
            color_scores = [self._score_color(player, c)
                            for c in ["yellow", "blue", "green", "orange", "purple"]]
            lowest = min(color_scores)
            total += self.sheets[sp]["foxes"] * lowest
        return total

    def _can_place(self, player, color, die_value):
        """Check if a die value can be placed on a color area."""
        sheet = self.sheets[str(player)]
        if color == "yellow":
            for r in range(4):
                for c in range(4):
                    if not sheet["yellow"][r][c] and YELLOW_GRID[r][c] == die_value:
                        return True
            return False
        elif color == "blue":
            idx = die_value - 2
            if 0 <= idx < 11 and not sheet["blue"][idx]:
                return True
            return False
        elif color == "green":
            count = sheet["green"]
            if count < len(GREEN_THRESHOLDS):
                return die_value >= GREEN_THRESHOLDS[count]
            return False
        elif color == "orange":
            return sheet["orange_count"] < ORANGE_SLOTS
        elif color == "purple":
            count = sheet["purple_count"]
            if count >= PURPLE_SLOTS:
                return False
            if count == 0:
                return True
            last = sheet["purple"][count - 1]
            return die_value > last or die_value == 6
        return False

    def _place_die(self, player, color, die_value):
        """Place a die value on a color area. Returns True if bonus triggered."""
        sheet = self.sheets[str(player)]
        bonus = False
        if color == "yellow":
            for r in range(4):
                for c in range(4):
                    if not sheet["yellow"][r][c] and YELLOW_GRID[r][c] == die_value:
                        sheet["yellow"][r][c] = True
                        # Check row completion for bonuses
                        if all(sheet["yellow"][r]):
                            bonus = True
                        return bonus
        elif color == "blue":
            idx = die_value - 2
            if 0 <= idx < 11:
                sheet["blue"][idx] = True
                marked = sum(1 for x in sheet["blue"] if x)
                if marked in [3, 6, 9]:
                    bonus = True
        elif color == "green":
            sheet["green"] += 1
            if sheet["green"] in [3, 5, 7]:
                bonus = True
        elif color == "orange":
            i = sheet["orange_count"]
            sheet["orange"][i] = die_value
            sheet["orange_count"] += 1
            if sheet["orange_count"] in [3, 6, 9]:
                bonus = True
        elif color == "purple":
            i = sheet["purple_count"]
            sheet["purple"][i] = die_value
            sheet["purple_count"] += 1
            if sheet["purple_count"] in [3, 6, 9]:
                bonus = True
        return bonus

    def display(self):
        clear_screen()
        mode = "Twice as Clever" if self.twice else "Standard"
        print(f"{'=' * 65}")
        print(f"  THAT'S PRETTY CLEVER - {mode} | Round {self.round_number}/{self.total_rounds}")
        print(f"{'=' * 65}")

        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            total = self._total_score(p)
            print(f"  {self.players[p-1]}: Total={total}{marker}")
            sheet = self.sheets[sp]
            # Yellow
            yw = ""
            for r in range(4):
                row_s = ""
                for c in range(4):
                    if sheet["yellow"][r][c]:
                        row_s += "X "
                    else:
                        row_s += f"{YELLOW_GRID[r][c]} "
                yw += f"[{row_s.strip()}] "
            print(f"    Yellow: {yw} = {self._score_color(p, 'yellow')}")
            # Blue
            bl = ""
            for i, v in enumerate(BLUE_CELLS):
                bl += "X" if sheet["blue"][i] else str(v)
                bl += " "
            print(f"    Blue:   {bl.strip()} = {self._score_color(p, 'blue')}")
            # Green
            gn = "X " * sheet["green"] + "- " * (len(GREEN_THRESHOLDS) - sheet["green"])
            print(f"    Green:  {gn.strip()} = {self._score_color(p, 'green')}")
            # Orange
            og = ""
            for i in range(ORANGE_SLOTS):
                v = sheet["orange"][i]
                mult = ORANGE_MULTIPLIERS[i]
                if v is not None:
                    og += f"{v}" + ("x2" if mult == 2 else "x3" if mult == 3 else "") + " "
                else:
                    og += ("_x2 " if mult == 2 else "_x3 " if mult == 3 else "_ ")
            print(f"    Orange: {og.strip()} = {self._score_color(p, 'orange')}")
            # Purple
            pp = ""
            for i in range(PURPLE_SLOTS):
                v = sheet["purple"][i]
                pp += str(v) if v is not None else "_"
                pp += " "
            print(f"    Purple: {pp.strip()} = {self._score_color(p, 'purple')}")
            print(f"    Foxes: {sheet['foxes']}")
            print()

        # Dice
        if self.dice:
            dice_str = "  Dice: " + " ".join(
                f"{COLOR_ABBREV[c]}={v}" for c, v in self.dice.items()
                if c in self.available_dice)
            print(dice_str)
        if self.silver_tray:
            tray_str = "  Silver tray: " + " ".join(
                f"{COLOR_ABBREV[c]}={v}" for c, v in self.silver_tray)
            print(tray_str)
        print(f"  Phase: {self.phase} | Picks left: {self.picks_left}")
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if self.phase == "roll":
            input_with_quit("  Press Enter to roll dice...")
            return {"action": "roll"}

        elif self.phase == "choose":
            print(f"  {self.players[cp-1]}, choose a die color to use ({self.picks_left} picks left):")
            for i, color in enumerate(self.available_dice):
                val = self.dice[color]
                print(f"    [{i+1}] {color} ({val})")
            print(f"    [0] Pass (end picking)")
            val = input_with_quit("  Choice: ").strip()
            try:
                idx = int(val)
                if idx == 0:
                    return {"action": "pass"}
                idx -= 1
                if 0 <= idx < len(self.available_dice):
                    color = self.available_dice[idx]
                    # Ask which area to place in
                    die_val = self.dice[color]
                    print(f"  Place {color} ({die_val}) on which area?")
                    areas = []
                    for area in ["yellow", "blue", "green", "orange", "purple"]:
                        check_val = die_val
                        if area == "blue":
                            # Blue uses blue+white sum
                            white_val = self.dice.get("White", 0)
                            if color == "Blue":
                                check_val = die_val + white_val
                            elif color == "White":
                                blue_val = self.dice.get("Blue", 0)
                                check_val = blue_val + die_val
                        if self._can_place(cp, area, check_val):
                            areas.append((area, check_val))
                    if not areas:
                        print("  No valid placement for this die!")
                        input_with_quit("  Press Enter...")
                        return None
                    for i, (area, v) in enumerate(areas):
                        print(f"    [{i+1}] {area.title()} (value {v})")
                    a = input_with_quit("  Area: ").strip()
                    try:
                        ai = int(a) - 1
                        if 0 <= ai < len(areas):
                            return {"action": "choose", "color": color,
                                    "area": areas[ai][0], "value": areas[ai][1]}
                    except ValueError:
                        pass
            except ValueError:
                pass
            return None

        elif self.phase == "opponent_pick":
            print(f"  {self.players[cp-1]}, pick a die from the silver tray:")
            for i, (color, val) in enumerate(self.silver_tray):
                print(f"    [{i+1}] {color} ({val})")
            print(f"    [0] Pass")
            val = input_with_quit("  Choice: ").strip()
            try:
                idx = int(val)
                if idx == 0:
                    return {"action": "pass_tray"}
                idx -= 1
                if 0 <= idx < len(self.silver_tray):
                    color, die_val = self.silver_tray[idx]
                    areas = []
                    for area in ["yellow", "blue", "green", "orange", "purple"]:
                        if self._can_place(cp, area, die_val):
                            areas.append((area, die_val))
                    if not areas:
                        return {"action": "pass_tray"}
                    print(f"  Place on which area?")
                    for i, (area, v) in enumerate(areas):
                        print(f"    [{i+1}] {area.title()}")
                    a = input_with_quit("  Area: ").strip()
                    try:
                        ai = int(a) - 1
                        if 0 <= ai < len(areas):
                            return {"action": "tray_pick", "tray_index": idx,
                                    "area": areas[ai][0], "value": die_val}
                    except ValueError:
                        pass
            except ValueError:
                pass
            return None

        elif self.phase == "round_end":
            input_with_quit("  Press Enter for next round...")
            return {"action": "next_round"}

        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move["action"]

        if action == "roll":
            self._roll_dice()
            self.phase = "choose"
            self.log.append(f"{self.players[cp-1]} rolled dice.")
            return True

        if action == "choose":
            color = move["color"]
            area = move["area"]
            value = move["value"]
            if color not in self.available_dice:
                return False
            # Remove chosen die and all lower-valued dice go to silver tray
            chosen_val = self.dice[color]
            for c in list(self.available_dice):
                if c != color and self.dice[c] < chosen_val:
                    self.silver_tray.append((c, self.dice[c]))
            self.available_dice = [c for c in self.available_dice
                                   if c != color and self.dice.get(c, 0) >= chosen_val]
            self.chosen_dice.append(color)
            self._place_die(cp, area, value)
            self.picks_left -= 1
            self.log.append(f"{self.players[cp-1]} used {color}({chosen_val}) on {area}.")

            if self.picks_left <= 0 or not self.available_dice:
                # Opponent picks from silver tray
                if self.silver_tray:
                    self.phase = "opponent_pick"
                    self.current_player = 2 if cp == 1 else 1
                else:
                    self._end_turn()
                return True
            # Reroll remaining
            self._roll_dice_remaining()
            return True

        if action == "pass":
            if self.silver_tray:
                self.phase = "opponent_pick"
                self.current_player = 2 if cp == 1 else 1
            else:
                self._end_turn()
            return True

        if action == "tray_pick":
            idx = move["tray_index"]
            area = move["area"]
            value = move["value"]
            if idx < 0 or idx >= len(self.silver_tray):
                return False
            self._place_die(cp, area, value)
            self.log.append(f"{self.players[cp-1]} picked from tray for {area}.")
            self._end_turn()
            return True

        if action == "pass_tray":
            self._end_turn()
            return True

        if action == "next_round":
            if self.round_number >= self.total_rounds:
                self.game_over = True
                return True
            self._start_round()
            return True

        return False

    def _roll_dice_remaining(self):
        """Reroll only the remaining available dice."""
        new_dice = {}
        for color in self.available_dice:
            new_dice[color] = random.randint(1, 6)
        self.dice = new_dice

    def _end_turn(self):
        """End current player's full turn."""
        # Switch active player for their turn, or end round
        if self.current_player == 1:
            self.current_player = 2
            self.phase = "roll"
            self.picks_left = 3
            self.silver_tray = []
            self.chosen_dice = []
        else:
            self.phase = "round_end"
            self.current_player = 1
            self.log.append(f"Round {self.round_number} complete!")

    def check_game_over(self):
        if self.game_over:
            s1 = self._total_score(1)
            s2 = self._total_score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "round_number": self.round_number,
            "dice": self.dice,
            "chosen_dice": self.chosen_dice,
            "sheets": self.sheets,
            "phase": self.phase,
            "picks_left": self.picks_left,
            "available_dice": self.available_dice,
            "silver_tray": self.silver_tray,
            "log": self.log,
        }

    def load_state(self, state):
        self.round_number = state["round_number"]
        self.dice = state["dice"]
        self.chosen_dice = state["chosen_dice"]
        self.sheets = state["sheets"]
        self.phase = state["phase"]
        self.picks_left = state["picks_left"]
        self.available_dice = state["available_dice"]
        self.silver_tray = state.get("silver_tray", [])
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==========================================================
  THAT'S PRETTY CLEVER - Tutorial
==========================================================
  Roll 6 colored dice, pick one at a time for your sheet.
  Lower dice go to a tray for your opponent!

  YELLOW: 4x4 grid, mark matching numbers. Columns: 10/14/16/20 pts.
  BLUE: Mark cells 2-12 using Blue+White sum. More = more pts.
  GREEN: Mark left to right, die >= threshold. Streaks score more.
  ORANGE: Write any value. Some slots have 2x/3x multipliers.
  PURPLE: Ascending sequence. Each > previous (6 resets).

  TURN: Roll -> Choose die -> lower dice to tray -> reroll ->
  repeat (3 picks) -> opponent picks from tray.
  FOXES: Each fox = your lowest color score added again.
  After 6 rounds, highest total score wins!
==========================================================
"""
