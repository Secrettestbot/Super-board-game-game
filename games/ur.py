"""Royal Game of Ur - Ancient Mesopotamian race game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# The board paths for each player.
# The Royal Game of Ur has a distinctive shape:
#   Player 1 side:  squares 1-4   (top-left 4 squares)
#   Shared middle:  squares 5-12  (middle row of 8 squares)
#   Player 1 side:  squares 13-14 (top-right 2 squares)
#   Player 2 side:  squares 1-4   (bottom-left 4 squares)
#   Shared middle:  squares 5-12  (same middle row)
#   Player 2 side:  squares 13-14 (bottom-right 2 squares)
#
# Path for each player (14 squares total, indices 1-14):
#   1-4:   player's own starting lane (4 squares)
#   5-12:  shared combat zone (8 squares, middle row)
#   13-14: player's own finishing lane (2 squares)
#
# After square 14, the piece bears off.
#
# Rosette positions grant an extra turn and are safe from capture.
# Rosettes are at path positions: 4, 8, 14
# (Square 4 is in each player's private lane, square 8 is shared, square 14 is private)

PATH_LENGTH = 14

# Rosette positions on the path (1-indexed)
ROSETTES = {4, 8, 14}

# Board layout mapping: path position -> (row, col) for display
# Row 0 = Player 1's lane (top), Row 1 = shared middle, Row 2 = Player 2's lane (bottom)
# The classic Ur board shape:
#   Top row:    cols 0-3 (P1 start) and cols 6-7 (P1 end)
#   Middle row: cols 0-7 (shared)
#   Bottom row: cols 0-3 (P2 start) and cols 6-7 (P2 end)

# Path position -> (row, col) for Player 1
P1_PATH_COORDS = {
    1: (0, 3), 2: (0, 2), 3: (0, 1), 4: (0, 0),  # P1 start (right to left)
    5: (1, 0), 6: (1, 1), 7: (1, 2), 8: (1, 3),   # shared (left to right)
    9: (1, 4), 10: (1, 5), 11: (1, 6), 12: (1, 7), # shared continued
    13: (0, 7), 14: (0, 6),                          # P1 end
}

# Path position -> (row, col) for Player 2
P2_PATH_COORDS = {
    1: (2, 3), 2: (2, 2), 3: (2, 1), 4: (2, 0),  # P2 start (right to left)
    5: (1, 0), 6: (1, 1), 7: (1, 2), 8: (1, 3),   # shared (same middle)
    9: (1, 4), 10: (1, 5), 11: (1, 6), 12: (1, 7), # shared continued
    13: (2, 7), 14: (2, 6),                          # P2 end
}

PLAYER_SYMBOLS = {1: "X", 2: "O"}


class UrGame(BaseGame):
    """The Royal Game of Ur - ancient Mesopotamian race game."""

    name = "Royal Game of Ur"
    description = "Ancient Mesopotamian race game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Rules",
        "simple": "Simplified (5 pieces per player)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_pieces = 7 if self.variation != "simple" else 5
        # Each player's pieces: list of positions
        #   0        = off-board (waiting to enter)
        #   1-14     = on path
        #   15       = borne off (finished)
        self.pieces = {1: [], 2: []}
        self.last_roll = None
        self.last_event = ""
        self.extra_turn = False

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize all pieces off-board."""
        self.num_pieces = 7 if self.variation != "simple" else 5
        self.pieces = {
            1: [0] * self.num_pieces,
            2: [0] * self.num_pieces,
        }
        self.current_player = 1
        self.last_roll = None
        self.last_event = ""
        self.extra_turn = False

    # ---------------------------------------------------------------- display
    def display(self):
        """Display the Ur board as ASCII art."""
        p = self.current_player
        sym1 = PLAYER_SYMBOLS[1]
        sym2 = PLAYER_SYMBOLS[2]

        print(f"\n  {'Royal Game of Ur':^50}")
        print(f"  {self.players[0]} ({sym1}) vs {self.players[1]} ({sym2})")
        print(f"  Turn {self.turn_number + 1} - "
              f"{self.players[p - 1]}'s move ({PLAYER_SYMBOLS[p]})")
        print()

        if self.last_event:
            print(f"  {self.last_event}")
            print()

        # Count pieces in various states
        for pl in [1, 2]:
            sym = PLAYER_SYMBOLS[pl]
            waiting = sum(1 for pos in self.pieces[pl] if pos == 0)
            finished = sum(1 for pos in self.pieces[pl] if pos == 15)
            print(f"  {sym} Waiting: {waiting}  Borne off: {finished}/{self.num_pieces}")
        print()

        # Build the board grid (3 rows x 8 cols)
        # Each cell can contain: piece symbol, rosette marker, empty, or N/A
        grid = [[None for _ in range(8)] for _ in range(3)]

        # Mark which cells are valid board squares
        valid_cells = set()
        for pos, (r, c) in P1_PATH_COORDS.items():
            valid_cells.add((r, c))
        for pos, (r, c) in P2_PATH_COORDS.items():
            valid_cells.add((r, c))

        # Initialize valid cells as empty
        for r, c in valid_cells:
            grid[r][c] = "."

        # Mark rosettes
        for pos in ROSETTES:
            r1, c1 = P1_PATH_COORDS[pos]
            grid[r1][c1] = "*"
            if pos in P2_PATH_COORDS:
                r2, c2 = P2_PATH_COORDS[pos]
                grid[r2][c2] = "*"

        # Place pieces on the board
        for pl in [1, 2]:
            sym = PLAYER_SYMBOLS[pl]
            coords = P1_PATH_COORDS if pl == 1 else P2_PATH_COORDS
            for i, pos in enumerate(self.pieces[pl]):
                if 1 <= pos <= PATH_LENGTH:
                    r, c = coords[pos]
                    # If multiple pieces on same square, show the symbol
                    # (shouldn't normally happen except for same-player stacking
                    #  which isn't allowed, but handle gracefully)
                    grid[r][c] = sym

        # Draw the board
        # Path positions map to columns as follows:
        #   Top row:    col3=sq1, col2=sq2, col1=sq3, col0=sq4, gap, col6=sq14, col7=sq13
        #   Middle row: col0=sq5, col1=sq6, col2=sq7, col3=sq8, col4=sq9, col5=sq10, col6=sq11, col7=sq12
        #   Bottom row: same as top but for Player 2

        # Column headers showing path square numbers
        print("      sq4   sq3   sq2   sq1               sq14  sq13")
        print("     +-----+-----+-----+-----+           +-----+-----+")
        # Top row (Player 1's private squares: sq1-4 and sq13-14)
        line = f"  {sym1}  |"
        for c in range(4):
            cell = self._format_cell(grid[0][c])
            line += f"  {cell}  |"
        line += "           |"
        for c in range(6, 8):
            cell = self._format_cell(grid[0][c])
            line += f"  {cell}  |"
        print(line)
        print("     +-----+-----+-----+-----+-----+-----+-----+-----+")

        # Middle row (shared: sq5-12)
        line = "     |"
        for c in range(8):
            cell = self._format_cell(grid[1][c])
            line += f"  {cell}  |"
        print(line)
        print("     +-----+-----+-----+-----+-----+-----+-----+-----+")

        # Bottom row (Player 2's private squares)
        line = f"  {sym2}  |"
        for c in range(4):
            cell = self._format_cell(grid[2][c])
            line += f"  {cell}  |"
        line += "           |"
        for c in range(6, 8):
            cell = self._format_cell(grid[2][c])
            line += f"  {cell}  |"
        print(line)
        print("     +-----+-----+-----+-----+           +-----+-----+")
        print("      sq5   sq6   sq7   sq8   sq9  sq10  sq11  sq12")
        print()

        # Show piece positions
        for pl in [1, 2]:
            sym = PLAYER_SYMBOLS[pl]
            parts = []
            for i, pos in enumerate(self.pieces[pl]):
                if pos == 0:
                    parts.append(f"{sym}{i + 1}:wait")
                elif pos == 15:
                    parts.append(f"{sym}{i + 1}:OFF")
                else:
                    r_marker = "*" if pos in ROSETTES else ""
                    parts.append(f"{sym}{i + 1}:sq{pos}{r_marker}")
            print(f"  {', '.join(parts)}")
        print()

    def _format_cell(self, content):
        """Format a board cell for display."""
        if content is None:
            return " "
        return content

    # --------------------------------------------------------------- dice
    def _roll_dice(self):
        """Roll 4 binary dice (tetrahedral). Each die is 0 or 1.
        Total range: 0-4."""
        dice = [random.randint(0, 1) for _ in range(4)]
        return sum(dice)

    # --------------------------------------------------------------- move logic
    def _get_legal_moves(self, player, roll):
        """Return list of (piece_index, action_description) for legal moves.
        piece_index is the index in self.pieces[player].
        A special index of -1 means 'enter a new piece'."""
        if roll == 0:
            return []

        moves = []
        coords = P1_PATH_COORDS if player == 1 else P2_PATH_COORDS
        opponent = 3 - player
        opp_coords = P2_PATH_COORDS if player == 1 else P1_PATH_COORDS

        for i, pos in enumerate(self.pieces[player]):
            if pos == 15:
                # Already borne off
                continue

            new_pos = pos + roll

            if new_pos > PATH_LENGTH + 1:
                # Overshot - can't bear off
                continue

            if new_pos == PATH_LENGTH + 1:
                # Exact roll to bear off (pos 15)
                new_pos = 15

            if new_pos == 15:
                # Bearing off - always legal
                moves.append((i, "bear off"))
                continue

            # Check if destination is occupied by own piece
            if new_pos in self.pieces[player]:
                # Can't land on own piece
                # (Check if any of our OTHER pieces are there)
                own_occupied = False
                for j, other_pos in enumerate(self.pieces[player]):
                    if j != i and other_pos == new_pos:
                        own_occupied = True
                        break
                if own_occupied:
                    continue

            # Check if destination is a rosette occupied by opponent
            if 5 <= new_pos <= 12:
                # Shared squares - check opponent
                opp_on_square = any(opos == new_pos for opos in self.pieces[opponent])
                if opp_on_square and new_pos in ROSETTES:
                    # Can't capture on a rosette
                    continue

            # Check private squares (1-4, 13-14) - opponent can't be there
            # (They have their own private squares)

            # Move is legal
            if pos == 0:
                desc = f"enter to sq{new_pos}"
            else:
                desc = f"sq{pos} -> sq{new_pos}"
            moves.append((i, desc))

        return moves

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Roll dice and get player's chosen piece to move."""
        player = self.current_player
        sym = PLAYER_SYMBOLS[player]

        input_with_quit(f"  {self.players[player - 1]} ({sym}), press Enter to roll... ")
        roll = self._roll_dice()
        self.last_roll = roll
        print(f"\n  Rolled: {roll} (4 binary dice)")

        if roll == 0:
            print("  Rolled 0 - no move possible. Turn passes.")
            input("  Press Enter to continue...")
            return ("no_move", roll)

        legal = self._get_legal_moves(player, roll)

        if not legal:
            print("  No legal moves available. Turn passes.")
            input("  Press Enter to continue...")
            return ("no_move", roll)

        if len(legal) == 1:
            idx, desc = legal[0]
            print(f"  Only move: {sym}{idx + 1} ({desc})")
            input("  Press Enter to continue...")
            return ("move", roll, idx)

        # Multiple choices - let player pick
        print(f"\n  Legal moves:")
        for idx, desc in legal:
            pos = self.pieces[player][idx]
            if pos == 0:
                loc = "waiting"
            else:
                loc = f"sq{pos}"
            print(f"    {sym}{idx + 1} ({loc}): {desc}")

        while True:
            raw = input_with_quit(
                f"  Choose piece number (1-{self.num_pieces}): "
            ).strip()

            try:
                choice = int(raw) - 1
                # Check if this piece index is in the legal moves
                legal_indices = [idx for idx, _ in legal]
                if choice in legal_indices:
                    return ("move", roll, choice)
                print(f"  Piece {choice + 1} cannot move. "
                      f"Choose from: {', '.join(str(idx + 1) for idx in legal_indices)}")
            except ValueError:
                print("  Enter a piece number.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply the chosen move to the board."""
        if move is None:
            return False

        action = move[0]
        roll = move[1]
        player = self.current_player
        sym = PLAYER_SYMBOLS[player]
        opponent = 3 - player
        opp_sym = PLAYER_SYMBOLS[opponent]

        if action == "no_move":
            self.last_event = (f"{self.players[player - 1]} rolled {roll} "
                               f"- no move possible.")
            self.extra_turn = False
            return True

        piece_idx = move[2]
        old_pos = self.pieces[player][piece_idx]
        new_pos = old_pos + roll

        if new_pos >= PATH_LENGTH + 1:
            new_pos = 15  # bear off

        piece_name = f"{sym}{piece_idx + 1}"

        # Handle capture (only on shared squares 5-12)
        captured = ""
        if 5 <= new_pos <= 12:
            for j, opp_pos in enumerate(self.pieces[opponent]):
                if opp_pos == new_pos:
                    self.pieces[opponent][j] = 0
                    captured = f" Captured {opp_sym}{j + 1}!"
                    break

        # Move the piece
        self.pieces[player][piece_idx] = new_pos

        # Check for rosette (extra turn)
        if new_pos in ROSETTES:
            self.extra_turn = True
            rosette_msg = " Landed on rosette - extra turn!"
        elif new_pos == 15:
            self.extra_turn = False
            rosette_msg = ""
        else:
            self.extra_turn = False
            rosette_msg = ""

        # Build event message
        if old_pos == 0:
            self.last_event = (f"{self.players[player - 1]} rolled {roll}, "
                               f"{piece_name} entered at sq{new_pos}."
                               f"{captured}{rosette_msg}")
        elif new_pos == 15:
            self.last_event = (f"{self.players[player - 1]} rolled {roll}, "
                               f"{piece_name} borne off!"
                               f"{captured}{rosette_msg}")
        else:
            self.last_event = (f"{self.players[player - 1]} rolled {roll}, "
                               f"{piece_name} moved sq{old_pos} -> sq{new_pos}."
                               f"{captured}{rosette_msg}")

        return True

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        """Override to handle extra turns from rosettes."""
        if self.extra_turn:
            self.extra_turn = False
            return  # same player goes again
        self.current_player = 2 if self.current_player == 1 else 1

    # ----------------------------------------------------- check_game_over
    def check_game_over(self):
        """Game ends when a player has borne off all pieces."""
        for player in [1, 2]:
            if all(pos == 15 for pos in self.pieces[player]):
                self.game_over = True
                self.winner = player
                return

    # -------------------------------------------------------- state save/load
    def get_state(self):
        """Serialize game state for saving."""
        return {
            "pieces": {
                str(k): list(v) for k, v in self.pieces.items()
            },
            "num_pieces": self.num_pieces,
            "last_roll": self.last_roll,
            "last_event": self.last_event,
            "extra_turn": self.extra_turn,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.num_pieces = state.get("num_pieces", 7)
        self.last_roll = state.get("last_roll")
        self.last_event = state.get("last_event", "")
        self.extra_turn = state.get("extra_turn", False)
        self.pieces = {}
        for k, v in state["pieces"].items():
            self.pieces[int(k)] = list(v)

    # ------------------------------------------------------------ play override
    def play(self):
        """Custom play loop to handle extra turns from rosettes."""
        self.setup()
        while not self.game_over:
            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except Exception as e:
                from engine.base import QuitGame, SuspendGame, ShowHelp, ShowTutorial
                if isinstance(e, QuitGame):
                    print("\nGame ended.")
                    input("Press Enter to return to menu...")
                    return None
                elif isinstance(e, SuspendGame):
                    slot = self.save_game()
                    print(f"\nGame saved as '{slot}'")
                    input("Press Enter to return to menu...")
                    return 'suspended'
                elif isinstance(e, ShowHelp):
                    self.show_help()
                    continue
                elif isinstance(e, ShowTutorial):
                    clear_screen()
                    print(self.get_tutorial())
                    input("\nPress Enter to continue...")
                    continue
                raise

            if self.make_move(move):
                self.move_history.append(str(move))
                self.turn_number += 1
                self.check_game_over()
                if not self.game_over:
                    self.switch_player()
            else:
                if move is not None:
                    print("  Invalid move! Try again.")
                    input("  Press Enter to continue...")

        clear_screen()
        self.display()
        if self.winner:
            print(f"\n*** {self.players[self.winner - 1]} wins! "
                  f"All pieces borne off! ***")
        input("\nPress Enter to return to menu...")
        return self.winner

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return comprehensive Royal Game of Ur tutorial text."""
        return f"""
{'=' * 60}
  THE ROYAL GAME OF UR - Tutorial
{'=' * 60}

  OVERVIEW:
  The Royal Game of Ur is one of the oldest known board games,
  originating in ancient Mesopotamia around 2600 BCE. It is a
  race game for two players where each player tries to move all
  their pieces along a path and off the board before their
  opponent does.

  BOARD LAYOUT:
  The board has a distinctive shape with 20 squares arranged
  in three rows:

     +--+--+--+--+        +--+--+
  X  |  |  |  |* |        |  |* |   <- Player 1's private squares
     +--+--+--+--+--+--+--+--+--+
     |  |  |  |* |  |  |  |  |      <- Shared middle row (8 squares)
     +--+--+--+--+--+--+--+--+--+
  O  |  |  |  |* |        |  |* |   <- Player 2's private squares
     +--+--+--+--+        +--+--+

  Each player's path is 14 squares long:
    - Squares 1-4:  Private starting lane (top/bottom row)
    - Squares 5-12: Shared combat zone (middle row)
    - Squares 13-14: Private finishing lane (top/bottom row)

  THE PATH:
  Pieces enter at square 1 and travel the path in order.
  In the starting lane (1-4), pieces move right to left.
  In the middle row (5-12), pieces move left to right.
  In the finishing lane (13-14), pieces exit at the right.

  PIECES:
  Each player has {self.num_pieces} pieces. Player 1 uses 'X' and
  Player 2 uses 'O'.

  DICE:
  Four tetrahedral (binary) dice are rolled each turn. Each die
  shows either 0 or 1, giving a total of 0-4. The probability
  distribution is:
    0: 1/16 (6.25%)    3: 4/16 (25%)
    1: 4/16 (25%)      4: 1/16 (6.25%)
    2: 6/16 (37.5%)

  ROSETTE SQUARES (marked with *):
  Three squares on each player's path are rosettes (at positions
  4, 8, and 14):
    1. Landing on a rosette grants an EXTRA TURN.
    2. A piece on a rosette CANNOT be captured (it is safe).

  Rosette at position 4: In your private starting lane.
  Rosette at position 8: In the shared middle row (strategic!).
  Rosette at position 14: The last square before bearing off.

  CAPTURING:
  If your piece lands on a shared square (5-12) occupied by an
  opponent's piece, the opponent's piece is sent back to the
  start (off the board). The opponent must re-enter that piece
  on a future turn.

  You CANNOT capture a piece that is on a rosette square.
  You CANNOT land on a square occupied by your own piece.

  BEARING OFF:
  To remove a piece from the board, you must roll the EXACT
  number needed to move past square 14. For example, if your
  piece is on square 12, you need to roll exactly 3 to bear
  it off (12 + 3 = 15).

  NO LEGAL MOVE:
  If you roll 0, or if no piece can legally move the rolled
  amount, your turn is skipped.

  WINNING:
  The first player to bear off all {self.num_pieces} pieces wins!

  INPUT:
  - Press Enter to roll the dice.
  - Enter a piece number (1-{self.num_pieces}) to choose which piece
    to move.

  COMMANDS:
  'quit' / 'q'     - Quit game
  'save' / 's'     - Save and suspend game
  'help' / 'h'     - Show help
  'tutorial' / 't' - Show this tutorial
{'=' * 60}
"""
