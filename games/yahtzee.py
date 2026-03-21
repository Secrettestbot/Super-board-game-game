"""Yahtzee - Classic dice game of luck and strategy."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Scoring category definitions
UPPER_CATEGORIES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
LOWER_CATEGORIES = ['three_kind', 'four_kind', 'full_house', 'sm_straight',
                    'lg_straight', 'yahtzee', 'chance']
ALL_CATEGORIES = UPPER_CATEGORIES + LOWER_CATEGORIES

CATEGORY_DISPLAY = {
    'ones': 'Ones', 'twos': 'Twos', 'threes': 'Threes',
    'fours': 'Fours', 'fives': 'Fives', 'sixes': 'Sixes',
    'three_kind': 'Three of a Kind', 'four_kind': 'Four of a Kind',
    'full_house': 'Full House', 'sm_straight': 'Small Straight',
    'lg_straight': 'Large Straight', 'yahtzee': 'Yahtzee', 'chance': 'Chance',
}

CATEGORY_NUMBER = {cat: i for i, cat in enumerate(UPPER_CATEGORIES, 1)}
CATEGORY_NUMBER.update({cat: i for i, cat in enumerate(LOWER_CATEGORIES, 7)})

# ASCII art for dice faces
DICE_ART = {
    1: ["+-------+", "|       |", "|   *   |", "|       |", "+-------+"],
    2: ["+-------+", "| *     |", "|       |", "|     * |", "+-------+"],
    3: ["+-------+", "| *     |", "|   *   |", "|     * |", "+-------+"],
    4: ["+-------+", "| *   * |", "|       |", "| *   * |", "+-------+"],
    5: ["+-------+", "| *   * |", "|   *   |", "| *   * |", "+-------+"],
    6: ["+-------+", "| *   * |", "| *   * |", "| *   * |", "+-------+"],
}


def _calc_score(dice, category):
    """Calculate the score for a given category and dice combination.

    Returns the score (may be 0 if criteria not met).
    """
    counts = [0] * 7  # index 0 unused, 1-6
    for d in dice:
        counts[d] += 1

    if category in UPPER_CATEGORIES:
        face = UPPER_CATEGORIES.index(category) + 1
        return counts[face] * face

    total = sum(dice)

    if category == 'three_kind':
        return total if max(counts[1:]) >= 3 else 0
    if category == 'four_kind':
        return total if max(counts[1:]) >= 4 else 0
    if category == 'full_house':
        vals = sorted([c for c in counts[1:] if c > 0])
        return 25 if vals == [2, 3] else 0
    if category == 'sm_straight':
        s = set(dice)
        for start in (1, 2, 3):
            if {start, start + 1, start + 2, start + 3}.issubset(s):
                return 30
        return 0
    if category == 'lg_straight':
        s = sorted(set(dice))
        if s == [1, 2, 3, 4, 5] or s == [2, 3, 4, 5, 6]:
            return 40
        return 0
    if category == 'yahtzee':
        return 50 if max(counts[1:]) == 5 else 0
    if category == 'chance':
        return total

    return 0


class YahtzeeGame(BaseGame):
    """Full Yahtzee implementation with standard and triple variants."""

    name = "Yahtzee"
    description = "Classic dice game - roll five dice to score in 13 categories"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Yahtzee",
        "triple": "Triple Yahtzee (3x score sheet)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_columns = 1  # 3 for triple
        self.dice = [0, 0, 0, 0, 0]
        self.kept = [False, False, False, False, False]
        self.rolls_left = 3
        self.round_number = 0
        # scores[player][column][category] = score or None
        self.scores = {}
        # yahtzee bonus tracking per player
        self.yahtzee_bonuses = {1: 0, 2: 0}
        # Phase within a turn: 'rolling' or 'scoring'
        self.phase = 'rolling'

    def setup(self):
        """Initialize score sheets for both players."""
        self.num_columns = 3 if self.variation == 'triple' else 1
        self.dice = [0, 0, 0, 0, 0]
        self.kept = [False, False, False, False, False]
        self.rolls_left = 3
        self.round_number = 1
        self.phase = 'rolling'
        self.yahtzee_bonuses = {1: 0, 2: 0}
        self.scores = {}
        for p in (1, 2):
            self.scores[p] = {}
            for col in range(self.num_columns):
                self.scores[p][col] = {cat: None for cat in ALL_CATEGORIES}
        self.game_over = False
        self.winner = None

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

    def _render_dice(self):
        """Return lines showing current dice with ASCII art."""
        lines = []
        # Labels
        label_line = ""
        for i in range(5):
            tag = " [KEPT]" if self.kept[i] else ""
            label_line += f"  Die {i + 1}{tag}  "
        lines.append(label_line)
        # Art rows
        for row in range(5):
            parts = []
            for i in range(5):
                val = self.dice[i]
                if val < 1 or val > 6:
                    parts.append("         ")
                else:
                    parts.append(DICE_ART[val][row])
            lines.append("  ".join(parts))
        return "\n".join(lines)

    def _upper_total(self, player, col):
        total = 0
        for cat in UPPER_CATEGORIES:
            v = self.scores[player][col][cat]
            if v is not None:
                total += v
        return total

    def _lower_total(self, player, col):
        total = 0
        for cat in LOWER_CATEGORIES:
            v = self.scores[player][col][cat]
            if v is not None:
                total += v
        return total

    def _upper_bonus(self, player, col):
        return 35 if self._upper_total(player, col) >= 63 else 0

    def _column_total(self, player, col):
        return (self._upper_total(player, col)
                + self._upper_bonus(player, col)
                + self._lower_total(player, col))

    def _grand_total(self, player):
        total = sum(self._column_total(player, c) for c in range(self.num_columns))
        total += self.yahtzee_bonuses[player] * 100
        return total

    def _render_scorecard(self):
        """Render the scorecard for both players."""
        lines = []
        cols = self.num_columns

        # Header
        hdr = f"{'Category':<20}"
        for p in (1, 2):
            if cols == 1:
                hdr += f"| {self.players[p - 1]:^12}"
            else:
                for c in range(cols):
                    hdr += f"| {self.players[p - 1]} C{c + 1:>1} "
        lines.append(hdr)
        lines.append("-" * len(hdr))

        # Upper section
        for cat in UPPER_CATEGORIES:
            row = f"{CATEGORY_DISPLAY[cat]:<20}"
            for p in (1, 2):
                for c in range(cols):
                    v = self.scores[p][c][cat]
                    cell = f"{v:>4}" if v is not None else "   -"
                    row += f"| {cell:^12}" if cols == 1 else f"| {cell:>5} "
            lines.append(row)

        # Upper total and bonus
        row_ut = f"{'Upper Total':<20}"
        row_ub = f"{'Upper Bonus':<20}"
        for p in (1, 2):
            for c in range(cols):
                ut = self._upper_total(p, c)
                ub = self._upper_bonus(p, c)
                if cols == 1:
                    row_ut += f"| {ut:>4}/63       "
                    row_ub += f"| {ub:>4}         "
                else:
                    row_ut += f"| {ut:>3}/63"
                    row_ub += f"|  {ub:>4} "
        lines.append(row_ut)
        lines.append(row_ub)
        lines.append("-" * len(hdr))

        # Lower section
        for cat in LOWER_CATEGORIES:
            row = f"{CATEGORY_DISPLAY[cat]:<20}"
            for p in (1, 2):
                for c in range(cols):
                    v = self.scores[p][c][cat]
                    cell = f"{v:>4}" if v is not None else "   -"
                    row += f"| {cell:^12}" if cols == 1 else f"| {cell:>5} "
            lines.append(row)

        lines.append("-" * len(hdr))

        # Yahtzee bonus
        row_yb = f"{'Yahtzee Bonus':<20}"
        for p in (1, 2):
            yb = self.yahtzee_bonuses[p] * 100
            span = 12 * cols + (cols - 1) * 2 if cols > 1 else 12
            row_yb += f"| {yb:>{span}}"
        lines.append(row_yb)

        # Grand total
        row_gt = f"{'GRAND TOTAL':<20}"
        for p in (1, 2):
            gt = self._grand_total(p)
            span = 12 * cols + (cols - 1) * 2 if cols > 1 else 12
            row_gt += f"| {gt:>{span}}"
        lines.append(row_gt)

        return "\n".join(lines)

    def display(self):
        """Show the full game state."""
        print(f"\n{'=' * 60}")
        print(f"  YAHTZEE  -  Round {self.round_number}/{ 13 * self.num_columns }  "
              f"-  {self.players[self.current_player - 1]}'s turn")
        print(f"{'=' * 60}\n")

        # Show dice if we have rolled at least once
        if self.rolls_left < 3:
            print(self._render_dice())
            print(f"\n  Rolls remaining: {self.rolls_left}\n")
        else:
            print("  Roll the dice to start your turn!\n")

        print(self._render_scorecard())
        print()

    # ------------------------------------------------------------------ #
    #  Move handling
    # ------------------------------------------------------------------ #

    def get_move(self):
        """Get the player's action: roll, keep, or score."""
        while True:
            if self.rolls_left == 3:
                prompt = f"{self.players[self.current_player - 1]}, type 'roll' to roll the dice: "
            elif self.rolls_left > 0:
                prompt = (f"{self.players[self.current_player - 1]}, "
                          "'roll' to reroll, 'keep 1 3 5' to keep dice, "
                          "'all' to keep all, or 'score <category>': ")
            else:
                prompt = (f"{self.players[self.current_player - 1]}, "
                          "no rolls left - 'score <category>': ")

            raw = input_with_quit(prompt).strip().lower()
            if not raw:
                continue

            parts = raw.split()
            cmd = parts[0]

            if cmd == 'all':
                if self.rolls_left == 3:
                    print("You must roll first!")
                    continue
                return ('keep', [1, 2, 3, 4, 5])

            if cmd == 'roll':
                if self.rolls_left <= 0:
                    print("No rolls remaining! You must score a category.")
                    continue
                return ('roll',)

            if cmd == 'keep':
                if self.rolls_left == 3:
                    print("You must roll first!")
                    continue
                if self.rolls_left <= 0:
                    print("No rolls remaining! You must score a category.")
                    continue
                try:
                    indices = [int(x) for x in parts[1:]]
                except ValueError:
                    print("Usage: keep 1 3 5  (dice numbers 1-5)")
                    continue
                if not indices or any(i < 1 or i > 5 for i in indices):
                    print("Dice numbers must be 1-5.")
                    continue
                return ('keep', indices)

            if cmd == 'score':
                if self.rolls_left == 3:
                    print("You must roll at least once before scoring!")
                    continue
                if len(parts) < 2:
                    print("Usage: score <category>  (e.g. 'score ones')")
                    continue
                category = parts[1]
                if category not in ALL_CATEGORIES:
                    print(f"Unknown category '{category}'. Valid: "
                          f"{', '.join(ALL_CATEGORIES)}")
                    continue
                # For triple, need column selection
                col = 0
                if self.num_columns > 1:
                    if len(parts) >= 3:
                        try:
                            col = int(parts[2]) - 1
                        except ValueError:
                            col = -1
                    else:
                        # ask for column
                        try:
                            col_input = input_with_quit(
                                "Which column (1-3)? ").strip()
                            col = int(col_input) - 1
                        except (ValueError, EOFError):
                            col = -1
                    if col < 0 or col >= self.num_columns:
                        print("Column must be 1-3.")
                        continue
                # Check if category is available in that column
                if self.scores[self.current_player][col][category] is not None:
                    print(f"'{CATEGORY_DISPLAY[category]}' is already scored"
                          f"{f' in column {col + 1}' if self.num_columns > 1 else ''}!")
                    continue
                return ('score', category, col)

            print("Commands: 'roll', 'keep 1 3 5', 'all', 'score <category>'")

    def make_move(self, move):
        """Apply a move. Returns True if valid (turn may continue internally)."""
        action = move[0]

        if action == 'roll':
            for i in range(5):
                if not self.kept[i]:
                    self.dice[i] = random.randint(1, 6)
            self.rolls_left -= 1
            # After rolling, stay on same player for further actions
            return self._continue_turn()

        if action == 'keep':
            indices = move[1]
            # Toggle: set exactly these dice as kept, others as not kept
            self.kept = [False] * 5
            for idx in indices:
                self.kept[idx - 1] = True
            # Don't consume a turn; need to roll or score next
            return self._continue_turn()

        if action == 'score':
            category = move[1]
            col = move[2]
            return self._apply_score(category, col)

        return False

    def _continue_turn(self):
        """After a roll or keep, re-display and get another action.

        Returns True when the turn is finally complete (a score was applied).
        """
        while True:
            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except Exception:
                raise  # propagate QuitGame, SuspendGame, etc.

            if move[0] == 'roll':
                for i in range(5):
                    if not self.kept[i]:
                        self.dice[i] = random.randint(1, 6)
                self.rolls_left -= 1
                continue

            if move[0] == 'keep':
                indices = move[1]
                self.kept = [False] * 5
                for idx in indices:
                    self.kept[idx - 1] = True
                continue

            if move[0] == 'score':
                return self._apply_score(move[1], move[2])

    def _apply_score(self, category, col):
        """Score a category and end the turn."""
        player = self.current_player
        dice = list(self.dice)

        # Check for Yahtzee bonus
        counts = [0] * 7
        for d in dice:
            counts[d] += 1
        is_yahtzee = max(counts[1:]) == 5

        if is_yahtzee and category != 'yahtzee':
            # Check if yahtzee already scored with 50 in any column
            has_yahtzee_50 = any(
                self.scores[player][c]['yahtzee'] == 50
                for c in range(self.num_columns)
            )
            if has_yahtzee_50:
                self.yahtzee_bonuses[player] += 1

        score = _calc_score(dice, category)
        self.scores[player][col][category] = score

        # Also award yahtzee bonus if scoring yahtzee when already have one
        if category == 'yahtzee' and is_yahtzee:
            has_yahtzee_50 = any(
                c != col and self.scores[player][c]['yahtzee'] == 50
                for c in range(self.num_columns)
            )
            if has_yahtzee_50:
                self.yahtzee_bonuses[player] += 1

        # Reset for next turn
        self.dice = [0, 0, 0, 0, 0]
        self.kept = [False, False, False, False, False]
        self.rolls_left = 3

        # Advance round counter (each player gets a turn per round)
        if self.current_player == 2:
            self.round_number += 1

        return True

    # ------------------------------------------------------------------ #
    #  Game over
    # ------------------------------------------------------------------ #

    def check_game_over(self):
        """Check if all categories are filled for both players."""
        total_cats = 13 * self.num_columns
        for p in (1, 2):
            filled = sum(
                1 for c in range(self.num_columns)
                for cat in ALL_CATEGORIES
                if self.scores[p][c][cat] is not None
            )
            if filled < total_cats:
                return
        self.game_over = True
        t1 = self._grand_total(1)
        t2 = self._grand_total(2)
        if t1 > t2:
            self.winner = 1
        elif t2 > t1:
            self.winner = 2
        else:
            self.winner = None  # draw

    # ------------------------------------------------------------------ #
    #  Save / Load
    # ------------------------------------------------------------------ #

    def get_state(self):
        """Return serializable game state."""
        # Convert scores dict with int keys to string keys for JSON
        scores_ser = {}
        for p in (1, 2):
            scores_ser[str(p)] = {}
            for c in range(self.num_columns):
                scores_ser[str(p)][str(c)] = dict(self.scores[p][c])
        return {
            'dice': self.dice,
            'kept': self.kept,
            'rolls_left': self.rolls_left,
            'round_number': self.round_number,
            'num_columns': self.num_columns,
            'scores': scores_ser,
            'yahtzee_bonuses': {str(k): v for k, v in self.yahtzee_bonuses.items()},
            'phase': self.phase,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.dice = state['dice']
        self.kept = state['kept']
        self.rolls_left = state['rolls_left']
        self.round_number = state['round_number']
        self.num_columns = state['num_columns']
        self.phase = state.get('phase', 'rolling')
        self.yahtzee_bonuses = {int(k): v for k, v in state['yahtzee_bonuses'].items()}
        self.scores = {}
        for p_str, cols in state['scores'].items():
            p = int(p_str)
            self.scores[p] = {}
            for c_str, cats in cols.items():
                c = int(c_str)
                self.scores[p][c] = {cat: cats.get(cat) for cat in ALL_CATEGORIES}

    # ------------------------------------------------------------------ #
    #  Tutorial
    # ------------------------------------------------------------------ #

    def get_tutorial(self):
        """Return tutorial text for Yahtzee."""
        txt = """
==================================================
  YAHTZEE TUTORIAL
==================================================

OVERVIEW:
  Yahtzee is a dice game where players take turns
  rolling 5 dice to fill 13 scoring categories.
  The player with the highest total score wins.

EACH TURN:
  1. Roll all 5 dice (type 'roll')
  2. After rolling, you may:
     - Keep some dice and reroll the rest:
       'keep 1 3 5' keeps dice 1, 3, and 5
     - Reroll all dice: 'roll'
     - Score immediately: 'score <category>'
  3. You get up to 3 rolls per turn.
  4. After your last roll, you must choose a
     category to score.

SCORING CATEGORIES:

  UPPER SECTION:
    ones    - Sum of all 1s
    twos    - Sum of all 2s
    threes  - Sum of all 3s
    fours   - Sum of all 4s
    fives   - Sum of all 5s
    sixes   - Sum of all 6s
    * Bonus: 35 points if upper total >= 63

  LOWER SECTION:
    three_kind  - Three of a kind (sum all dice)
    four_kind   - Four of a kind (sum all dice)
    full_house  - Full house: 3+2 of a kind (25 pts)
    sm_straight - Small straight: 4 in a row (30 pts)
    lg_straight - Large straight: 5 in a row (40 pts)
    yahtzee     - Five of a kind (50 pts)
    chance      - Any combination (sum all dice)

  YAHTZEE BONUS:
    If you roll another Yahtzee after scoring 50
    in the Yahtzee category, you get 100 bonus pts
    for each additional Yahtzee.

  You may score 0 in any category if you cannot
  (or choose not to) meet the requirements.
"""
        if self.variation == 'triple':
            txt += """
TRIPLE YAHTZEE:
  In Triple Yahtzee, each player has 3 score
  columns to fill. When scoring, you choose which
  column to place your score in. The game lasts
  39 rounds (13 categories x 3 columns).
"""
        txt += """
COMMANDS:
  roll           - Roll (or reroll) the dice
  keep 1 3 5     - Keep dice 1, 3, and 5
  all            - Keep all dice (stop rolling)
  score <cat>    - Score in a category

  quit / q       - Quit the game
  save / s       - Save and suspend
  help / h       - Show help
  tutorial / t   - Show this tutorial
==================================================
"""
        return txt
