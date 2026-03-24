"""Gobblet - A strategy game where larger pieces can gobble smaller ones."""

from engine.base import BaseGame, input_with_quit, clear_screen


# Piece sizes (larger number = bigger piece)
SMALL = 1
MEDIUM = 2
LARGE = 3

SIZE_NAMES = {SMALL: "S", MEDIUM: "M", LARGE: "L"}
SIZE_FULL_NAMES = {SMALL: "Small", MEDIUM: "Medium", LARGE: "Large"}

# Player symbols
PLAYER_SYMBOLS = {1: "W", 2: "B"}  # White and Black
PLAYER_NAMES = {1: "White", 2: "Black"}


def piece_label(player, size):
    """Return a display label for a piece, e.g. 'WL' for White Large."""
    return f"{PLAYER_SYMBOLS[player]}{SIZE_NAMES[size]}"


class GobbletGame(BaseGame):
    """Gobblet: A game where larger pieces can gobble (cover) smaller ones."""

    name = "Gobblet"
    description = "Stack and gobble pieces to get four in a row"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Gobblet (4x4, 3 sizes)",
        "gobblet_jr": "Gobblet Jr (3x3, 2 sizes)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        if self.variation == "gobblet_jr":
            self.board_size = 3
            self.sizes = [SMALL, MEDIUM]
            self.stacks_per_player = 3
            self.win_length = 3
        else:
            self.board_size = 4
            self.sizes = [SMALL, MEDIUM, LARGE]
            self.stacks_per_player = 4
            self.win_length = 4

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize empty board and player reserves."""
        n = self.board_size
        # Each cell is a list (stack) of (player, size) tuples.
        # Last element is the top (visible) piece.
        self.board = [[[] for _ in range(n)] for _ in range(n)]

        # Reserves: each player has stacks_per_player stacks, each containing
        # one piece of each size (largest on bottom, smallest on top).
        # Pieces can only be taken from the top of a reserve stack.
        self.reserves = {
            1: [list(reversed(self.sizes)) for _ in range(self.stacks_per_player)],
            2: [list(reversed(self.sizes)) for _ in range(self.stacks_per_player)],
        }

    # --------------------------------------------------------------- display
    def display(self):
        """Display the board and reserves."""
        n = self.board_size
        var_label = "Standard" if self.variation == "standard" else "Gobblet Jr"
        print(f"\n  === Gobblet ({var_label}) ===  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} ({PLAYER_NAMES[1]}) vs {self.players[1]} ({PLAYER_NAMES[2]})")
        print(f"  Current: {self.players[self.current_player - 1]} ({PLAYER_NAMES[self.current_player]})")
        print()

        # Column headers
        header = "     " + "   ".join(f" {c+1} " for c in range(n))
        print(header)
        print("  +" + "-----+" * n)
        for r in range(n):
            row_str = "  |"
            for c in range(n):
                stack = self.board[r][c]
                if stack:
                    player, size = stack[-1]
                    label = piece_label(player, size)
                    # Show stack depth indicator if pieces underneath
                    if len(stack) > 1:
                        row_str += f"{label}{len(stack):>2} "
                    else:
                        row_str += f" {label}  "
                else:
                    row_str += "  .  "
                row_str += "|"
            row_str += f"  {r + 1}"
            print(row_str)
            print("  +" + "-----+" * n)

        # Show reserves
        print()
        for p in [1, 2]:
            name = self.players[p - 1]
            pname = PLAYER_NAMES[p]
            stacks_display = []
            for i, stack in enumerate(self.reserves[p]):
                if stack:
                    top_size = stack[-1]
                    contents = ",".join(SIZE_NAMES[s] for s in stack)
                    stacks_display.append(f"[{i+1}]:{contents}")
                else:
                    stacks_display.append(f"[{i+1}]:--")
            print(f"  {name} ({pname}) reserve: {' '.join(stacks_display)}")
        print()

    # --------------------------------------------------------------- helpers
    def _top_piece(self, r, c):
        """Return the top piece at (r,c) as (player, size) or None."""
        stack = self.board[r][c]
        return stack[-1] if stack else None

    def _visible_pieces(self, player):
        """Return list of (r, c) where the top piece belongs to player."""
        n = self.board_size
        result = []
        for r in range(n):
            for c in range(n):
                top = self._top_piece(r, c)
                if top and top[0] == player:
                    result.append((r, c))
        return result

    def _can_place_on(self, size, r, c):
        """Check if a piece of given size can be placed at (r,c)."""
        top = self._top_piece(r, c)
        if top is None:
            return True
        return size > top[1]

    def _check_win_for(self, player):
        """Check if the given player has win_length visible pieces in a row."""
        n = self.board_size
        wl = self.win_length

        # All lines to check: rows, columns, diagonals
        lines = []
        # Rows
        for r in range(n):
            lines.append([(r, c) for c in range(n)])
        # Columns
        for c in range(n):
            lines.append([(r, c) for r in range(n)])
        # Diagonals
        lines.append([(i, i) for i in range(n)])
        lines.append([(i, n - 1 - i) for i in range(n)])

        for line in lines:
            if len(line) >= wl:
                tops = [self._top_piece(r, c) for r, c in line]
                if all(t is not None and t[0] == player for t in tops):
                    return True
        return False

    def _would_expose_opponent_win(self, player, from_r, from_c):
        """Check if lifting a piece from (from_r, from_c) would expose an
        opponent win. Used to warn but not prevent (per standard rules,
        you must be careful about what you expose)."""
        # This is informational only; the official rules allow risky moves.
        pass

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Get move from current player.

        A move is either:
          - Place from reserve: {'action': 'place', 'stack_idx': int, 'to': (r,c)}
          - Move on board: {'action': 'move', 'from': (r,c), 'to': (r,c)}
        """
        player = self.current_player
        name = self.players[player - 1]
        pname = PLAYER_NAMES[player]
        n = self.board_size

        while True:
            print(f"  {name} ({pname}), enter your move:")
            print(f"    Place from reserve: p <stack#> <row> <col>")
            print(f"    Move on board:      m <from_row> <from_col> <to_row> <to_col>")
            raw = input_with_quit("  > ").strip().lower()
            parts = raw.split()

            if not parts:
                print("  Please enter a move.")
                continue

            action = parts[0]

            if action == 'p':
                # Place from reserve
                if len(parts) != 4:
                    print("  Format: p <stack#> <row> <col>")
                    continue
                try:
                    stack_idx = int(parts[1]) - 1
                    to_r = int(parts[2]) - 1
                    to_c = int(parts[3]) - 1
                except ValueError:
                    print("  Invalid numbers. Format: p <stack#> <row> <col>")
                    continue

                if not (0 <= stack_idx < self.stacks_per_player):
                    print(f"  Stack number must be 1-{self.stacks_per_player}.")
                    continue
                if not self.reserves[player][stack_idx]:
                    print(f"  Reserve stack {stack_idx + 1} is empty.")
                    continue
                if not (0 <= to_r < n and 0 <= to_c < n):
                    print(f"  Row and column must be 1-{n}.")
                    continue

                size = self.reserves[player][stack_idx][-1]
                if not self._can_place_on(size, to_r, to_c):
                    top = self._top_piece(to_r, to_c)
                    print(f"  Cannot place {SIZE_FULL_NAMES[size]} on {piece_label(top[0], top[1])}. "
                          f"Piece must be larger than what's there.")
                    continue

                return {'action': 'place', 'stack_idx': stack_idx,
                        'to': (to_r, to_c)}

            elif action == 'm':
                # Move piece on board
                if len(parts) != 5:
                    print("  Format: m <from_row> <from_col> <to_row> <to_col>")
                    continue
                try:
                    from_r = int(parts[1]) - 1
                    from_c = int(parts[2]) - 1
                    to_r = int(parts[3]) - 1
                    to_c = int(parts[4]) - 1
                except ValueError:
                    print("  Invalid numbers. Format: m <from_row> <from_col> <to_row> <to_col>")
                    continue

                if not (0 <= from_r < n and 0 <= from_c < n):
                    print(f"  Source row/col must be 1-{n}.")
                    continue
                if not (0 <= to_r < n and 0 <= to_c < n):
                    print(f"  Destination row/col must be 1-{n}.")
                    continue
                if from_r == to_r and from_c == to_c:
                    print("  Source and destination must be different.")
                    continue

                top = self._top_piece(from_r, from_c)
                if top is None:
                    print("  No piece at that position.")
                    continue
                if top[0] != player:
                    print("  That's not your piece.")
                    continue

                if not self._can_place_on(top[1], to_r, to_c):
                    dest_top = self._top_piece(to_r, to_c)
                    print(f"  Cannot move {piece_label(top[0], top[1])} onto "
                          f"{piece_label(dest_top[0], dest_top[1])}. Must be larger.")
                    continue

                return {'action': 'move', 'from': (from_r, from_c),
                        'to': (to_r, to_c)}
            else:
                print("  Unknown action. Use 'p' to place or 'm' to move.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        player = self.current_player
        n = self.board_size

        if move['action'] == 'place':
            stack_idx = move['stack_idx']
            to_r, to_c = move['to']

            if not (0 <= stack_idx < self.stacks_per_player):
                return False
            if not self.reserves[player][stack_idx]:
                return False
            if not (0 <= to_r < n and 0 <= to_c < n):
                return False

            size = self.reserves[player][stack_idx][-1]
            if not self._can_place_on(size, to_r, to_c):
                return False

            # Remove from reserve and place on board
            self.reserves[player][stack_idx].pop()
            self.board[to_r][to_c].append((player, size))
            return True

        elif move['action'] == 'move':
            from_r, from_c = move['from']
            to_r, to_c = move['to']

            if not (0 <= from_r < n and 0 <= from_c < n):
                return False
            if not (0 <= to_r < n and 0 <= to_c < n):
                return False
            if from_r == to_r and from_c == to_c:
                return False

            top = self._top_piece(from_r, from_c)
            if top is None or top[0] != player:
                return False
            if not self._can_place_on(top[1], to_r, to_c):
                return False

            # Lift piece and place at destination
            piece = self.board[from_r][from_c].pop()
            self.board[to_r][to_c].append(piece)
            return True

        return False

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check if someone has won. Current player just moved, so check them.
        Also check opponent in case lifting a piece revealed an opponent win."""
        current = self.current_player
        opponent = 2 if current == 1 else 1

        if self._check_win_for(current):
            self.game_over = True
            self.winner = current
            return

        # Lifting a piece might reveal an opponent's winning line
        if self._check_win_for(opponent):
            self.game_over = True
            self.winner = opponent
            return

    # ----------------------------------------------------------- state / save
    def get_state(self):
        """Return serializable game state."""
        n = self.board_size
        board_data = []
        for r in range(n):
            row_data = []
            for c in range(n):
                row_data.append([(p, s) for p, s in self.board[r][c]])
            board_data.append(row_data)

        reserves_data = {
            str(p): [list(stack) for stack in self.reserves[p]]
            for p in [1, 2]
        }

        return {
            "board": board_data,
            "reserves": reserves_data,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        n = self.board_size
        board_data = state["board"]
        self.board = []
        for r in range(n):
            row = []
            for c in range(n):
                row.append([(p, s) for p, s in board_data[r][c]])
            self.board.append(row)

        reserves_data = state["reserves"]
        self.reserves = {
            1: [list(stack) for stack in reserves_data["1"]],
            2: [list(stack) for stack in reserves_data["2"]],
        }

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return tutorial text for Gobblet."""
        if self.variation == "gobblet_jr":
            return """
==============================================================
                   GOBBLET JR  TUTORIAL
==============================================================

OVERVIEW
  Gobblet Jr is a simplified version of Gobblet for younger
  players. It is played on a 3x3 grid. Each player has 6
  pieces in 2 sizes (Small and Medium), arranged in 3 stacks
  of 2 pieces each. The goal is to get 3 of your visible
  pieces in a row.

--------------------------------------------------------------
PIECES
--------------------------------------------------------------
  Each player (White=W, Black=B) has:
    - 3 Small pieces (S)
    - 3 Medium pieces (M)

  Pieces start in 3 reserve stacks. Each stack has a Medium
  piece on the bottom and a Small piece on top. You can only
  take the top piece from a reserve stack.

  A larger piece can "gobble" (cover) a smaller piece on the
  board, hiding it from view.

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  On your turn, do ONE of the following:

  1. PLACE a piece from one of your reserve stacks onto the
     board. You take the top piece from a stack.

  2. MOVE a piece you already have on the board to a different
     square.

  In both cases, you may place/move onto an empty square or
  onto a square with a SMALLER piece (gobbling it).

  IMPORTANT: Moving a piece off a square reveals whatever was
  underneath. If that reveals an opponent's winning line, they
  win!

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Place from reserve:  p <stack#> <row> <col>
    Example: p 1 2 3  (place top of stack 1 at row 2, col 3)

  Move on board:       m <from_row> <from_col> <to_row> <to_col>
    Example: m 1 1 2 3  (move piece from row 1 col 1 to row 2 col 3)

  Rows and columns are numbered 1-3.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  Get 3 of your visible pieces in a row (horizontal, vertical,
  or diagonal).

  Be careful when moving pieces -- you might reveal a hidden
  piece that completes your opponent's line!

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
        return """
==============================================================
                     GOBBLET  TUTORIAL
==============================================================

OVERVIEW
  Gobblet is a two-player strategy game played on a 4x4 grid.
  Each player has 12 pieces in 3 sizes (Small, Medium, Large),
  arranged in 4 stacks of 3 pieces each. The goal is to get
  4 of your visible pieces in a row.

--------------------------------------------------------------
PIECES
--------------------------------------------------------------
  Each player (White=W, Black=B) has:
    - 4 Small pieces (S)
    - 4 Medium pieces (M)
    - 4 Large pieces (L)

  Pieces start in 4 reserve stacks. Each stack has a Large
  piece on the bottom, then Medium, then Small on top. You
  can only take the top piece from a reserve stack.

  A larger piece can "gobble" (cover) a smaller piece on the
  board, hiding it from view. Size order: Small < Medium < Large.

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  On your turn, do ONE of the following:

  1. PLACE a piece from one of your reserve stacks onto the
     board. You take the top piece from a stack.

  2. MOVE a piece you already have on the board to a different
     square.

  In both cases, you may place/move onto an empty square or
  onto a square with a SMALLER piece (gobbling it). You can
  gobble your own or your opponent's pieces.

  IMPORTANT: Moving a piece off a square reveals whatever was
  underneath. If that reveals an opponent's winning line, the
  opponent wins! Think carefully before lifting pieces.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Place from reserve:  p <stack#> <row> <col>
    Example: p 2 3 4  (place top of stack 2 at row 3, col 4)

  Move on board:       m <from_row> <from_col> <to_row> <to_col>
    Example: m 1 1 3 4  (move piece from row 1 col 1 to row 3 col 4)

  Rows and columns are numbered 1-4.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  Get 4 of your visible pieces in a row -- horizontal,
  vertical, or diagonal.

  Be careful when moving pieces -- you might reveal a hidden
  piece that completes your opponent's line!

--------------------------------------------------------------
BOARD DISPLAY
--------------------------------------------------------------
       1     2     3     4
  +-----+-----+-----+-----+
  | WL  |  .  | BM  |  .  |  1
  +-----+-----+-----+-----+
  |  .  | WS  |  .  |  .  |  2
  +-----+-----+-----+-----+
  |  .  |  .  | BS 2|  .  |  3
  +-----+-----+-----+-----+
  | BL  |  .  |  .  | WM  |  4
  +-----+-----+-----+-----+

  Each cell shows the top (visible) piece:
    W/B = White/Black player
    S/M/L = Small/Medium/Large size
    A number after the label (e.g. "BS 2") means there are
    pieces stacked underneath (2 pieces total in that cell).

--------------------------------------------------------------
RESERVES
--------------------------------------------------------------
  Your reserve stacks show which pieces are available:
    [1]:S,M,L  means stack 1 has Small on top, then Medium,
               then Large on bottom
    [2]:--     means stack 2 is empty

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
  - Start by placing smaller pieces. Save large pieces for
    gobbling later when you need to block or reveal.

  - Think before you lift! Moving a piece might expose a
    hidden piece underneath that helps your opponent.

  - Use gobbling offensively to cover opponent's pieces in
    key positions.

  - Use gobbling defensively to block an opponent's line
    by covering their piece with a larger one of yours.

  - Control the center of the board when possible.

  - Keep track of what's hidden under gobbled pieces --
    memory is a key part of the game!
==============================================================
"""
