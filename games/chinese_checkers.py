"""Chinese Checkers - 2-player star-shaped board game with hop-and-jump movement."""

from engine.base import BaseGame, input_with_quit, clear_screen

# Cell states
EMPTY = 0
P1 = 1
P2 = 2


def _build_star_board():
    """Build the 6-pointed star board as a set of (row, col) positions.

    The board uses axial/offset coordinates.  Rows 0..16 (17 rows total).
    The star has 121 cells arranged as:

    Row  0:  1 cell   (top point)
    Row  1:  2 cells
    Row  2:  3 cells
    Row  3:  4 cells
    Row  4: 13 cells  (widest inner row begins)
    Row  5: 12 cells
    Row  6: 11 cells
    Row  7: 10 cells
    Row  8:  9 cells
    Row  9: 10 cells
    Row 10: 11 cells
    Row 11: 12 cells
    Row 12: 13 cells  (widest inner row ends)
    Row 13:  4 cells
    Row 14:  3 cells
    Row 15:  2 cells
    Row 16:  1 cell   (bottom point)
    """
    positions = set()

    # Top triangle (rows 0-3)
    for r in range(4):
        width = r + 1
        start_col = 6 - r
        for c in range(width):
            positions.add((r, start_col + c * 2))

    positions.clear()

    # Let me use a well-known layout.  The board has 17 rows.
    # Each row has a certain number of positions and a starting column offset.
    # Positions in each row are spaced 2 apart (hex grid).
    # Row widths and start columns (0-indexed columns):
    row_specs = [
        # (num_cells, start_col)  -- top triangle
        (1, 12),   # row 0
        (2, 11),   # row 1
        (3, 10),   # row 2
        (4, 9),    # row 3
        # middle band
        (13, 0),   # row 4
        (12, 1),   # row 5
        (11, 2),   # row 6
        (10, 3),   # row 7
        (9, 4),    # row 8
        (10, 3),   # row 9
        (11, 2),   # row 10
        (12, 1),   # row 11
        (13, 0),   # row 12
        # bottom triangle
        (4, 9),    # row 13
        (3, 10),   # row 14
        (2, 11),   # row 15
        (1, 12),   # row 16
    ]

    for r, (num, start) in enumerate(row_specs):
        for i in range(num):
            positions.add((r, start + i * 2))

    return positions, row_specs


def _build_small_board():
    """Build a smaller star board for the 'small' variation (6 pieces each).

    Uses 13 rows instead of 17, with 3-cell triangles.
    """
    row_specs = [
        (1, 8),    # row 0
        (2, 7),    # row 1
        (3, 6),    # row 2
        (10, 1),   # row 3  (was 9, widened)
        (9, 2),    # row 4
        (8, 3),    # row 5
        (7, 4),    # row 6
        (8, 3),    # row 7
        (9, 2),    # row 8
        (10, 1),   # row 9
        (3, 6),    # row 10
        (2, 7),    # row 11
        (1, 8),    # row 12
    ]

    positions = set()
    for r, (num, start) in enumerate(row_specs):
        for i in range(num):
            positions.add((r, start + i * 2))

    return positions, row_specs


def _get_home_positions_standard():
    """Return (p1_home, p2_home) sets for the standard board.

    P1 starts in the top triangle (rows 0-3), goal is bottom triangle (rows 13-16).
    P2 starts in the bottom triangle (rows 13-16), goal is top triangle (rows 0-3).
    """
    _, row_specs = _build_star_board()

    p1_home = set()
    for r in range(4):
        num, start = row_specs[r]
        for i in range(num):
            p1_home.add((r, start + i * 2))

    p2_home = set()
    for r in range(13, 17):
        num, start = row_specs[r]
        for i in range(num):
            p2_home.add((r, start + i * 2))

    return p1_home, p2_home


def _get_home_positions_small():
    """Return (p1_home, p2_home) for the small board."""
    _, row_specs = _build_small_board()

    p1_home = set()
    for r in range(3):
        num, start = row_specs[r]
        for i in range(num):
            p1_home.add((r, start + i * 2))

    p2_home = set()
    for r in range(10, 13):
        num, start = row_specs[r]
        for i in range(num):
            p2_home.add((r, start + i * 2))

    return p1_home, p2_home


def _hex_neighbors(r, c):
    """Return the 6 hex neighbors of position (r, c) in offset coordinates.

    On even rows, neighbors are at offsets:
      (-1, -1), (-1, +1),  (0, -2), (0, +2),  (+1, -1), (+1, +1)
    """
    return [
        (r - 1, c - 1),
        (r - 1, c + 1),
        (r, c - 2),
        (r, c + 2),
        (r + 1, c - 1),
        (r + 1, c + 1),
    ]


def _jump_dest(r, c, nr, nc):
    """Return the landing position when jumping from (r,c) over (nr,nc)."""
    dr = nr - r
    dc = nc - c
    return (nr + dr, nc + dc)


class ChineseCheckersGame(BaseGame):
    """Chinese Checkers for 2 players on a star-shaped board."""

    name = "Chinese Checkers"
    description = "Race your pieces across the star-shaped board to the opposite triangle"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (10-piece triangles)",
        "small": "Small (6-piece triangles)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation not in self.variations:
            self.variation = "standard"
        self.board = {}          # (r, c) -> EMPTY / P1 / P2
        self.positions = set()   # all valid positions
        self.row_specs = []
        self.p1_home = set()     # P1 starting triangle (P2 goal)
        self.p2_home = set()     # P2 starting triangle (P1 goal)
        self.label_to_pos = {}   # "a1" -> (r, c)
        self.pos_to_label = {}   # (r, c) -> "a1"

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def setup(self):
        """Initialize the board with pieces in home triangles."""
        if self.variation == "small":
            self.positions, self.row_specs = _build_small_board()
            self.p1_home, self.p2_home = _get_home_positions_small()
        else:
            self.positions, self.row_specs = _build_star_board()
            self.p1_home, self.p2_home = _get_home_positions_standard()

        # Build the board dict
        for pos in self.positions:
            self.board[pos] = EMPTY

        # Place pieces
        for pos in self.p1_home:
            self.board[pos] = P1
        for pos in self.p2_home:
            self.board[pos] = P2

        # Build coordinate labels
        self._build_labels()

    def _build_labels(self):
        """Build alphanumeric labels for all positions.

        Labels use the format: column_letter + row_number.
        Row numbers go 1..num_rows from top to bottom.
        Column letters go 'a'..'z' from left to right within each row.
        Since positions can share the same column index across rows,
        we label by (row, position_index_within_row).
        """
        self.label_to_pos = {}
        self.pos_to_label = {}

        for r, (num, start) in enumerate(self.row_specs):
            row_num = r + 1
            for i in range(num):
                c = start + i * 2
                col_letter = chr(ord('a') + i)
                label = f"{col_letter}{row_num}"
                pos = (r, c)
                self.label_to_pos[label] = pos
                self.pos_to_label[pos] = label

    # ------------------------------------------------------------------
    # Display
    # ------------------------------------------------------------------

    def display(self):
        """Display the board as ASCII art."""
        num_rows = len(self.row_specs)
        max_col = 0
        for pos in self.positions:
            if pos[1] > max_col:
                max_col = pos[1]

        print()
        print(f"  {self.name} ({self.variations[self.variation]})")
        print(f"  {self.players[0]} (X)  vs  {self.players[1]} (O)")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        print()

        for r, (num, start) in enumerate(self.row_specs):
            row_num = r + 1
            # Left padding for centering
            padding = " " * (start + 1)

            # Build row cells
            cells = []
            for i in range(num):
                c = start + i * 2
                pos = (r, c)
                piece = self.board.get(pos, EMPTY)
                if piece == P1:
                    cells.append("X")
                elif piece == P2:
                    cells.append("O")
                else:
                    cells.append(".")

            row_label = f"{row_num:>2}"
            line = padding + " ".join(cells)
            # Show position labels on the right
            labels = []
            for i in range(num):
                col_letter = chr(ord('a') + i)
                labels.append(f"{col_letter}{row_num}")

            print(f"{row_label} {line}   ({', '.join(labels)})")

        print()

    # ------------------------------------------------------------------
    # Move input and validation
    # ------------------------------------------------------------------

    def get_move(self):
        """Get move input from the current player.

        Format: 'from to' for a single step/jump, or 'from mid1 mid2 ... to' for chain jumps.
        Uses labels like 'a1 b2' or 'a1 c3 e5'.
        """
        prompt = f"{self.players[self.current_player - 1]} move (e.g. a1 b2): "
        raw = input_with_quit(prompt).strip().lower()
        parts = raw.split()
        if len(parts) < 2:
            return None

        # Convert labels to positions
        waypoints = []
        for label in parts:
            if label not in self.label_to_pos:
                print(f"  Unknown position: {label}")
                return None
            waypoints.append(self.label_to_pos[label])

        return waypoints

    def make_move(self, move):
        """Validate and execute a move. Returns True if valid."""
        if move is None or len(move) < 2:
            return False

        start = move[0]
        # Verify the start position has the current player's piece
        if self.board.get(start) != self.current_player:
            print("  You don't have a piece there.")
            return False

        # Validate each step of the path
        path = move
        is_jump_chain = len(path) > 2

        if len(path) == 2:
            # Single move: either step or single jump
            frm, to = path
            if not self._is_valid_step(frm, to) and not self._is_valid_jump(frm, to):
                print("  Invalid move. Must step to adjacent or jump over a piece.")
                return False
        else:
            # Chain jump: every step must be a valid jump
            for i in range(len(path) - 1):
                if not self._is_valid_jump(path[i], path[i + 1]):
                    lbl_from = self.pos_to_label.get(path[i], str(path[i]))
                    lbl_to = self.pos_to_label.get(path[i + 1], str(path[i + 1]))
                    print(f"  Invalid jump from {lbl_from} to {lbl_to}.")
                    return False

        dest = path[-1]

        # Cannot end in opponent's home if not passing through
        opponent = 3 - self.current_player
        opp_home = self.p2_home if opponent == 2 else self.p1_home
        my_goal = self.p2_home if self.current_player == 1 else self.p1_home

        # If destination is in opponent's home triangle (which is NOT our goal),
        # that's not allowed (no permanent stay in opponent's start zone).
        if dest in opp_home and opp_home != my_goal:
            print("  Cannot end your move in the opponent's home triangle.")
            return False

        # If piece is already in goal triangle, it must stay there
        if start in my_goal and dest not in my_goal:
            print("  A piece in the goal triangle cannot leave it.")
            return False

        # Execute the move
        self.board[start] = EMPTY
        # Clear intermediate positions for display correctness (pieces don't
        # actually move through them; the piece teleports along the chain).
        self.board[dest] = self.current_player

        return True

    def _is_valid_step(self, frm, to):
        """Check if moving from frm to to is a valid single step (adjacent)."""
        if to not in self.positions:
            return False
        if self.board.get(to, EMPTY) != EMPTY:
            return False
        return to in _hex_neighbors(*frm)

    def _is_valid_jump(self, frm, to):
        """Check if jumping from frm over an adjacent piece to to is valid."""
        if to not in self.positions:
            return False
        if self.board.get(to, EMPTY) != EMPTY:
            # Allow landing on start position during chain validation
            return False

        # The midpoint must be an occupied adjacent cell
        neighbors = _hex_neighbors(*frm)
        for nb in neighbors:
            land = _jump_dest(frm[0], frm[1], nb[0], nb[1])
            if land == to:
                # nb must be occupied
                if self.board.get(nb, EMPTY) != EMPTY:
                    return True
        return False

    def _get_all_jumps(self, start, visited=None):
        """Get all reachable positions from start via chain jumps.

        Returns a set of reachable (row, col) positions.
        """
        if visited is None:
            visited = {start}
        results = set()

        for nb in _hex_neighbors(*start):
            if self.board.get(nb, EMPTY) == EMPTY:
                continue
            land = _jump_dest(start[0], start[1], nb[0], nb[1])
            if land not in self.positions:
                continue
            if self.board.get(land, EMPTY) != EMPTY:
                continue
            if land in visited:
                continue
            visited.add(land)
            results.add(land)
            results |= self._get_all_jumps(land, visited)

        return results

    # ------------------------------------------------------------------
    # Win check
    # ------------------------------------------------------------------

    def check_game_over(self):
        """Check if a player has filled the opposite triangle."""
        # P1 goal is p2_home (bottom triangle)
        p1_goal = self.p2_home
        # P2 goal is p1_home (top triangle)
        p2_goal = self.p1_home

        p1_wins = all(self.board.get(pos) == P1 for pos in p1_goal)
        p2_wins = all(self.board.get(pos) == P2 for pos in p2_goal)

        if p1_wins:
            self.game_over = True
            self.winner = 1
        elif p2_wins:
            self.game_over = True
            self.winner = 2

    # ------------------------------------------------------------------
    # Save / Load
    # ------------------------------------------------------------------

    def get_state(self):
        """Return serializable game state."""
        board_data = {}
        for (r, c), val in self.board.items():
            board_data[f"{r},{c}"] = val
        return {
            "board": board_data,
            "variation": self.variation,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.variation = state.get("variation", "standard")
        self.setup()
        # Overwrite board
        board_data = state.get("board", {})
        for key, val in board_data.items():
            r, c = map(int, key.split(","))
            if (r, c) in self.board:
                self.board[(r, c)] = val

    # ------------------------------------------------------------------
    # Tutorial
    # ------------------------------------------------------------------

    def get_tutorial(self):
        """Return tutorial text for Chinese Checkers."""
        return """
==================================================
  Chinese Checkers - Tutorial
==================================================

OBJECTIVE:
  Move all your pieces from your home triangle to
  the opposite triangle before your opponent does.

BOARD:
  The board is a 6-pointed star. In 2-player mode
  you use the top and bottom triangles.
  Player 1 (X) starts at the top, aiming for bottom.
  Player 2 (O) starts at the bottom, aiming for top.

MOVEMENT:
  On your turn, move one piece:

  1. STEP: Move to any adjacent empty hex cell.
  2. JUMP: Hop over an adjacent piece (yours or your
     opponent's) and land on the empty cell beyond.
     Jumps can be CHAINED in a single turn - keep
     hopping as long as valid jumps exist.

  Jumped pieces are NOT captured (they stay on the
  board).

INPUT FORMAT:
  Enter moves as position labels separated by spaces.
  - Simple step or jump: "a1 b2"
  - Chain jump: "a1 c3 e5" (list each waypoint)

  Position labels are shown next to each row.

SPECIAL RULES:
  - You cannot permanently stay in the opponent's
    starting triangle (pass through only).
  - A piece that reaches the goal triangle cannot
    leave it.

WINNING:
  The first player to fill the opposite triangle
  with all their pieces wins.

COMMANDS:
  'quit' or 'q'  - Quit game
  'save' or 's'  - Save and suspend
  'help' or 'h'  - Show help
  'tutorial' / 't' - Show this tutorial
==================================================
"""
