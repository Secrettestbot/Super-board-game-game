"""Backgammon - Classic board game of strategy and luck."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Standard starting positions: {point: (player, count)}
# Points 1-24, player 1 moves from 24 toward 1, player 2 moves from 1 toward 24
STANDARD_SETUP = {
    24: (1, 2), 13: (1, 5), 8: (1, 3), 6: (1, 5),
    1: (2, 2), 12: (2, 5), 17: (2, 3), 19: (2, 5),
}

NACKGAMMON_SETUP = {
    24: (1, 4), 23: (1, 1), 13: (1, 4), 8: (1, 2), 6: (1, 4),
    1: (2, 4), 2: (2, 1), 12: (2, 4), 17: (2, 2), 19: (2, 4),
}

HYPERGAMMON_SETUP = {
    24: (1, 1), 23: (1, 1), 22: (1, 1),
    1: (2, 1), 2: (2, 1), 3: (2, 1),
}


class BackgammonGame(BaseGame):
    """Full Backgammon implementation."""

    name = "Backgammon"
    description = "Classic game of strategy and dice - race your checkers home and bear them off"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard backgammon (15 checkers each)",
        "nackgammon": "Nackgammon - Nack Ballard's variant (different starting position)",
        "hypergammon": "Hypergammon - only 3 checkers each, fast game",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Board: points 1-24 stored as index 0-23
        # Positive values = player 1 checkers, negative = player 2 checkers
        self.points = [0] * 24
        self.bar = {1: 0, 2: 0}       # checkers on the bar
        self.borne_off = {1: 0, 2: 0}  # checkers borne off
        self.dice = []                  # current dice roll
        self.remaining_moves = []       # dice values still available this turn
        self.total_checkers = 15        # per player

    def setup(self):
        """Initialize the board based on variation."""
        self.points = [0] * 24
        self.bar = {1: 0, 2: 0}
        self.borne_off = {1: 0, 2: 0}

        if self.variation == "nackgammon":
            setup = NACKGAMMON_SETUP
            self.total_checkers = 15
        elif self.variation == "hypergammon":
            setup = HYPERGAMMON_SETUP
            self.total_checkers = 3
        else:
            setup = STANDARD_SETUP
            self.total_checkers = 15

        for point, (player, count) in setup.items():
            if player == 1:
                self.points[point - 1] = count
            else:
                self.points[point - 1] = -count

        self.dice = []
        self.remaining_moves = []

    # ------------------------------------------------------------------ #
    #  Coordinate helpers
    # ------------------------------------------------------------------ #

    def _player_sign(self, player):
        """Player 1 is positive, player 2 is negative."""
        return 1 if player == 1 else -1

    def _home_range(self, player):
        """Return (start, end) indices for the player's home board (inclusive)."""
        if player == 1:
            return (0, 5)     # points 1-6
        else:
            return (18, 23)   # points 19-24

    def _move_direction(self, player):
        """Player 1 moves from high to low point numbers (-1), player 2 low to high (+1)."""
        return -1 if player == 1 else 1

    def _point_has_player(self, idx, player):
        """True if point at idx has at least one checker of player."""
        sign = self._player_sign(player)
        return self.points[idx] * sign > 0

    def _point_count(self, idx, player):
        """How many of player's checkers are on point idx."""
        sign = self._player_sign(player)
        val = self.points[idx] * sign
        return val if val > 0 else 0

    def _is_blocked(self, idx, player):
        """True if opponent has 2+ checkers on point idx (blocks landing)."""
        opponent = 3 - player
        sign = self._player_sign(opponent)
        return self.points[idx] * sign >= 2

    def _all_in_home(self, player):
        """Check if all of player's checkers are in their home board (or borne off)."""
        sign = self._player_sign(player)
        home_start, home_end = self._home_range(player)
        if self.bar[player] > 0:
            return False
        for i in range(24):
            if home_start <= i <= home_end:
                continue
            if self.points[i] * sign > 0:
                return False
        return True

    def _farthest_checker_home(self, player):
        """Return the home-board point index of the farthest checker from bearing off.
        For player 1: highest index in 0-5 with checkers.
        For player 2: lowest index in 18-23 with checkers.
        Returns None if no checkers in home."""
        sign = self._player_sign(player)
        home_start, home_end = self._home_range(player)
        if player == 1:
            for i in range(home_end, home_start - 1, -1):
                if self.points[i] * sign > 0:
                    return i
        else:
            for i in range(home_start, home_end + 1):
                if self.points[i] * sign > 0:
                    return i
        return None

    # ------------------------------------------------------------------ #
    #  Dice
    # ------------------------------------------------------------------ #

    def _roll_dice(self):
        """Roll two dice. Doubles give 4 moves."""
        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        self.dice = [d1, d2]
        if d1 == d2:
            self.remaining_moves = [d1] * 4
        else:
            self.remaining_moves = [d1, d2]

    # ------------------------------------------------------------------ #
    #  Move validation
    # ------------------------------------------------------------------ #

    def _enter_from_bar(self, player, die_value):
        """Try entering a checker from the bar. Returns target index or None."""
        if player == 1:
            target = 24 - die_value  # entering into opponent's home board (points 19-24 = idx 18-23)
        else:
            target = die_value - 1   # entering into opponent's home board (points 1-6 = idx 0-5)

        if 0 <= target <= 23 and not self._is_blocked(target, player):
            return target
        return None

    def _can_bear_off(self, src_idx, die_value, player):
        """Check if bearing off from src_idx with die_value is legal.
        Returns True if exact or if src is the farthest checker and die is larger."""
        if player == 1:
            # Player 1 home is points 1-6 (idx 0-5), bears off going below idx 0
            needed = src_idx + 1  # exact die needed to bear off from this point
        else:
            # Player 2 home is points 19-24 (idx 18-23), bears off going above idx 23
            needed = 24 - src_idx  # exact die needed

        if die_value == needed:
            return True
        if die_value > needed:
            # Only allowed if no checkers are on a higher (farther) point
            farthest = self._farthest_checker_home(player)
            if farthest == src_idx:
                return True
        return False

    def _get_valid_moves_for_die(self, player, die_value):
        """Return list of valid (src, dst) pairs for a single die value.
        src = point index (0-23) or 'bar'. dst = point index or 'off'."""
        moves = []
        sign = self._player_sign(player)
        direction = self._move_direction(player)

        # Must enter from bar first
        if self.bar[player] > 0:
            target = self._enter_from_bar(player, die_value)
            if target is not None:
                moves.append(('bar', target))
            return moves  # can't move anything else while on bar

        for i in range(24):
            if self.points[i] * sign <= 0:
                continue
            dest = i + direction * die_value

            # Bear off
            if dest < 0 or dest > 23:
                if self._all_in_home(player) and self._can_bear_off(i, die_value, player):
                    moves.append((i, 'off'))
                continue

            if not self._is_blocked(dest, player):
                moves.append((i, dest))

        return moves

    def _has_any_valid_move(self, player):
        """Check if the player can make any move with remaining dice."""
        for die in set(self.remaining_moves):
            if self._get_valid_moves_for_die(player, die):
                return True
        return False

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

    def _point_label(self, idx):
        """Return the 1-based point number."""
        return str(idx + 1)

    def display(self):
        """Display the backgammon board in text format."""
        p1_sym = "X"  # player 1
        p2_sym = "O"  # player 2

        print(f"\n  {'Backgammon':^52}")
        print(f"  {self.players[0]} (X) vs {self.players[1]} (O)")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move "
              f"({'X' if self.current_player == 1 else 'O'})")
        print(f"  Borne off - X: {self.borne_off[1]}  O: {self.borne_off[2]}")
        if self.dice:
            print(f"  Dice: {self.dice}  Remaining: {self.remaining_moves}")
        print()

        # Top half: points 13-24 (displayed left to right)
        top_points = list(range(12, 24))   # idx 12..23 = points 13..24
        # Bottom half: points 12-1 (displayed left to right)
        bot_points = list(range(11, -1, -1))  # idx 11..0 = points 12..1

        # Header
        top_labels = []
        for idx in top_points:
            top_labels.append(f"{idx + 1:>3}")
        header = " ".join(top_labels[:6]) + "  BAR " + " ".join(top_labels[6:])
        print(f"  {header}")
        print(f"  {'─' * 56}")

        # Show up to 5 rows from the top
        for row in range(5):
            line = " "
            for i, idx in enumerate(top_points):
                val = self.points[idx]
                if abs(val) > row:
                    sym = p1_sym if val > 0 else p2_sym
                    line += f"  {sym} "
                elif abs(val) == row and abs(val) > 5:
                    # show count for stacks > 5
                    line += f" {abs(val):>2} "
                else:
                    line += "  · "
                if i == 5:
                    # Bar column
                    if row == 0 and self.bar[2] > 0:
                        line += f" {p2_sym}{self.bar[2]:<2}"
                    else:
                        line += "    "
            print(f"  {line}")

        # Middle separator
        print(f"  {'':>24}  ├──┤")

        # Show up to 5 rows from the bottom
        for row in range(4, -1, -1):
            line = " "
            for i, idx in enumerate(bot_points):
                val = self.points[idx]
                if abs(val) > row:
                    sym = p1_sym if val > 0 else p2_sym
                    line += f"  {sym} "
                elif abs(val) == row and abs(val) > 5:
                    line += f" {abs(val):>2} "
                else:
                    line += "  · "
                if i == 5:
                    if row == 0 and self.bar[1] > 0:
                        line += f" {p1_sym}{self.bar[1]:<2}"
                    else:
                        line += "    "
            print(f"  {line}")

        print(f"  {'─' * 56}")
        bot_labels = []
        for idx in bot_points:
            bot_labels.append(f"{idx + 1:>3}")
        footer = " ".join(bot_labels[:6]) + "  BAR " + " ".join(bot_labels[6:])
        print(f"  {footer}")
        print()

    # ------------------------------------------------------------------ #
    #  Input parsing
    # ------------------------------------------------------------------ #

    def _parse_single_move(self, move_str):
        """Parse a single move like '8/5' or 'bar/20' or '3/off'.
        Returns (src, dst) where src/dst are int indices, 'bar', or 'off'."""
        move_str = move_str.strip().lower()
        parts = move_str.split('/')
        if len(parts) != 2:
            return None

        src_str, dst_str = parts

        # Parse source
        if src_str == 'bar':
            src = 'bar'
        else:
            try:
                src_pt = int(src_str)
                if src_pt < 1 or src_pt > 24:
                    return None
                src = src_pt - 1  # convert to 0-based index
            except ValueError:
                return None

        # Parse destination
        if dst_str == 'off':
            dst = 'off'
        else:
            try:
                dst_pt = int(dst_str)
                if dst_pt < 1 or dst_pt > 24:
                    return None
                dst = dst_pt - 1
            except ValueError:
                return None

        return (src, dst)

    def _die_value_for_move(self, src, dst, player):
        """Calculate which die value a move src->dst would use. Returns int or None."""
        if src == 'bar':
            if player == 1:
                return 24 - dst
            else:
                return dst + 1
        elif dst == 'off':
            if player == 1:
                return src + 1
            else:
                return 24 - src
        else:
            diff = abs(dst - src)
            # Verify direction
            direction = self._move_direction(player)
            if (dst - src) * direction <= 0:
                return None  # wrong direction
            return diff

    def _validate_move(self, src, dst, die_value, player):
        """Validate a specific move. Returns True if legal."""
        valid_moves = self._get_valid_moves_for_die(player, die_value)
        return (src, dst) in valid_moves

    # ------------------------------------------------------------------ #
    #  Get move / Make move
    # ------------------------------------------------------------------ #

    def get_move(self):
        """Get moves from the current player for this dice roll.
        Returns list of (src, dst) tuples."""
        player = self.current_player

        # Roll dice at the start of the turn
        if not self.remaining_moves:
            self._roll_dice()
            clear_screen()
            self.display()

        if not self._has_any_valid_move(player):
            print(f"  No valid moves available with dice {self.remaining_moves}.")
            input_with_quit("  Press Enter to end turn (or type 'quit'): ")
            return 'no_moves'

        moves_made = []

        while self.remaining_moves and self._has_any_valid_move(player):
            # Show available dice
            print(f"  Remaining dice: {self.remaining_moves}")
            available_dice = sorted(set(self.remaining_moves))
            # Show valid moves
            all_valid = []
            for die in available_dice:
                for mv in self._get_valid_moves_for_die(player, die):
                    src_str = 'bar' if mv[0] == 'bar' else str(mv[0] + 1)
                    dst_str = 'off' if mv[1] == 'off' else str(mv[1] + 1)
                    all_valid.append(f"{src_str}/{dst_str}")
            print(f"  Valid moves: {', '.join(all_valid)}")

            move_input = input_with_quit(
                f"  {self.players[player - 1]}, enter move (e.g. 8/5) or 'done': "
            )

            if move_input.strip().lower() == 'done':
                # Player can only end early if no moves are possible
                if self._has_any_valid_move(player):
                    print("  You must use all possible dice values.")
                    continue
                break

            parsed = self._parse_single_move(move_input)
            if parsed is None:
                print("  Invalid format. Use 'point/point', 'bar/point', or 'point/off'.")
                continue

            src, dst = parsed
            die_value = self._die_value_for_move(src, dst, player)
            if die_value is None:
                print("  Invalid move direction.")
                continue

            if die_value not in self.remaining_moves:
                # For bearing off, check if a larger die can be used
                print(f"  No die showing {die_value}. Remaining: {self.remaining_moves}")
                continue

            if not self._validate_move(src, dst, die_value, player):
                print("  That is not a valid move.")
                continue

            # Apply the move immediately so subsequent moves see updated board
            self._apply_single_move(src, dst, player)
            self.remaining_moves.remove(die_value)
            moves_made.append((src, dst))

            if self.remaining_moves and self._has_any_valid_move(player):
                clear_screen()
                self.display()

        return moves_made if moves_made else 'no_moves'

    def _apply_single_move(self, src, dst, player):
        """Apply one checker move to the board."""
        sign = self._player_sign(player)
        opponent = 3 - player

        # Remove from source
        if src == 'bar':
            self.bar[player] -= 1
        else:
            self.points[src] -= sign

        # Place at destination
        if dst == 'off':
            self.borne_off[player] += 1
        else:
            # Check for hit (opponent has exactly 1 checker = blot)
            opp_sign = self._player_sign(opponent)
            if self.points[dst] * opp_sign == 1:
                # Hit! Send opponent's checker to bar
                self.points[dst] = 0
                self.bar[opponent] += 1
            self.points[dst] += sign

    def make_move(self, move):
        """Apply the move(s). The actual moves were already applied in get_move.
        Returns True if valid."""
        if move == 'no_moves':
            return True
        # Moves were already applied during get_move for interactive feedback
        return True

    def check_game_over(self):
        """Game ends when a player has borne off all checkers."""
        for player in [1, 2]:
            if self.borne_off[player] >= self.total_checkers:
                self.game_over = True
                self.winner = player
                return

    def get_state(self):
        """Serialize game state for saving."""
        return {
            'points': self.points[:],
            'bar': dict(self.bar),
            'borne_off': dict(self.borne_off),
            'dice': self.dice[:],
            'remaining_moves': self.remaining_moves[:],
            'total_checkers': self.total_checkers,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.points = state['points'][:]
        self.bar = {int(k): v for k, v in state['bar'].items()}
        self.borne_off = {int(k): v for k, v in state['borne_off'].items()}
        self.dice = state['dice'][:]
        self.remaining_moves = state['remaining_moves'][:]
        self.total_checkers = state['total_checkers']

    def get_tutorial(self):
        """Return comprehensive Backgammon tutorial text."""
        return """
╔══════════════════════════════════════════════════════════════╗
║                    BACKGAMMON TUTORIAL                        ║
╚══════════════════════════════════════════════════════════════╝

OVERVIEW
--------
Backgammon is a two-player game where each player races to move all
their checkers around the board and bear them off (remove them).
The first player to bear off all their checkers wins.

  Player 1 plays X - moves from point 24 toward point 1
  Player 2 plays O - moves from point 1 toward point 24

THE BOARD
---------
The board has 24 narrow triangles called "points", numbered 1-24.
Each player has a "home board" (the last 6 points before bearing off):
  Player 1 (X): points 1-6 (bears off past point 1)
  Player 2 (O): points 19-24 (bears off past point 24)

There is also a "bar" in the middle where hit checkers are placed.

STARTING POSITIONS
------------------
Standard: Each player starts with 15 checkers in the classic setup:
  Player 1 (X): 2 on point 24, 5 on point 13, 3 on point 8, 5 on point 6
  Player 2 (O): 2 on point 1, 5 on point 12, 3 on point 17, 5 on point 19

Nackgammon: A variant with a slightly different starting position
  that leads to more complex opening play.

Hypergammon: Only 3 checkers each, starting on the last 3 points.
  Very fast games with more luck involved.

ROLLING DICE
------------
Each turn, two dice are rolled automatically. You must use both dice
values if possible (as separate moves for different checkers, or both
for the same checker).

DOUBLES: If you roll doubles (e.g. 4-4), you get FOUR moves of that
value instead of two!

HOW TO MOVE
-----------
Enter moves in "source/destination" format using point numbers:
  8/5    - Move a checker from point 8 to point 5
  bar/20 - Enter a checker from the bar to point 20
  3/off  - Bear off a checker from point 3

You make one move at a time. After each move, you'll be prompted
for the next move until all dice values are used.

MOVEMENT RULES
--------------
1. You may only move to a point that is:
   - Empty, OR
   - Occupied by your own checkers, OR
   - Occupied by exactly ONE opponent checker (a "blot")

2. You MUST use all dice values if legally possible.
   If you can only use one die, you must use the larger one if possible.

HITTING
-------
If you land on a point with exactly ONE opponent checker (a blot),
that checker is "hit" and placed on the bar.

ENTERING FROM THE BAR
---------------------
If you have checkers on the bar, you MUST enter them before making
any other moves. To enter, you must roll a number corresponding to
an open point in your opponent's home board.

  Player 1 enters on points 19-24 (using dice values 1-6)
  Player 2 enters on points 1-6 (using dice values 1-6)

If you cannot enter (all entry points are blocked), you lose your turn.

BEARING OFF
-----------
Once ALL of your checkers are in your home board, you may begin
bearing off. To bear off:

1. Roll a number that exactly matches a point with your checker, OR
2. Roll a number HIGHER than your farthest checker - in that case,
   you bear off the farthest checker.

You must have ALL checkers in your home board to bear off. If a
checker is hit during bearing off, you must re-enter it and bring
it back to your home board before continuing to bear off.

GAME END
--------
The first player to bear off all their checkers wins.

STRATEGY TIPS
-------------
- Making "points" (having 2+ checkers) blocks your opponent.
- A "prime" (6 consecutive points you own) is nearly impassable.
- Balance advancing your checkers with blocking your opponent.
- Leaving blots in your opponent's home board is very risky.
- Sometimes it's worth hitting opponent blots to slow them down.

COMMANDS
--------
  Type your move  - Move a checker (e.g., 8/5)
  'done'          - End turn early (only if no moves available)
  'quit' or 'q'   - Quit the game
  'save' or 's'   - Save and suspend the game
  'help' or 'h'   - Show help
  'tutorial' / 't' - Show this tutorial
"""
