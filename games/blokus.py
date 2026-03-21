"""Blokus Duo - A two-player territorial strategy game with polyomino pieces."""

from engine.base import BaseGame, input_with_quit, clear_screen


# All 21 standard Blokus pieces defined as coordinate sets (row, col) normalized to origin.
# Pieces are grouped by size: 1 monomino, 1 domino, 2 triominoes, 5 tetrominoes, 12 pentominoes.
PIECES_ALL = [
    # --- Size 1: Monomino (1 piece) ---
    {"name": "1", "size": 1, "coords": [(0, 0)]},

    # --- Size 2: Domino (1 piece) ---
    {"name": "2", "size": 2, "coords": [(0, 0), (0, 1)]},

    # --- Size 3: Triominoes (2 pieces) ---
    {"name": "I3", "size": 3, "coords": [(0, 0), (0, 1), (0, 2)]},
    {"name": "L3", "size": 3, "coords": [(0, 0), (0, 1), (1, 0)]},

    # --- Size 4: Tetrominoes (5 pieces) ---
    {"name": "I4", "size": 4, "coords": [(0, 0), (0, 1), (0, 2), (0, 3)]},
    {"name": "O4", "size": 4, "coords": [(0, 0), (0, 1), (1, 0), (1, 1)]},
    {"name": "T4", "size": 4, "coords": [(0, 0), (0, 1), (0, 2), (1, 1)]},
    {"name": "S4", "size": 4, "coords": [(0, 0), (0, 1), (1, 1), (1, 2)]},
    {"name": "L4", "size": 4, "coords": [(0, 0), (0, 1), (0, 2), (1, 0)]},

    # --- Size 5: Pentominoes (12 pieces) ---
    {"name": "F5", "size": 5, "coords": [(0, 1), (0, 2), (1, 0), (1, 1), (2, 1)]},
    {"name": "I5", "size": 5, "coords": [(0, 0), (0, 1), (0, 2), (0, 3), (0, 4)]},
    {"name": "L5", "size": 5, "coords": [(0, 0), (0, 1), (0, 2), (0, 3), (1, 0)]},
    {"name": "N5", "size": 5, "coords": [(0, 0), (0, 1), (1, 1), (1, 2), (1, 3)]},
    {"name": "P5", "size": 5, "coords": [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0)]},
    {"name": "T5", "size": 5, "coords": [(0, 0), (0, 1), (0, 2), (1, 1), (2, 1)]},
    {"name": "U5", "size": 5, "coords": [(0, 0), (0, 2), (1, 0), (1, 1), (1, 2)]},
    {"name": "V5", "size": 5, "coords": [(0, 0), (1, 0), (2, 0), (2, 1), (2, 2)]},
    {"name": "W5", "size": 5, "coords": [(0, 0), (1, 0), (1, 1), (2, 1), (2, 2)]},
    {"name": "X5", "size": 5, "coords": [(0, 1), (1, 0), (1, 1), (1, 2), (2, 1)]},
    {"name": "Y5", "size": 5, "coords": [(0, 0), (0, 1), (0, 2), (0, 3), (1, 1)]},
    {"name": "Z5", "size": 5, "coords": [(0, 0), (0, 1), (1, 1), (2, 1), (2, 2)]},
]


def _normalize(coords):
    """Normalize coordinates so the minimum row and col are both 0."""
    min_r = min(r for r, c in coords)
    min_c = min(c for r, c in coords)
    normalized = sorted((r - min_r, c - min_c) for r, c in coords)
    return normalized


def _rotate_90(coords):
    """Rotate coordinates 90 degrees clockwise: (r,c) -> (c, -r)."""
    return _normalize([(c, -r) for r, c in coords])


def _flip_horizontal(coords):
    """Flip coordinates horizontally: (r,c) -> (r, -c)."""
    return _normalize([(r, -c) for r, c in coords])


def _all_orientations(coords):
    """Generate all unique orientations (rotations and flips) of a piece."""
    orientations = []
    current = _normalize(coords)
    for _ in range(4):
        norm = _normalize(current)
        if norm not in orientations:
            orientations.append(norm)
        flipped = _flip_horizontal(current)
        if flipped not in orientations:
            orientations.append(flipped)
        current = _rotate_90(current)
    return orientations


def _transform(coords, rotation, flip):
    """Apply rotation (0-3) and optional flip to piece coordinates."""
    current = list(coords)
    if flip:
        current = _flip_horizontal(current)
    for _ in range(rotation % 4):
        current = _rotate_90(current)
    return _normalize(current)


class BlokusDuoGame(BaseGame):
    """Blokus Duo: Place polyomino pieces with corner-only adjacency."""

    name = "Blokus Duo"
    description = "A two-player territorial strategy game with polyomino pieces"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Blokus Duo (14x14)",
        "small": "Mini Blokus (10x10, fewer pieces)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.board_size = 14
        self.board = []
        self.pieces = {1: [], 2: []}  # Available pieces per player
        self.start_dots = {1: (4, 4), 2: (9, 9)}
        self.passed = {1: False, 2: False}

    def setup(self):
        """Initialize board and pieces based on variation."""
        if self.variation == "small":
            self.board_size = 10
            self.start_dots = {1: (2, 2), 2: (7, 7)}
            # Only pieces of size 1-4 (9 pieces each)
            piece_defs = [p for p in PIECES_ALL if p["size"] <= 4]
        else:
            self.board_size = 14
            self.start_dots = {1: (4, 4), 2: (9, 9)}
            piece_defs = list(PIECES_ALL)

        # 0 = empty, 1 = player1, 2 = player2
        self.board = [[0] * self.board_size for _ in range(self.board_size)]

        # Give each player a copy of the piece set
        for player in [1, 2]:
            self.pieces[player] = []
            for i, p in enumerate(piece_defs):
                self.pieces[player].append({
                    "id": i + 1,
                    "name": p["name"],
                    "size": p["size"],
                    "coords": list(p["coords"]),
                })

        self.passed = {1: False, 2: False}

    def display(self):
        """Display the board and piece information."""
        var_label = "Standard 14x14" if self.variation != "small" else "Mini 10x10"
        print(f"\n  === Blokus Duo ({var_label}) ===")
        print(f"  {self.players[0]} (X) vs {self.players[1]} (O)")
        print(f"  Current turn: {self.players[self.current_player - 1]}"
              f" ({'X' if self.current_player == 1 else 'O'})")
        print()

        # Column headers
        header = "     " + " ".join(f"{c:2d}" for c in range(self.board_size))
        print(header)
        print("    +" + "---" * self.board_size + "-+")

        for r in range(self.board_size):
            row_str = f"  {r:2d} |"
            for c in range(self.board_size):
                val = self.board[r][c]
                if val == 1:
                    row_str += " X "
                elif val == 2:
                    row_str += " O "
                elif (r, c) == self.start_dots[1] or (r, c) == self.start_dots[2]:
                    row_str += " * "
                else:
                    row_str += " . "
            row_str += "|"
            print(row_str)

        print("    +" + "---" * self.board_size + "-+")

        # Show scores
        for p in [1, 2]:
            remaining = sum(pc["size"] for pc in self.pieces[p])
            symbol = "X" if p == 1 else "O"
            print(f"  {self.players[p - 1]} ({symbol}): "
                  f"{len(self.pieces[p])} pieces left, {remaining} squares remaining")
        print()

    def _has_any_piece_on_board(self, player):
        """Check if a player has placed at least one piece on the board."""
        for r in range(self.board_size):
            for c in range(self.board_size):
                if self.board[r][c] == player:
                    return True
        return False

    def _is_valid_placement(self, coords, player):
        """
        Check if placing a piece at the given board coordinates is valid.
        coords: list of (row, col) tuples representing absolute board positions.
        """
        has_existing = self._has_any_piece_on_board(player)

        covers_start = False
        has_corner_touch = False

        for r, c in coords:
            # Check bounds
            if r < 0 or r >= self.board_size or c < 0 or c >= self.board_size:
                return False
            # Check cell is empty
            if self.board[r][c] != 0:
                return False

        coord_set = set(coords)

        for r, c in coords:
            # Check start dot
            if (r, c) == self.start_dots[player]:
                covers_start = True

            # Check no edge adjacency with same player
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if (nr, nc) in coord_set:
                    continue  # Same piece cells don't count
                if 0 <= nr < self.board_size and 0 <= nc < self.board_size:
                    if self.board[nr][nc] == player:
                        return False

            # Check corner adjacency with same player
            for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                nr, nc = r + dr, c + dc
                if (nr, nc) in coord_set:
                    continue
                if 0 <= nr < self.board_size and 0 <= nc < self.board_size:
                    if self.board[nr][nc] == player:
                        has_corner_touch = True

        if not has_existing:
            # First piece must cover the starting dot
            return covers_start
        else:
            # Must touch a corner of same player's pieces
            return has_corner_touch

    def _can_player_move(self, player):
        """Check if the player can place any piece anywhere."""
        for piece in self.pieces[player]:
            orientations = _all_orientations(piece["coords"])
            for orient in orientations:
                for r in range(self.board_size):
                    for c in range(self.board_size):
                        placed = [(r + dr, c + dc) for dr, dc in orient]
                        if self._is_valid_placement(placed, player):
                            return True
        return False

    def _display_piece(self, coords):
        """Return a small string rendering of a piece shape."""
        if not coords:
            return ""
        max_r = max(r for r, c in coords)
        max_c = max(c for r, c in coords)
        grid = [["  " for _ in range(max_c + 1)] for _ in range(max_r + 1)]
        for r, c in coords:
            grid[r][c] = "##"
        lines = []
        for row in grid:
            lines.append("".join(row))
        return "\n".join(lines)

    def get_move(self):
        """Get move from current player."""
        player = self.current_player
        print(f"  Available pieces for {self.players[player - 1]}:")
        print()
        for piece in self.pieces[player]:
            shape_lines = self._display_piece(piece["coords"])
            first_line = True
            for line in shape_lines.split("\n"):
                if first_line:
                    print(f"    {piece['id']:2d}. [{piece['name']:>3s}] (size {piece['size']}): {line}")
                    first_line = False
                else:
                    print(f"                              {line}")
        print()
        print("  Enter move: piece_id row col rotation [f]")
        print("  rotation: 0-3 (90-degree increments), f = flip horizontally")
        print("  Example: '5 3 4 2 f' places piece 5 at row 3, col 4, rotated 180, flipped")
        print("  Type 'pass' if you cannot place any piece.")
        print()
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        player = self.current_player

        if move.lower() == "pass":
            # Verify the player truly cannot move
            if self._can_player_move(player):
                return False
            self.passed[player] = True
            return True

        try:
            parts = move.split()
            if len(parts) < 4:
                return False
            piece_id = int(parts[0])
            row = int(parts[1])
            col = int(parts[2])
            rotation = int(parts[3])
            flip = len(parts) >= 5 and parts[4].lower() == "f"
        except (ValueError, IndexError):
            return False

        if rotation < 0 or rotation > 3:
            return False

        # Find the piece
        piece = None
        piece_idx = None
        for i, p in enumerate(self.pieces[player]):
            if p["id"] == piece_id:
                piece = p
                piece_idx = i
                break

        if piece is None:
            return False

        # Transform piece
        transformed = _transform(piece["coords"], rotation, flip)

        # Calculate absolute board positions
        placed = [(row + dr, col + dc) for dr, dc in transformed]

        # Validate placement
        if not self._is_valid_placement(placed, player):
            return False

        # Place the piece
        for r, c in placed:
            self.board[r][c] = player

        # Remove piece from player's available pieces
        self.pieces[player].pop(piece_idx)

        # Reset pass status since player made a move
        self.passed[player] = False

        return True

    def check_game_over(self):
        """Check if both players cannot place any more pieces."""
        # If current player just passed, check if game should end
        p1_can = self._can_player_move(1)
        p2_can = self._can_player_move(2)

        if not p1_can and not p2_can:
            self.game_over = True
            # Score = negative of remaining squares (fewer = better)
            score1 = -sum(p["size"] for p in self.pieces[1])
            score2 = -sum(p["size"] for p in self.pieces[2])
            if score1 > score2:
                self.winner = 1
            elif score2 > score1:
                self.winner = 2
            else:
                self.winner = None  # Draw

            print(f"\n  Final scores:")
            print(f"  {self.players[0]} (X): {score1} ({-score1} squares remaining)")
            print(f"  {self.players[1]} (O): {score2} ({-score2} squares remaining)")

    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [row[:] for row in self.board],
            "board_size": self.board_size,
            "pieces": {
                str(k): [
                    {"id": p["id"], "name": p["name"], "size": p["size"],
                     "coords": p["coords"]}
                    for p in v
                ]
                for k, v in self.pieces.items()
            },
            "start_dots": {str(k): list(v) for k, v in self.start_dots.items()},
            "passed": {str(k): v for k, v in self.passed.items()},
        }

    def load_state(self, state):
        """Restore game state."""
        self.board_size = state["board_size"]
        self.board = [row[:] for row in state["board"]]
        self.pieces = {}
        for k, v in state["pieces"].items():
            self.pieces[int(k)] = [
                {"id": p["id"], "name": p["name"], "size": p["size"],
                 "coords": [tuple(c) for c in p["coords"]]}
                for p in v
            ]
        self.start_dots = {int(k): tuple(v) for k, v in state["start_dots"].items()}
        self.passed = {int(k): v for k, v in state["passed"].items()}

    def get_tutorial(self):
        """Return tutorial with rules, piece list, input format, and strategy."""
        return """
==================================================
  Blokus Duo - Tutorial
==================================================

  OVERVIEW:
  Blokus Duo is a two-player territorial strategy
  game played on a 14x14 board (or 10x10 for the
  mini variant). Each player has a set of polyomino
  pieces of sizes 1 through 5 squares.

  RULES:
  1. Players take turns placing one piece per turn.
  2. Your FIRST piece must cover your starting dot
     (shown as * on the board).
     - Player 1 (X): starts at row 4, col 4
     - Player 2 (O): starts at row 9, col 9
  3. Each subsequent piece must TOUCH at least one
     CORNER of your own already-placed pieces.
  4. Your pieces may NOT share an EDGE with any of
     your own pieces (diagonal corners only).
  5. Your pieces CAN share edges with your opponent's
     pieces - only same-player edge adjacency is
     forbidden.
  6. The game ends when neither player can place any
     more pieces.
  7. Score = negative of remaining unplaced squares.
     The player with the higher score (fewer remaining
     squares) wins.

  PIECES (21 total in standard):
  Size 1: 1 (monomino)
  Size 2: 2 (domino)
  Size 3: I3 (line), L3 (corner)
  Size 4: I4 (line), O4 (square), T4, S4 (skew), L4
  Size 5: F5, I5, L5, N5, P5, T5, U5, V5, W5, X5,
          Y5, Z5

  Mini variant uses only pieces of size 1-4 (9 each)
  on a 10x10 board with starts at (2,2) and (7,7).

  HOW TO ENTER MOVES:
  Format: piece_id row col rotation [f]
  - piece_id: The number shown next to the piece
  - row, col: Where to place the top-left origin of
    the transformed piece on the board
  - rotation: 0 = none, 1 = 90 CW, 2 = 180, 3 = 270
  - f: Optional, flip the piece horizontally before
    rotating

  Examples:
  "1 4 4 0"     - Place piece 1 at row 4, col 4,
                   no rotation, no flip
  "5 3 4 2 f"   - Place piece 5 at row 3, col 4,
                   rotated 180 degrees, flipped

  Type 'pass' if you truly cannot make any move.
  (The game will verify this before allowing it.)

  STRATEGY HINTS:
  - Place large pieces early when you have more room.
  - Try to expand toward the center and your
    opponent's territory.
  - Keep corners available for future placements -
    blocking your own corners limits your options.
  - Use smaller pieces late in the game to fill
    tight spaces.
  - Try to block your opponent's corners while
    preserving your own.

==================================================
"""
