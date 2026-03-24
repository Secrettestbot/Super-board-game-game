"""Entropy (Hyle) - An asymmetric game of chaos and order on a grid."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


class EntropyGame(BaseGame):
    """Entropy: One player sows chaos, the other imposes order."""

    name = "Entropy"
    description = "Asymmetric game - Chaos places random pieces, Order arranges them into patterns"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (5x5, 7 colors)",
        "small": "Small (4x4, 5 colors)",
    }

    # Color symbols and display names
    ALL_COLORS = ['R', 'G', 'B', 'Y', 'P', 'O', 'W']
    COLOR_NAMES = {
        'R': 'Red', 'G': 'Green', 'B': 'Blue', 'Y': 'Yellow',
        'P': 'Purple', 'O': 'Orange', 'W': 'White',
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.size = 0
        self.num_colors = 0
        self.board = []
        self.bag = []
        self.drawn_piece = None
        self.phase = "chaos"  # "chaos" or "order"
        self.pieces_placed = 0
        self.scores = {1: 0, 2: 0}
        # Track which player is Chaos and which is Order for current round.
        # Player 1 starts as Chaos, Player 2 starts as Order.
        # After both phases complete, roles swap.
        self.chaos_player = 1
        self.order_player = 2

    def setup(self):
        """Initialize board and piece bag."""
        if self.variation == "small":
            self.size = 4
            self.num_colors = 5
        else:
            self.size = 5
            self.num_colors = 7

        self.board = [['.' for _ in range(self.size)] for _ in range(self.size)]

        # Create the bag: N of each color (N = board size)
        colors_used = self.ALL_COLORS[:self.num_colors]
        pieces_per_color = self.size
        self.bag = []
        for color in colors_used:
            self.bag.extend([color] * pieces_per_color)
        random.shuffle(self.bag)

        self.drawn_piece = None
        self.phase = "chaos"
        self.pieces_placed = 0
        self.scores = {1: 0, 2: 0}
        self.chaos_player = 1
        self.order_player = 2
        # Set current_player to whichever player acts first (chaos player)
        self.current_player = self.chaos_player

    def switch_player(self):
        """Override base switch_player to handle two-phase turns.

        The base play() loop calls this after each successful move.
        - After a chaos move, phase switches to order, and current_player
          becomes the order player.
        - After an order move (or pass), phase switches to chaos with
          swapped roles, and current_player becomes the new chaos player.
        """
        if self.phase == "order":
            # Chaos move just happened, now it is order's turn
            self.current_player = self.order_player
        else:
            # Order move just happened (_end_turn already swapped roles
            # and set phase to chaos), so current_player = new chaos player
            self.current_player = self.chaos_player

    def display(self):
        """Display the board, current phase, and game info."""
        total_squares = self.size * self.size

        print(f"\n  === Entropy ({self.variations[self.variation]}) ===")
        print(f"  {self.players[0]} score: {self.scores[1]}")
        print(f"  {self.players[1]} score: {self.scores[2]}")
        print(f"  Pieces placed: {self.pieces_placed}/{total_squares}  |  Bag: {len(self.bag)} remaining")
        print()

        if not self.game_over:
            if self.phase == "chaos":
                chaos_name = self.players[self.chaos_player - 1]
                print(f"  CHAOS phase - {chaos_name} places the drawn piece")
                if self.drawn_piece:
                    print(f"  Drawn piece: [{self.drawn_piece}] ({self.COLOR_NAMES.get(self.drawn_piece, self.drawn_piece)})")
            else:
                order_name = self.players[self.order_player - 1]
                print(f"  ORDER phase - {order_name} may slide a piece (or pass)")
            print()

        # Column headers
        col_labels = "    " + "  ".join(str(c + 1) for c in range(self.size))
        print(col_labels)
        print("  +" + "---" * self.size + "+")

        for r in range(self.size):
            row_str = f"{r + 1:2}|"
            for c in range(self.size):
                cell = self.board[r][c]
                row_str += f" {cell} "
            row_str += f"|{r + 1}"
            print(row_str)

        print("  +" + "---" * self.size + "+")
        print(col_labels)
        print()

        # Show color legend
        colors_used = self.ALL_COLORS[:self.num_colors]
        legend = "  Colors: " + ", ".join(
            f"{c}={self.COLOR_NAMES[c]}" for c in colors_used
        )
        print(legend)
        print()

    def get_move(self):
        """Get move based on current phase."""
        if self.phase == "chaos":
            return self._get_chaos_move()
        else:
            return self._get_order_move()

    def _get_chaos_move(self):
        """Chaos player places the drawn piece at an empty position."""
        chaos_name = self.players[self.chaos_player - 1]

        # Draw a piece if not already drawn
        if self.drawn_piece is None:
            if self.bag:
                self.drawn_piece = self.bag.pop()
            else:
                return None

        while True:
            raw = input_with_quit(
                f"  {chaos_name} (Chaos), place [{self.drawn_piece}] at row,col (e.g. 2,3): "
            ).strip()

            parts = raw.replace(' ', ',').split(',')
            parts = [p.strip() for p in parts if p.strip()]

            if len(parts) != 2:
                print(f"  Enter row,col (1-{self.size}). Example: 2,3")
                continue

            try:
                row = int(parts[0]) - 1
                col = int(parts[1]) - 1
            except ValueError:
                print(f"  Invalid numbers. Enter row,col (1-{self.size}).")
                continue

            if not (0 <= row < self.size and 0 <= col < self.size):
                print(f"  Position out of bounds. Use 1-{self.size}.")
                continue

            if self.board[row][col] != '.':
                print("  That square is already occupied.")
                continue

            return ("chaos", row, col)

    def _get_order_move(self):
        """Order player slides a piece in a cardinal direction, or passes."""
        order_name = self.players[self.order_player - 1]

        while True:
            raw = input_with_quit(
                f"  {order_name} (Order), slide piece: row,col direction (e.g. 2,3 up) or 'pass': "
            ).strip()

            if raw.lower() == 'pass':
                return ("order_pass",)

            parts = raw.replace(',', ' ').split()
            if len(parts) < 3:
                print("  Enter: row,col direction (up/down/left/right) or 'pass'")
                continue

            try:
                row = int(parts[0]) - 1
                col = int(parts[1]) - 1
            except ValueError:
                print(f"  Invalid position. Use numbers 1-{self.size}.")
                continue

            direction = parts[2].lower()
            if direction not in ('up', 'down', 'left', 'right', 'u', 'd', 'l', 'r'):
                print("  Direction must be: up, down, left, or right (u/d/l/r).")
                continue

            # Normalize direction shorthand
            dir_map = {'u': 'up', 'd': 'down', 'l': 'left', 'r': 'right'}
            direction = dir_map.get(direction, direction)

            if not (0 <= row < self.size and 0 <= col < self.size):
                print(f"  Position out of bounds. Use 1-{self.size}.")
                continue

            if self.board[row][col] == '.':
                print("  No piece at that position.")
                continue

            return ("order", row, col, direction)

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move is None:
            return False

        if move[0] == "chaos":
            _, row, col = move
            if self.board[row][col] != '.':
                return False
            self.board[row][col] = self.drawn_piece
            self.drawn_piece = None
            self.pieces_placed += 1
            # After chaos places, switch to order phase
            self.phase = "order"
            return True

        elif move[0] == "order_pass":
            # Order passes, swap roles for next turn
            self._end_turn()
            return True

        elif move[0] == "order":
            _, row, col, direction = move
            if self.board[row][col] == '.':
                return False

            # Calculate direction vector
            dr, dc = {
                'up': (-1, 0), 'down': (1, 0),
                'left': (0, -1), 'right': (0, 1),
            }[direction]

            # Slide the piece as far as possible
            piece = self.board[row][col]
            nr, nc = row + dr, col + dc

            # Must be able to move at least one square
            if not (0 <= nr < self.size and 0 <= nc < self.size) or self.board[nr][nc] != '.':
                print("  Piece cannot slide in that direction.")
                return False

            # Slide until hitting edge or another piece
            final_r, final_c = row, col
            cr, cc = row + dr, col + dc
            while 0 <= cr < self.size and 0 <= cc < self.size and self.board[cr][cc] == '.':
                final_r, final_c = cr, cc
                cr += dr
                cc += dc

            # Move the piece
            self.board[row][col] = '.'
            self.board[final_r][final_c] = piece

            # After order moves, swap roles for next turn
            self._end_turn()
            return True

        return False

    def _end_turn(self):
        """End the current turn: swap chaos/order roles, set phase to chaos."""
        self.chaos_player, self.order_player = self.order_player, self.chaos_player
        self.phase = "chaos"

    def check_game_over(self):
        """Check if the board is full. If so, calculate scores."""
        total_squares = self.size * self.size
        if self.pieces_placed >= total_squares and self.phase == "chaos":
            # Board is full and we are back to chaos (no more pieces to draw)
            self.game_over = True
            self._calculate_scores()
            if self.scores[1] > self.scores[2]:
                self.winner = 1
            elif self.scores[2] > self.scores[1]:
                self.winner = 2
            else:
                self.winner = None  # Draw

    def _calculate_scores(self):
        """Calculate scores using asymmetric row/column scoring."""
        p1_score = 0
        p2_score = 0

        # Player 1 scores from rows (longest same-color run in each row)
        for r in range(self.size):
            row = [self.board[r][c] for c in range(self.size)]
            p1_score += self._longest_run(row)

        # Player 2 scores from columns (longest same-color run in each column)
        for c in range(self.size):
            col = [self.board[r][c] for r in range(self.size)]
            p2_score += self._longest_run(col)

        self.scores[1] = p1_score
        self.scores[2] = p2_score

    def _longest_run(self, line):
        """Find the longest consecutive run of the same color in a line."""
        if not line:
            return 0

        max_run = 0
        current_run = 1

        for i in range(1, len(line)):
            if line[i] == line[i - 1] and line[i] != '.':
                current_run += 1
            else:
                if current_run > 1:
                    max_run = max(max_run, current_run)
                current_run = 1

        if current_run > 1:
            max_run = max(max_run, current_run)

        return max_run

    def get_state(self):
        """Return serializable game state."""
        return {
            "size": self.size,
            "num_colors": self.num_colors,
            "board": [row[:] for row in self.board],
            "bag": self.bag[:],
            "drawn_piece": self.drawn_piece,
            "phase": self.phase,
            "pieces_placed": self.pieces_placed,
            "scores": {str(k): v for k, v in self.scores.items()},
            "chaos_player": self.chaos_player,
            "order_player": self.order_player,
        }

    def load_state(self, state):
        """Restore game state."""
        self.size = state["size"]
        self.num_colors = state["num_colors"]
        self.board = [row[:] for row in state["board"]]
        self.bag = state["bag"][:]
        self.drawn_piece = state["drawn_piece"]
        self.phase = state["phase"]
        self.pieces_placed = state["pieces_placed"]
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.chaos_player = state["chaos_player"]
        self.order_player = state["order_player"]

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==============================================================
               ENTROPY (HYLE) TUTORIAL
==============================================================

OVERVIEW
  Entropy is an asymmetric two-player game also known as Hyle.
  Players alternate between two roles each turn: Chaos and
  Order. Chaos tries to scatter pieces randomly while Order
  tries to arrange them into scoring patterns.

--------------------------------------------------------------
SETUP
--------------------------------------------------------------
  The game uses a 5x5 board (standard) or 4x4 board (small)
  and a bag of colored pieces (7 colors in standard, 5 in
  small). There are 5 pieces of each color (or 4 in small).

--------------------------------------------------------------
GAMEPLAY
--------------------------------------------------------------
  Each turn has two phases:

  1. CHAOS PHASE:
     A random piece is drawn from the bag. The Chaos player
     must place it on any empty square on the board. Chaos
     wants to prevent scoring patterns from forming.

  2. ORDER PHASE:
     The Order player may slide any single piece already on
     the board in a cardinal direction (up, down, left, right).
     The piece slides like a rook in chess - it moves in a
     straight line until it hits the edge or another piece.
     Order may also pass (do nothing).

  After both phases, the roles swap: the previous Chaos player
  becomes Order, and vice versa.

--------------------------------------------------------------
SCORING
--------------------------------------------------------------
  When all squares are filled, the game ends and the board is
  scored:

  - Player 1 scores from ROWS: the longest consecutive run
    of the same color in each row is counted.
  - Player 2 scores from COLUMNS: the longest consecutive run
    of the same color in each column is counted.
  - Runs of length 1 score 0. Runs of 2 score 2, of 3 score
    3, etc.
  - The player with the higher total score wins.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Chaos phase:
    Enter the position as row,col (e.g. "2,3" for row 2,
    column 3). Rows and columns are numbered from 1.

  Order phase:
    Enter: row,col direction (e.g. "2,3 up")
    Directions: up, down, left, right (or u, d, l, r)
    Or type "pass" to skip your Order turn.

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  Standard (5x5, 7 colors):
    Classic game with 7 colors (R,G,B,Y,P,O,W) and 25 squares.

  Small (4x4, 5 colors):
    Shorter game with 5 colors (R,G,B,Y,P) and 16 squares.

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  As Chaos:
  - Place pieces to break up potential runs.
  - Put different colors next to each other.
  - Anticipate where Order will try to slide pieces.

  As Order:
  - Slide pieces to create long runs of the same color.
  - Think ahead about which rows/columns you are scoring.
  - Sometimes it is better to pass than to make a bad slide.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
