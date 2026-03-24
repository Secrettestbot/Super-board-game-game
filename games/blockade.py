"""Blockade - A wall-placement race game."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


class BlockadeGame(BaseGame):
    """Blockade: Race your pawns while placing walls to block your opponent."""

    name = "Blockade"
    description = "A wall-placement race game - move pawns and place walls"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Blockade (11x14)",
        "small": "Small Blockade (7x8)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.cols = 0
        self.rows = 0
        # pawns: {player: [(row, col), ...]}
        self.pawns = {}
        # walls stored as sets of frozen wall segments
        # horizontal wall at (r, c) blocks movement between row r-1 and r at cols c and c+1
        self.h_walls = set()  # (row, col) - wall on top edge of (row, col) spanning cols col and col+1
        # vertical wall at (r, c) blocks movement between col c-1 and c at rows r and r+1
        self.v_walls = set()  # (row, col) - wall on left edge of (row, col) spanning rows row and row+1

    def setup(self):
        """Initialize board and pawns."""
        if self.variation == "small":
            self.cols = 7
            self.rows = 8
            # 1 pawn each for small
            mid = self.cols // 2
            self.pawns = {
                1: [(0, mid)],
                2: [(self.rows - 1, mid)],
            }
        else:
            self.cols = 11
            self.rows = 14
            # 2 pawns each for standard
            c1 = self.cols // 3
            c2 = 2 * self.cols // 3
            self.pawns = {
                1: [(0, c1), (0, c2)],
                2: [(self.rows - 1, c1), (self.rows - 1, c2)],
            }
        self.h_walls = set()
        self.v_walls = set()

    def _col_to_letter(self, c):
        """Convert column index to letter (a, b, c, ...)."""
        return chr(ord('a') + c)

    def _letter_to_col(self, letter):
        """Convert letter to column index."""
        return ord(letter.lower()) - ord('a')

    def _pos_to_algebraic(self, row, col):
        """Convert (row, col) to algebraic notation like 'a1'."""
        return f"{self._col_to_letter(col)}{row + 1}"

    def _algebraic_to_pos(self, s):
        """Convert algebraic notation like 'a1' to (row, col)."""
        if len(s) < 2:
            return None
        letter_part = ""
        num_part = ""
        for ch in s:
            if ch.isalpha():
                letter_part += ch
            else:
                num_part += ch
        if len(letter_part) != 1 or not num_part.isdigit():
            return None
        col = self._letter_to_col(letter_part)
        row = int(num_part) - 1
        if row < 0 or row >= self.rows or col < 0 or col >= self.cols:
            return None
        return (row, col)

    def _get_all_pawn_positions(self):
        """Return set of all pawn positions."""
        positions = set()
        for player_pawns in self.pawns.values():
            for pos in player_pawns:
                positions.add(pos)
        return positions

    def _can_move_between(self, r1, c1, r2, c2):
        """Check if movement between adjacent cells is blocked by a wall."""
        if r2 == r1 - 1 and c2 == c1:
            # Moving up: check for horizontal wall on top edge of (r1, c1)
            # A horizontal wall at (r1, c) blocks top of (r1, c) and (r1, c+1)
            for wc in range(max(0, c1 - 1), min(self.cols - 1, c1 + 1)):
                if (r1, wc) in self.h_walls:
                    if wc == c1 or wc == c1 - 1:
                        return False
            return True
        elif r2 == r1 + 1 and c2 == c1:
            # Moving down: same as moving up from (r2, c2)
            return self._can_move_between(r2, c2, r1, c1)
        elif c2 == c1 - 1 and r2 == r1:
            # Moving left: check for vertical wall on left edge of (r1, c1)
            for wr in range(max(0, r1 - 1), min(self.rows - 1, r1 + 1)):
                if (wr, c1) in self.v_walls:
                    if wr == r1 or wr == r1 - 1:
                        return False
            return True
        elif c2 == c1 + 1 and r2 == r1:
            # Moving right: same as moving left from (r2, c2)
            return self._can_move_between(r2, c2, r1, c1)
        return False

    def _is_path_clear(self, r1, c1, r2, c2, pawn_positions):
        """Check if a single-step move is possible (no wall, no pawn blocking)."""
        if r2 < 0 or r2 >= self.rows or c2 < 0 or c2 >= self.cols:
            return False
        if (r2, c2) in pawn_positions:
            return False
        return self._can_move_between(r1, c1, r2, c2)

    def _has_path_to_goal(self, start, goal_row):
        """BFS to check if there's a path from start to goal_row."""
        visited = set()
        queue = deque([start])
        visited.add(start)
        while queue:
            r, c = queue.popleft()
            if r == goal_row:
                return True
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < self.rows and 0 <= nc < self.cols and (nr, nc) not in visited:
                    if self._can_move_between(r, c, nr, nc):
                        visited.add((nr, nc))
                        queue.append((nr, nc))
        return False

    def _wall_leaves_paths_open(self):
        """Check that all pawns still have a path to their goal row."""
        for player in [1, 2]:
            goal_row = self.rows - 1 if player == 1 else 0
            for pawn_pos in self.pawns[player]:
                if not self._has_path_to_goal(pawn_pos, goal_row):
                    return False
        return True

    def _can_place_h_wall(self, row, col):
        """Check if a horizontal wall can be placed at (row, col)."""
        # Horizontal wall spans (row, col) and (row, col+1) on top edge
        if row < 1 or row >= self.rows or col < 0 or col + 1 >= self.cols:
            return False
        # Check overlap with existing horizontal walls
        if (row, col) in self.h_walls:
            return False
        # Check overlap: wall at col-1 would also cover col
        if (row, col - 1) in self.h_walls:
            return False
        if (row, col + 1) in self.h_walls:
            return False
        # Check crossing with vertical wall at same intersection
        # A vertical wall at (row-1, col+1) would cross this horizontal wall
        if (row - 1, col + 1) in self.v_walls:
            return False
        return True

    def _can_place_v_wall(self, row, col):
        """Check if a vertical wall can be placed at (row, col)."""
        # Vertical wall spans (row, col) and (row+1, col) on left edge
        if col < 1 or col >= self.cols or row < 0 or row + 1 >= self.rows:
            return False
        # Check overlap with existing vertical walls
        if (row, col) in self.v_walls:
            return False
        if (row - 1, col) in self.v_walls:
            return False
        if (row + 1, col) in self.v_walls:
            return False
        # Check crossing with horizontal wall
        if (row + 1, col - 1) in self.h_walls:
            return False
        return True

    def display(self):
        """Display the board with pawns, walls, and coordinates."""
        var_label = "Standard 11x14" if self.variation == "standard" else "Small 7x8"
        print(f"\n  === Blockade ({var_label}) ===")
        print(f"  {self.players[0]} (1) vs {self.players[1]} (2)")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        # Build pawn lookup
        pawn_map = {}
        for player in [1, 2]:
            for pos in self.pawns[player]:
                pawn_map[pos] = str(player)

        # Column headers
        header = "     "
        for c in range(self.cols):
            header += f" {self._col_to_letter(c)} "
        print(header)

        for r in range(self.rows):
            # Horizontal wall line above this row
            if r > 0:
                wall_line = "     "
                for c in range(self.cols):
                    # Check if there is a horizontal wall above (r, c)
                    has_wall = False
                    for wc in range(max(0, c - 1), min(self.cols - 1, c + 1)):
                        if (r, wc) in self.h_walls:
                            if wc == c or wc == c - 1:
                                has_wall = True
                                break
                    if has_wall:
                        wall_line += "---"
                    else:
                        wall_line += "   "
                print(wall_line)

            # Row with cells and vertical walls
            row_str = f"  {r + 1:2d} "
            for c in range(self.cols):
                # Vertical wall to the left of (r, c)
                if c > 0:
                    has_v_wall = False
                    for wr in range(max(0, r - 1), min(self.rows - 1, r + 1)):
                        if (wr, c) in self.v_walls:
                            if wr == r or wr == r - 1:
                                has_v_wall = True
                                break
                    if has_v_wall:
                        row_str += "|"
                    else:
                        row_str += " "
                else:
                    row_str += " "

                if (r, c) in pawn_map:
                    row_str += pawn_map[(r, c)]
                else:
                    row_str += "."
                row_str += " "

            print(row_str)

        print()

    def get_move(self):
        """Get move input from current player."""
        player_name = self.players[self.current_player - 1]
        num_pawns = len(self.pawns[self.current_player])
        print(f"  {player_name}, enter your move.")
        if num_pawns == 1:
            print("  Format: direction distance wall_pos orientation")
            print("  Example: down 2 e5 h  (move down 2, place horizontal wall at e5)")
            print("  Directions: up, down, left, right")
            print("  Orientation: h (horizontal) or v (vertical)")
        else:
            print("  Format: pawn_num direction distance wall_pos orientation")
            print("  Example: 1 down 2 e5 h  (pawn 1 down 2, horizontal wall at e5)")
            print("  Directions: up, down, left, right")
            print("  Orientation: h (horizontal) or v (vertical)")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply move. Returns True if valid."""
        parts = move.lower().split()
        num_pawns = len(self.pawns[self.current_player])

        try:
            if num_pawns == 1:
                if len(parts) != 4:
                    return False
                pawn_idx = 0
                direction = parts[0]
                distance = int(parts[1])
                wall_pos_str = parts[2]
                wall_orient = parts[3]
            else:
                if len(parts) != 5:
                    return False
                pawn_idx = int(parts[0]) - 1
                direction = parts[1]
                distance = int(parts[2])
                wall_pos_str = parts[3]
                wall_orient = parts[4]
        except (ValueError, IndexError):
            return False

        if pawn_idx < 0 or pawn_idx >= num_pawns:
            return False
        if direction not in ('up', 'down', 'left', 'right'):
            return False
        if distance < 1 or distance > 2:
            return False
        if wall_orient not in ('h', 'v'):
            return False

        wall_pos = self._algebraic_to_pos(wall_pos_str)
        if wall_pos is None:
            return False

        # Direction deltas
        dir_map = {'up': (-1, 0), 'down': (1, 0), 'left': (0, -1), 'right': (0, 1)}
        dr, dc = dir_map[direction]

        # Validate pawn movement step by step
        pr, pc = self.pawns[self.current_player][pawn_idx]
        pawn_positions = self._get_all_pawn_positions()
        pawn_positions.discard((pr, pc))  # Remove current pawn from blocking set

        for step in range(distance):
            nr, nc = pr + dr, pc + dc
            if not self._is_path_clear(pr, pc, nr, nc, pawn_positions):
                return False
            pr, pc = nr, nc

        # Temporarily move the pawn
        old_pos = self.pawns[self.current_player][pawn_idx]
        self.pawns[self.current_player][pawn_idx] = (pr, pc)

        # Validate and place wall
        wr, wc = wall_pos
        valid_wall = False
        if wall_orient == 'h':
            if self._can_place_h_wall(wr, wc):
                self.h_walls.add((wr, wc))
                if self._wall_leaves_paths_open():
                    valid_wall = True
                else:
                    self.h_walls.discard((wr, wc))
        else:
            if self._can_place_v_wall(wr, wc):
                self.v_walls.add((wr, wc))
                if self._wall_leaves_paths_open():
                    valid_wall = True
                else:
                    self.v_walls.discard((wr, wc))

        if not valid_wall:
            # Revert pawn movement
            self.pawns[self.current_player][pawn_idx] = old_pos
            return False

        return True

    def check_game_over(self):
        """Check if a player has reached the opponent's starting row."""
        # Player 1 wins by reaching the bottom row (rows - 1)
        for pos in self.pawns[1]:
            if pos[0] == self.rows - 1:
                self.game_over = True
                self.winner = 1
                return
        # Player 2 wins by reaching the top row (0)
        for pos in self.pawns[2]:
            if pos[0] == 0:
                self.game_over = True
                self.winner = 2
                return

    def get_state(self):
        """Return serializable game state."""
        return {
            "cols": self.cols,
            "rows": self.rows,
            "pawns": {str(k): list(v) for k, v in self.pawns.items()},
            "h_walls": [list(w) for w in self.h_walls],
            "v_walls": [list(w) for w in self.v_walls],
        }

    def load_state(self, state):
        """Restore game state."""
        self.cols = state["cols"]
        self.rows = state["rows"]
        self.pawns = {int(k): [tuple(p) for p in v] for k, v in state["pawns"].items()}
        self.h_walls = set(tuple(w) for w in state["h_walls"])
        self.v_walls = set(tuple(w) for w in state["v_walls"])

    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Blockade - Tutorial
==================================================

  RULES:
  - The board is a rectangular grid (11x14 standard,
    7x8 small).
  - Each player has pawns: 2 each in standard mode,
    1 each in small mode.
  - Player 1 starts at the top row, Player 2 at the
    bottom row.
  - On each turn you must:
    1. Move one pawn 1-2 squares orthogonally
       (up, down, left, or right).
    2. Place a wall (2 squares long) on the board,
       either horizontal or vertical.
  - Pawns cannot cross walls or other pawns.
  - Walls cannot completely block all paths to the
    goal row for any pawn.
  - First player to get any pawn to the opponent's
    starting row wins.

  HOW TO ENTER MOVES:
  Standard (2 pawns):
    pawn_num direction distance wall_pos orientation
    Example: "1 down 2 e5 h"
    (Move pawn 1 down 2 squares, place horizontal
     wall at e5)

  Small (1 pawn):
    direction distance wall_pos orientation
    Example: "down 2 e5 h"

  - Directions: up, down, left, right
  - Distance: 1 or 2 squares
  - Wall position: algebraic coordinate (e.g. e5)
  - Orientation: h (horizontal) or v (vertical)

  COORDINATES:
  - Columns are letters (a, b, c, ...)
  - Rows are numbers (1, 2, 3, ... from top)
  - A wall at e5 with 'h' places a horizontal wall
    spanning 2 squares at that position.

  STRATEGY HINTS:
  - Balance offense and defense: advance your pawns
    while placing walls to slow your opponent.
  - Try to create long detours for your opponent
    without completely blocking their path.
  - Moving 2 squares per turn is faster but may
    leave you in a worse position for wall placement.
  - Control the center of the board with walls to
    force your opponent into longer routes.
  - In standard mode, having 2 pawns gives you
    flexibility - advance one while the other takes
    an alternative route.

==================================================
"""
