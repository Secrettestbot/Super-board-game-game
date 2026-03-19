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
    #   Board 0 (dark, P1 home)   | Board 1 (light, P1 home)
    #   Board 2 (light, P2 home)  | Board 3 (dark, P2 home)
    BOARD_NAMES = ["Dark (P1 Home)", "Light (P1 Home)",
                   "Light (P2 Home)", "Dark (P2 Home)"]
    BOARD_COLORS = ['dark', 'light', 'light', 'dark']  # color of each board
    HOME_BOARDS = {
        1: [0, 1],  # Player 1's home boards
        2: [2, 3],  # Player 2's home boards
    }

    # Directions: name -> (dr, dc)
    DIRECTIONS = {
        'N':  (-1, 0),
        'NE': (-1, 1),
        'E':  (0, 1),
        'SE': (1, 1),
        'S':  (1, 0),
        'SW': (1, -1),
        'W':  (0, -1),
        'NW': (-1, -1),
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    def setup(self):
        """Initialize four 4x4 boards."""
        # Each board is a 4x4 grid
        self.boards = [[[self.EMPTY] * 4 for _ in range(4)] for _ in range(4)]

        # Place stones: P1 on row 3 (bottom), P2 on row 0 (top) of each board
        for b in range(4):
            for c in range(4):
                self.boards[b][0][c] = self.P2  # P2 on top row
                self.boards[b][3][c] = self.P1  # P1 on bottom row

        # Count stones per player per board
        self.stone_counts = {
            1: [4, 4, 4, 4],  # P1 stones on each board
            2: [4, 4, 4, 4],  # P2 stones on each board
        }

    def display(self):
        """Display all four boards side by side in 2x2 layout."""
        symbols = {self.EMPTY: '.', self.P1: 'X', self.P2: 'O'}

        print(f"\n  Shobu   Turn {self.turn_number}")
        print(f"  {self.players[0]} (X) vs {self.players[1]} (O)")
        print(f"  Current: {self.players[self.current_player - 1]}")
        print()

        # Top two boards (0 and 1)
        self._display_board_pair(0, 1, symbols)
        print(f"  {'─' * 47}")
        # Bottom two boards (2 and 3)
        self._display_board_pair(2, 3, symbols)

        print()
        print("  Passive move on a HOME board, then aggressive on OPPOSITE color board.")
        print("  Input: board,row,col direction distance (e.g., '0,3,0 N 2')")
        print("  Directions: N NE E SE S SW W NW | Distance: 1 or 2")
        print()

    def _display_board_pair(self, b1, b2, symbols):
        """Display two boards side by side."""
        # Headers
        p1_stones_b1 = self.stone_counts[1][b1]
        p2_stones_b1 = self.stone_counts[2][b1]
        p1_stones_b2 = self.stone_counts[1][b2]
        p2_stones_b2 = self.stone_counts[2][b2]

        h1 = f"  Board {b1}: {self.BOARD_NAMES[b1]}"
        h2 = f"Board {b2}: {self.BOARD_NAMES[b2]}"
        print(f"{h1:<26}| {h2}")
        print(f"  X:{p1_stones_b1} O:{p2_stones_b1}                   "
              f"| X:{p1_stones_b2} O:{p2_stones_b2}")

        # Column numbers
        col_hdr = "    0   1   2   3"
        print(f"  {col_hdr}          | {col_hdr}")
        sep = "  +" + "---+" * 4
        print(f"  {sep[2:]}          | {sep[2:]}")

        for r in range(4):
            row1 = f"  {r}|"
            for c in range(4):
                row1 += f" {symbols[self.boards[b1][r][c]]} |"

            row2 = f"{r}|"
            for c in range(4):
                row2 += f" {symbols[self.boards[b2][r][c]]} |"

            print(f"  {row1[2:]}          | {row2}")
            print(f"  {sep[2:]}          | {sep[2:]}")

    def _opposite_color_boards(self, board_idx):
        """Get board indices of opposite color."""
        my_color = self.BOARD_COLORS[board_idx]
        return [b for b in range(4) if self.BOARD_COLORS[b] != my_color]

    def _parse_board_pos_dir(self, raw):
        """Parse input like 'board,row,col direction distance'.

        Returns (board, row, col, dr, dc, distance) or None.
        """
        parts = raw.strip().split()
        if len(parts) != 3:
            return None

        # Parse board,row,col
        pos_parts = parts[0].split(',')
        if len(pos_parts) != 3:
            return None
        try:
            board = int(pos_parts[0])
            row = int(pos_parts[1])
            col = int(pos_parts[2])
        except ValueError:
            return None

        if not (0 <= board < 4 and 0 <= row < 4 and 0 <= col < 4):
            return None

        # Parse direction
        dir_str = parts[1].upper()
        if dir_str not in self.DIRECTIONS:
            return None
        dr, dc = self.DIRECTIONS[dir_str]

        # Parse distance
        try:
            distance = int(parts[2])
        except ValueError:
            return None
        if distance not in (1, 2):
            return None

        return (board, row, col, dr, dc, distance)

    def _can_passive_move(self, board, row, col, dr, dc, distance, player):
        """Check if a passive move is valid.

        Passive moves cannot push any stones (path must be completely clear).
        """
        if self.boards[board][row][col] != player:
            return False
        if board not in self.HOME_BOARDS[player]:
            return False

        # Check path is clear
        cr, cc = row, col
        for _ in range(distance):
            cr += dr
            cc += dc
            if not (0 <= cr < 4 and 0 <= cc < 4):
                return False
            if self.boards[board][cr][cc] != self.EMPTY:
                return False
        return True

    def _can_aggressive_move(self, board, row, col, dr, dc, distance, player, passive_board):
        """Check if an aggressive move is valid.

        Must be on a board of opposite color to the passive board.
        Can push at most ONE opponent stone. Cannot push own stones.
        """
        if self.boards[board][row][col] != player:
            return False

        # Board must be opposite color to passive board
        if self.BOARD_COLORS[board] == self.BOARD_COLORS[passive_board]:
            return False

        opponent = self.P2 if player == self.P1 else self.P1

        # Trace path
        cr, cc = row, col
        pushed_stone = None

        for step in range(distance):
            cr += dr
            cc += dc
            if not (0 <= cr < 4 and 0 <= cc < 4):
                # Went off the board while moving our own stone
                return False

            cell = self.boards[board][cr][cc]
            if cell == player:
                # Cannot push own stones
                return False
            elif cell == opponent:
                if pushed_stone is not None:
                    # Already pushing one stone, can't push two
                    return False
                pushed_stone = (cr, cc)
                # Check if remaining steps are clear or push stone off
                # The pushed stone moves in same direction for remaining steps
                # Actually, the pushing piece occupies this square, so the
                # opponent stone is pushed from here

        # If we're pushing a stone, verify it can be pushed (or goes off board)
        if pushed_stone is not None:
            pr, pc = pushed_stone
            # The pushed stone ends up at pushed_pos + (dr, dc)
            push_end_r = pr + dr
            push_end_c = pc + dc
            if 0 <= push_end_r < 4 and 0 <= push_end_c < 4:
                # Stone stays on board - destination must be empty
                if self.boards[board][push_end_r][push_end_c] != self.EMPTY:
                    return False
            # else: stone falls off board (valid - it gets removed)

        return True

    def get_move(self):
        """Get passive and aggressive moves from current player."""
        player = self.current_player

        # Check if player has any valid complete moves at all
        if not self._has_any_moves(player):
            return None

        # Get passive move
        while True:
            raw = input_with_quit(
                f"  {self.players[player - 1]}, PASSIVE move "
                f"(home board: {self.HOME_BOARDS[player]}): "
            )
            parsed = self._parse_board_pos_dir(raw)
            if parsed is None:
                print("  Invalid format. Use: board,row,col direction distance")
                print("  Example: 0,3,0 N 2")
                continue

            board, row, col, dr, dc, distance = parsed
            if not self._can_passive_move(board, row, col, dr, dc, distance, player):
                print("  Invalid passive move. Must be on your home board,")
                print("  path must be clear, and stone must be yours.")
                continue

            # Check that there exists at least one valid aggressive move
            # with this direction and distance
            opp_boards = self._opposite_color_boards(board)
            has_aggressive = False
            for ab in opp_boards:
                for ar in range(4):
                    for ac in range(4):
                        if self._can_aggressive_move(ab, ar, ac, dr, dc, distance, player, board):
                            has_aggressive = True
                            break
                    if has_aggressive:
                        break
                if has_aggressive:
                    break

            if not has_aggressive:
                print("  No valid aggressive move exists for this direction/distance.")
                continue

            passive_move = parsed
            break

        _, _, _, p_dr, p_dc, p_dist = passive_move

        # Display the board after showing passive move selection
        print(f"\n  Passive: Board {passive_move[0]}, "
              f"({passive_move[1]},{passive_move[2]}) "
              f"{self._dir_name(p_dr, p_dc)} {p_dist}")

        # Get aggressive move
        opp_color_boards = self._opposite_color_boards(passive_move[0])
        while True:
            raw = input_with_quit(
                f"  AGGRESSIVE move (opposite color boards: {opp_color_boards}): "
            )
            parsed = self._parse_board_pos_dir(raw)
            if parsed is None:
                print("  Invalid format. Use: board,row,col direction distance")
                continue

            a_board, a_row, a_col, a_dr, a_dc, a_dist = parsed

            # Must use same direction and distance as passive move
            if (a_dr, a_dc) != (p_dr, p_dc) or a_dist != p_dist:
                print(f"  Must use same direction ({self._dir_name(p_dr, p_dc)}) "
                      f"and distance ({p_dist}) as passive move.")
                continue

            if not self._can_aggressive_move(a_board, a_row, a_col, a_dr, a_dc,
                                             a_dist, player, passive_move[0]):
                print("  Invalid aggressive move.")
                continue

            aggressive_move = parsed
            break

        return ('full_move', passive_move, aggressive_move)

    def _dir_name(self, dr, dc):
        """Get direction name from vector."""
        for name, (d_r, d_c) in self.DIRECTIONS.items():
            if d_r == dr and d_c == dc:
                return name
        return "?"

    def _has_any_moves(self, player):
        """Check if a player has any valid full move (passive + aggressive)."""
        for pb in self.HOME_BOARDS[player]:
            for pr in range(4):
                for pc in range(4):
                    if self.boards[pb][pr][pc] != player:
                        continue
                    for dr, dc in self.DIRECTIONS.values():
                        for dist in (1, 2):
                            if not self._can_passive_move(pb, pr, pc, dr, dc, dist, player):
                                continue
                            # Check for matching aggressive move
                            opp_boards = self._opposite_color_boards(pb)
                            for ab in opp_boards:
                                for ar in range(4):
                                    for ac in range(4):
                                        if self._can_aggressive_move(
                                                ab, ar, ac, dr, dc, dist, player, pb):
                                            return True
        return False

    def make_move(self, move):
        """Apply a full move (passive + aggressive). Returns True if valid."""
        if move is None:
            return False

        if move[0] != 'full_move':
            return False

        _, passive, aggressive = move
        player = self.current_player

        # Execute passive move
        p_board, p_row, p_col, p_dr, p_dc, p_dist = passive
        if not self._can_passive_move(p_board, p_row, p_col, p_dr, p_dc, p_dist, player):
            return False

        self.boards[p_board][p_row][p_col] = self.EMPTY
        new_pr = p_row + p_dr * p_dist
        new_pc = p_col + p_dc * p_dist
        self.boards[p_board][new_pr][new_pc] = player

        # Execute aggressive move
        a_board, a_row, a_col, a_dr, a_dc, a_dist = aggressive
        if not self._can_aggressive_move(a_board, a_row, a_col, a_dr, a_dc,
                                         a_dist, player, p_board):
            # Undo passive move
            self.boards[p_board][new_pr][new_pc] = self.EMPTY
            self.boards[p_board][p_row][p_col] = player
            return False

        opponent = self.P2 if player == self.P1 else self.P1

        # Find if there's a stone being pushed
        cr, cc = a_row, a_col
        pushed_stone = None
        for step in range(a_dist):
            cr += a_dr
            cc += a_dc
            if self.boards[a_board][cr][cc] == opponent:
                pushed_stone = (cr, cc)

        # Handle pushed stone
        if pushed_stone is not None:
            pr, pc = pushed_stone
            push_end_r = pr + a_dr
            push_end_c = pc + a_dc
            self.boards[a_board][pr][pc] = self.EMPTY

            if 0 <= push_end_r < 4 and 0 <= push_end_c < 4:
                # Stone stays on board
                self.boards[a_board][push_end_r][push_end_c] = opponent
            else:
                # Stone pushed off - removed from game
                self.stone_counts[opponent][a_board] -= 1

        # Move aggressive stone
        self.boards[a_board][a_row][a_col] = self.EMPTY
        new_ar = a_row + a_dr * a_dist
        new_ac = a_col + a_dc * a_dist
        self.boards[a_board][new_ar][new_ac] = player

        return True

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

        # Check if next player has any moves
        next_player = 2 if self.current_player == 1 else 1
        if not self._has_any_moves(next_player):
            self.game_over = True
            self.winner = self.current_player

    def get_state(self):
        """Return serializable game state."""
        return {
            "boards": [[[cell for cell in row] for row in board]
                       for board in self.boards],
            "stone_counts": {
                str(k): v[:] for k, v in self.stone_counts.items()
            },
        }

    def load_state(self, state):
        """Restore game state."""
        self.boards = [[[cell for cell in row] for row in board]
                       for board in state["boards"]]
        self.stone_counts = {
            int(k): v[:] for k, v in state["stone_counts"].items()
        }

    def get_tutorial(self):
        return """
==================================================
  SHOBU - Tutorial
==================================================

  OVERVIEW
  --------
  Shobu is a modern abstract strategy game
  designed in 2019. It is played on four 4x4
  boards arranged in a 2x2 grid.

  BOARD LAYOUT
  ------------
  The four boards are arranged as follows:

    Board 0: Dark  (P1 Home) | Board 1: Light (P1 Home)
    -------------------------------------------------
    Board 2: Light (P2 Home) | Board 3: Dark  (P2 Home)

  Player 1 (X) has home boards 0 and 1.
  Player 2 (O) has home boards 2 and 3.

  SETUP
  -----
  Each board starts with 4 stones per player:
  - Player 2 (O) on row 0 (top row)
  - Player 1 (X) on row 3 (bottom row)

  TURNS
  -----
  Each turn has TWO phases:

  1. PASSIVE MOVE:
     Move one of your stones on one of YOUR HOME
     boards. The stone moves 1 or 2 spaces in any
     of 8 directions (N, NE, E, SE, S, SW, W, NW).
     The path must be completely clear - you CANNOT
     push any stones with a passive move.

  2. AGGRESSIVE MOVE:
     Move one of your stones on a board of the
     OPPOSITE COLOR to your passive board. The
     aggressive move must be in the SAME DIRECTION
     and the SAME DISTANCE as your passive move.

     The aggressive move CAN push exactly ONE
     opponent stone. If the pushed stone goes off
     the edge of the board, it is removed from
     the game permanently.

     You CANNOT push your own stones.
     You CANNOT push more than one stone.

  COLOR MATCHING:
  - If passive move was on a DARK board, aggressive
    must be on a LIGHT board (and vice versa).
  - The aggressive move can be on ANY board of the
    opposite color (not just the one across).

  MOVE INPUT
  ----------
  Format: board,row,col direction distance

  Examples:
    0,3,0 N 2   - Board 0, row 3, col 0, North, 2 spaces
    1,2,3 SW 1  - Board 1, row 2, col 3, Southwest, 1 space

  Boards: 0-3 (see layout above)
  Rows: 0 (top) to 3 (bottom)
  Columns: 0 (left) to 3 (right)
  Directions: N, NE, E, SE, S, SW, W, NW
  Distance: 1 or 2

  WINNING
  -------
  You win by removing ALL opponent stones from
  ANY SINGLE board. You only need to clear one
  board to win, not all four.

  You also win if your opponent has no legal
  moves on their turn.

  STRATEGY TIPS
  -------------
  - Pay attention to all four boards at once.
    A move on one board affects what's possible
    on others.
  - Pushing stones off the edge is the only way
    to eliminate them. Position your stones to
    set up edge pushes.
  - Protect boards where you're low on stones.
    Losing all stones on even one board loses
    the game.
  - The passive move restricts your aggressive
    options (same direction and distance). Plan
    both moves together.
  - Sometimes a passive move that seems weak is
    necessary to enable a strong aggressive move.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
