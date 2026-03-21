"""Othello - Official Othello with multiple board sizes and clean display."""

from engine.base import BaseGame, input_with_quit, clear_screen


# Eight directions: N, NE, E, SE, S, SW, W, NW
DIRECTIONS = [(-1, 0), (-1, 1), (0, 1), (1, 1),
              (1, 0), (1, -1), (0, -1), (-1, -1)]


class OthelloGame(BaseGame):
    """Othello implementation with 6x6, 8x8, and 10x10 board sizes."""

    name = "Othello"
    description = "Classic Othello - outflank your opponent on multiple board sizes"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Othello (8x8)",
        "6x6": "Quick Othello (6x6)",
        "10x10": "Grand Othello (10x10)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "6x6":
            self.size = 6
        elif self.variation == "10x10":
            self.size = 10
        else:
            self.size = 8
        self.board = []  # 2D list: 0=empty, 1=black(X), 2=white(O)

    def setup(self):
        """Initialize the board with the standard 4-piece center."""
        n = self.size
        self.board = [[0] * n for _ in range(n)]
        mid = n // 2
        # Standard starting position
        self.board[mid - 1][mid - 1] = 2  # white O
        self.board[mid - 1][mid] = 1      # black X
        self.board[mid][mid - 1] = 1      # black X
        self.board[mid][mid] = 2          # white O

    def _in_bounds(self, r, c):
        return 0 <= r < self.size and 0 <= c < self.size

    def _flips_in_direction(self, row, col, player, dr, dc):
        """Return list of (r, c) positions that would be flipped in one direction."""
        opponent = 3 - player
        flips = []
        r, c = row + dr, col + dc
        while self._in_bounds(r, c) and self.board[r][c] == opponent:
            flips.append((r, c))
            r += dr
            c += dc
        if flips and self._in_bounds(r, c) and self.board[r][c] == player:
            return flips
        return []

    def _get_all_flips(self, row, col, player):
        """Return all positions flipped if player places at (row, col)."""
        if self.board[row][col] != 0:
            return []
        all_flips = []
        for dr, dc in DIRECTIONS:
            all_flips.extend(self._flips_in_direction(row, col, player, dr, dc))
        return all_flips

    def _valid_moves(self, player):
        """Return list of (row, col) with valid moves for player."""
        moves = []
        for r in range(self.size):
            for c in range(self.size):
                if self._get_all_flips(r, c, player):
                    moves.append((r, c))
        return moves

    def _count_pieces(self):
        """Return (player1_count, player2_count)."""
        p1 = sum(cell == 1 for row in self.board for cell in row)
        p2 = sum(cell == 2 for row in self.board for cell in row)
        return p1, p2

    def display(self):
        """Display the board with coordinates, valid move indicators, and scores."""
        valid = set(self._valid_moves(self.current_player))
        p1_score, p2_score = self._count_pieces()

        board_width = self.size * 2 + 5
        print()
        print(f"  {'Othello':^{board_width}}")
        print(f"  {self.players[0]} (X): {p1_score}   {self.players[1]} (O): {p2_score}")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move "
              f"({'X' if self.current_player == 1 else 'O'})")
        print()

        # Column headers (lowercase a-j depending on board size)
        col_letters = [chr(ord('a') + c) for c in range(self.size)]
        print("    " + " ".join(f" {ch}" for ch in col_letters))
        print("   +" + "---" * self.size + "-+")

        for r in range(self.size):
            row_label = f"{r + 1:2}"
            row_str = f"{row_label} |"
            for c in range(self.size):
                cell = self.board[r][c]
                if cell == 1:
                    row_str += " X "
                elif cell == 2:
                    row_str += " O "
                elif (r, c) in valid:
                    row_str += " * "
                else:
                    row_str += " . "
            row_str += f"| {r + 1}"
            print(row_str)

        print("   +" + "---" * self.size + "-+")
        print("    " + " ".join(f" {ch}" for ch in col_letters))

        if valid:
            move_strs = [self._pos_to_str(r, c) for r, c in sorted(valid)]
            print(f"\n  Valid moves: {', '.join(move_strs)}")
        else:
            print("\n  No valid moves - you must pass.")

    def _pos_to_str(self, row, col):
        """Convert (row, col) to algebraic notation like 'd3'."""
        return f"{chr(ord('a') + col)}{row + 1}"

    def _parse_move(self, move_str):
        """Parse 'd3' style input into (row, col). Returns None on failure."""
        s = move_str.strip().lower()
        if len(s) < 2 or len(s) > 3:
            return None
        col_ch = s[0]
        row_str = s[1:]
        if not col_ch.isalpha() or not row_str.isdigit():
            return None
        col = ord(col_ch) - ord('a')
        row = int(row_str) - 1
        if not self._in_bounds(row, col):
            return None
        return (row, col)

    def get_move(self):
        """Get move from current player. Returns (row, col) or 'pass'."""
        valid = self._valid_moves(self.current_player)
        if not valid:
            input_with_quit("  No valid moves. Press Enter to pass (or type 'quit'): ")
            return 'pass'

        while True:
            move_input = input_with_quit(
                f"  {self.players[self.current_player - 1]}, enter move (e.g. d3): "
            )
            parsed = self._parse_move(move_input)
            if parsed is None:
                print("  Invalid format. Use column letter + row number, e.g. d3.")
                continue
            if parsed not in valid:
                print(f"  {self._pos_to_str(*parsed)} is not a valid move.")
                continue
            return parsed

    def make_move(self, move):
        """Place a piece and flip captured opponents. Returns True if valid."""
        if move == 'pass':
            return True

        row, col = move
        flips = self._get_all_flips(row, col, self.current_player)
        if not flips:
            return False

        self.board[row][col] = self.current_player
        for r, c in flips:
            self.board[r][c] = self.current_player
        return True

    def check_game_over(self):
        """Game ends when neither player can move, or the board is full."""
        empty = sum(cell == 0 for row in self.board for cell in row)
        if empty == 0:
            self._end_game()
            return

        if not self._valid_moves(1) and not self._valid_moves(2):
            self._end_game()
            return

    def _end_game(self):
        """Set game_over and winner based on piece counts."""
        self.game_over = True
        p1, p2 = self._count_pieces()
        if p1 > p2:
            self.winner = 1
        elif p2 > p1:
            self.winner = 2
        else:
            self.winner = None  # draw

    def get_state(self):
        """Serialize game state for saving."""
        return {
            'board': [row[:] for row in self.board],
            'size': self.size,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = [row[:] for row in state['board']]
        self.size = state['size']

    def get_tutorial(self):
        """Return comprehensive Othello tutorial text."""
        return """
======================================================================
                         OTHELLO TUTORIAL
======================================================================

OVERVIEW
--------
Othello is a two-player strategy game played on a square board.
Players take turns placing discs, aiming to have the most pieces
of their color when the game ends.

  Player 1 plays Black (X)
  Player 2 plays White (O)
  Valid moves are shown as (*)
  Empty squares are shown as (.)

BOARD SIZES
-----------
  Standard:  8x8  (64 squares) - the classic Othello board
  Quick:     6x6  (36 squares) - faster games
  Grand:     10x10 (100 squares) - longer, more strategic games

BOARD SETUP
-----------
The game begins with four discs placed in the center of the board
in a diagonal pattern: two black and two white.

HOW TO MOVE
-----------
Enter your move using algebraic notation: a lowercase column letter
followed by a row number.

  Example: d3 places your disc at column d, row 3.

Valid moves are marked with * on the board.

FLANKING (THE CORE RULE)
------------------------
You MUST place your disc so that it flanks one or more of your
opponent's discs. Flanking means your new disc and an existing
disc of your color form a straight line (horizontal, vertical, or
diagonal) with one or more opponent discs in between.

All flanked opponent discs are flipped to your color.

A single move can flank in multiple directions simultaneously.

  Example:
    Before:  X O O _     You (X) place at the _
    After:   X X X X     Both O discs are flipped!

PASSING
-------
If you have no valid move (no placement that flanks any opponent
disc), you must pass. Your opponent then continues playing.

GAME END
--------
The game ends when:
  1. The board is completely full, OR
  2. Neither player has a valid move.

The player with the most discs on the board wins.
If both players have the same number, it is a draw.

STRATEGY TIPS
-------------
- Corners are extremely valuable - they can never be flipped.
- Edges are strong positions since they limit flanking directions.
- Avoid placing next to empty corners early on.
- Having fewer discs early can be advantageous - it limits your
  opponent's options while keeping yours flexible.
- The endgame often swings dramatically in the final moves.

COMMANDS
--------
  Type your move   - Place a disc (e.g. d3)
  'quit' or 'q'    - Quit the game
  'save' or 's'    - Save and suspend the game
  'help' or 'h'    - Show help
  'tutorial' / 't' - Show this tutorial
======================================================================
"""
