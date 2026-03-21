"""Pig - Simple dice game of risk and reward."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# ASCII art for dice faces
DICE_ART = {
    1: ["+-------+", "|       |", "|   *   |", "|       |", "+-------+"],
    2: ["+-------+", "| *     |", "|       |", "|     * |", "+-------+"],
    3: ["+-------+", "| *     |", "|   *   |", "|     * |", "+-------+"],
    4: ["+-------+", "| *   * |", "|       |", "| *   * |", "+-------+"],
    5: ["+-------+", "| *   * |", "|   *   |", "| *   * |", "+-------+"],
    6: ["+-------+", "| *   * |", "| *   * |", "| *   * |", "+-------+"],
}


def _render_dice(values):
    """Render one or more dice side by side as ASCII art."""
    lines = []
    for row in range(5):
        parts = []
        for v in values:
            parts.append(DICE_ART[v][row])
        lines.append("  ".join(parts))
    return "\n".join(lines)


def _progress_bar(score, target, width=30):
    """Return a text progress bar for a score toward target."""
    filled = min(int(score / target * width), width)
    bar = "#" * filled + "-" * (width - filled)
    pct = min(score / target * 100, 100)
    return f"[{bar}] {score}/{target} ({pct:.0f}%)"


class PigGame(BaseGame):
    """Pig dice game with standard, two-dice, and big pig variants."""

    name = "Pig"
    description = "Simple dice game - push your luck to reach the target score"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Pig (1 die)",
        "two_dice": "Two-Dice Pig",
        "big_pig": "Big Pig (100 points)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.total_scores = {1: 0, 2: 0}
        self.turn_total = 0
        self.target_score = 100
        self.last_dice = []
        self.turn_message = ""
        self.must_roll_again = False  # for two-dice doubles

    def setup(self):
        """Initialize game state."""
        self.total_scores = {1: 0, 2: 0}
        self.turn_total = 0
        self.target_score = 100
        self.last_dice = []
        self.turn_message = ""
        self.must_roll_again = False
        self.game_over = False
        self.winner = None
        self.current_player = 1

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

    def display(self):
        """Show the full game state."""
        target = self.target_score
        print(f"\n{'=' * 56}")
        variant_label = self.variations.get(self.variation, "Pig")
        print(f"  PIG  -  {variant_label}  -  Target: {target} points")
        print(f"{'=' * 56}\n")

        # Player scores with progress bars
        for p in (1, 2):
            marker = " <<" if p == self.current_player else ""
            print(f"  {self.players[p - 1]}: {_progress_bar(self.total_scores[p], target)}{marker}")
        print()

        # Show last dice roll
        if self.last_dice:
            print(_render_dice(self.last_dice))
            print()

        # Turn info
        print(f"  {self.players[self.current_player - 1]}'s turn")
        print(f"  Turn total: {self.turn_total}")

        if self.turn_message:
            print(f"\n  >>> {self.turn_message}")
        print()

    # ------------------------------------------------------------------ #
    #  Move handling
    # ------------------------------------------------------------------ #

    def get_move(self):
        """Get the player's action: roll or hold."""
        while True:
            if self.must_roll_again:
                prompt = f"{self.players[self.current_player - 1]}, doubles! You must 'roll' again: "
            elif not self.last_dice:
                prompt = f"{self.players[self.current_player - 1]}, type 'roll' to start your turn: "
            else:
                prompt = f"{self.players[self.current_player - 1]}, 'roll' or 'hold': "

            raw = input_with_quit(prompt).strip().lower()
            if not raw:
                continue

            if raw in ('roll', 'r'):
                return 'roll'
            elif raw in ('hold', 'h') and not self.must_roll_again:
                if not self.last_dice:
                    print("You must roll at least once!")
                    continue
                return 'hold'
            elif raw in ('hold', 'h') and self.must_roll_again:
                print("You rolled doubles - you must roll again!")
                continue
            else:
                print("Commands: 'roll' (or 'r'), 'hold' (or 'h')")

    def make_move(self, move):
        """Apply a move. Handles the full turn loop internally."""
        if move == 'roll':
            return self._do_roll()
        elif move == 'hold':
            return self._do_hold()
        return False

    def _do_roll(self):
        """Execute a roll and handle the result. Continues turn loop internally."""
        result = self._roll_once()
        if result == 'turn_over':
            # Turn ended (rolled a 1, or double 1s in two-dice)
            return True
        # result == 'continue' - keep going within the turn
        while True:
            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except Exception:
                raise  # propagate QuitGame, SuspendGame, etc.

            if move == 'hold':
                return self._do_hold()
            elif move == 'roll':
                result = self._roll_once()
                if result == 'turn_over':
                    return True
                # otherwise continue the loop

    def _roll_once(self):
        """Roll dice and update state. Returns 'turn_over' or 'continue'."""
        self.must_roll_again = False

        if self.variation == 'two_dice':
            d1 = random.randint(1, 6)
            d2 = random.randint(1, 6)
            self.last_dice = [d1, d2]

            if d1 == 1 and d2 == 1:
                # Double ones: lose ALL total points
                self.turn_message = (
                    f"Double ones! {self.players[self.current_player - 1]} "
                    f"loses ALL {self.total_scores[self.current_player]} points!"
                )
                self.total_scores[self.current_player] = 0
                self.turn_total = 0
                return 'turn_over'
            elif d1 == 1 or d2 == 1:
                # Single one: lose turn points
                self.turn_message = (
                    f"Rolled a 1! Turn total of {self.turn_total} is lost."
                )
                self.turn_total = 0
                return 'turn_over'
            else:
                self.turn_total += d1 + d2
                if d1 == d2:
                    # Non-one doubles: must roll again
                    self.must_roll_again = True
                    self.turn_message = f"Doubles! You must roll again."
                else:
                    self.turn_message = f"Rolled {d1} + {d2} = {d1 + d2}."
                return 'continue'

        elif self.variation == 'big_pig':
            d = random.randint(1, 6)
            self.last_dice = [d]

            if d == 1:
                # Lose entire score
                lost = self.total_scores[self.current_player] + self.turn_total
                self.turn_message = (
                    f"Rolled a 1! {self.players[self.current_player - 1]} "
                    f"loses entire score of {lost} points!"
                )
                self.total_scores[self.current_player] = 0
                self.turn_total = 0
                return 'turn_over'
            else:
                self.turn_total += d
                self.turn_message = f"Rolled a {d}."
                return 'continue'

        else:
            # Standard Pig
            d = random.randint(1, 6)
            self.last_dice = [d]

            if d == 1:
                self.turn_message = (
                    f"Rolled a 1! Turn total of {self.turn_total} is lost."
                )
                self.turn_total = 0
                return 'turn_over'
            else:
                self.turn_total += d
                self.turn_message = f"Rolled a {d}."
                return 'continue'

    def _do_hold(self):
        """Bank the turn total and end the turn."""
        banked = self.turn_total
        self.total_scores[self.current_player] += banked
        self.turn_message = (
            f"{self.players[self.current_player - 1]} holds, "
            f"banking {banked} points! "
            f"(Total: {self.total_scores[self.current_player]})"
        )
        self.turn_total = 0
        self.last_dice = []
        return True

    # ------------------------------------------------------------------ #
    #  Game over
    # ------------------------------------------------------------------ #

    def check_game_over(self):
        """Check if a player has reached the target score."""
        for p in (1, 2):
            if self.total_scores[p] >= self.target_score:
                self.game_over = True
                self.winner = p
                return

    def switch_player(self):
        """Switch player and reset turn state."""
        super().switch_player()
        self.turn_total = 0
        self.last_dice = []
        self.must_roll_again = False
        self.turn_message = ""

    # ------------------------------------------------------------------ #
    #  Save / Load
    # ------------------------------------------------------------------ #

    def get_state(self):
        """Return serializable game state."""
        return {
            'total_scores': {str(k): v for k, v in self.total_scores.items()},
            'turn_total': self.turn_total,
            'target_score': self.target_score,
            'last_dice': self.last_dice,
            'turn_message': self.turn_message,
            'must_roll_again': self.must_roll_again,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.total_scores = {int(k): v for k, v in state['total_scores'].items()}
        self.turn_total = state['turn_total']
        self.target_score = state['target_score']
        self.last_dice = state['last_dice']
        self.turn_message = state.get('turn_message', '')
        self.must_roll_again = state.get('must_roll_again', False)

    # ------------------------------------------------------------------ #
    #  Tutorial
    # ------------------------------------------------------------------ #

    def get_tutorial(self):
        """Return tutorial text for Pig."""
        txt = """
==================================================
  PIG TUTORIAL
==================================================

OVERVIEW:
  Pig is a simple dice game where players take
  turns rolling dice, trying to be the first to
  reach the target score (100 points).

  On each turn, you decide: roll again for more
  points, or hold to bank what you have?

STANDARD PIG (1 die):
  - Roll a single die on your turn.
  - If you roll 2-6, that value is added to your
    turn total. You may roll again or hold.
  - If you roll a 1, you lose ALL points
    accumulated during this turn. Your turn ends.
  - Choose "hold" to add your turn total to your
    permanent score. Your turn ends.
  - First player to reach 100 points wins!
"""
        if self.variation == 'two_dice':
            txt += """
TWO-DICE PIG:
  - Roll 2 dice instead of 1.
  - If EITHER die is a 1, you lose your turn
    total and your turn ends.
  - If BOTH dice are 1, you lose your ENTIRE
    score (not just the turn total)!
  - If you roll doubles (non-ones), you MUST
    roll again - you cannot hold.
  - Otherwise, both dice are added to your turn
    total. You may roll or hold.
"""
        elif self.variation == 'big_pig':
            txt += """
BIG PIG:
  - Same as standard, but with higher stakes!
  - If you roll a 1, you lose your ENTIRE score
    (not just the turn total).
  - Target is still 100 points.
  - This variant rewards cautious play - holding
    early and often is usually wise.
"""
        txt += """
COMMANDS:
  roll / r     - Roll the dice
  hold / h     - Bank your turn total

  quit / q     - Quit the game
  save / s     - Save and suspend
  help / h     - Show help
  tutorial / t - Show this tutorial
==================================================
"""
        return txt
