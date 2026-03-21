"""Shut the Box - Classic dice and tile game."""

import random
from itertools import combinations
from engine.base import BaseGame, input_with_quit, clear_screen


def _find_combinations(tiles_up, target):
    """Find all subsets of tiles_up that sum to target."""
    result = []
    for r in range(1, len(tiles_up) + 1):
        for combo in combinations(tiles_up, r):
            if sum(combo) == target:
                result.append(combo)
    return result


class ShutTheBoxGame(BaseGame):
    """Shut the Box - flip tiles to match dice rolls."""

    name = "Shut the Box"
    description = "Roll dice and flip numbered tiles to reach the lowest score"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (tiles 1-9)",
        "twelve": "Extended (tiles 1-12)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_tiles = 9
        # tiles_up[player] = set of tiles still up
        self.tiles_up = {1: set(), 2: set()}
        # scores[player] = list of scores per round
        self.scores = {1: [], 2: []}
        self.round_number = 1
        self.max_rounds = 3
        # Current turn state
        self.dice = []
        self.dice_total = 0
        self.turn_phase = "rolling"  # rolling, choosing, done
        self.available_combos = []
        self.instant_win = None  # player who shut the box

    def setup(self):
        self.num_tiles = 12 if self.variation == "twelve" else 9
        self.tiles_up = {
            1: set(range(1, self.num_tiles + 1)),
            2: set(range(1, self.num_tiles + 1)),
        }
        self.scores = {1: [], 2: []}
        self.round_number = 1
        self.max_rounds = 3
        self.dice = []
        self.dice_total = 0
        self.turn_phase = "rolling"
        self.available_combos = []
        self.instant_win = None
        self.game_over = False
        self.winner = None
        self.current_player = 1

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

    def _render_box(self, player):
        """Render the tile box for a player."""
        tiles = self.tiles_up[player]
        n = self.num_tiles
        lines = []

        # Top border
        cell_width = 5
        total_width = n * cell_width + 1
        lines.append("+" + "-" * (total_width - 2) + "+")

        # Tile numbers row
        num_row = "|"
        for t in range(1, n + 1):
            if t in tiles:
                num_row += f" {t:>2} "
            else:
                num_row += " -- "
        num_row += "|"
        lines.append(num_row)

        # Status row
        stat_row = "|"
        for t in range(1, n + 1):
            if t in tiles:
                stat_row += " UP "
            else:
                stat_row += " dn "
        stat_row += "|"
        lines.append(stat_row)

        # Bottom border
        lines.append("+" + "-" * (total_width - 2) + "+")

        return "\n".join(lines)

    def _render_dice(self):
        """Render the dice result."""
        if not self.dice:
            return ""
        art = {
            1: ["+-------+", "|       |", "|   *   |", "|       |", "+-------+"],
            2: ["+-------+", "| *     |", "|       |", "|     * |", "+-------+"],
            3: ["+-------+", "| *     |", "|   *   |", "|     * |", "+-------+"],
            4: ["+-------+", "| *   * |", "|       |", "| *   * |", "+-------+"],
            5: ["+-------+", "| *   * |", "|   *   |", "| *   * |", "+-------+"],
            6: ["+-------+", "| *   * |", "| *   * |", "| *   * |", "+-------+"],
        }
        lines = []
        for row in range(5):
            parts = [art[d][row] for d in self.dice]
            lines.append("  ".join(parts))
        lines.append(f"  Total: {self.dice_total}")
        return "\n".join(lines)

    def display(self):
        print(f"\n{'=' * 56}")
        print(f"  SHUT THE BOX  -  Round {self.round_number}/{self.max_rounds}"
              f"  -  {self.players[self.current_player - 1]}'s turn")
        print(f"{'=' * 56}\n")

        # Show scores from previous rounds
        if self.scores[1] or self.scores[2]:
            print("  Previous rounds:")
            for r_idx in range(len(self.scores[1])):
                s1 = self.scores[1][r_idx]
                s2 = self.scores[2][r_idx] if r_idx < len(self.scores[2]) else "?"
                print(f"    Round {r_idx + 1}: {self.players[0]}={s1}  "
                      f"{self.players[1]}={s2}")
            print()

        # Show current player's box
        print(f"  {self.players[self.current_player - 1]}'s tiles:")
        print(self._render_box(self.current_player))

        if self.dice:
            print()
            print(self._render_dice())

        if self.available_combos:
            print("\n  Valid combinations:")
            for i, combo in enumerate(self.available_combos, 1):
                tiles_str = " ".join(str(t) for t in sorted(combo))
                print(f"    {i}. {tiles_str}  (sum={sum(combo)})")
        print()

    # ------------------------------------------------------------------ #
    #  Move handling
    # ------------------------------------------------------------------ #

    def _can_use_one_die(self, player):
        """Check if player can roll 1 die (tiles 7,8,9 all down)."""
        high_tiles = {7, 8, 9}
        if self.num_tiles == 12:
            high_tiles = {7, 8, 9, 10, 11, 12}
        # For standard: can use 1 die if 7, 8, 9 are all down
        # Only check 7, 8, 9 regardless of variant per traditional rules
        return not ({7, 8, 9} & self.tiles_up[player])

    def _roll_dice(self, num_dice):
        """Roll the specified number of dice."""
        self.dice = [random.randint(1, 6) for _ in range(num_dice)]
        self.dice_total = sum(self.dice)

    def get_move(self):
        """Handle the full turn for the current player internally."""
        player = self.current_player
        tiles = self.tiles_up[player]

        # Reset tiles for this player at the start of a new round
        # (tiles get reset when we start a fresh round)

        # Player's turn loop: roll, choose tiles, repeat until stuck or done
        while True:
            clear_screen()

            # Check if we can offer 1-die option
            can_one = self._can_use_one_die(player)

            if can_one:
                self.dice = []
                self.dice_total = 0
                self.available_combos = []
                self.display()
                while True:
                    choice = input_with_quit(
                        "Roll 1 or 2 dice? (1/2): ").strip()
                    if choice in ("1", "2"):
                        num_dice = int(choice)
                        break
                    print("Please enter 1 or 2.")
            else:
                num_dice = 2

            # Roll
            self._roll_dice(num_dice)

            # Find valid combinations
            self.available_combos = _find_combinations(
                sorted(self.tiles_up[player]), self.dice_total)

            clear_screen()
            self.display()

            if not self.available_combos:
                # No valid moves - turn over
                score = sum(self.tiles_up[player])
                print(f"  No valid combination! Turn over.")
                print(f"  Score this round: {score}")
                input("\n  Press Enter to continue...")
                return ("end_turn", score, False)

            # Get player's tile choice
            while True:
                raw = input_with_quit(
                    "  Enter tiles to flip (e.g. '3 5'), or # to pick "
                    "a combo by number: ").strip()
                if not raw:
                    continue

                # Try as combo number
                if raw.isdigit():
                    idx = int(raw)
                    if 1 <= idx <= len(self.available_combos):
                        chosen = self.available_combos[idx - 1]
                        break
                    else:
                        print(f"  Pick 1-{len(self.available_combos)}.")
                        continue

                # Parse tile numbers
                try:
                    chosen_tiles = tuple(sorted(int(x) for x in raw.split()))
                except ValueError:
                    print("  Enter tile numbers separated by spaces.")
                    continue

                # Validate
                if any(t not in self.tiles_up[player] for t in chosen_tiles):
                    bad = [t for t in chosen_tiles
                           if t not in self.tiles_up[player]]
                    print(f"  Tile(s) {bad} not available (already down).")
                    continue
                if sum(chosen_tiles) != self.dice_total:
                    print(f"  Tiles must sum to {self.dice_total} "
                          f"(got {sum(chosen_tiles)}).")
                    continue
                # Check it's a valid combo (no duplicates, all up)
                if len(chosen_tiles) != len(set(chosen_tiles)):
                    print("  No duplicate tiles allowed.")
                    continue
                chosen = chosen_tiles
                break

            # Flip chosen tiles down
            for t in chosen:
                self.tiles_up[player].discard(t)

            # Check for shut the box
            if not self.tiles_up[player]:
                clear_screen()
                self.dice = []
                self.available_combos = []
                self.display()
                print("  *** SHUT THE BOX! ***")
                print(f"  {self.players[player - 1]} scores 0 - INSTANT WIN!")
                input("\n  Press Enter to continue...")
                return ("end_turn", 0, True)

            # Continue rolling (loop back)

    def make_move(self, move):
        """Process the result of a turn."""
        _, score, shut = move
        player = self.current_player

        self.scores[player].append(score)

        if shut:
            self.instant_win = player
            return True

        # After player 2 finishes, check the round
        if player == 2:
            # Both players have completed this round
            # Reset tiles for next round (handled in _start_new_round)
            pass

        # Reset dice display
        self.dice = []
        self.dice_total = 0
        self.available_combos = []

        return True

    def _start_new_round(self):
        """Reset tiles for a new round."""
        self.tiles_up = {
            1: set(range(1, self.num_tiles + 1)),
            2: set(range(1, self.num_tiles + 1)),
        }
        self.round_number += 1

    def switch_player(self):
        """Override to handle round transitions."""
        if self.current_player == 1:
            self.current_player = 2
        else:
            # Player 2 just finished; start new round
            self._start_new_round()
            self.current_player = 1

    def check_game_over(self):
        """Check if the game is over."""
        # Instant win
        if self.instant_win:
            self.game_over = True
            self.winner = self.instant_win
            return

        # Need both players to have equal number of scores to evaluate a round
        if len(self.scores[1]) != len(self.scores[2]):
            return

        rounds_played = len(self.scores[1])

        # Count round wins
        wins = {1: 0, 2: 0}
        for r in range(rounds_played):
            s1 = self.scores[1][r]
            s2 = self.scores[2][r]
            if s1 < s2:
                wins[1] += 1
            elif s2 < s1:
                wins[2] += 1
            # tie: neither gets a win, play another round

        # Check for best of 3 winner
        for p in (1, 2):
            if wins[p] >= 2:
                self.game_over = True
                self.winner = p
                return

        # If all max_rounds played without a best-of-3 winner
        if rounds_played >= self.max_rounds:
            # Check if latest round was a tie - extend
            if self.scores[1][-1] == self.scores[2][-1]:
                # Tied round - play another
                self.max_rounds += 1
                return

            # Determine winner by total round wins
            if wins[1] > wins[2]:
                self.game_over = True
                self.winner = 1
            elif wins[2] > wins[1]:
                self.game_over = True
                self.winner = 2
            else:
                # Still tied overall - play another round
                self.max_rounds += 1

    # ------------------------------------------------------------------ #
    #  Save / Load
    # ------------------------------------------------------------------ #

    def get_state(self):
        return {
            "num_tiles": self.num_tiles,
            "tiles_up": {
                str(k): sorted(v) for k, v in self.tiles_up.items()
            },
            "scores": {
                str(k): v for k, v in self.scores.items()
            },
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "instant_win": self.instant_win,
        }

    def load_state(self, state):
        self.num_tiles = state["num_tiles"]
        self.tiles_up = {
            int(k): set(v) for k, v in state["tiles_up"].items()
        }
        self.scores = {
            int(k): v for k, v in state["scores"].items()
        }
        self.round_number = state["round_number"]
        self.max_rounds = state["max_rounds"]
        self.instant_win = state.get("instant_win")
        self.dice = []
        self.dice_total = 0
        self.available_combos = []

    # ------------------------------------------------------------------ #
    #  Tutorial
    # ------------------------------------------------------------------ #

    def get_tutorial(self):
        return """
==================================================
  SHUT THE BOX TUTORIAL
==================================================

OVERVIEW:
  Shut the Box is a classic dice game played with
  numbered tiles. Each player tries to "shut" (flip
  down) as many tiles as possible to achieve the
  lowest score.

TILES:
  Standard: Tiles numbered 1-9
  Extended: Tiles numbered 1-12

EACH TURN:
  1. All your tiles start face up.
  2. Roll two dice (if tiles 7, 8, and 9 are all
     already down, you may choose to roll just 1 die).
  3. Choose any combination of UP tiles that sum to
     the dice total. For example, if you roll 8, you
     could flip down 8, or 3+5, or 1+3+4, etc.
  4. Flip those tiles down.
  5. Roll again and repeat.
  6. If no valid combination exists for your roll,
     your turn ends.

SCORING:
  Your score = sum of tiles still face up.
  Lower score is better!

SHUT THE BOX:
  If you flip ALL tiles down (score = 0), you
  "Shut the Box" and win instantly!

WINNING:
  - After both players take a turn, the lower
    score wins the round.
  - Play best of 3 rounds.
  - If a round is tied, an extra round is played.
  - Shutting the box wins the game immediately.

INPUT:
  Enter tile numbers separated by spaces:
    "3 5"  - flip tiles 3 and 5
    "8"    - flip tile 8
  Or enter a combo number from the list shown.

COMMANDS:
  quit / q       - Quit the game
  save / s       - Save and suspend
  help / h       - Show help
  tutorial / t   - Show this tutorial
==================================================
"""
