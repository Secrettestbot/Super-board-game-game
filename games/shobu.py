"""Shobu - Modern abstract strategy game (2019) on four 4x4 boards."""

from engine.base import BaseGame, input_with_quit, clear_screen


class ShobuGame(BaseGame):
    """Shobu.

    A modern abstract strategy game played on four 4x4 boards arranged
    in a 2x2 grid. Each player has two home boards (one dark, one light).
    Each board starts with 4 stones per player on their respective first rows.

    Each turn consists of two moves:
    1. PASSIVE move: Move one of your stones on one of your home boards
       1-2 spaces in any direction (8-directional). Cannot push any stones.
    2. AGGRESSIVE move: Move one of your stones on a board of the OPPOSITE
       color (dark<->light) the same direction and distance as the passive
       move. Can push exactly ONE opponent stone. If a pushed stone goes
       off the board edge, it is removed from the game.

    Win by removing all opponent stones from any single board.
    """

    name = "Shobu"
    description = "Modern abstract game on four 4x4 boards with passive/aggressive moves"
    min_players = 2
    max_players = 2
    variations = {"standard": "Standard Shobu"}

    EMPTY = 0
    P1 = 1
    P2 = 2

    # Board layout:
    #   NW (dark,  P1 home)  |  NE (light, P1 home)
    #   SW (light, P2 home)  |  SE (dark,  P2 home)
    BOARD_LABELS = ["NW", "NE", "SW", "SE"]
    BOARD_NAMES = {
        "NW": 0,
        "NE": 1,
        "SW": 2,
        "SE": 3,
    }
    BOARD_DESCRIPTIONS = {
        0: "NW (Dark, P1 Home)",
        1: "NE (Light, P1 Home)",
        2: "SW (Light, P2 Home)",
        3: "SE (Dark, P2 Home)",
    }
    BOARD_COLORS = {0: "dark", 1: "light", 2: "light", 3: "dark"}
    HOME_BOARDS = {
        1: [0, 1],  # Player 1 owns NW and NE (top row)
        2: [2, 3],  # Player 2 owns SW and SE (bottom row)
    }

    # Directions: name -> (dr, dc)
    DIRECTIONS = {
        "N":  (-1,  0),
        "NE": (-1,  1),
        "E":  ( 0,  1),
        "SE": ( 1,  1),
        "S":  ( 1,  0),
        "SW": ( 1, -1),
        "W":  ( 0, -1),
        "NW": (-1, -1),
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize four 4x4 boards with starting positions."""
        # boards[board_index][row][col]
        self.boards = [[[self.EMPTY] * 4 for _ in range(4)] for _ in range(4)]

        # Place stones: P1 on row 0 (home row = top of each board),
        # P2 on row 3 (home row = bottom of each board).
        # From P1's perspective, their home row is row 0 (top).
        # From P2's perspective, their home row is row 3 (bottom).
        for b in range(4):
            for c in range(4):
                self.boards[b][0][c] = self.P1   # P1 stones on top row
                self.boards[b][3][c] = self.P2   # P2 stones on bottom row

        self.stone_counts = {
            1: [4, 4, 4, 4],  # P1 stones on each board
            2: [4, 4, 4, 4],  # P2 stones on each board
        }

    # --------------------------------------------------------------- display
    def display(self):
        """Display all four boards in a 2x2 layout with labels."""
        symbols = {self.EMPTY: ".", self.P1: "X", self.P2: "O"}

        print(f"\n  Shobu   Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (X) vs {self.players[1]} (O)")
        print(f"  Current: {self.players[self.current_player - 1]}"
              f" ({symbols[self.current_player]})")
        print()

        # Top two boards: NW (0) and NE (1)
        self._display_board_pair(0, 1, symbols)
        print(f"  {'─' * 47}")
        # Bottom two boards: SW (2) and SE (3)
        self._display_board_pair(2, 3, symbols)

        print()
        print("  Format: passive_board row,col dir dist aggressive_board row,col")
        print("  Example: NW 0,1 S 2 SE 3,1")
        print("  Boards: NW NE SW SE | Dirs: N NE E SE S SW W NW | Dist: 1 or 2")
        print()

    def _display_board_pair(self, b1, b2, symbols):
        """Display two boards side by side."""
        label1 = self.BOARD_LABELS[b1]
        label2 = self.BOARD_LABELS[b2]
        desc1 = self.BOARD_DESCRIPTIONS[b1]
        desc2 = self.BOARD_DESCRIPTIONS[b2]

        p1_b1 = self.stone_counts[1][b1]
        p2_b1 = self.stone_counts[2][b1]
        p1_b2 = self.stone_counts[1][b2]
        p2_b2 = self.stone_counts[2][b2]

        print(f"  {desc1:<24}| {desc2}")
        print(f"  X:{p1_b1} O:{p2_b1}                  "
              f"| X:{p1_b2} O:{p2_b2}")

        # Column headers
        col_hdr = "    0   1   2   3"
        print(f"  {col_hdr}          | {col_hdr}")

        sep = "+---+---+---+---+"
        print(f"  {sep}          | {sep}")

        for r in range(4):
            row1 = f"{r}|"
            for c in range(4):
                row1 += f" {symbols[self.boards[b1][r][c]]} |"

            row2 = f"{r}|"
            for c in range(4):
                row2 += f" {symbols[self.boards[b2][r][c]]} |"

            print(f"  {row1}          | {row2}")
            print(f"  {sep}          | {sep}")

    # --------------------------------------------------------------- helpers
    def _board_index(self, label):
        """Convert a board label (NW/NE/SW/SE) to index, or None."""
        return self.BOARD_NAMES.get(label.upper())

    def _opposite_color_boards(self, board_idx):
        """Get board indices of opposite color to given board."""
        my_color = self.BOARD_COLORS[board_idx]
        return [b for b in range(4) if self.BOARD_COLORS[b] != my_color]

    def _dir_name(self, dr, dc):
        """Get direction name from (dr, dc) vector."""
        for name, (d_r, d_c) in self.DIRECTIONS.items():
            if d_r == dr and d_c == dc:
                return name
        return "?"

    def _in_bounds(self, r, c):
        """Check if (r, c) is within a 4x4 board."""
        return 0 <= r < 4 and 0 <= c < 4

    # ---------------------------------------------------------- move validation
    def _can_passive_move(self, board, row, col, dr, dc, distance, player):
        """Check if a passive move is valid.

        Passive moves: on a home board, own stone, path clear, no pushing.
        """
        if self.boards[board][row][col] != player:
            return False
        if board not in self.HOME_BOARDS[player]:
            return False

        # Check entire path is clear
        cr, cc = row, col
        for _ in range(distance):
            cr += dr
            cc += dc
            if not self._in_bounds(cr, cc):
                return False
            if self.boards[board][cr][cc] != self.EMPTY:
                return False
        return True

    def _can_aggressive_move(self, board, row, col, dr, dc, distance,
                             player, passive_board):
        """Check if an aggressive move is valid.

        Must be on a board of opposite color to passive board.
        Can push at most ONE opponent stone. Cannot push own stones.
        """
        if self.boards[board][row][col] != player:
            return False

        # Board must be opposite color to passive board
        if self.BOARD_COLORS[board] == self.BOARD_COLORS[passive_board]:
            return False

        opponent = self.P2 if player == self.P1 else self.P1

        # Trace path, counting pushed opponent stones
        cr, cc = row, col
        pushed_stone = None

        for step in range(distance):
            cr += dr
            cc += dc
            if not self._in_bounds(cr, cc):
                # Our stone would go off board
                return False

            cell = self.boards[board][cr][cc]
            if cell == player:
                # Cannot push own stones
                return False
            elif cell == opponent:
                if pushed_stone is not None:
                    # Already pushing one stone, cannot push two
                    return False
                pushed_stone = (cr, cc)

        # If pushing a stone, verify it can be pushed
        if pushed_stone is not None:
            pr, pc = pushed_stone
            push_end_r = pr + dr
            push_end_c = pc + dc
            if self._in_bounds(push_end_r, push_end_c):
                # Stone stays on board; destination must be empty
                dest = self.boards[board][push_end_r][push_end_c]
                if dest != self.EMPTY:
                    return False
            # else: stone pushed off board edge (valid, it is removed)

        return True

    def _has_any_moves(self, player):
        """Check if a player has any valid full move (passive + aggressive)."""
        for pb in self.HOME_BOARDS[player]:
            for pr in range(4):
                for pc in range(4):
                    if self.boards[pb][pr][pc] != player:
                        continue
                    for dr, dc in self.DIRECTIONS.values():
                        for dist in (1, 2):
                            if not self._can_passive_move(
                                    pb, pr, pc, dr, dc, dist, player):
                                continue
                            # Check for any matching aggressive move
                            opp_boards = self._opposite_color_boards(pb)
                            for ab in opp_boards:
                                for ar in range(4):
                                    for ac in range(4):
                                        if self._can_aggressive_move(
                                                ab, ar, ac, dr, dc, dist,
                                                player, pb):
                                            return True
        return False

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Get passive and aggressive moves from current player.

        Input format: passive_board row,col dir dist aggressive_board row,col
        Example: NW 0,1 S 2 SE 3,1
        """
        player = self.current_player
        name = self.players[player - 1]

        # Check if player can move at all
        if not self._has_any_moves(player):
            print(f"  {name} has no legal moves!")
            return None

        while True:
            raw = input_with_quit(
                f"  {name}'s move: "
            ).strip()

            parsed = self._parse_full_move(raw, player)
            if parsed is None:
                continue
            return parsed

    def _parse_full_move(self, raw, player):
        """Parse and validate the full move string.

        Format: passive_board row,col dir dist aggressive_board row,col
        Returns ('full_move', passive_tuple, aggressive_tuple) or None.
        """
        parts = raw.split()
        if len(parts) != 6:
            print("  Invalid format. Expected 6 parts:")
            print("  passive_board row,col dir dist aggressive_board row,col")
            print("  Example: NW 0,1 S 2 SE 3,1")
            return None

        # Parse passive board label
        p_label = parts[0].upper()
        p_board = self._board_index(p_label)
        if p_board is None:
            print(f"  Invalid board '{parts[0]}'. Use: NW, NE, SW, SE")
            return None

        # Parse passive position (row,col)
        p_pos = parts[1].split(",")
        if len(p_pos) != 2:
            print("  Invalid position. Use row,col (e.g. 0,1)")
            return None
        try:
            p_row = int(p_pos[0])
            p_col = int(p_pos[1])
        except ValueError:
            print("  Row and col must be numbers 0-3.")
            return None
        if not self._in_bounds(p_row, p_col):
            print("  Row and col must be 0-3.")
            return None

        # Parse direction
        dir_str = parts[2].upper()
        if dir_str not in self.DIRECTIONS:
            print(f"  Invalid direction '{parts[2]}'. "
                  f"Use: N NE E SE S SW W NW")
            return None
        dr, dc = self.DIRECTIONS[dir_str]

        # Parse distance
        try:
            distance = int(parts[3])
        except ValueError:
            print("  Distance must be 1 or 2.")
            return None
        if distance not in (1, 2):
            print("  Distance must be 1 or 2.")
            return None

        # Validate passive move
        if not self._can_passive_move(p_board, p_row, p_col, dr, dc,
                                      distance, player):
            if self.boards[p_board][p_row][p_col] != player:
                print(f"  No stone of yours at {p_label} ({p_row},{p_col}).")
            elif p_board not in self.HOME_BOARDS[player]:
                print(f"  {p_label} is not your home board. "
                      f"Your home boards: "
                      f"{[self.BOARD_LABELS[b] for b in self.HOME_BOARDS[player]]}")
            else:
                print("  Passive move blocked (path not clear or goes off board).")
            return None

        # Parse aggressive board label
        a_label = parts[4].upper()
        a_board = self._board_index(a_label)
        if a_board is None:
            print(f"  Invalid board '{parts[4]}'. Use: NW, NE, SW, SE")
            return None

        # Parse aggressive position (row,col)
        a_pos = parts[5].split(",")
        if len(a_pos) != 2:
            print("  Invalid position. Use row,col (e.g. 3,1)")
            return None
        try:
            a_row = int(a_pos[0])
            a_col = int(a_pos[1])
        except ValueError:
            print("  Row and col must be numbers 0-3.")
            return None
        if not self._in_bounds(a_row, a_col):
            print("  Row and col must be 0-3.")
            return None

        # Validate aggressive move (same direction and distance as passive)
        if not self._can_aggressive_move(a_board, a_row, a_col, dr, dc,
                                         distance, player, p_board):
            if self.boards[a_board][a_row][a_col] != player:
                print(f"  No stone of yours at {a_label} ({a_row},{a_col}).")
            elif self.BOARD_COLORS[a_board] == self.BOARD_COLORS[p_board]:
                print(f"  Aggressive board must be opposite color to passive "
                      f"board. {p_label} is {self.BOARD_COLORS[p_board]}, "
                      f"so pick a "
                      f"{('light' if self.BOARD_COLORS[p_board] == 'dark' else 'dark')} board.")
            else:
                print("  Aggressive move invalid (blocked, pushes own stone, "
                      "or pushes more than one stone).")
            return None

        # Check that at least one valid aggressive exists for this
        # passive direction+distance (should be true since we validated above)
        passive = (p_board, p_row, p_col, dr, dc, distance)
        aggressive = (a_board, a_row, a_col, dr, dc, distance)
        return ("full_move", passive, aggressive)

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply a full move (passive + aggressive). Returns True if valid."""
        if move is None:
            return False
        if move[0] != "full_move":
            return False

        _, passive, aggressive = move
        player = self.current_player
        opponent = self.P2 if player == self.P1 else self.P1

        p_board, p_row, p_col, p_dr, p_dc, p_dist = passive
        a_board, a_row, a_col, a_dr, a_dc, a_dist = aggressive

        # Double-check validity
        if not self._can_passive_move(p_board, p_row, p_col, p_dr, p_dc,
                                      p_dist, player):
            return False
        if not self._can_aggressive_move(a_board, a_row, a_col, a_dr, a_dc,
                                         a_dist, player, p_board):
            return False

        # --- Execute passive move ---
        self.boards[p_board][p_row][p_col] = self.EMPTY
        new_pr = p_row + p_dr * p_dist
        new_pc = p_col + p_dc * p_dist
        self.boards[p_board][new_pr][new_pc] = player

        # --- Execute aggressive move ---
        # Find pushed stone (if any) along the path
        cr, cc = a_row, a_col
        pushed_stone = None
        for step in range(a_dist):
            cr += a_dr
            cc += a_dc
            if self.boards[a_board][cr][cc] == opponent:
                pushed_stone = (cr, cc)

        # Handle pushed stone first (before moving aggressive stone)
        if pushed_stone is not None:
            pr, pc = pushed_stone
            push_end_r = pr + a_dr
            push_end_c = pc + a_dc
            self.boards[a_board][pr][pc] = self.EMPTY

            if self._in_bounds(push_end_r, push_end_c):
                # Stone stays on board at new position
                self.boards[a_board][push_end_r][push_end_c] = opponent
            else:
                # Stone pushed off the edge -- removed from game
                self.stone_counts[opponent][a_board] -= 1

        # Move the aggressive stone
        self.boards[a_board][a_row][a_col] = self.EMPTY
        new_ar = a_row + a_dr * a_dist
        new_ac = a_col + a_dc * a_dist
        self.boards[a_board][new_ar][new_ac] = player

        return True

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check if any board has zero stones for either player."""
        for b in range(4):
            if self.stone_counts[1][b] == 0:
                self.game_over = True
                self.winner = 2
                return
            if self.stone_counts[2][b] == 0:
                self.game_over = True
                self.winner = 1
                return

        # Also check if the next player has any legal moves
        next_player = 2 if self.current_player == 1 else 1
        if not self._has_any_moves(next_player):
            self.game_over = True
            self.winner = self.current_player

    # ----------------------------------------------------------- state / save
    def get_state(self):
        """Return serializable game state."""
        return {
            "boards": [[[cell for cell in row] for row in board]
                       for board in self.boards],
            "stone_counts": {
                str(k): list(v) for k, v in self.stone_counts.items()
            },
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.boards = [[[cell for cell in row] for row in board]
                       for board in state["boards"]]
        self.stone_counts = {
            int(k): list(v) for k, v in state["stone_counts"].items()
        }

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return comprehensive tutorial text for Shobu."""
        return """
==============================================================
                     SHOBU  TUTORIAL
==============================================================

OVERVIEW
--------
  Shobu is a modern abstract strategy game designed in 2019.
  Two players compete on four small 4x4 boards arranged in a
  2x2 grid. The goal is to push all of your opponent's stones
  off any single board.

  Player 1 plays as X. Player 2 plays as O.

--------------------------------------------------------------
BOARD LAYOUT
--------------------------------------------------------------
  The four boards are arranged like this:

    NW (Dark, P1 Home)   |  NE (Light, P1 Home)
    ------------------------------------------
    SW (Light, P2 Home)  |  SE (Dark, P2 Home)

  - NW and SE are DARK boards.
  - NE and SW are LIGHT boards.
  - Player 1 (X) owns the top two boards (NW and NE).
  - Player 2 (O) owns the bottom two boards (SW and SE).

  Each board is a 4x4 grid with rows 0-3 and columns 0-3.

--------------------------------------------------------------
STARTING POSITION
--------------------------------------------------------------
  On every board:
  - Player 1 (X) has 4 stones on row 0 (the top row).
  - Player 2 (O) has 4 stones on row 3 (the bottom row).

  Example board:
      0   1   2   3
    +---+---+---+---+
  0 | X | X | X | X |    <- P1 stones
    +---+---+---+---+
  1 | . | . | . | . |
    +---+---+---+---+
  2 | . | . | . | . |
    +---+---+---+---+
  3 | O | O | O | O |    <- P2 stones
    +---+---+---+---+

--------------------------------------------------------------
HOW A TURN WORKS
--------------------------------------------------------------
  Each turn consists of TWO phases performed together:

  1. PASSIVE MOVE
     - Choose one of YOUR HOME boards.
     - Move one of your stones 1 or 2 spaces in any of the
       8 directions: N, NE, E, SE, S, SW, W, NW.
     - The entire path must be clear -- you CANNOT jump over
       or push any stones with a passive move.

  2. AGGRESSIVE MOVE
     - Choose a board of the OPPOSITE COLOR to the board you
       used for your passive move.
       (Dark passive -> Light aggressive, or vice versa.)
     - Move one of your stones in the SAME DIRECTION and the
       SAME DISTANCE as your passive move.
     - This move CAN push exactly ONE opponent stone.
     - If the pushed stone goes off the edge of the board,
       it is permanently removed from the game.
     - You CANNOT push your own stones.
     - You CANNOT push more than one stone.

  Both moves must be legal. If no valid aggressive move exists
  for a given passive move, you must choose a different passive
  move.

--------------------------------------------------------------
COLOR MATCHING RULES
--------------------------------------------------------------
  The passive and aggressive boards must be OPPOSITE colors:

  If passive is on:          Aggressive must be on:
    NW (dark)         ->       NE or SW (light)
    NE (light)        ->       NW or SE (dark)
    SW (light)        ->       NW or SE (dark)
    SE (dark)         ->       NE or SW (light)

  Note: the aggressive board does NOT have to be "across" from
  the passive board. Any board of the opposite color works.

--------------------------------------------------------------
PUSHING RULES (AGGRESSIVE MOVE)
--------------------------------------------------------------
  - You may push exactly ONE opponent stone.
  - The pushed stone moves in the SAME direction as your stone.
  - If the pushed stone lands on an empty square on the board,
    it stays there.
  - If the pushed stone goes off the edge of the board, it is
    REMOVED from the game permanently.
  - You CANNOT push your own stones.
  - You CANNOT push two or more stones in a single move.
  - If an opponent stone is in your path and pushing it would
    cause it to land on another occupied square, the move is
    illegal.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Format: passive_board row,col dir dist aggressive_board row,col

  The move is entered as a single line with 6 parts:
    1. passive_board   - Board label: NW, NE, SW, or SE
    2. row,col         - Starting position on passive board
    3. dir             - Direction: N, NE, E, SE, S, SW, W, NW
    4. dist            - Distance: 1 or 2
    5. aggressive_board - Board label for the aggressive move
    6. row,col         - Starting position on aggressive board

  The aggressive move automatically uses the SAME direction and
  distance as the passive move.

  Examples:
    NW 0,1 S 2 SE 3,1
      Passive: move stone at NW (0,1) South 2 spaces
      Aggressive: move stone at SE (3,1) South 2 spaces

    NE 0,3 E 1 NW 2,0
      Passive: move stone at NE (0,3) East 1 space
      Aggressive: move stone at NW (2,0) East 1 space

    SW 3,0 N 1 SE 1,2
      Passive: move stone at SW (3,0) North 1 space
      Aggressive: move stone at SE (1,2) North 1 space

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  You win by removing ALL of your opponent's stones from ANY
  ONE of the four boards. You do not need to clear all four
  boards -- just one.

  You also win if your opponent has no legal moves available
  on their turn.

--------------------------------------------------------------
STRATEGY TIPS
--------------------------------------------------------------
  - Think about all four boards simultaneously. Your passive
    move constrains your aggressive options.

  - Pushing stones off the edge is the ONLY way to eliminate
    them. Position your pieces to set up edge pushes.

  - Protect boards where you are running low on stones. Losing
    all stones on even one board loses the entire game.

  - Sometimes a "weak" passive move is necessary to enable a
    powerful aggressive push on another board.

  - Control the center of boards to maximize your movement
    options in future turns.

  - Keep stones spread out rather than clustered, so you have
    more directional options for both passive and aggressive
    moves.

  - Watch for two-board threats: if you can threaten to clear
    stones on two different boards, your opponent may not be
    able to defend both.

  - Pay attention to which colors pair together. A passive on
    a dark board means your attack must be on a light board,
    and vice versa.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial

==============================================================
"""
