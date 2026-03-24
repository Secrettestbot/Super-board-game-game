"""Kamisado - Color-based abstract strategy game."""

from engine.base import BaseGame, input_with_quit, clear_screen


class KamisadoGame(BaseGame):
    """Kamisado.

    An abstract strategy game played on an 8x8 board of colored squares.
    Each player has 8 towers, one of each color. Players race to get a
    tower to the opponent's home row. The key mechanic: the color of the
    square your opponent landed on determines which tower you must move next.
    """

    name = "Kamisado"
    description = "Color-based abstract strategy race game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Kamisado (single round)",
        "sumo": "Sumo Kamisado (best of 3 rounds, push mechanic)",
    }

    # The 8 colors used on the board and for towers
    COLORS = ['O', 'B', 'P', 'Y', 'R', 'G', 'N', 'W']
    COLOR_NAMES = {
        'O': 'Orange', 'B': 'Brown', 'P': 'Purple', 'Y': 'Yellow',
        'R': 'Red', 'G': 'Green', 'N': 'Navy', 'W': 'White',
    }

    # Standard Kamisado board color layout (row 0 = top = Player 1 home row)
    BOARD_COLORS = [
        ['O', 'B', 'P', 'Y', 'R', 'G', 'N', 'W'],
        ['W', 'O', 'B', 'P', 'Y', 'R', 'G', 'N'],
        ['N', 'W', 'O', 'B', 'P', 'Y', 'R', 'G'],
        ['G', 'N', 'W', 'O', 'B', 'P', 'Y', 'R'],
        ['R', 'G', 'N', 'W', 'O', 'B', 'P', 'Y'],
        ['Y', 'R', 'G', 'N', 'W', 'O', 'B', 'P'],
        ['P', 'Y', 'R', 'G', 'N', 'W', 'O', 'B'],
        ['B', 'P', 'Y', 'R', 'G', 'N', 'W', 'O'],
    ]

    COL_LABELS = "abcdefgh"

    def __init__(self, variation=None):
        super().__init__(variation)

    def setup(self):
        """Initialize the board with towers in starting positions."""
        # Board stores pieces: None = empty, (player, color) = tower
        # player is 1 or 2, color is one of COLORS
        self.board = [[None] * 8 for _ in range(8)]

        # Player 1 towers on row 0 (top), Player 2 towers on row 7 (bottom)
        # Each tower's color matches the board square color at its starting position
        for c in range(8):
            color = self.BOARD_COLORS[0][c]
            self.board[0][c] = (1, color)
            color2 = self.BOARD_COLORS[7][c]
            self.board[7][c] = (2, color2)

        # The color constraint: which color tower must be moved next
        # None means free choice (first move or deadlock)
        self.must_move_color = None

        # Track if this is the very first move of the game
        self.first_move = True

        # Sumo variation state
        if self.variation == "sumo":
            # sumo_level tracks how many times each tower has won a round
            # A tower with sumo_level >= 1 can push opponent towers
            self.sumo_levels = {1: {c: 0 for c in self.COLORS},
                                2: {c: 0 for c in self.COLORS}}
            self.round_wins = {1: 0, 2: 0}
            self.current_round = 1
        else:
            self.sumo_levels = None
            self.round_wins = None
            self.current_round = 1

    def _find_tower(self, player, color):
        """Find the position (row, col) of a player's tower of the given color."""
        for r in range(8):
            for c in range(8):
                if self.board[r][c] == (player, color):
                    return (r, c)
        return None

    def _get_forward_direction(self, player):
        """Return the row direction for 'forward' movement.

        Player 1 starts at row 0, moves toward row 7 (forward = +1).
        Player 2 starts at row 7, moves toward row 0 (forward = -1).
        """
        return 1 if player == 1 else -1

    def _get_legal_moves_for_tower(self, player, color):
        """Get all legal destination squares for a specific tower.

        Towers move forward only: straight ahead or diagonally forward,
        any number of squares. Cannot jump over pieces.
        """
        pos = self._find_tower(player, color)
        if pos is None:
            return []

        r, c = pos
        forward = self._get_forward_direction(player)
        moves = []

        # Three forward directions: straight, diagonal-left, diagonal-right
        directions = [
            (forward, 0),   # straight ahead
            (forward, -1),  # diagonal forward-left
            (forward, 1),   # diagonal forward-right
        ]

        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            while 0 <= nr < 8 and 0 <= nc < 8:
                if self.board[nr][nc] is not None:
                    # In sumo mode, check if we can push
                    if (self.variation == "sumo" and
                            self.board[nr][nc][0] != player and
                            self.sumo_levels[player][color] >= 1 and
                            dc == 0):
                        # Sumo push: can push opponent backward one space
                        # Only straight ahead, and only if the square behind
                        # the opponent is empty or off-board (pushed off = removed)
                        push_r = nr + forward
                        if push_r < 0 or push_r >= 8:
                            # Push off the board - this counts as a valid move
                            moves.append((nr, nc, 'push_off'))
                        elif self.board[push_r][nc] is None:
                            moves.append((nr, nc, 'push'))
                    break  # blocked by a piece
                moves.append((nr, nc))
                nr += dr
                nc += dc

        return moves

    def _has_any_legal_move(self, player):
        """Check if any of this player's towers can move."""
        for color in self.COLORS:
            if self._find_tower(player, color) is not None:
                if self._get_legal_moves_for_tower(player, color):
                    return True
        return False

    def _tower_can_move(self, player, color):
        """Check if a specific tower has legal moves."""
        return len(self._get_legal_moves_for_tower(player, color)) > 0

    def display(self):
        """Display the board with colored squares and towers."""
        var_label = "Standard" if self.variation == "standard" else "Sumo"
        print(f"\n  === Kamisado ({var_label}) ===")
        print(f"  {self.players[0]} (\u25b2) vs {self.players[1]} (\u25bc)")

        if self.variation == "sumo":
            print(f"  Round {self.current_round} | "
                  f"Score: {self.round_wins[1]} - {self.round_wins[2]}")

        if self.first_move:
            print(f"  {self.players[self.current_player - 1]}: choose any tower")
        elif self.must_move_color is not None:
            cname = self.COLOR_NAMES[self.must_move_color]
            if self._tower_can_move(self.current_player, self.must_move_color):
                print(f"  Must move: {cname} tower")
            else:
                print(f"  {cname} tower is blocked! Free choice")
        else:
            print(f"  Free choice (constrained tower blocked)")

        print()
        print("     a   b   c   d   e   f   g   h")

        for r in range(8):
            row_str = f"  {r + 1} "
            for c in range(8):
                sq_color = self.BOARD_COLORS[r][c]
                piece = self.board[r][c]
                if piece is not None:
                    player, tower_color = piece
                    symbol = "\u25b2" if player == 1 else "\u25bc"
                    # Show sumo towers with a special marker
                    if (self.variation == "sumo" and
                            self.sumo_levels[player][tower_color] >= 1):
                        symbol = "\u25a0" if player == 1 else "\u25a1"
                    row_str += f"[{symbol}{tower_color}]"
                else:
                    row_str += f"[ {sq_color}]"
            print(row_str)

        print()

    def switch_player(self):
        """Switch to the next player, handling the pass mechanic.

        In Kamisado, after a move the color constraint determines which
        opponent tower must move. If that tower has no legal moves, the
        turn passes back to the current player with free choice.
        """
        next_player = 2 if self.current_player == 1 else 1

        if self.must_move_color is not None:
            if not self._tower_can_move(next_player, self.must_move_color):
                # The constrained tower cannot move. The turn passes back
                # to the current player who gets free choice.
                self.must_move_color = None
                # Do NOT switch player - current player goes again
                return

        self.current_player = next_player

    def get_move(self):
        """Get a move from the current player.

        If a specific tower is constrained (must_move_color is set and that
        tower can move), ask for destination only: 'row col' (e.g., '4 c').
        If free choice (first move or constrained tower blocked), ask for
        full move: 'piece_row piece_col dest_row dest_col' (e.g., '1 a 4 a').
        """
        player = self.current_player
        free_choice = False

        if self.first_move:
            free_choice = True
        elif self.must_move_color is not None:
            if not self._tower_can_move(player, self.must_move_color):
                free_choice = True
            else:
                free_choice = False
        else:
            free_choice = True

        if free_choice:
            prompt = (f"  {self.players[player - 1]}, pick tower and destination "
                      f"(row col row col, e.g. '1 a 4 a'): ")
            move_str = input_with_quit(prompt)
            parts = move_str.strip().split()
            if len(parts) != 4:
                return None

            try:
                src_row = int(parts[0]) - 1
                src_col = self.COL_LABELS.index(parts[1].lower())
                dst_row = int(parts[2]) - 1
                dst_col = self.COL_LABELS.index(parts[3].lower())
            except (ValueError, IndexError):
                return None

            if not (0 <= src_row < 8 and 0 <= src_col < 8 and
                    0 <= dst_row < 8 and 0 <= dst_col < 8):
                return None

            return ('free', src_row, src_col, dst_row, dst_col)
        else:
            color_name = self.COLOR_NAMES[self.must_move_color]
            pos = self._find_tower(player, self.must_move_color)
            if pos is None:
                return None
            prompt = (f"  {self.players[player - 1]}, move {color_name} tower "
                      f"(at {pos[0]+1} {self.COL_LABELS[pos[1]]}) "
                      f"to (row col, e.g. '4 c'): ")
            move_str = input_with_quit(prompt)
            parts = move_str.strip().split()
            if len(parts) != 2:
                return None

            try:
                dst_row = int(parts[0]) - 1
                dst_col = self.COL_LABELS.index(parts[1].lower())
            except (ValueError, IndexError):
                return None

            if not (0 <= dst_row < 8 and 0 <= dst_col < 8):
                return None

            return ('constrained', dst_row, dst_col)

    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        if move is None:
            return False

        player = self.current_player

        if move[0] == 'free':
            _, src_row, src_col, dst_row, dst_col = move
            piece = self.board[src_row][src_col]
            if piece is None or piece[0] != player:
                return False
            tower_color = piece[1]

            # Verify the chosen tower can actually move
            if not self._tower_can_move(player, tower_color):
                return False

        elif move[0] == 'constrained':
            _, dst_row, dst_col = move
            tower_color = self.must_move_color
            pos = self._find_tower(player, tower_color)
            if pos is None:
                return False
            src_row, src_col = pos
        else:
            return False

        # Validate the move is legal for this tower
        legal = self._get_legal_moves_for_tower(player, tower_color)
        # Check if destination is in legal moves
        move_entry = None
        for m in legal:
            if m[0] == dst_row and m[1] == dst_col:
                move_entry = m
                break

        if move_entry is None:
            return False

        # Execute the move
        # Handle sumo push
        if len(move_entry) == 3:
            pushed_piece = self.board[dst_row][dst_col]
            forward = self._get_forward_direction(player)
            push_target_r = dst_row + forward
            if move_entry[2] == 'push_off':
                # Opponent tower pushed off the board - removed
                self.board[dst_row][dst_col] = None
            elif move_entry[2] == 'push':
                # Push opponent tower back one space
                self.board[push_target_r][dst_col] = pushed_piece
                self.board[dst_row][dst_col] = None

        self.board[src_row][src_col] = None
        self.board[dst_row][dst_col] = (player, tower_color)

        # Update the color constraint for the next player
        landed_color = self.BOARD_COLORS[dst_row][dst_col]
        self.must_move_color = landed_color
        self.first_move = False

        return True

    def check_game_over(self):
        """Check if a player has reached the opponent's home row."""
        # Player 1 wins by reaching row 7 (Player 2's home row)
        for c in range(8):
            piece = self.board[7][c]
            if piece is not None and piece[0] == 1:
                self._handle_round_win(1, piece[1])
                return

        # Player 2 wins by reaching row 0 (Player 1's home row)
        for c in range(8):
            piece = self.board[0][c]
            if piece is not None and piece[0] == 2:
                self._handle_round_win(2, piece[1])
                return

        # Check for deadlock: if the next player's constrained tower can't
        # move AND no other tower can move either, the last player to move wins.
        next_player = 2 if self.current_player == 1 else 1
        if not self._has_any_legal_move(next_player):
            # Next player completely stuck - current player wins
            self._handle_round_win(self.current_player, None)
            return

    def _handle_round_win(self, winner, winning_color):
        """Handle a round being won."""
        if self.variation == "sumo":
            self.round_wins[winner] += 1
            if winning_color is not None:
                self.sumo_levels[winner][winning_color] += 1

            if self.round_wins[winner] >= 2:
                # Won best of 3
                self.game_over = True
                self.winner = winner
            else:
                # Start a new round
                self.current_round += 1
                self._reset_board_for_new_round(winner)
        else:
            self.game_over = True
            self.winner = winner

    def _reset_board_for_new_round(self, last_winner):
        """Reset the board for a new round in sumo mode."""
        self.board = [[None] * 8 for _ in range(8)]

        for c in range(8):
            color = self.BOARD_COLORS[0][c]
            self.board[0][c] = (1, color)
            color2 = self.BOARD_COLORS[7][c]
            self.board[7][c] = (2, color2)

        self.must_move_color = None
        self.first_move = True
        # The loser of the previous round goes first
        self.current_player = 2 if last_winner == 1 else 1

    def get_state(self):
        """Return serializable game state for saving."""
        # Serialize the board
        serial_board = []
        for r in range(8):
            row = []
            for c in range(8):
                piece = self.board[r][c]
                if piece is None:
                    row.append(None)
                else:
                    row.append([piece[0], piece[1]])
            serial_board.append(row)

        state = {
            "board": serial_board,
            "must_move_color": self.must_move_color,
            "first_move": self.first_move,
            "current_round": self.current_round,
        }

        if self.variation == "sumo":
            state["sumo_levels"] = {
                str(p): dict(levels) for p, levels in self.sumo_levels.items()
            }
            state["round_wins"] = {
                str(p): w for p, w in self.round_wins.items()
            }

        return state

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = [[None] * 8 for _ in range(8)]
        for r in range(8):
            for c in range(8):
                cell = state["board"][r][c]
                if cell is not None:
                    self.board[r][c] = (cell[0], cell[1])

        self.must_move_color = state["must_move_color"]
        self.first_move = state["first_move"]
        self.current_round = state.get("current_round", 1)

        if self.variation == "sumo":
            self.sumo_levels = {
                int(p): dict(levels)
                for p, levels in state.get("sumo_levels", {}).items()
            }
            self.round_wins = {
                int(p): w for p, w in state.get("round_wins", {}).items()
            }
        else:
            self.sumo_levels = None
            self.round_wins = None

    def get_tutorial(self):
        """Return tutorial text for Kamisado."""
        return """
==================================================
  KAMISADO - Tutorial
==================================================

  OVERVIEW
  --------
  Kamisado is an abstract strategy game for two
  players on an 8x8 board of colored squares.
  Each player controls 8 towers, one of each
  color. The goal is to move one of your towers
  to your opponent's home row.

  THE BOARD
  ---------
  The board has 64 squares in 8 colors arranged
  in a fixed pattern. Each row and column
  contains exactly one square of each color.

  The standard board layout:

     a   b   c   d   e   f   g   h
  1 [ O][ B][ P][ Y][ R][ G][ N][ W]
  2 [ W][ O][ B][ P][ Y][ R][ G][ N]
  3 [ N][ W][ O][ B][ P][ Y][ R][ G]
  4 [ G][ N][ W][ O][ B][ P][ Y][ R]
  5 [ R][ G][ N][ W][ O][ B][ P][ Y]
  6 [ Y][ R][ G][ N][ W][ O][ B][ P]
  7 [ P][ Y][ R][ G][ N][ W][ O][ B]
  8 [ B][ P][ Y][ R][ G][ N][ W][ O]

  Colors: O=Orange, B=Brown, P=Purple, Y=Yellow,
          R=Red, G=Green, N=Navy, W=White

  SETUP
  -----
  Player 1 (shown as triangles pointing up)
  places 8 towers on row 1 (top). Each tower
  matches the color of the square it starts on.

  Player 2 (shown as triangles pointing down)
  places 8 towers on row 8 (bottom), similarly
  matching the square colors.

  MOVEMENT
  --------
  Towers move in straight lines FORWARD only
  (toward the opponent's home row):
    - Straight ahead (like a rook, but forward)
    - Diagonally forward-left
    - Diagonally forward-right

  A tower can move any number of squares in one
  of these three directions, but it CANNOT jump
  over other pieces (friendly or opponent).

  Player 1's towers move downward (row 1 -> 8).
  Player 2's towers move upward (row 8 -> 1).

  THE KEY MECHANIC
  ----------------
  After the first move, you do NOT get to choose
  which tower to move. Instead, the COLOR of the
  SQUARE your opponent just landed on determines
  which of YOUR towers you must move.

  Example: If your opponent moves a tower and it
  lands on a Red square, you MUST move YOUR Red
  tower on your turn.

  FIRST MOVE
  ----------
  On the very first move of the game, Player 1
  may choose any of their 8 towers to move.

  BLOCKED TOWERS
  --------------
  If the tower you must move has no legal moves
  (it is completely blocked), your opponent gets
  another turn instead. They may choose any of
  their towers that can move, and the color
  constraint passes back to you based on where
  they land.

  If neither player can move at all, the last
  player who made a move wins the game.

  WINNING
  -------
  The first player to move one of their towers
  to the opponent's home row wins the game.
  - Player 1 wins by reaching row 8.
  - Player 2 wins by reaching row 1.

  MOVE INPUT
  ----------
  When your tower is determined by the color
  constraint, enter just the destination:
    row col    (e.g., "4 c")

  When you have a free choice (first move or
  when the constrained tower is blocked), enter
  the source and destination:
    src_row src_col dst_row dst_col
    (e.g., "1 a 4 a")

  Rows are numbered 1-8 (top to bottom).
  Columns are labeled a-h (left to right).

  SUMO VARIATION
  --------------
  In Sumo Kamisado, the game is played as a
  best-of-3 match. When you win a round, the
  tower that reached the opponent's home row
  becomes a "sumo" tower (shown with a square
  symbol). Sumo towers can push an opponent's
  tower backward one space when moving straight
  ahead into it (not diagonally). The pushed
  tower slides back one square. If there is no
  room behind, the tower is pushed off the board
  and removed from play.

  The loser of each round gets to move first in
  the next round. Sumo levels are preserved
  across rounds, so a tower can become even
  stronger by winning multiple rounds.

  STRATEGY TIPS
  -------------
  - Think about which color square you land on!
    Landing on a color whose opponent tower is
    well-positioned gives your opponent a strong
    move.
  - Try to force your opponent to land on colors
    that give you good moves.
  - Block your opponent's towers by positioning
    your pieces in their path.
  - In the opening, consider which towers to
    advance and which to hold back as blockers.
  - In Sumo mode, earning sumo towers early can
    give you a significant pushing advantage in
    later rounds.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
