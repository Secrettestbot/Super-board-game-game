"""Reversi (Othello) - Classic strategy board game."""

from engine.base import BaseGame, input_with_quit, clear_screen


# Eight directions: N, NE, E, SE, S, SW, W, NW
DIRECTIONS = [(-1, 0), (-1, 1), (0, 1), (1, 1),
              (1, 0), (1, -1), (0, -1), (-1, -1)]


class ReversiGame(BaseGame):
    """Reversi/Othello implementation."""

    name = "Reversi"
    description = "Classic strategy game - flip your opponent's pieces by flanking them"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard 8x8 board",
        "small": "Smaller 6x6 board"
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.size = 6 if self.variation == "small" else 8
        self.board = []  # 2D list: 0=empty, 1=player1(black ●), 2=player2(white ○)

    def setup(self):
        """Initialize the board with the standard 4-piece center."""
        n = self.size
        self.board = [[0] * n for _ in range(n)]
        mid = n // 2
        # Standard starting position: white top-left/bottom-right diagonal,
        # black top-right/bottom-left diagonal of center 2x2
        self.board[mid - 1][mid - 1] = 2  # white ○
        self.board[mid - 1][mid] = 1      # black ●
        self.board[mid][mid - 1] = 1      # black ●
        self.board[mid][mid] = 2          # white ○

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
        # Must end with own piece to form a valid flank
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
        """Display the board with coordinates, valid moves highlighted, and scores."""
        symbols = {0: '·', 1: '●', 2: '○'}
        valid = set(self._valid_moves(self.current_player))
        p1_score, p2_score = self._count_pieces()

        print(f"\n  {'Reversi':^{self.size * 2 + 3}}")
        print(f"  {self.players[0]} (●): {p1_score}   {self.players[1]} (○): {p2_score}")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move "
              f"({'●' if self.current_player == 1 else '○'})")
        print()

        # Column headers
        col_letters = [chr(ord('A') + c) for c in range(self.size)]
        print("    " + "  ".join(col_letters))
        print("  +" + "---" * self.size + "+")

        for r in range(self.size):
            row_str = f"{r + 1:2}|"
            for c in range(self.size):
                if self.board[r][c] == 0 and (r, c) in valid:
                    row_str += " * "
                else:
                    row_str += f" {symbols[self.board[r][c]]} "
            row_str += f"|{r + 1}"
            print(row_str)

        print("  +" + "---" * self.size + "+")
        print("    " + "  ".join(col_letters))

        if valid:
            print(f"\n  Valid moves: {', '.join(self._pos_to_str(r, c) for r, c in sorted(valid))}")
        else:
            print("\n  No valid moves - you must pass.")

    def _pos_to_str(self, row, col):
        """Convert (row, col) to display string like 'D3'."""
        return f"{chr(ord('A') + col)}{row + 1}"

    def _parse_move(self, move_str):
        """Parse 'D3' style input into (row, col). Returns None on failure."""
        s = move_str.strip().upper()
        if len(s) < 2 or len(s) > 3:
            return None
        col_ch = s[0]
        row_str = s[1:]
        if not col_ch.isalpha() or not row_str.isdigit():
            return None
        col = ord(col_ch) - ord('A')
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
                f"  {self.players[self.current_player - 1]}, enter move (e.g. D3): "
            )
            parsed = self._parse_move(move_input)
            if parsed is None:
                print("  Invalid format. Use column letter + row number, e.g. D3.")
                continue
            if parsed not in valid:
                print(f"  {self._pos_to_str(*parsed)} is not a valid move.")
                continue
            return parsed

    def make_move(self, move):
        """Place a piece and flip captured opponents. Returns True if valid."""
        if move == 'pass':
            # Pass is valid only when no moves available (already checked in get_move)
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
        # Board full?
        empty = sum(cell == 0 for row in self.board for cell in row)
        if empty == 0:
            self._end_game()
            return

        # Both players have no moves?
        if not self._valid_moves(1) and not self._valid_moves(2):
            self._end_game()
            return

    def _end_game(self):
        """Set game_over, winner based on piece counts."""
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
        """Return comprehensive Reversi tutorial text."""
        return """
╔══════════════════════════════════════════════════════════════╗
║                    REVERSI (OTHELLO) TUTORIAL                ║
╚══════════════════════════════════════════════════════════════╝

OVERVIEW
--------
Reversi is a two-player strategy game played on a square board.
Players take turns placing their colored discs on the board, with
the goal of having the most discs of their color when the game ends.

  Player 1 plays Black (●)
  Player 2 plays White (○)

BOARD SETUP
-----------
The game begins with four discs placed in the center of the board
in a diagonal pattern: two black and two white.

  Standard board: 8x8 (64 squares)
  Small variant:  6x6 (36 squares)

HOW TO MOVE
-----------
Enter your move as a column letter followed by a row number.
  Example: D3 places your disc at column D, row 3.

Valid moves are shown on the board with an asterisk (*).

FLANKING (THE CORE RULE)
-------------------------
You MUST place your disc so that it flanks one or more of your
opponent's discs. Flanking means your new disc and an existing
disc of your color form a straight line (horizontal, vertical, or
diagonal) with one or more opponent discs in between.

All flanked opponent discs are flipped to your color.

A single move can flank in multiple directions simultaneously,
flipping all captured discs at once.

Example:
  Before:  ● ○ ○ _     You (●) place at the _
  After:   ● ● ● ●     Both ○ discs are flipped!

PASSING
-------
If you have no valid move (no placement that flanks any opponent
disc), you must pass. Your opponent then continues playing.

GAME END
--------
The game ends when:
  1. The board is completely full, OR
  2. Neither player has a valid move.

The player with the most discs on the board wins. If both players
have the same number, it is a draw.

STRATEGY TIPS
-------------
- Corners are extremely valuable - they can never be flipped.
- Edges are strong positions since they limit flanking directions.
- Avoid placing discs adjacent to empty corners early on, as this
  gives your opponent access to the corner.
- Having fewer discs early can be advantageous - it limits your
  opponent's moves while keeping yours flexible.
- The game often swings dramatically in the final moves.

COMMANDS
--------
  Type your move  - Place a disc (e.g., D3)
  'quit' or 'q'   - Quit the game
  'save' or 's'   - Save and suspend the game
  'help' or 'h'   - Show help
  'tutorial' / 't' - Show this tutorial
"""
