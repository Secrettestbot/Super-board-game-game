"""Lines of Action - Abstract strategy board game where the goal is to connect all your pieces."""

from engine.base import BaseGame, input_with_quit, clear_screen

# Piece constants
EMPTY = 0
BLACK = 1  # Player 1 (X)
WHITE = 2  # Player 2 (O)

SYMBOLS = {EMPTY: '.', BLACK: 'X', WHITE: 'O'}


class LinesOfActionGame(BaseGame):
    """Lines of Action implementation with standard and scrambled variations."""

    name = "Lines of Action"
    description = "Connect all your pieces into one contiguous group"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (8x8)",
        "scrambled": "Scrambled Eggs (alternate start)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation not in self.variations:
            self.variation = "standard"
        self.board = [[EMPTY] * 8 for _ in range(8)]

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def setup(self):
        """Initialize the board with starting positions."""
        self.board = [[EMPTY] * 8 for _ in range(8)]

        if self.variation == "standard":
            # Black (P1) on top row (row 0) and bottom row (row 7), columns 1-6
            for c in range(1, 7):
                self.board[0][c] = BLACK
                self.board[7][c] = BLACK
            # White (P2) on left column (col 0) and right column (col 7), rows 1-6
            for r in range(1, 7):
                self.board[r][0] = WHITE
                self.board[r][7] = WHITE
        elif self.variation == "scrambled":
            # Checkerboard pattern on the two middle rows (rows 3 and 4)
            for c in range(8):
                # Row 3: Black on even cols, White on odd cols
                if c % 2 == 0:
                    self.board[3][c] = BLACK
                else:
                    self.board[3][c] = WHITE
                # Row 4: White on even cols, Black on odd cols
                if c % 2 == 0:
                    self.board[4][c] = WHITE
                else:
                    self.board[4][c] = BLACK
            # Also place pieces on rows 2 and 5 with opposite pattern
            for c in range(8):
                if c % 2 == 0:
                    self.board[2][c] = WHITE
                else:
                    self.board[2][c] = BLACK
                if c % 2 == 0:
                    self.board[5][c] = BLACK
                else:
                    self.board[5][c] = WHITE

    # ------------------------------------------------------------------
    # Display
    # ------------------------------------------------------------------

    def display(self):
        """Display the board with algebraic coordinates."""
        print(f"\n  Lines of Action - {self.variations[self.variation]}")
        print(f"  {self.players[0]} (X) vs {self.players[1]} (O)")
        print(f"  Turn {self.turn_number + 1}: {self.players[self.current_player - 1]}'s move "
              f"({'X' if self.current_player == 1 else 'O'})\n")

        print("    a b c d e f g h")
        print("  +-----------------+")
        for r in range(8):
            row_label = str(8 - r)
            pieces = ' '.join(SYMBOLS[self.board[r][c]] for c in range(8))
            print(f"{row_label} | {pieces} |")
        print("  +-----------------+")
        print("    a b c d e f g h")

        # Show piece counts
        b_count = sum(row.count(BLACK) for row in self.board)
        w_count = sum(row.count(WHITE) for row in self.board)
        print(f"\n  X pieces: {b_count}   O pieces: {w_count}")

    # ------------------------------------------------------------------
    # Coordinate conversion
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_square(s):
        """Convert algebraic notation (e.g. 'a2') to (row, col). Returns None on failure."""
        s = s.strip().lower()
        if len(s) != 2:
            return None
        col = ord(s[0]) - ord('a')
        try:
            row = 8 - int(s[1])
        except ValueError:
            return None
        if 0 <= row < 8 and 0 <= col < 8:
            return (row, col)
        return None

    @staticmethod
    def _square_name(row, col):
        """Convert (row, col) to algebraic notation."""
        return chr(ord('a') + col) + str(8 - row)

    # ------------------------------------------------------------------
    # Move logic
    # ------------------------------------------------------------------

    def _count_pieces_on_line(self, row, col, dr, dc):
        """Count total pieces (both players) along the line through (row, col) in direction (dr, dc).

        The line extends in both the (dr, dc) and (-dr, -dc) directions, plus the square itself.
        """
        count = 0
        # Check if the square itself has a piece
        if self.board[row][col] != EMPTY:
            count += 1

        # Positive direction
        r, c = row + dr, col + dc
        while 0 <= r < 8 and 0 <= c < 8:
            if self.board[r][c] != EMPTY:
                count += 1
            r += dr
            c += dc

        # Negative direction
        r, c = row - dr, col - dc
        while 0 <= r < 8 and 0 <= c < 8:
            if self.board[r][c] != EMPTY:
                count += 1
            r -= dr
            c -= dc

        return count

    def _get_valid_moves_for_piece(self, row, col):
        """Return list of valid destination (row, col) for the piece at (row, col)."""
        piece = self.board[row][col]
        if piece == EMPTY:
            return []

        player = piece  # BLACK=1, WHITE=2
        opponent = WHITE if player == BLACK else BLACK
        moves = []

        # 8 directions: orthogonal + diagonal
        directions = [
            (-1, 0), (1, 0), (0, -1), (0, 1),   # orthogonal
            (-1, -1), (-1, 1), (1, -1), (1, 1),  # diagonal
        ]

        for dr, dc in directions:
            dist = self._count_pieces_on_line(row, col, dr, dc)
            dest_r = row + dr * dist
            dest_c = col + dc * dist

            # Check bounds
            if not (0 <= dest_r < 8 and 0 <= dest_c < 8):
                continue

            # Check destination is not own piece
            if self.board[dest_r][dest_c] == player:
                continue

            # Check path: can jump friendly but NOT opponent pieces
            blocked = False
            for step in range(1, dist):
                ir = row + dr * step
                ic = col + dc * step
                if self.board[ir][ic] == opponent:
                    blocked = True
                    break

            if not blocked:
                moves.append((dest_r, dest_c))

        return moves

    def _is_connected(self, player):
        """Check if all pieces of player form one contiguous group (8-directional adjacency)."""
        pieces = []
        for r in range(8):
            for c in range(8):
                if self.board[r][c] == player:
                    pieces.append((r, c))

        if len(pieces) <= 1:
            return True

        # BFS from first piece
        visited = {pieces[0]}
        queue = [pieces[0]]
        piece_set = set(pieces)

        while queue:
            r, c = queue.pop(0)
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    if dr == 0 and dc == 0:
                        continue
                    nr, nc = r + dr, c + dc
                    if (nr, nc) in piece_set and (nr, nc) not in visited:
                        visited.add((nr, nc))
                        queue.append((nr, nc))

        return len(visited) == len(pieces)

    def _has_any_valid_move(self, player):
        """Check if the player has at least one valid move."""
        piece = BLACK if player == 1 else WHITE
        for r in range(8):
            for c in range(8):
                if self.board[r][c] == piece:
                    if self._get_valid_moves_for_piece(r, c):
                        return True
        return False

    # ------------------------------------------------------------------
    # Game interface
    # ------------------------------------------------------------------

    def get_move(self):
        """Get move input from current player."""
        symbol = 'X' if self.current_player == 1 else 'O'
        move_str = input_with_quit(f"\n  {self.players[self.current_player - 1]} ({symbol}), enter move (e.g. a2 a5): ")
        return move_str.strip()

    def make_move(self, move):
        """Parse and apply a move. Returns True if valid."""
        parts = move.split()
        if len(parts) != 2:
            print("  Invalid format. Use 'from to', e.g. 'a2 a5'.")
            return False

        src = self._parse_square(parts[0])
        dst = self._parse_square(parts[1])

        if src is None or dst is None:
            print("  Invalid square. Use algebraic notation (a1-h8).")
            return False

        sr, sc = src
        dr, dc = dst

        piece = BLACK if self.current_player == 1 else WHITE

        if self.board[sr][sc] != piece:
            print(f"  No {'X' if self.current_player == 1 else 'O'} piece at {parts[0]}.")
            return False

        valid_moves = self._get_valid_moves_for_piece(sr, sc)
        if (dr, dc) not in valid_moves:
            print("  Invalid move. Piece must move exactly N squares along its line,")
            print("  where N = total pieces on that line. Cannot jump opponent pieces.")
            return False

        # Execute the move
        self.board[sr][sc] = EMPTY
        self.board[dr][dc] = piece

        return True

    def check_game_over(self):
        """Check if the game is over."""
        current_piece = BLACK if self.current_player == 1 else WHITE
        opponent_piece = WHITE if self.current_player == 1 else BLACK

        current_connected = self._is_connected(current_piece)
        opponent_connected = self._is_connected(opponent_piece)

        # If the mover's pieces are all connected, mover wins
        # (even if opponent is also connected - mover wins)
        if current_connected:
            self.game_over = True
            self.winner = self.current_player
            return

        # If opponent became connected (e.g. through capture reducing their count)
        if opponent_connected:
            self.game_over = True
            self.winner = 2 if self.current_player == 1 else 1
            return

    # ------------------------------------------------------------------
    # Save / Load
    # ------------------------------------------------------------------

    def get_state(self):
        """Return serializable game state."""
        return {
            'board': [row[:] for row in self.board],
            'variation': self.variation,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = [row[:] for row in state['board']]
        if 'variation' in state:
            self.variation = state['variation']

    # ------------------------------------------------------------------
    # Tutorial
    # ------------------------------------------------------------------

    def get_tutorial(self):
        """Return tutorial text for Lines of Action."""
        return """
==============================================================================
                         LINES OF ACTION - TUTORIAL
==============================================================================

  OBJECTIVE:
    Connect all of your remaining pieces into a single contiguous group.
    Pieces are connected if they are adjacent horizontally, vertically,
    or diagonally.

  SETUP:
    - 8x8 board
    - Player 1 (X/Black): 12 pieces on the top and bottom rows (not corners)
    - Player 2 (O/White): 12 pieces on the left and right columns (not corners)

  HOW TO MOVE:
    - On your turn, move one of your pieces in any direction (horizontal,
      vertical, or diagonal).
    - The piece must move EXACTLY N squares, where N is the total number
      of pieces (yours AND your opponent's) on that line of movement.
    - A "line" is the row, column, or diagonal the piece moves along.

  JUMPING AND CAPTURING:
    - You CAN jump over your own pieces.
    - You CANNOT jump over opponent pieces (they block your path).
    - You CAN land on an opponent piece to capture it (remove it).
    - You CANNOT land on your own piece.

  WINNING:
    - You win when all your remaining pieces form one connected group.
    - If a move connects BOTH players' pieces, the mover wins.
    - If you are reduced to 1 piece (e.g., through captures), you win
      since 1 piece is trivially connected.

  EXAMPLE MOVE:
    "b1 b4" - Move piece from b1 to b4 (if there are exactly 4 pieces
    on the b-file through which the piece travels).

  INPUT FORMAT:
    Enter moves as "from to" in algebraic notation, e.g. "a2 a5"
    Columns: a-h (left to right), Rows: 1-8 (bottom to top)

  VARIATIONS:
    - Standard: Classic starting position
    - Scrambled Eggs: Pieces start in a checkerboard pattern on middle rows

==============================================================================
"""
