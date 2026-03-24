"""Abalone - Push opponent's marbles off a hexagonal board."""

from engine.base import BaseGame, input_with_quit, clear_screen


class AbaloneGame(BaseGame):
    """Abalone: Push opponent's marbles off the hexagonal board.

    Abalone is a two-player strategy game played on a hexagonal board.
    Players take turns moving 1-3 of their marbles in a line. A player
    can push opponent marbles off the board using sumito moves (where
    the attacker outnumbers the defender in the push direction).
    The first player to push 6 opponent marbles off the board wins.

    Uses axial coordinates (q, r) for the hex grid.
    """

    name = "Abalone"
    description = "Push opponent's marbles off the hexagonal board"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Abalone (14 marbles each)",
        "small": "Small (9 marbles each, smaller board)",
    }

    # Six hex directions in axial coordinates (q, r)
    # East, West, NE, SW, NW, SE
    DIRECTIONS = {
        'E':  (+1,  0),
        'W':  (-1,  0),
        'NE': (+1, -1),
        'SW': (-1, +1),
        'NW': ( 0, -1),
        'SE': ( 0, +1),
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board = {}       # (q, r) -> player (1 or 2), only occupied cells
        self.valid_cells = set()  # set of (q, r) that are on the board
        self.captured = {1: 0, 2: 0}  # marbles captured BY each player
        self.board_radius = 0

    def setup(self):
        """Initialize the hex board and place marbles."""
        if self.variation == "small":
            self._setup_small()
        else:
            self._setup_standard()

    def _setup_standard(self):
        """Standard board: radius 4 (61 hexes), 14 marbles each."""
        self.board_radius = 4
        self.valid_cells = set()
        self.board = {}
        self.captured = {1: 0, 2: 0}

        # Generate all valid cells for a hex with radius 4
        for q in range(-4, 5):
            for r in range(-4, 5):
                if abs(q + r) <= 4:
                    self.valid_cells.add((q, r))

        # Standard starting positions for player 1 (bottom)
        # Row r=4: q from -4 to 0 (5 marbles)
        for q in range(-4, 1):
            self.board[(q, 4)] = 1
        # Row r=3: q from -4 to 1 (6 marbles)
        for q in range(-4, 2):
            self.board[(q, 3)] = 1
        # Row r=2: middle 3, q from -1 to 1
        for q in range(-1, 2):
            self.board[(q, 2)] = 1

        # Standard starting positions for player 2 (top) - mirror
        # Row r=-4: q from 0 to 4 (5 marbles)
        for q in range(0, 5):
            self.board[(q, -4)] = 2
        # Row r=-3: q from -1 to 4 (6 marbles)
        for q in range(-1, 5):
            self.board[(q, -3)] = 2
        # Row r=-2: middle 3, q from -1 to 1
        for q in range(-1, 2):
            self.board[(q, -2)] = 2

    def _setup_small(self):
        """Small board: radius 3 (37 hexes), 9 marbles each."""
        self.board_radius = 3
        self.valid_cells = set()
        self.board = {}
        self.captured = {1: 0, 2: 0}

        for q in range(-3, 4):
            for r in range(-3, 4):
                if abs(q + r) <= 3:
                    self.valid_cells.add((q, r))

        # Player 1 (bottom)
        for q in range(-3, 1):
            self.board[(q, 3)] = 1
        for q in range(-2, 1):
            self.board[(q, 2)] = 1
        # Center bottom 2
        self.board[(0, 1)] = 1
        self.board[(-1, 1)] = 1

        # Player 2 (top) - mirror
        for q in range(0, 4):
            self.board[(q, -3)] = 2
        for q in range(0, 3):
            self.board[(q, -2)] = 2
        self.board[(0, -1)] = 2
        self.board[(1, -1)] = 2

    def _axial_to_label(self, q, r):
        """Convert axial (q, r) to a human-readable label like 'c3'.

        We map the board so that columns are labeled a-i (left to right)
        and rows are labeled 1-9 (bottom to top) for standard,
        or a-g and 1-7 for small.
        """
        radius = self.board_radius
        # Column: based on q offset by row
        # In the display, for row index ri (from top), col index ci,
        # we use a different mapping. Let's use the standard Abalone notation.
        # Row number = radius - r + 1 (bottom row r=radius -> row 1... wait,
        # standard notation: row 1 is bottom)
        # Actually for Abalone: rows labeled 1-9 from bottom to top
        # Row label = radius + 1 - r  (when r = radius -> row 1, r = -radius -> row 2*radius+1)
        # Hmm, let's use: row_label = radius - r + 1? No...
        # r=-4 -> top, row 9; r=4 -> bottom, row 1
        # So row_label = radius - r + 1... for r=-4, radius=4: 4-(-4)+1=9. For r=4: 4-4+1=1.
        # But standard Abalone has row 1 at bottom. Let me just do:
        row_num = self.board_radius - r + 1  # wrong direction
        # Actually: r=4 is bottom, should be row 1. r=-4 is top, should be row 9.
        # row_num = radius + 1 - r... for r=4: 4+1-4=1. For r=-4: 4+1-(-4)=9.
        # Hmm that's radius - r + 1 = 4 - 4 + 1 = 1. Yes.
        row_num = radius - r + 1

        # Column letter: within a given row, the leftmost cell gets 'a'
        # For row r, valid q values range from max(-radius, -radius - r) to min(radius, radius - r)
        q_min = max(-radius, -radius - r)
        col_idx = q - q_min
        col_letter = chr(ord('a') + col_idx)
        return f"{col_letter}{row_num}"

    def _label_to_axial(self, label):
        """Convert a label like 'c3' to axial (q, r). Returns None if invalid."""
        label = label.strip().lower()
        if len(label) < 2:
            return None
        col_letter = label[0]
        try:
            row_num = int(label[1:])
        except ValueError:
            return None

        radius = self.board_radius
        diameter = 2 * radius + 1

        if not ('a' <= col_letter <= chr(ord('a') + diameter - 1)):
            return None
        if row_num < 1 or row_num > diameter:
            return None

        r = radius - row_num + 1
        q_min = max(-radius, -radius - r)
        col_idx = ord(col_letter) - ord('a')
        q = q_min + col_idx

        if (q, r) not in self.valid_cells:
            return None
        return (q, r)

    def display(self):
        """Display the hex board with ASCII art."""
        radius = self.board_radius
        symbols = {1: 'O', 2: '@'}  # Player 1 = O (white), Player 2 = @ (black)

        print(f"\n  === Abalone ({self.variation}) ===")
        print(f"  {self.players[0]} (O) vs {self.players[1]} (@)")
        print(f"  Captured: {self.players[0]}: {self.captured[1]}  |  "
              f"{self.players[1]}: {self.captured[2]}")
        print(f"  Current turn: {self.players[self.current_player - 1]} "
              f"({'O' if self.current_player == 1 else '@'})")
        print(f"  First to capture 6 wins!")
        print()

        # Display rows from top (r = -radius) to bottom (r = radius)
        for r in range(-radius, radius + 1):
            q_min = max(-radius, -radius - r)
            q_max = min(radius, radius - r)
            num_cells = q_max - q_min + 1

            row_num = radius - r + 1
            # Indent for hex layout: more indent for rows with fewer cells
            indent = abs(r)
            line = " " * (indent * 2)
            line = f"  {line}{row_num:>2}  "

            cells = []
            for q in range(q_min, q_max + 1):
                if (q, r) in self.board:
                    cells.append(f" {symbols[self.board[(q, r)]]}")
                else:
                    cells.append(" .")
            line += " ".join(c.strip() for c in cells)
            print(line)

        # Column letters at the bottom
        # The bottom row (r=radius) has cells from q_min to q_max
        # We show labels for the widest row (r near 0)
        # Actually, let's show column labels per-row style at the bottom
        # Just show the label range
        bottom_q_min = max(-radius, -radius - radius)  # r=radius
        bottom_q_max = min(radius, radius - radius)     # r=radius
        # For the widest row (r=0 for even, or close)
        mid_q_min = max(-radius, -radius - 0)
        mid_q_max = min(radius, radius - 0)

        # Print column letters for reference under the bottom row
        bottom_indent = abs(radius)
        bot_q_min = max(-radius, -radius - radius)
        bot_q_max = min(radius, radius - radius)
        bot_labels = "  " + " " * (bottom_indent * 2) + "    "
        for q in range(bot_q_min, bot_q_max + 1):
            col_idx = q - bot_q_min
            bot_labels += " " + chr(ord('a') + col_idx)
        print(bot_labels)
        print()

    def get_move(self):
        """Get a move from the current player.

        Input formats:
          Single marble: "c3 d3" (move marble at c3 to d3)
          Group inline:  "c3c5 d4" (move marbles c3-c5 in direction toward d4)
                         The first part specifies a range (from-to), second is
                         where the 'from' marble ends up, defining the direction.
        """
        player_name = self.players[self.current_player - 1]
        symbol = 'O' if self.current_player == 1 else '@'

        while True:
            raw = input_with_quit(
                f"  {player_name} ({symbol}), enter move "
                f"(e.g. 'c3 d3' or 'a1a3 b2'): "
            ).strip().lower()

            move = self._parse_move(raw)
            if move is None:
                print("  Invalid input format. Use 'c3 d3' for single or "
                      "'c3c5 d4' for group moves.")
                continue
            return move

    def _parse_move(self, raw):
        """Parse move input. Returns (marbles_list, direction) or None.

        'marbles_list' is a list of (q, r) positions of marbles to move.
        'direction' is (dq, dr).
        """
        parts = raw.split()
        if len(parts) != 2:
            return None

        source_str = parts[0]
        dest_str = parts[1]

        dest = self._label_to_axial(dest_str)
        if dest is None:
            return None

        # Try single marble move: "c3 d3"
        source = self._label_to_axial(source_str)
        if source is not None:
            # Single marble move
            dq = dest[0] - source[0]
            dr = dest[1] - source[1]
            direction = (dq, dr)
            if direction not in self.DIRECTIONS.values():
                print(f"  Direction ({dq},{dr}) is not a valid hex direction.")
                return None
            return ([source], direction)

        # Try group move: "c3c5 d4" - source_str contains two labels
        # Need to split source_str into two labels
        # Labels are like "a1" to "i9" - letter followed by digit(s)
        group = self._parse_group_source(source_str)
        if group is None:
            return None

        start, end = group
        start_ax = self._label_to_axial(start)
        end_ax = self._label_to_axial(end)
        if start_ax is None or end_ax is None:
            return None

        # Find the marbles in the line from start to end
        marbles = self._get_marbles_in_line(start_ax, end_ax)
        if marbles is None:
            print("  Marbles must be in a straight line on the hex grid.")
            return None

        if len(marbles) < 2 or len(marbles) > 3:
            print("  Group must be 2 or 3 marbles.")
            return None

        # Direction: where does the first marble (start) go?
        dq = dest[0] - start_ax[0]
        dr = dest[1] - start_ax[1]
        direction = (dq, dr)
        if direction not in self.DIRECTIONS.values():
            print(f"  Direction is not a valid hex direction.")
            return None

        return (marbles, direction)

    def _parse_group_source(self, s):
        """Parse 'c3c5' into ('c3', 'c5'). Returns (label1, label2) or None."""
        # A label is a letter followed by one or more digits
        # Find the split point: after the first label ends
        if len(s) < 4:
            return None
        i = 1
        while i < len(s) and s[i].isdigit():
            i += 1
        if i >= len(s) or not s[i].isalpha():
            return None
        return (s[:i], s[i:])

    def _get_marbles_in_line(self, start, end):
        """Get list of positions from start to end in a hex line.

        Returns list of (q,r) positions or None if not a valid line.
        """
        dq = end[0] - start[0]
        dr = end[1] - start[1]

        # Determine the hex direction
        # For axial coords, valid directions have components in {-1, 0, 1}
        # or are multiples of a unit direction
        length = max(abs(dq), abs(dr), abs(dq + dr))
        if length == 0:
            return [start]
        if length > 2:  # max 3 marbles = distance 2
            return None

        # Unit direction
        udq = dq // length if dq != 0 else 0
        udr = dr // length if dr != 0 else 0

        if (udq, udr) not in self.DIRECTIONS.values():
            return None

        # Verify it's actually a valid direction by checking each step
        positions = []
        for step in range(length + 1):
            pos = (start[0] + udq * step, start[1] + udr * step)
            positions.append(pos)

        # Verify the last position matches end
        if positions[-1] != end:
            return None

        return positions

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        marbles, direction = move
        player = self.current_player
        opponent = 3 - player
        dq, dr = direction

        # Validate all marbles belong to current player
        for pos in marbles:
            if self.board.get(pos) != player:
                print("  You can only move your own marbles.")
                return False

        # Determine if this is an inline move or a broadside move
        if len(marbles) == 1:
            # Single marble: always inline
            return self._make_inline_move(marbles, direction, player, opponent)
        else:
            # Check if direction is along the line of marbles (inline) or perpendicular (broadside)
            line_dq = marbles[1][0] - marbles[0][0]
            line_dr = marbles[1][1] - marbles[0][1]

            if (dq, dr) == (line_dq, line_dr) or (dq, dr) == (-line_dq, -line_dr):
                # Inline move (along the line)
                return self._make_inline_move(marbles, direction, player, opponent)
            else:
                # Broadside move (perpendicular - all marbles move same direction)
                return self._make_broadside_move(marbles, direction, player)

    def _make_inline_move(self, marbles, direction, player, opponent):
        """Execute an inline move (along the line of marbles). Can push."""
        dq, dr = direction

        # Find the front marble (the one moving in the direction)
        # Sort marbles along the direction
        if len(marbles) > 1:
            # Determine which end is the "front" in the push direction
            # The front marble is the one whose next position is NOT another marble in the group
            front = None
            back = None
            for m in marbles:
                next_pos = (m[0] + dq, m[1] + dr)
                if next_pos not in marbles:
                    front = m
                prev_pos = (m[0] - dq, m[1] - dr)
                if prev_pos not in marbles:
                    back = m
            if front is None:
                return False
        else:
            front = marbles[0]

        # Check what's in front
        pushed_opponents = []
        check_pos = (front[0] + dq, front[1] + dr)

        while True:
            if check_pos not in self.valid_cells:
                # Off the board - if we're pushing opponents, the front opponent falls off
                if len(pushed_opponents) > 0:
                    break  # opponent pushed off
                else:
                    print("  Cannot move off the board.")
                    return False
            if check_pos not in self.board:
                # Empty space - move is valid
                break
            if self.board[check_pos] == player:
                # Blocked by own marble
                print("  Blocked by your own marble.")
                return False
            if self.board[check_pos] == opponent:
                pushed_opponents.append(check_pos)
                if len(pushed_opponents) >= len(marbles):
                    # Can't push equal or more opponents
                    print("  Not enough marbles to push (sumito requires outnumbering).")
                    return False
                check_pos = (check_pos[0] + dq, check_pos[1] + dr)
            else:
                break

        # Execute the move
        # First, handle pushed opponents (from farthest to nearest)
        for opp_pos in reversed(pushed_opponents):
            new_opp_pos = (opp_pos[0] + dq, opp_pos[1] + dr)
            del self.board[opp_pos]
            if new_opp_pos in self.valid_cells:
                self.board[new_opp_pos] = opponent
            else:
                # Marble pushed off the board!
                self.captured[player] += 1

        # Move own marbles (from front to back to avoid collisions)
        # Order marbles from front to back in the direction of movement
        sorted_marbles = sorted(marbles,
                                key=lambda m: m[0] * dq + m[1] * dr,
                                reverse=True)
        for m in sorted_marbles:
            del self.board[m]
        for m in sorted_marbles:
            new_pos = (m[0] + dq, m[1] + dr)
            self.board[new_pos] = player

        return True

    def _make_broadside_move(self, marbles, direction, player):
        """Execute a broadside move (perpendicular). Cannot push."""
        dq, dr = direction

        # Check all destination cells
        for m in marbles:
            new_pos = (m[0] + dq, m[1] + dr)
            if new_pos not in self.valid_cells:
                print("  Cannot move marble off the board in broadside move.")
                return False
            if new_pos in self.board and new_pos not in marbles:
                print("  Destination blocked (broadside moves cannot push).")
                return False

        # Execute: remove all, then place all
        for m in marbles:
            del self.board[m]
        for m in marbles:
            new_pos = (m[0] + dq, m[1] + dr)
            self.board[new_pos] = player

        return True

    def check_game_over(self):
        """Check if either player has captured 6 opponent marbles."""
        for player in [1, 2]:
            if self.captured[player] >= 6:
                self.game_over = True
                self.winner = player
                return

    def get_state(self):
        """Return serializable game state."""
        # Convert tuple keys to strings for JSON serialization
        board_serialized = {f"{q},{r}": p for (q, r), p in self.board.items()}
        valid_serialized = sorted([list(c) for c in self.valid_cells])
        return {
            "board": board_serialized,
            "valid_cells": valid_serialized,
            "captured": {str(k): v for k, v in self.captured.items()},
            "board_radius": self.board_radius,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board_radius = state["board_radius"]
        self.valid_cells = set(tuple(c) for c in state["valid_cells"])
        self.board = {}
        for key, val in state["board"].items():
            q, r = key.split(",")
            self.board[(int(q), int(r))] = val
        self.captured = {int(k): v for k, v in state["captured"].items()}

    def get_tutorial(self):
        """Return tutorial text for Abalone."""
        return """
==============================================================
                    ABALONE  TUTORIAL
==============================================================

OVERVIEW
  Abalone is a two-player strategy game played on a hexagonal
  board. Each player has 14 marbles (standard) or 9 (small).
  The goal is to push 6 of your opponent's marbles off the
  edge of the board.

--------------------------------------------------------------
THE BOARD
--------------------------------------------------------------
  The board is a hexagonal grid with 61 spaces (standard) or
  37 spaces (small variant). Positions are labeled with a
  column letter and row number, e.g. 'a1', 'e5', 'i9'.

  Row 1 is at the bottom, row 9 at the top (standard).
  Column 'a' is leftmost within each row.

--------------------------------------------------------------
MOVING MARBLES
--------------------------------------------------------------
  On your turn, you move 1, 2, or 3 of your own marbles.
  All moved marbles must be in a connected straight line on
  the hex grid. There are 6 possible directions.

  Two types of moves:
  1. INLINE: Marbles move along their own line direction.
     Only inline moves can push opponent marbles.
  2. BROADSIDE: Marbles move sideways (perpendicular to their
     line). All marbles shift together. Cannot push.

--------------------------------------------------------------
PUSHING (SUMITO)
--------------------------------------------------------------
  When moving inline, you can push opponent marbles if:
    - Your group outnumbers the opponent's group being pushed
    - 2 vs 1, 3 vs 1, or 3 vs 2 are valid pushes
    - 1 vs 1, 2 vs 2, 3 vs 3 are NOT valid (no push)

  Pushed marbles move in the same direction. If a marble is
  pushed off the edge of the board, it is captured!

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Single marble move:
    source destination
    Example: c3 d3   (move marble from c3 to d3)

  Group move:
    startEnd destination
    Example: c3c5 d4  (move the line c3-c4-c5, with c3
                        moving to d4, defining the direction)

  The destination in a group move tells where the FIRST marble
  of the range goes, which determines the direction.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  Push 6 of your opponent's marbles off the board to win!

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  standard : 61-hex board, 14 marbles each
  small    : 37-hex board, 9 marbles each

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Keep your marbles together in tight groups for defense.
  - A group of 3 is very powerful - it can push 1 or 2.
  - Attack isolated marbles near the edge.
  - Avoid spreading your marbles too thin.
  - The center of the board is the safest position.
  - Force your opponent toward the edges.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
