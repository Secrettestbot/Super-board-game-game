"""Nine Men's Morris - Classic strategy game of forming mills."""

from engine.base import BaseGame, input_with_quit, clear_screen


# ---------------------------------------------------------------------------
# Board topologies: each returns (num_positions, adjacency_dict, mill_lines)
# ---------------------------------------------------------------------------

def _build_nine_board():
    """3 concentric squares with midpoint connections. 24 positions.

     0 ----------- 1 ----------- 2
     |             |             |
     |   3 ------- 4 ------- 5  |
     |   |         |         |  |
     |   |   6 --- 7 --- 8   |  |
     |   |   |           |   |  |
     9 --10--11          12--13--14
     |   |   |           |   |  |
     |   |  15 --16 --17     |  |
     |   |         |         |  |
     |  18 ------19 ------20    |
     |             |             |
    21 ----------22 ----------23
    """
    adjacency = {
        0: [1, 9],       1: [0, 2, 4],      2: [1, 14],
        3: [4, 10],      4: [1, 3, 5, 7],   5: [4, 13],
        6: [7, 11],      7: [4, 6, 8],      8: [7, 12],
        9: [0, 10, 21],  10: [3, 9, 11, 18], 11: [6, 10, 15],
        12: [8, 13, 17], 13: [5, 12, 14, 20], 14: [2, 13, 23],
        15: [11, 16],    16: [15, 17, 19],  17: [12, 16],
        18: [10, 19],    19: [16, 18, 20, 22], 20: [13, 19],
        21: [9, 22],     22: [19, 21, 23],  23: [14, 22],
    }
    mills = [
        # Outer square
        (0, 1, 2), (2, 14, 23), (21, 22, 23), (0, 9, 21),
        # Middle square
        (3, 4, 5), (5, 13, 20), (18, 19, 20), (3, 10, 18),
        # Inner square
        (6, 7, 8), (8, 12, 17), (15, 16, 17), (6, 11, 15),
        # Cross lines (midpoint connections)
        (1, 4, 7), (9, 10, 11), (12, 13, 14), (16, 19, 22),
    ]
    return 24, adjacency, mills


def _build_six_board():
    """2 concentric squares with midpoint connections. 16 positions.

     0 -------- 1 -------- 2
     |          |          |
     |   3 --- 4 --- 5    |
     |   |            |   |
     6 - 7            8 - 9
     |   |            |   |
     |  10 --11 --12      |
     |          |          |
    13 -------14 -------15
    """
    adjacency = {
        0: [1, 6],      1: [0, 2, 4],     2: [1, 9],
        3: [4, 7],      4: [1, 3, 5],     5: [4, 8],
        6: [0, 7, 13],  7: [3, 6, 10],    8: [5, 9, 12],
        9: [2, 8, 15],  10: [7, 11],      11: [10, 12, 14],
        12: [8, 11],    13: [6, 14],      14: [11, 13, 15],
        15: [9, 14],
    }
    mills = [
        # Outer square sides
        (0, 1, 2), (2, 9, 15), (13, 14, 15), (0, 6, 13),
        # Inner square sides
        (3, 4, 5), (5, 8, 12), (10, 11, 12), (3, 7, 10),
    ]
    return 16, adjacency, mills


def _build_three_board():
    """Single square with diagonals. 9 positions.

     0 --- 1 --- 2
     | \\   |   / |
     |  \\  |  /  |
     3 --- 4 --- 5
     |  /  |  \\  |
     | /   |   \\ |
     6 --- 7 --- 8
    """
    adjacency = {
        0: [1, 3, 4],    1: [0, 2, 4],
        2: [1, 4, 5],    3: [0, 4, 6],
        4: [0, 1, 2, 3, 5, 6, 7, 8],
        5: [2, 4, 8],    6: [3, 4, 7],
        7: [4, 6, 8],    8: [4, 5, 7],
    }
    mills = [
        (0, 1, 2), (3, 4, 5), (6, 7, 8),  # rows
        (0, 3, 6), (1, 4, 7), (2, 5, 8),  # columns
        (0, 4, 8), (2, 4, 6),              # diagonals
    ]
    return 9, adjacency, mills


def _build_twelve_board():
    """3 concentric squares with diagonal connections at corners. 24 positions.
    Same numbering as nine men's but corners of adjacent squares are connected.
    """
    adjacency = {
        0: [1, 3, 9],    1: [0, 2, 4],      2: [1, 5, 14],
        3: [0, 4, 6, 10], 4: [1, 3, 5, 7],  5: [2, 4, 8, 13],
        6: [3, 7, 11],   7: [4, 6, 8],      8: [5, 7, 12],
        9: [0, 10, 21],  10: [3, 9, 11, 18], 11: [6, 10, 15],
        12: [8, 13, 17], 13: [5, 12, 14, 20], 14: [2, 13, 23],
        15: [11, 16, 18], 16: [15, 17, 19],  17: [12, 16, 20],
        18: [10, 15, 19, 21], 19: [16, 18, 20, 22], 20: [13, 17, 19, 23],
        21: [9, 18, 22], 22: [19, 21, 23],   23: [14, 20, 22],
    }
    mills = [
        # Outer square
        (0, 1, 2), (2, 14, 23), (21, 22, 23), (0, 9, 21),
        # Middle square
        (3, 4, 5), (5, 13, 20), (18, 19, 20), (3, 10, 18),
        # Inner square
        (6, 7, 8), (8, 12, 17), (15, 16, 17), (6, 11, 15),
        # Cross lines (midpoint connections)
        (1, 4, 7), (9, 10, 11), (12, 13, 14), (16, 19, 22),
        # Diagonal lines (corner connections)
        (0, 3, 6), (2, 5, 8), (15, 18, 21), (17, 20, 23),
    ]
    return 24, adjacency, mills


BOARD_BUILDERS = {
    "nine": _build_nine_board,
    "six": _build_six_board,
    "three": _build_three_board,
    "twelve": _build_twelve_board,
}


class MorrisGame(BaseGame):
    """Nine Men's Morris and variations: six, three, twelve."""

    name = "Morris"
    description = "Classic mill-forming strategy game with multiple board sizes"
    min_players = 2
    max_players = 2
    variations = {
        "nine": "Nine Men's Morris - 9 pieces, 3 concentric squares",
        "six": "Six Men's Morris - 6 pieces, 2 concentric squares",
        "three": "Three Men's Morris - 3 pieces, 1 square with diagonals",
        "twelve": "Twelve Men's Morris - 12 pieces, 3 squares with diagonals",
    }

    PIECES_COUNT = {"nine": 9, "six": 6, "three": 3, "twelve": 12}
    SYMBOLS = {0: ".", 1: "W", 2: "B"}

    def __init__(self, variation=None):
        super().__init__(variation or "nine")
        self.board = []
        self.num_positions = 0
        self.adjacency = {}
        self.mills = []
        self.pieces_to_place = [0, 0]
        self.pieces_on_board = [0, 0]
        self.must_remove = False
        self.pieces_per_player = 9

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize board topology and pieces."""
        builder = BOARD_BUILDERS[self.variation]
        self.num_positions, self.adjacency, self.mills = builder()
        self.board = [0] * self.num_positions
        self.pieces_per_player = self.PIECES_COUNT[self.variation]
        self.pieces_to_place = [self.pieces_per_player, self.pieces_per_player]
        self.pieces_on_board = [0, 0]
        self.must_remove = False

    # ------------------------------------------------------------- display
    def display(self):
        """Display the Morris board with text art."""
        var_labels = {
            "nine": "Nine", "six": "Six",
            "three": "Three", "twelve": "Twelve",
        }
        label = var_labels.get(self.variation, self.variation.title())
        print(f"\n  === {label} Men's Morris ===")
        print(f"  {self.players[0]} (W) vs {self.players[1]} (B)")
        cur = self.players[self.current_player - 1]
        sym = self.SYMBOLS[self.current_player]
        phase = self._phase_label(self.current_player)
        print(f"  Current turn: {cur} ({sym})  |  Phase: {phase}")
        if self.must_remove:
            print(f"  >>> MILL FORMED! Remove an opponent's piece. <<<")
        print()
        print(f"  Unplaced: W={self.pieces_to_place[0]}  B={self.pieces_to_place[1]}"
              f"   |   On board: W={self.pieces_on_board[0]}  B={self.pieces_on_board[1]}")
        print()

        if self.variation in ("nine", "twelve"):
            self._display_large()
        elif self.variation == "six":
            self._display_six()
        elif self.variation == "three":
            self._display_three()
        print()

    # -- helpers for display symbols --
    def _c(self, pos):
        """Character for a position: number if empty, W/B if occupied."""
        v = self.board[pos]
        if v == 0:
            if pos < 10:
                return f" {pos}"
            return str(pos)
        return f" {self.SYMBOLS[v]}"

    def _display_large(self):
        """24-position board for nine and twelve men's."""
        c = self._c
        # Show diagonal hints for twelve
        dl = "\\" if self.variation == "twelve" else " "
        dr = "/" if self.variation == "twelve" else " "
        print(f"  {c(0)}-----------{c(1)}-----------{c(2)}")
        print(f"   | {dl}           |           {dr} |")
        print(f"   |  {c(3)}--------{c(4)}--------{c(5)}  |")
        print(f"   |   | {dl}       |       {dr} |   |")
        print(f"   |   |  {c(6)}----{c(7)}----{c(8)}  |   |")
        print(f"   |   |   |           |   |   |")
        print(f"  {c(9)}--{c(10)}--{c(11)}          {c(12)}--{c(13)}--{c(14)}")
        print(f"   |   |   |           |   |   |")
        print(f"   |   |  {c(15)}---{c(16)}---{c(17)}  |   |")
        print(f"   |   | {dr}       |       {dl} |   |")
        print(f"   |  {c(18)}-------{c(19)}-------{c(20)}  |")
        print(f"   | {dr}           |           {dl} |")
        print(f"  {c(21)}-----------{c(22)}-----------{c(23)}")

    def _display_six(self):
        """16-position board for six men's."""
        c = self._c
        print(f"  {c(0)}--------{c(1)}--------{c(2)}")
        print(f"   |         |         |")
        print(f"   |  {c(3)}----{c(4)}----{c(5)}  |")
        print(f"   |   |           |   |")
        print(f"  {c(6)}--{c(7)}            {c(8)}--{c(9)}")
        print(f"   |   |           |   |")
        print(f"   |  {c(10)}---{c(11)}---{c(12)}  |")
        print(f"   |         |         |")
        print(f"  {c(13)}-------{c(14)}-------{c(15)}")

    def _display_three(self):
        """9-position board for three men's."""
        c = self._c
        print(f"  {c(0)}----{c(1)}----{c(2)}")
        print(f"   | \\   |   / |")
        print(f"   |  \\  |  /  |")
        print(f"  {c(3)}----{c(4)}----{c(5)}")
        print(f"   |  /  |  \\  |")
        print(f"   | /   |   \\ |")
        print(f"  {c(6)}----{c(7)}----{c(8)}")

    def _phase_label(self, player):
        """Descriptive label for the current phase."""
        idx = player - 1
        if self.must_remove:
            return "Remove opponent piece"
        if self.pieces_to_place[idx] > 0:
            return "Placing"
        if self._can_fly(player):
            return "Flying"
        return "Moving"

    def _can_fly(self, player):
        """Check if player can fly (nine/twelve, exactly 3 pieces, none to place)."""
        if self.variation not in ("nine", "twelve"):
            return False
        idx = player - 1
        return self.pieces_to_place[idx] == 0 and self.pieces_on_board[idx] == 3

    # ------------------------------------------------------------- get_move
    def get_move(self):
        """Prompt for move based on current phase."""
        if self.must_remove:
            return self._get_remove_input()
        idx = self.current_player - 1
        if self.pieces_to_place[idx] > 0:
            return self._get_place_input()
        return self._get_move_input()

    def _get_place_input(self):
        """Prompt to place a piece."""
        name = self.players[self.current_player - 1]
        hi = self.num_positions - 1
        while True:
            raw = input_with_quit(f"  {name}, place piece at position (0-{hi}): ")
            try:
                pos = int(raw.strip())
                if 0 <= pos <= hi:
                    if self.board[pos] == 0:
                        return ("place", pos)
                    print("  That position is occupied!")
                else:
                    print(f"  Enter 0-{hi}.")
            except ValueError:
                print(f"  Invalid. Enter a number 0-{hi}.")

    def _get_move_input(self):
        """Prompt to move (or fly) a piece."""
        player = self.current_player
        name = self.players[player - 1]
        flying = self._can_fly(player)
        verb = "fly" if flying else "move"
        hi = self.num_positions - 1
        while True:
            raw = input_with_quit(f"  {name}, {verb} piece (from,to): ")
            raw = raw.strip()
            try:
                if "," in raw:
                    parts = raw.split(",")
                elif " " in raw:
                    parts = raw.split()
                else:
                    print("  Enter from,to (e.g. 3,7 or 3 7).")
                    continue
                frm = int(parts[0].strip())
                to = int(parts[1].strip())
                if not (0 <= frm <= hi and 0 <= to <= hi):
                    print(f"  Positions must be 0-{hi}.")
                    continue
                if self.board[frm] != player:
                    print("  You don't have a piece there!")
                    continue
                if self.board[to] != 0:
                    print("  Destination is occupied!")
                    continue
                if not flying and to not in self.adjacency[frm]:
                    print("  Not adjacent! (You are not in flying phase.)")
                    continue
                return ("move", frm, to)
            except (ValueError, IndexError):
                print("  Invalid. Enter from,to (e.g. 3,7).")

    def _get_remove_input(self):
        """Prompt to remove an opponent piece."""
        player = self.current_player
        opponent = 2 if player == 1 else 1
        name = self.players[player - 1]
        hi = self.num_positions - 1
        while True:
            raw = input_with_quit(f"  {name}, remove opponent piece at position (0-{hi}): ")
            try:
                pos = int(raw.strip())
                if not (0 <= pos <= hi):
                    print(f"  Enter 0-{hi}.")
                    continue
                if self.board[pos] != opponent:
                    print("  No opponent piece there!")
                    continue
                if self._in_mill(pos, opponent) and not self._all_in_mills(opponent):
                    print("  That piece is in a mill! Pick one that isn't.")
                    continue
                return ("remove", pos)
            except ValueError:
                print(f"  Invalid. Enter a number 0-{hi}.")

    # ----------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply a move tuple. Returns True if valid."""
        action = move[0]
        if action == "place":
            return self._do_place(move[1])
        elif action == "move":
            return self._do_move(move[1], move[2])
        elif action == "remove":
            return self._do_remove(move[1])
        return False

    def _do_place(self, pos):
        player = self.current_player
        idx = player - 1
        if pos < 0 or pos >= self.num_positions:
            return False
        if self.board[pos] != 0:
            return False
        if self.pieces_to_place[idx] <= 0:
            return False

        self.board[pos] = player
        self.pieces_to_place[idx] -= 1
        self.pieces_on_board[idx] += 1

        if self._in_mill(pos, player):
            self.must_remove = True
        return True

    def _do_move(self, frm, to):
        player = self.current_player
        if self.board[frm] != player or self.board[to] != 0:
            return False
        if not self._can_fly(player) and to not in self.adjacency[frm]:
            return False

        self.board[frm] = 0
        self.board[to] = player

        if self._in_mill(to, player):
            self.must_remove = True
        return True

    def _do_remove(self, pos):
        player = self.current_player
        opponent = 2 if player == 1 else 1
        opp_idx = opponent - 1
        if self.board[pos] != opponent:
            return False
        if self._in_mill(pos, opponent) and not self._all_in_mills(opponent):
            return False

        self.board[pos] = 0
        self.pieces_on_board[opp_idx] -= 1
        self.must_remove = False
        return True

    # -------------------------------------------------------- mill helpers
    def _in_mill(self, pos, player):
        """True if pos is part of a completed mill for player."""
        for mill in self.mills:
            if pos in mill and all(self.board[p] == player for p in mill):
                return True
        return False

    def _all_in_mills(self, player):
        """True if every piece of player is part of at least one mill."""
        for pos in range(self.num_positions):
            if self.board[pos] == player and not self._in_mill(pos, player):
                return False
        return True

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        """Don't switch during removal phase."""
        if self.must_remove:
            return
        super().switch_player()

    # ---------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check losing conditions after a move."""
        if self.must_remove:
            return  # mid-removal, not over yet

        # Only check once both players have finished placing
        both_placed = self.pieces_to_place[0] == 0 and self.pieces_to_place[1] == 0
        if not both_placed:
            return

        for player in (1, 2):
            idx = player - 1
            opponent = 2 if player == 1 else 1
            # Lose condition: fewer than 3 pieces on board
            if self.pieces_on_board[idx] < 3:
                self.game_over = True
                self.winner = opponent
                return

        # The player who just moved is self.current_player.
        # BaseGame calls check_game_over before switch_player,
        # so the NEXT player to move is the opponent.
        next_player = 2 if self.current_player == 1 else 1
        if not self._has_valid_move(next_player):
            self.game_over = True
            self.winner = self.current_player

    def _has_valid_move(self, player):
        """True if player can make at least one move."""
        idx = player - 1
        if self.pieces_to_place[idx] > 0:
            return any(self.board[p] == 0 for p in range(self.num_positions))

        flying = self._can_fly(player)
        has_empty = None  # lazy eval
        for pos in range(self.num_positions):
            if self.board[pos] != player:
                continue
            if flying:
                if has_empty is None:
                    has_empty = any(self.board[p] == 0 for p in range(self.num_positions))
                return has_empty
            for adj in self.adjacency[pos]:
                if self.board[adj] == 0:
                    return True
        return False

    # --------------------------------------------------------- get_state
    def get_state(self):
        """Return serializable game state."""
        return {
            "board": list(self.board),
            "pieces_to_place": list(self.pieces_to_place),
            "pieces_on_board": list(self.pieces_on_board),
            "must_remove": self.must_remove,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        builder = BOARD_BUILDERS[self.variation]
        self.num_positions, self.adjacency, self.mills = builder()
        self.pieces_per_player = self.PIECES_COUNT[self.variation]
        self.board = list(state["board"])
        self.pieces_to_place = list(state["pieces_to_place"])
        self.pieces_on_board = list(state["pieces_on_board"])
        self.must_remove = state.get("must_remove", False)

    # --------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return comprehensive tutorial text."""
        return """
==============================================================
                  MORRIS (MILL GAME)  TUTORIAL
==============================================================

OVERVIEW
  Morris is a classic two-player strategy game dating back
  thousands of years. Players place and move pieces on a board,
  trying to form "mills" (three pieces in a row along a line).
  Forming a mill allows you to remove one of your opponent's
  pieces from the board.

  Pieces: Player 1 = W (White), Player 2 = B (Black)
  Empty positions show their position number on the board.

--------------------------------------------------------------
GAME PHASES
--------------------------------------------------------------
  1. PLACING PHASE
     Players alternate placing one piece at a time on any
     empty position. This continues until all pieces have
     been placed on the board.

  2. MOVING PHASE
     After all pieces are placed, players alternate moving
     one of their pieces to an adjacent empty position
     along a connecting line on the board.

  3. FLYING PHASE (Nine & Twelve Men's only)
     When a player is reduced to exactly 3 pieces (and has
     no more to place), that player may "fly": move a piece
     to ANY empty position, not just adjacent ones. This
     gives the weaker player a fighting chance.

--------------------------------------------------------------
MILLS
--------------------------------------------------------------
  A mill is three of your pieces in a row along one of the
  marked lines on the board.

  When you complete a mill (by placing or moving a piece),
  you MUST remove one of your opponent's pieces.

  Removal rules:
  - You CANNOT remove a piece that is currently part of a
    completed mill, UNLESS every one of your opponent's
    pieces is in a mill (then any piece may be taken).
  - Removed pieces are permanently out of the game.
  - You may break and re-form the same mill to capture
    again on later turns.

--------------------------------------------------------------
WINNING AND LOSING
--------------------------------------------------------------
  A player loses when (after the placing phase):
  - They are reduced to fewer than 3 pieces, OR
  - They have no legal move on their turn (all pieces
    are blocked).

--------------------------------------------------------------
VARIATION: Nine Men's Morris  (Default)
--------------------------------------------------------------
  Pieces : 9 per player
  Board  : 3 concentric squares connected at midpoints
           (24 positions, 16 possible mills)
  Flying : Yes, when reduced to 3 pieces

  Board layout:
   0 ----------- 1 ----------- 2
   |             |             |
   |   3 ------- 4 ------- 5  |
   |   |         |         |  |
   |   |   6 --- 7 --- 8   |  |
   |   |   |           |   |  |
   9 --10--11          12--13--14
   |   |   |           |   |  |
   |   |  15 --16 --17     |  |
   |   |         |         |  |
   |  18 ------19 ------20    |
   |             |             |
  21 ----------22 ----------23

--------------------------------------------------------------
VARIATION: Six Men's Morris
--------------------------------------------------------------
  Pieces : 6 per player
  Board  : 2 concentric squares connected at midpoints
           (16 positions, 8 possible mills)
  Flying : No
  Note   : Faster game, fewer pieces, purely tactical.

--------------------------------------------------------------
VARIATION: Three Men's Morris
--------------------------------------------------------------
  Pieces : 3 per player
  Board  : A single 3x3 grid with diagonal connections
           (9 positions, 8 possible mills)
  Flying : No
  Note   : Like an enhanced Tic-Tac-Toe. After placing all
           3 pieces each, players slide pieces along lines.
           Very quick game with deep opening strategy.

  Board layout:
   0 --- 1 --- 2
   | \\   |   / |
   3 --- 4 --- 5
   | /   |   \\ |
   6 --- 7 --- 8

--------------------------------------------------------------
VARIATION: Twelve Men's Morris
--------------------------------------------------------------
  Pieces : 12 per player
  Board  : Same 24 positions as Nine Men's, but with added
           diagonal connections at the corners of adjacent
           squares (20 possible mills).
  Flying : Yes, when reduced to 3 pieces
  Note   : More pieces + more connections = more mills and
           a richer, longer game.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Placing phase:
    Enter a position number shown on the board.
    Example: "7" places your piece at position 7.

  Moving / Flying phase:
    Enter from,to separated by a comma or space.
    Example: "3,7" or "3 7" moves from position 3 to 7.

  Removal phase (after forming a mill):
    Enter the position number of the opponent piece to remove.
    Example: "12" removes the opponent piece at position 12.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial

--------------------------------------------------------------
STRATEGY TIPS
--------------------------------------------------------------
  - Double mills: arrange two mills sharing a common piece.
    Slide the shared piece out and back each turn to remove
    an opponent piece every move.
  - Control intersections (positions with many connections)
    for maximum mobility.
  - During the placing phase, plan ahead for the moving phase.
    A good placement creates future mill opportunities.
  - Block your opponent's mills whenever possible.
  - In Nine/Twelve Men's, reaching 3 pieces triggers flying,
    which can be surprisingly powerful if the opponent has
    many immovable pieces.
  - In Three Men's Morris, controlling the center (position 4)
    is critical as it connects to every other position.
==============================================================
"""
