"""Cathedral - A territory game where players place polyomino pieces on a board."""

from engine.base import BaseGame, input_with_quit, clear_screen


class CathedralGame(BaseGame):
    """Cathedral: Claim territory by placing polyomino-shaped pieces."""

    name = "Cathedral"
    description = "Place polyomino pieces to claim territory and block your opponent"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Cathedral",
        "simple": "Simple (fewer pieces)",
    }

    # Polyomino shapes defined as lists of (row_offset, col_offset) from anchor
    # Rotation transforms: 0=base, 90=rotate CW, 180=flip, 270=rotate CCW
    PIECE_SHAPES = {
        1: {
            "name": "Mono",
            "base": [(0, 0)],
        },
        2: {
            "name": "Domino",
            "base": [(0, 0), (0, 1)],
        },
        3: {
            "name": "Triomino-L",
            "base": [(0, 0), (1, 0), (1, 1)],
        },
        4: {
            "name": "Tetromino-T",
            "base": [(0, 0), (0, 1), (0, 2), (1, 1)],
        },
        5: {
            "name": "Pentomino-P",
            "base": [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0)],
        },
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.size = 10
        self.board = []
        self.pieces = {1: [], 2: []}  # Available pieces for each player
        self.cathedral_placed = False
        self.consecutive_passes = 0
        self.total_placed = {1: 0, 2: 0}  # Total squares placed by each player

    def setup(self):
        """Initialize the board and piece inventories."""
        self.size = 10
        self.board = [[0] * self.size for _ in range(self.size)]
        self.cathedral_placed = False
        self.consecutive_passes = 0
        self.total_placed = {1: 0, 2: 0}

        if self.variation == "simple":
            # Fewer pieces: 1,1,2,2,3,3,4,5
            self.pieces = {
                1: [1, 1, 2, 2, 3, 3, 4, 5],
                2: [1, 1, 2, 2, 3, 3, 4, 5],
            }
        else:
            # Standard: 1,1,1,2,2,2,3,3,3,4,4,5
            self.pieces = {
                1: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5],
                2: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5],
            }

        # Place the cathedral (neutral piece) in the center
        self._place_cathedral()

    def _place_cathedral(self):
        """Place the cathedral (neutral 'C' piece) in the center of the board."""
        # Cathedral is a cross shape in the center
        center = self.size // 2
        cathedral_cells = [
            (center - 1, center),
            (center, center - 1), (center, center), (center, center + 1),
            (center + 1, center),
        ]
        for r, c in cathedral_cells:
            self.board[r][c] = 'C'
        self.cathedral_placed = True

    def _get_rotated_shape(self, base_cells, rotation):
        """Rotate a piece shape by the given degrees (0, 90, 180, 270)."""
        cells = base_cells[:]

        rotations = (rotation % 360) // 90
        for _ in range(rotations):
            # Rotate 90 degrees clockwise: (r, c) -> (c, -r)
            cells = [(c, -r) for r, c in cells]

        # Normalize: shift so minimum row and col are both 0
        min_r = min(r for r, c in cells)
        min_c = min(c for r, c in cells)
        cells = [(r - min_r, c - min_c) for r, c in cells]

        return cells

    def _can_place(self, cells, row, col, player):
        """Check if a piece with given cells can be placed at (row, col)."""
        for dr, dc in cells:
            r, c = row + dr, col + dc
            if r < 0 or r >= self.size or c < 0 or c >= self.size:
                return False
            if self.board[r][c] != 0:
                return False
        return True

    def _place_piece(self, cells, row, col, player):
        """Place a piece on the board."""
        for dr, dc in cells:
            r, c = row + dr, col + dc
            self.board[r][c] = player

    def display(self):
        """Display the board with player markers."""
        symbols = {0: ".", 1: "1", 2: "2", 'C': "C"}

        print(f"\n  === Cathedral ({self.variations[self.variation]}) ===")
        print(f"  {self.players[0]} (1): {self.total_placed[1]} squares placed")
        print(f"  {self.players[1]} (2): {self.total_placed[2]} squares placed")

        if not self.game_over:
            print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        print()

        # Column headers
        col_labels = "    " + "  ".join(f"{c:1}" for c in range(self.size))
        print(col_labels)
        print("  +" + "---" * self.size + "+")

        for r in range(self.size):
            row_str = f"{r:2}|"
            for c in range(self.size):
                cell = self.board[r][c]
                row_str += f" {symbols.get(cell, str(cell))} "
            row_str += f"|{r}"
            print(row_str)

        print("  +" + "---" * self.size + "+")
        print(col_labels)
        print()

        # Show remaining pieces
        if not self.game_over:
            player = self.current_player
            p_name = self.players[player - 1]
            piece_counts = {}
            for size in self.pieces[player]:
                piece_counts[size] = piece_counts.get(size, 0) + 1
            pieces_str = ", ".join(
                f"size-{s}x{cnt}" for s, cnt in sorted(piece_counts.items())
            )
            print(f"  {p_name}'s remaining pieces: {pieces_str}")

            # Also show opponent's remaining
            opp = 3 - player
            opp_counts = {}
            for size in self.pieces[opp]:
                opp_counts[size] = opp_counts.get(size, 0) + 1
            opp_str = ", ".join(
                f"size-{s}x{cnt}" for s, cnt in sorted(opp_counts.items())
            )
            print(f"  {self.players[opp - 1]}'s remaining pieces: {opp_str}")
            print()

            # Show piece shape reference
            self._show_piece_shapes()

    def _show_piece_shapes(self):
        """Show a compact reference of piece shapes."""
        print("  Piece shapes (at rotation 0):")
        print("    Size 1: #")
        print("    Size 2: ##")
        print("    Size 3: #     Size 4: ###   Size 5: ##")
        print("            ##             #            ##")
        print("                                        #")
        print()

    def get_move(self):
        """Get move: piece_size row,col rotation or 'pass'."""
        player = self.current_player
        player_name = self.players[player - 1]

        while True:
            raw = input_with_quit(
                f"  {player_name}, enter: size row,col rotation (e.g. 3 2,4 90) or 'pass': "
            ).strip()

            if raw.lower() == 'pass':
                return ("pass",)

            # Parse: piece_size row,col rotation
            parts = raw.replace(',', ' ').split()

            if len(parts) < 3:
                print("  Format: size row,col rotation (e.g. '3 2,4 90') or 'pass'")
                print("  Rotation: 0, 90, 180, or 270 degrees")
                continue

            try:
                piece_size = int(parts[0])
            except ValueError:
                print("  Piece size must be a number (1-5).")
                continue

            if piece_size not in self.PIECE_SHAPES:
                print(f"  Invalid piece size. Available: 1, 2, 3, 4, 5")
                continue

            if piece_size not in self.pieces[player]:
                print(f"  You have no size-{piece_size} pieces remaining.")
                continue

            try:
                row = int(parts[1])
                col = int(parts[2])
            except ValueError:
                print(f"  Invalid position. Use row col as numbers (0-{self.size - 1}).")
                continue

            # Rotation is optional, default to 0
            rotation = 0
            if len(parts) >= 4:
                try:
                    rotation = int(parts[3])
                except ValueError:
                    print("  Rotation must be 0, 90, 180, or 270.")
                    continue

            if rotation not in (0, 90, 180, 270):
                print("  Rotation must be 0, 90, 180, or 270.")
                continue

            if not (0 <= row < self.size and 0 <= col < self.size):
                print(f"  Position out of bounds. Use 0-{self.size - 1}.")
                continue

            return ("place", piece_size, row, col, rotation)

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move[0] == "pass":
            self.consecutive_passes += 1
            return True

        _, piece_size, row, col, rotation = move
        player = self.current_player

        # Verify piece is available
        if piece_size not in self.pieces[player]:
            print(f"  No size-{piece_size} piece available.")
            return False

        # Get rotated shape
        base = self.PIECE_SHAPES[piece_size]["base"]
        cells = self._get_rotated_shape(base, rotation)

        # Check placement validity
        if not self._can_place(cells, row, col, player):
            print("  Cannot place piece there (out of bounds or overlapping).")
            return False

        # Place the piece
        self._place_piece(cells, row, col, player)

        # Remove one piece of this size from inventory
        self.pieces[player].remove(piece_size)
        self.total_placed[player] += piece_size
        self.consecutive_passes = 0

        return True

    def check_game_over(self):
        """Check if the game is over."""
        # Game over if both players pass consecutively
        if self.consecutive_passes >= 2:
            self.game_over = True
            self._determine_winner()
            return

        # Game over if both players have no pieces left
        if not self.pieces[1] and not self.pieces[2]:
            self.game_over = True
            self._determine_winner()
            return

        # Check if current opponent (next to move) can place any piece
        next_player = 3 - self.current_player
        if not self.pieces[next_player]:
            # Next player has no pieces; check if current player also has none
            if not self.pieces[self.current_player]:
                self.game_over = True
                self._determine_winner()

    def _determine_winner(self):
        """Determine winner based on total squares placed."""
        if self.total_placed[1] > self.total_placed[2]:
            self.winner = 1
        elif self.total_placed[2] > self.total_placed[1]:
            self.winner = 2
        else:
            # Tiebreaker: fewer remaining pieces wins (already same total placed
            # so fewer remaining means placed same but had fewer remaining)
            remaining1 = sum(self.pieces[1])
            remaining2 = sum(self.pieces[2])
            if remaining1 < remaining2:
                self.winner = 1
            elif remaining2 < remaining1:
                self.winner = 2
            else:
                self.winner = None  # Draw

    def _has_any_valid_placement(self, player):
        """Check if a player can place any of their remaining pieces anywhere."""
        for piece_size in set(self.pieces[player]):
            base = self.PIECE_SHAPES[piece_size]["base"]
            for rotation in (0, 90, 180, 270):
                cells = self._get_rotated_shape(base, rotation)
                for r in range(self.size):
                    for c in range(self.size):
                        if self._can_place(cells, r, c, player):
                            return True
        return False

    def get_state(self):
        """Return serializable game state."""
        # Convert board to all-string for JSON (handles 'C' and int values)
        serializable_board = []
        for row in self.board:
            serializable_board.append([str(cell) for cell in row])

        return {
            "size": self.size,
            "board": serializable_board,
            "pieces": {str(k): v[:] for k, v in self.pieces.items()},
            "cathedral_placed": self.cathedral_placed,
            "consecutive_passes": self.consecutive_passes,
            "total_placed": {str(k): v for k, v in self.total_placed.items()},
        }

    def load_state(self, state):
        """Restore game state."""
        self.size = state["size"]

        # Restore board with proper types
        self.board = []
        for row in state["board"]:
            restored_row = []
            for cell in row:
                if cell == 'C':
                    restored_row.append('C')
                elif cell == '0':
                    restored_row.append(0)
                else:
                    try:
                        restored_row.append(int(cell))
                    except ValueError:
                        restored_row.append(cell)
            self.board.append(restored_row)

        self.pieces = {int(k): v[:] for k, v in state["pieces"].items()}
        self.cathedral_placed = state["cathedral_placed"]
        self.consecutive_passes = state["consecutive_passes"]
        self.total_placed = {int(k): v for k, v in state["total_placed"].items()}

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==============================================================
                  CATHEDRAL TUTORIAL
==============================================================

OVERVIEW
  Cathedral is a territory game where two players take turns
  placing polyomino-shaped pieces on a 10x10 board. The goal
  is to place more squares worth of pieces than your opponent.

--------------------------------------------------------------
SETUP
--------------------------------------------------------------
  The board starts with a cathedral (neutral cross-shaped
  piece marked 'C') in the center. Each player receives a
  set of polyomino pieces of various sizes.

  Standard set per player:
    3x size-1, 3x size-2, 3x size-3, 2x size-4, 1x size-5
    (Total: 36 squares worth of pieces)

  Simple set per player:
    2x size-1, 2x size-2, 2x size-3, 1x size-4, 1x size-5
    (Total: 23 squares worth of pieces)

--------------------------------------------------------------
PIECE SHAPES
--------------------------------------------------------------
  Size 1 (Mono):      #

  Size 2 (Domino):    ##

  Size 3 (Triomino):  #
                      ##

  Size 4 (Tetromino): ###
                       #

  Size 5 (Pentomino): ##
                      ##
                      #

  Each piece can be rotated in 90-degree increments
  (0, 90, 180, or 270 degrees).

--------------------------------------------------------------
GAMEPLAY
--------------------------------------------------------------
  1. Players take turns placing one piece at a time.
  2. Pieces cannot overlap with other pieces or the cathedral.
  3. Pieces cannot extend outside the board boundaries.
  4. A player may pass if they cannot or choose not to place.
  5. The game ends when both players pass consecutively, or
     both players run out of pieces.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  The player who has placed more total squares of pieces
  on the board wins. If tied, the player with fewer
  remaining piece squares wins.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Enter: piece_size row,col rotation

  Examples:
    3 2,4 90   - Place a size-3 piece at row 2, col 4,
                  rotated 90 degrees clockwise
    1 0,0 0    - Place a size-1 piece at top-left corner
    2 5 3 0    - Place a size-2 piece at row 5, col 3, no
                  rotation

  Rows and columns start from 0 (top-left is 0,0).
  Rotation values: 0, 90, 180, 270.
  Type 'pass' to skip your turn.

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  Standard Cathedral:
    Full piece set (12 pieces per player, 36 squares each).
    Longer, more strategic game.

  Simple (fewer pieces):
    Reduced piece set (8 pieces per player, 23 squares each).
    Shorter, faster game.

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Larger pieces are harder to place later, so consider
    using them early while there is more open space.
  - Try to block areas where your opponent needs to place
    their larger pieces.
  - Control the areas around the cathedral - the center
    is valuable real estate.
  - Use small pieces to fill gaps and deny space to your
    opponent.
  - Think about piece rotation - a piece may fit in a
    different orientation even when the default does not.
  - Passing strategically can force your opponent to fill
    space that benefits you.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
