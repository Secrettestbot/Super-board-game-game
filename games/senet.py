"""Senet - Ancient Egyptian board game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Board size
BOARD_SIZE = 30
PIECES_PER_PLAYER = 5

# Special square indices (0-based internally, displayed 1-based)
HOUSE_OF_HAPPINESS = 14   # square 15 - must stop here
HOUSE_OF_BEAUTY = 25      # square 26
HOUSE_OF_WATER = 26       # square 27 - sends piece back
HOUSE_OF_THREE_TRUTHS = 27  # square 28 - need exact roll of 3
HOUSE_OF_RE_ATOUM = 28    # square 29 - need exact roll of 2

SPECIAL_SQUARES = {
    HOUSE_OF_HAPPINESS,
    HOUSE_OF_BEAUTY,
    HOUSE_OF_WATER,
    HOUSE_OF_THREE_TRUTHS,
    HOUSE_OF_RE_ATOUM,
}

# Display markers for special squares
SPECIAL_MARKERS = {
    HOUSE_OF_HAPPINESS: "\u2665",      # ♥
    HOUSE_OF_BEAUTY: "\u2666",         # ♦
    HOUSE_OF_WATER: "\u2248",          # ≈
    HOUSE_OF_THREE_TRUTHS: "\u2462",   # ③
    HOUSE_OF_RE_ATOUM: "\u2461",       # ②
}

# Player piece symbols
PLAYER_SYMBOLS = {1: "\u25cf", 2: "\u25cb"}  # ● and ○


def _square_to_display(sq):
    """Convert 0-based internal square index to 1-based display number."""
    return sq + 1


def _display_to_square(display_num):
    """Convert 1-based display number to 0-based internal index."""
    return display_num - 1


def _square_to_row_col(sq):
    """Convert 0-based square index to (row, col) on the 3x10 board.

    Row 0: squares 0-9   (left to right)
    Row 1: squares 10-19 (right to left, displayed as 20..11)
    Row 2: squares 20-29 (left to right)
    """
    if sq < 10:
        return (0, sq)
    elif sq < 20:
        return (1, 9 - (sq - 10))
    else:
        return (2, sq - 20)


class SenetGame(BaseGame):
    """Senet - Ancient Egyptian board game."""

    name = "Senet"
    description = "Ancient Egyptian board game of fate and strategy"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Senet (Kendall rules)",
        "simple": "Simplified (no special squares)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Board: list of 30 squares, each is 0 (empty), 1 (player 1), or 2 (player 2)
        self.board = [0] * BOARD_SIZE
        # Count of borne-off pieces per player
        self.borne_off = {1: 0, 2: 0}
        # Current throw result
        self.last_throw = None
        # Last event message
        self.last_event = ""
        # Track whether current player must pass
        self.must_pass = False
        # Random state for serialization
        self.rng_state = None

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize the board with alternating pieces on the first 10 squares."""
        self.board = [0] * BOARD_SIZE
        self.borne_off = {1: 0, 2: 0}
        self.last_throw = None
        self.last_event = ""
        self.must_pass = False

        # Traditional starting arrangement: alternating pieces on squares 1-10
        for i in range(PIECES_PER_PLAYER * 2):
            if i < 10:
                # Alternate: P1 on even indices (0,2,4,6,8), P2 on odd (1,3,5,7,9)
                self.board[i] = 1 if i % 2 == 0 else 2

        self.current_player = 1

    # ---------------------------------------------------------------- sticks
    def _throw_sticks(self):
        """Throw 4 casting sticks to determine movement.

        Each stick has a painted side (0) and unpainted side (1).
        Count painted sides up:
          0 painted sides up = 5 moves
          1 painted side up  = 1 move
          2 painted sides up = 2 moves
          3 painted sides up = 3 moves
          4 painted sides up = 4 moves
        """
        sticks = [random.randint(0, 1) for _ in range(4)]
        painted_up = sum(1 for s in sticks if s == 0)
        if painted_up == 0:
            return 5
        return painted_up

    # --------------------------------------------------------- board queries
    def _get_player_positions(self, player):
        """Return sorted list of board indices where player has pieces."""
        return [i for i in range(BOARD_SIZE) if self.board[i] == player]

    def _pieces_on_board(self, player):
        """Count pieces on the board for a player."""
        return sum(1 for sq in self.board if sq == player)

    def _total_remaining(self, player):
        """Count pieces that have NOT been borne off."""
        return PIECES_PER_PLAYER - self.borne_off[player]

    def _is_protected(self, sq):
        """Check if a piece at square sq is protected.

        A piece is protected if an adjacent square has a piece of the same player.
        """
        if sq < 0 or sq >= BOARD_SIZE or self.board[sq] == 0:
            return False
        player = self.board[sq]
        # Check left neighbor
        if sq > 0 and self.board[sq - 1] == player:
            return True
        # Check right neighbor
        if sq < BOARD_SIZE - 1 and self.board[sq + 1] == player:
            return True
        return False

    def _can_bear_off(self, sq, throw):
        """Check if a piece at sq can bear off with the given throw.

        In standard mode, special squares at the end require exact rolls:
          - Square 28 (Three Truths): must roll exactly 3
          - Square 29 (Re-Atoum): must roll exactly 2
          - Other squares: piece must move past square 29 (index 29)
        """
        dest = sq + throw
        if self.variation == "simple":
            # In simple mode, just need to go past the end
            return dest >= BOARD_SIZE
        else:
            # Standard mode: special end squares
            if sq == HOUSE_OF_THREE_TRUTHS:
                return throw == 3
            elif sq == HOUSE_OF_RE_ATOUM:
                return throw == 2
            else:
                return dest >= BOARD_SIZE

    def _find_landing_for_water(self, player):
        """When a piece lands on House of Water, find where it goes.

        It goes to House of Beauty (square 26) if that square is empty.
        Otherwise, it goes to the first empty square searching backward from
        House of Beauty, or to square 0 if nothing is available.
        """
        if self.board[HOUSE_OF_BEAUTY] == 0:
            return HOUSE_OF_BEAUTY
        # Search backward from House of Beauty
        for i in range(HOUSE_OF_BEAUTY - 1, -1, -1):
            if self.board[i] == 0:
                return i
        # Fallback to start
        return 0

    def _get_legal_moves(self, player, throw):
        """Return list of square indices (0-based) from which the player can legally move.

        Returns positions of pieces that can make a valid move with the given throw.
        """
        positions = self._get_player_positions(player)
        opponent = 3 - player
        legal = []

        for sq in positions:
            # Check if piece must stop at House of Happiness
            if self.variation != "simple" and sq < HOUSE_OF_HAPPINESS:
                dest_check = sq + throw
                if dest_check > HOUSE_OF_HAPPINESS:
                    # Can't skip past House of Happiness
                    continue
                elif dest_check == HOUSE_OF_HAPPINESS:
                    # Must land exactly on House of Happiness
                    if self.board[HOUSE_OF_HAPPINESS] == 0:
                        legal.append(sq)
                    continue

            dest = sq + throw

            # Bear off check
            if dest >= BOARD_SIZE:
                if self._can_bear_off(sq, throw):
                    legal.append(sq)
                continue

            # Special squares restrictions (standard mode)
            if self.variation != "simple":
                # House of Three Truths: can only land with exact roll of 3
                if dest == HOUSE_OF_THREE_TRUTHS and throw != 3:
                    continue
                # House of Re-Atoum: can only land with exact roll of 2
                if dest == HOUSE_OF_RE_ATOUM and throw != 2:
                    continue

            # Check destination
            if self.board[dest] == player:
                # Can't land on own piece
                continue
            elif self.board[dest] == opponent:
                # Can land on opponent only if not protected
                if self._is_protected(dest):
                    continue
                # Special: can't swap onto House of Water in standard mode
                # (the piece would just drown) - allow it, swap handles it
                legal.append(sq)
            else:
                # Empty square
                legal.append(sq)

        return legal

    # ---------------------------------------------------------------- display
    def display(self):
        """Display the Senet board."""
        p = self.current_player
        sym1 = PLAYER_SYMBOLS[1]
        sym2 = PLAYER_SYMBOLS[2]

        print(f"\n  === Senet ===")
        print(f"  {self.players[0]} ({sym1}) vs {self.players[1]} ({sym2})")
        print(f"  Turn {self.turn_number + 1} - "
              f"{self.players[p - 1]}'s move ({PLAYER_SYMBOLS[p]})")

        if self.last_throw is not None:
            print(f"  Throw: {self.last_throw}")

        print(f"  Borne off - {sym1}: {self.borne_off[1]}  "
              f"{sym2}: {self.borne_off[2]}")
        print()

        if self.last_event:
            print(f"  {self.last_event}")
            print()

        # Row 0: squares 1-10, left to right
        self._display_row(0, range(0, 10), "\u2192")    # →

        # Row 1: squares 20-11, right to left (display order)
        self._display_row(1, range(19, 9, -1), "\u2190")  # ←

        # Row 2: squares 21-30, left to right
        self._display_row(2, range(20, 30), "\u2192")    # →

        print()

    def _display_row(self, row_num, squares, arrow):
        """Display one row of the board."""
        squares = list(squares)

        # Number labels (each cell is 4 chars wide: [XX])
        labels = ""
        for sq in squares:
            labels += f"{_square_to_display(sq):>4}"
        labels += f"   {arrow}"
        print(f" {labels}")

        # Cell contents
        cells = ""
        for sq in squares:
            content = self._cell_content(sq)
            cells += f"[{content}]"
        print(f"  {cells}")

    def _cell_content(self, sq):
        """Return the 2-character content for a board cell."""
        if self.board[sq] == 1:
            return f"{PLAYER_SYMBOLS[1]} "
        elif self.board[sq] == 2:
            return f"{PLAYER_SYMBOLS[2]} "
        elif self.variation != "simple" and sq in SPECIAL_MARKERS:
            return f"{SPECIAL_MARKERS[sq]} "
        else:
            return "  "

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Throw sticks and get player's chosen piece to move."""
        player = self.current_player
        sym = PLAYER_SYMBOLS[player]

        # Throw the sticks
        throw = self._throw_sticks()
        self.last_throw = throw

        # Redisplay with throw result
        clear_screen()
        self.display()

        print(f"  {self.players[player - 1]} ({sym}) threw: {throw}")

        # Find legal moves
        legal = self._get_legal_moves(player, throw)

        if not legal:
            print("  No legal moves available. Turn passes.")
            input_with_quit("  Press Enter to continue... ")
            return ("pass", throw)

        if len(legal) == 1:
            sq = legal[0]
            dest = sq + throw
            if dest >= BOARD_SIZE:
                desc = f"bear off from {_square_to_display(sq)}"
            else:
                desc = f"{_square_to_display(sq)} -> {_square_to_display(dest)}"
            print(f"  Only move: {desc}")
            input_with_quit("  Press Enter to continue... ")
            return ("move", throw, sq)

        # Multiple choices
        print(f"\n  Legal moves (enter piece position):")
        for sq in legal:
            dest = sq + throw
            if dest >= BOARD_SIZE:
                desc = f"bear off"
            else:
                dest_info = ""
                if self.variation != "simple" and dest in SPECIAL_MARKERS:
                    names = {
                        HOUSE_OF_HAPPINESS: "Happiness",
                        HOUSE_OF_BEAUTY: "Beauty",
                        HOUSE_OF_WATER: "Water",
                        HOUSE_OF_THREE_TRUTHS: "Three Truths",
                        HOUSE_OF_RE_ATOUM: "Re-Atoum",
                    }
                    dest_info = f" ({names.get(dest, '')})"
                if self.board[dest] == (3 - player):
                    dest_info += " [swap]"
                desc = f"-> {_square_to_display(dest)}{dest_info}"
            print(f"    {_square_to_display(sq):>2}: {desc}")

        while True:
            raw = input_with_quit(
                f"  Enter piece position (1-{BOARD_SIZE}), or 'pass': "
            ).strip().lower()

            if raw == "pass":
                if legal:
                    print("  You have legal moves available. You must move.")
                    continue
                return ("pass", throw)

            try:
                pos = int(raw)
                sq = _display_to_square(pos)
                if sq in legal:
                    return ("move", throw, sq)
                print(f"  Position {pos} is not a legal move. "
                      f"Choose from: {', '.join(str(_square_to_display(s)) for s in legal)}")
            except ValueError:
                print("  Enter a position number.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply the chosen move to the board."""
        if move is None:
            return False

        action = move[0]
        throw = move[1]
        player = self.current_player
        opponent = 3 - player
        sym = PLAYER_SYMBOLS[player]

        if action == "pass":
            self.last_event = (f"{self.players[player - 1]} threw {throw} "
                               f"- no legal moves. Turn passes.")
            return True

        sq = move[2]
        dest = sq + throw

        # Bear off
        if dest >= BOARD_SIZE:
            self.board[sq] = 0
            self.borne_off[player] += 1
            self.last_event = (f"{self.players[player - 1]} threw {throw}, "
                               f"bore off piece from {_square_to_display(sq)}!")
            return True

        # Handle landing on opponent piece (swap)
        if self.board[dest] == opponent:
            # Swap positions
            self.board[sq] = opponent
            self.board[dest] = player
            self.last_event = (f"{self.players[player - 1]} threw {throw}, "
                               f"moved {_square_to_display(sq)} -> {_square_to_display(dest)} "
                               f"(swapped with opponent!)")
        else:
            # Normal move to empty square
            self.board[sq] = 0
            self.board[dest] = player
            self.last_event = (f"{self.players[player - 1]} threw {throw}, "
                               f"moved {_square_to_display(sq)} -> {_square_to_display(dest)}.")

        # Handle House of Water (standard mode)
        if self.variation != "simple" and dest == HOUSE_OF_WATER:
            # Piece that lands here drowns and goes back
            landing = self._find_landing_for_water(player)
            self.board[dest] = 0
            self.board[landing] = player
            self.last_event += (f" Fell in the Water! "
                                f"Sent back to {_square_to_display(landing)}.")

        return True

    # ----------------------------------------------------- check_game_over
    def check_game_over(self):
        """Game ends when a player has borne off all 5 pieces."""
        for player in [1, 2]:
            if self.borne_off[player] >= PIECES_PER_PLAYER:
                self.game_over = True
                self.winner = player
                return

    # -------------------------------------------------------- state save/load
    def get_state(self):
        """Serialize game state for saving."""
        # Capture random state for reproducibility
        rng_state = random.getstate()
        return {
            "board": self.board[:],
            "borne_off": {str(k): v for k, v in self.borne_off.items()},
            "last_throw": self.last_throw,
            "last_event": self.last_event,
            "must_pass": self.must_pass,
            "rng_state": {
                "version": rng_state[0],
                "internalstate": list(rng_state[1][:-1]),
                "pos": rng_state[1][-1],
                "gauss_next": rng_state[2],
            },
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = state["board"][:]
        self.borne_off = {int(k): v for k, v in state["borne_off"].items()}
        self.last_throw = state.get("last_throw")
        self.last_event = state.get("last_event", "")
        self.must_pass = state.get("must_pass", False)

        # Restore random state
        if "rng_state" in state:
            rs = state["rng_state"]
            internal = tuple(rs["internalstate"]) + (rs["pos"],)
            random.setstate((rs["version"], internal, rs["gauss_next"]))

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return comprehensive Senet tutorial text."""
        return f"""
{'=' * 60}
  SENET - Tutorial
{'=' * 60}

  OVERVIEW:
  Senet is one of the oldest known board games, originating in
  ancient Egypt around 3100 BCE. The name means "passing" and
  the game was believed to represent the journey of the soul
  through the afterlife. It is a race game for two players.

  BOARD LAYOUT:
  The board consists of 30 squares arranged in 3 rows of 10.
  Pieces travel in a zigzag (boustrophedon) path:

    Row 1: squares 1-10   (left to right)   {chr(0x2192)}
    Row 2: squares 11-20  (right to left)   {chr(0x2190)}
    Row 3: squares 21-30  (left to right)   {chr(0x2192)}

     1   2   3   4   5   6   7   8   9  10   {chr(0x2192)}
    [  ][  ][  ][  ][  ][  ][  ][  ][  ][  ]
    20  19  18  17  16  15  14  13  12  11   {chr(0x2190)}
    [  ][  ][  ][  ][  ][{chr(0x2665)} ][  ][  ][  ][  ]
    21  22  23  24  25  26  27  28  29  30   {chr(0x2192)}
    [  ][  ][  ][  ][  ][{chr(0x2666)} ][{chr(0x2248)} ][{chr(0x2462)} ][{chr(0x2461)} ][  ]

  PIECES:
  Each player has {PIECES_PER_PLAYER} pieces. Player 1 uses {PLAYER_SYMBOLS[1]} and
  Player 2 uses {PLAYER_SYMBOLS[2]}. Pieces start alternating on
  squares 1-10.

  THROWING THE STICKS:
  Instead of dice, Senet uses 4 casting sticks. Each stick has
  one painted side and one plain side. The sticks are thrown and
  the number of painted sides facing up determines the move:

    0 painted sides up = 5 squares
    1 painted side up  = 1 square
    2 painted sides up = 2 squares
    3 painted sides up = 3 squares
    4 painted sides up = 4 squares

  Probability distribution:
    1: 25.0%    2: 37.5%    3: 25.0%    4: 6.25%    5: 6.25%

  MOVEMENT:
  Pieces move forward along the boustrophedon path. You select
  which piece to move by entering its square number.

  LANDING ON OPPONENT PIECES:
  If your piece lands on a square occupied by an opponent's
  piece, the two pieces SWAP positions - your piece goes to the
  destination and the opponent's piece goes to where your piece
  was. However, you CANNOT land on a PROTECTED opponent piece.

  PROTECTION:
  A piece is protected if it has a friendly piece on an adjacent
  square (the square immediately before or after it on the board).
  Protected pieces cannot be swapped by the opponent.

  SPECIAL SQUARES (Standard variation only):

  {chr(0x2665)} House of Happiness (square 15):
    Every piece MUST stop here on its way through the board.
    If a move would skip past square 15, it is not allowed
    unless it lands exactly on 15.

  {chr(0x2666)} House of Beauty (square 26):
    A safe resting place. Pieces sent back from the House of
    Water land here (or the nearest empty square before it).

  {chr(0x2248)} House of Water (square 27):
    DANGER! Any piece that lands here is sent back to the
    House of Beauty (square 26). If square 26 is occupied,
    the piece goes to the nearest empty square before it.

  {chr(0x2462)} House of Three Truths (square 28):
    A piece on this square can only bear off with an exact
    throw of 3.

  {chr(0x2461)} House of Re-Atoum (square 29):
    A piece on this square can only bear off with an exact
    throw of 2.

  BEARING OFF:
  To remove a piece from the board, it must move past square 30.
  The piece needs enough movement to go beyond the last square.
  On squares 28 and 29, special exact throws are needed (see
  above). The goal is to bear off all 5 pieces before your
  opponent.

  PASSING:
  If a player has no legal moves with their throw, their turn
  is passed automatically.

  SIMPLIFIED VARIATION:
  In the "simple" variation, all special square rules are
  removed. Pieces simply race along the board and bear off
  the end. Landing on opponents still swaps. Protection
  still applies.

  INPUT:
  - Enter a position number (1-30) to move the piece at that
    square.
  - If you have no legal moves, the game will pass your turn
    automatically.

  STRATEGY TIPS:
  - Try to keep your pieces adjacent to each other for
    protection.
  - Use swaps strategically to send opponents backward.
  - In standard mode, be careful around the House of Water!
  - Plan your approach to squares 28 and 29 since you need
    specific throws to bear off from them.

  COMMANDS:
  'quit' / 'q'     - Quit game
  'save' / 's'     - Save and suspend game
  'help' / 'h'     - Show help
  'tutorial' / 't' - Show this tutorial
{'=' * 60}
"""
