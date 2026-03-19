"""Quoridor - A strategy board game of walls and pathfinding."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


class QuoridorGame(BaseGame):
    """Quoridor: Race to the opposite edge while blocking with walls."""

    name = "Quoridor"
    description = "Race your pawn to the opposite side while placing walls to block your opponent"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (9x9, 10 walls)",
        "small": "Small (5x5, 5 walls)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.size = 0
        self.walls_per_player = 0
        # Pawn positions: {1: (row, col), 2: (row, col)}
        self.pawns = {}
        # Walls remaining: {1: count, 2: count}
        self.walls_remaining = {}
        # Placed walls: list of (orientation, row, col) where orientation is 'H' or 'V'
        # A horizontal wall at (r, c) blocks movement between rows r and r+1
        #   at columns c and c+1 (spans two cells).
        # A vertical wall at (r, c) blocks movement between cols c and c+1
        #   at rows r and r+1 (spans two cells).
        self.walls = []

    def setup(self):
        """Initialize the board, pawns, and walls."""
        if self.variation == "small":
            self.size = 5
            self.walls_per_player = 5
        else:
            self.size = 9
            self.walls_per_player = 10

        mid = self.size // 2
        # Player 1 starts at bottom (last row), player 2 at top (row 0)
        self.pawns = {1: (self.size - 1, mid), 2: (0, mid)}
        self.walls_remaining = {1: self.walls_per_player, 2: self.walls_per_player}
        self.walls = []

    def _wall_blocks_edge(self, orientation, wr, wc, r, c, dr, dc):
        """Check if a wall at (orientation, wr, wc) blocks movement from (r,c) in direction (dr,dc)."""
        nr, nc = r + dr, c + dc
        if orientation == 'H':
            # Horizontal wall at (wr, wc) blocks vertical movement between
            # row wr and wr+1, at columns wc and wc+1
            if dr == -1 and dc == 0:
                # Moving up: from row r to r-1. Blocked if wall is between r-1 and r
                if wr == r - 1 and (wc == c or wc == c - 1):
                    return True
            elif dr == 1 and dc == 0:
                # Moving down: from row r to r+1. Blocked if wall is between r and r+1
                if wr == r and (wc == c or wc == c - 1):
                    return True
        elif orientation == 'V':
            # Vertical wall at (wr, wc) blocks horizontal movement between
            # col wc and wc+1, at rows wr and wr+1
            if dc == -1 and dr == 0:
                # Moving left: from col c to c-1. Blocked if wall is between c-1 and c
                if wc == c - 1 and (wr == r or wr == r - 1):
                    return True
            elif dc == 1 and dr == 0:
                # Moving right: from col c to c+1. Blocked if wall is between c and c+1
                if wc == c and (wr == r or wr == r - 1):
                    return True
        return False

    def _is_blocked(self, r, c, dr, dc):
        """Check if movement from (r,c) in direction (dr,dc) is blocked by any wall."""
        for orientation, wr, wc in self.walls:
            if self._wall_blocks_edge(orientation, wr, wc, r, c, dr, dc):
                return True
        return False

    def _can_move_to(self, r, c, dr, dc):
        """Check if a pawn can step from (r,c) to (r+dr, c+dc) without wall blocking."""
        nr, nc = r + dr, c + dc
        if nr < 0 or nr >= self.size or nc < 0 or nc >= self.size:
            return False
        if self._is_blocked(r, c, dr, dc):
            return False
        return True

    def _get_pawn_moves(self, player):
        """Get all valid pawn moves for the given player, including jumps."""
        r, c = self.pawns[player]
        opponent = 3 - player
        opp_r, opp_c = self.pawns[opponent]
        moves = []
        directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]

        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            if not self._can_move_to(r, c, dr, dc):
                continue
            if (nr, nc) == (opp_r, opp_c):
                # Opponent is adjacent -- try to jump over
                jr, jc = nr + dr, nc + dc
                if self._can_move_to(nr, nc, dr, dc) and 0 <= jr < self.size and 0 <= jc < self.size:
                    moves.append((jr, jc))
                else:
                    # Can't jump straight -- try diagonal jumps
                    for sdr, sdc in [(-dc, dr), (dc, -dr)]:
                        # Perpendicular directions
                        if dr == 0:
                            side_dirs = [(-1, 0), (1, 0)]
                        else:
                            side_dirs = [(0, -1), (0, 1)]
                        for sd_r, sd_c in side_dirs:
                            sr, sc = nr + sd_r, nc + sd_c
                            if self._can_move_to(nr, nc, sd_r, sd_c) and 0 <= sr < self.size and 0 <= sc < self.size:
                                if (sr, sc) != (r, c):
                                    moves.append((sr, sc))
                        break  # Only process side jumps once
            else:
                moves.append((nr, nc))
        return moves

    def _walls_overlap(self, orientation, wr, wc):
        """Check if a proposed wall overlaps with any existing wall."""
        for o, r, c in self.walls:
            if orientation == o:
                if orientation == 'H':
                    # Two horizontal walls overlap if they share a column segment
                    if r == wr and abs(c - wc) < 2:
                        return True
                else:
                    # Two vertical walls overlap if they share a row segment
                    if c == wc and abs(r - wr) < 2:
                        return True
            else:
                # Different orientations: they cross at the center point
                if orientation == 'H':
                    # Proposed horizontal, existing vertical
                    if wr == r and wc == c:
                        return True
                else:
                    # Proposed vertical, existing horizontal
                    if wr == r and wc == c:
                        return True
        return False

    def _has_path(self, player, walls):
        """BFS to check if a player can reach their goal row given walls."""
        r, c = self.pawns[player]
        goal_row = 0 if player == 1 else self.size - 1
        visited = set()
        queue = deque()
        queue.append((r, c))
        visited.add((r, c))

        while queue:
            cr, cc = queue.popleft()
            if cr == goal_row:
                return True
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = cr + dr, cc + dc
                if nr < 0 or nr >= self.size or nc < 0 or nc >= self.size:
                    continue
                if (nr, nc) in visited:
                    continue
                # Check if blocked by walls
                blocked = False
                for orientation, wr, wc in walls:
                    if self._wall_blocks_edge(orientation, wr, wc, cr, cc, dr, dc):
                        blocked = True
                        break
                if not blocked:
                    visited.add((nr, nc))
                    queue.append((nr, nc))
        return False

    def _is_valid_wall(self, orientation, wr, wc):
        """Check if a wall placement is valid."""
        # Check bounds: wall spans 2 cells, so max position is size-2
        if wr < 0 or wr >= self.size - 1 or wc < 0 or wc >= self.size - 1:
            return False
        # Check overlap
        if self._walls_overlap(orientation, wr, wc):
            return False
        # Check path exists for both players
        test_walls = self.walls + [(orientation, wr, wc)]
        if not self._has_path(1, test_walls) or not self._has_path(2, test_walls):
            return False
        return True

    def display(self):
        """Display the board with pawns and walls."""
        size = self.size
        p1r, p1c = self.pawns[1]
        p2r, p2c = self.pawns[2]

        # Build sets for quick wall lookup
        h_walls = set()  # (r, c) pairs for horizontal walls
        v_walls = set()  # (r, c) pairs for vertical walls
        for o, r, c in self.walls:
            if o == 'H':
                h_walls.add((r, c))
                h_walls.add((r, c + 1))
            else:
                v_walls.add((r, c))
                v_walls.add((r + 1, c))

        print(f"\n  === Quoridor ({self.variation.capitalize()}) ===")
        print(f"  {self.players[0]} (P1): row {self.size - 1 - p1r + 1}, walls left: {self.walls_remaining[1]}")
        print(f"  {self.players[1]} (P2): row {self.size - 1 - p2r + 1}, walls left: {self.walls_remaining[2]}")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        print(f"  P1 goal: top edge (row {size}) | P2 goal: bottom edge (row 1)")
        print()

        # Column numbers
        col_header = "     "
        for c in range(size):
            col_header += f" {c + 1}  "
        print(col_header)

        # Top border
        print("    +" + "---+" * size)

        for r in range(size):
            # Cell row
            row_str = f" {size - r:2} |"
            for c in range(size):
                if (r, c) == self.pawns[1]:
                    cell = "P1"
                elif (r, c) == self.pawns[2]:
                    cell = "P2"
                else:
                    cell = "  "
                # Right border: check for vertical wall
                if c < size - 1 and (r, c) in v_walls:
                    row_str += f"{cell} #"
                else:
                    if c < size - 1:
                        row_str += f"{cell} |"
                    else:
                        row_str += f"{cell} |"
            row_str += f" {size - r}"
            print(row_str)

            # Bottom border for this row
            if r < size - 1:
                border = "    +"
                for c in range(size):
                    if (r, c) in h_walls:
                        border += "==="
                    else:
                        border += "---"
                    if c < size - 1:
                        # Intersection
                        border += "+"
                    else:
                        border += "+"
                print(border)
            else:
                print("    +" + "---+" * size)

        # Bottom column numbers
        print(col_header)
        print()

    def get_move(self):
        """Get a move: 'move N/S/E/W' or 'wall H/V row col'."""
        player = self.current_player
        name = self.players[player - 1]

        while True:
            raw = input_with_quit(
                f"  {name}, enter move (move N/S/E/W or wall H/V row col): "
            ).strip().lower()

            parts = raw.split()
            if not parts:
                print("  Invalid input. Type 'move N/S/E/W' or 'wall H/V row col'.")
                continue

            if parts[0] == "move":
                if len(parts) != 2 or parts[1] not in ('n', 's', 'e', 'w'):
                    print("  Usage: move N/S/E/W")
                    continue
                direction = parts[1]
                dir_map = {'n': (-1, 0), 's': (1, 0), 'e': (0, 1), 'w': (0, -1)}
                dr, dc = dir_map[direction]
                r, c = self.pawns[player]
                # Find the target from valid pawn moves
                valid_moves = self._get_pawn_moves(player)
                # For simple direction, the target is (r+dr, c+dc) or a jump
                target = (r + dr, c + dc)
                if target in valid_moves:
                    return ('move', target)
                # Check if there's a jump in that direction
                jump_target = (r + 2 * dr, c + 2 * dc)
                if jump_target in valid_moves:
                    return ('move', jump_target)
                # Check diagonal jumps in that general direction
                for mv in valid_moves:
                    mr, mc = mv
                    if dr != 0 and (mr - r) * dr > 0 and abs(mc - c) <= 1:
                        # A jump in the right vertical direction
                        if abs(mr - r) == 2 or (abs(mr - r) == 1 and abs(mc - c) == 1):
                            print(f"  Diagonal jump available to ({size_r(self, mr)},{mc+1}). Enter exact position.")
                    elif dc != 0 and (mc - c) * dc > 0 and abs(mr - r) <= 1:
                        if abs(mc - c) == 2 or (abs(mc - c) == 1 and abs(mr - r) == 1):
                            print(f"  Diagonal jump available to ({size_r(self, mr)},{mc+1}). Enter exact position.")
                print(f"  Cannot move {direction.upper()} from current position.")
                valid_strs = [f"({self.size - mr},{mc + 1})" for mr, mc in valid_moves]
                if valid_moves:
                    print(f"  Valid move targets: {', '.join(valid_strs)}")
                continue

            elif parts[0] == "wall":
                if len(parts) != 4:
                    print("  Usage: wall H/V row col (e.g. wall H 3 4)")
                    continue
                orient = parts[1].upper()
                if orient not in ('H', 'V'):
                    print("  Orientation must be H (horizontal) or V (vertical).")
                    continue
                try:
                    # Input is 1-indexed display coordinates
                    display_row = int(parts[2])
                    display_col = int(parts[3])
                except ValueError:
                    print("  Row and col must be numbers.")
                    continue
                # Convert display coordinates to internal
                # Display row N maps to internal row (size - N)
                # Wall placement uses intersection coordinates
                wr = self.size - display_row
                wc = display_col - 1
                return ('wall', orient, wr, wc)

            elif parts[0] == "jump" or parts[0] == "goto":
                # Allow direct coordinate input: jump row,col
                if len(parts) != 2:
                    print("  Usage: jump row,col (e.g. jump 3,5)")
                    continue
                try:
                    coords = parts[1].split(',')
                    display_row = int(coords[0])
                    display_col = int(coords[1])
                    tr = self.size - display_row
                    tc = display_col - 1
                    valid_moves = self._get_pawn_moves(player)
                    if (tr, tc) in valid_moves:
                        return ('move', (tr, tc))
                    else:
                        print(f"  Cannot move to ({display_row},{display_col}).")
                        continue
                except (ValueError, IndexError):
                    print("  Usage: jump row,col (e.g. jump 3,5)")
                    continue
            else:
                print("  Invalid input. Type 'move N/S/E/W', 'wall H/V row col', or 'jump row,col'.")

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        player = self.current_player

        if move[0] == 'move':
            target = move[1]
            valid_moves = self._get_pawn_moves(player)
            if target not in valid_moves:
                return False
            self.pawns[player] = target
            return True

        elif move[0] == 'wall':
            _, orient, wr, wc = move
            if self.walls_remaining[player] <= 0:
                print("  No walls remaining!")
                return False
            if not self._is_valid_wall(orient, wr, wc):
                print("  Invalid wall placement (out of bounds, overlaps, or blocks all paths).")
                return False
            self.walls.append((orient, wr, wc))
            self.walls_remaining[player] -= 1
            return True

        return False

    def check_game_over(self):
        """Check if a player has reached the opposite edge."""
        p1r, _ = self.pawns[1]
        p2r, _ = self.pawns[2]
        if p1r == 0:
            self.game_over = True
            self.winner = 1
        elif p2r == self.size - 1:
            self.game_over = True
            self.winner = 2

    def get_state(self):
        """Return serializable game state."""
        return {
            "size": self.size,
            "walls_per_player": self.walls_per_player,
            "pawns": {str(k): list(v) for k, v in self.pawns.items()},
            "walls_remaining": {str(k): v for k, v in self.walls_remaining.items()},
            "walls": self.walls,
        }

    def load_state(self, state):
        """Restore game state."""
        self.size = state["size"]
        self.walls_per_player = state["walls_per_player"]
        self.pawns = {int(k): tuple(v) for k, v in state["pawns"].items()}
        self.walls_remaining = {int(k): v for k, v in state["walls_remaining"].items()}
        self.walls = [(o, r, c) for o, r, c in state["walls"]]

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==============================================================
                   QUORIDOR TUTORIAL
==============================================================

OVERVIEW
  Quoridor is a two-player strategy game. Each player has a
  pawn that starts on opposite edges of the board. The goal
  is to be the first to reach the opposite edge.

--------------------------------------------------------------
RULES
--------------------------------------------------------------
  1. Players alternate turns.

  2. On your turn, you may EITHER:
     a) Move your pawn one step in any cardinal direction
        (North, South, East, West), OR
     b) Place a wall (a 2-cell-long barrier) on the board.

  3. Pawns cannot move through walls.

  4. When two pawns are face-to-face (adjacent), the moving
     pawn may jump over the opponent. If a wall or board edge
     blocks the straight jump, the pawn may jump diagonally
     to either side of the opponent instead.

  5. Each player starts with 10 walls (5 in the small variant).
     Walls are placed at intersections and span two cells.

  6. A wall placement is ILLEGAL if it would completely block
     either player's path to their goal edge. There must
     always be at least one path available.

  7. Player 1 (P1) starts at the bottom and must reach the
     top edge. Player 2 (P2) starts at the top and must reach
     the bottom edge.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Move pawn:
    move N     - Move north (up)
    move S     - Move south (down)
    move E     - Move east (right)
    move W     - Move west (left)

  Place wall:
    wall H row col  - Place a horizontal wall
    wall V row col  - Place a vertical wall
    (row and col refer to the intersection point, 1-indexed)
    Example: wall H 3 4

  Jump to coordinates (for complex jump situations):
    jump row,col    - Move pawn to specific position
    Example: jump 3,5

--------------------------------------------------------------
WALL PLACEMENT
--------------------------------------------------------------
  Walls are placed at intersection points between cells.
  A wall at position (row, col) spans:
    Horizontal (H): blocks vertical movement at that row
                     between two adjacent columns
    Vertical (V):   blocks horizontal movement at that column
                     between two adjacent rows

  Walls are shown as '===' (horizontal) and '#' (vertical)
  on the board display.

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  Standard:  9x9 board, 10 walls per player
  Small:     5x5 board, 5 walls per player

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Don't use all your walls too early; save some for defense.
  - Try to create long detours for your opponent.
  - The center of the board gives you the most flexibility.
  - A wall that helps you AND hurts your opponent is ideal.
  - Watch out: you cannot fully block a player's path!

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
