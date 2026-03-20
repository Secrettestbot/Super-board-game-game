"""DVONN - Stacking game from the GIPF project series."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


# Piece colors
WHITE = 'W'
BLACK = 'B'
DVONN = 'R'  # Red DVONN pieces


# Hex directions for the elongated hex board.
# Using offset coordinates where even rows are flush left and odd rows shift right.
# Directions depend on whether the row is even or odd.
# We use axial-style addressing: (row, col) with row 0..4 and col 0..max_col_for_row.
# For an elongated hex board, the six neighbor directions are:
#   For even rows: NW=(-1,-1), NE=(-1,0), W=(0,-1), E=(0,1), SW=(1,-1), SE=(1,0)
#   For odd rows:  NW=(-1,0), NE=(-1,1), W=(0,-1), E=(0,1), SW=(1,0), SE=(1,1)

def _hex_neighbors(row, col, row_offsets):
    """Return the six hex neighbors of (row, col) on the elongated hex board.

    row_offsets: dict mapping row -> starting column offset for that row.
    We use offset hex coordinates where the offset for each row determines
    the neighbor calculation.
    """
    neighbors = []
    # Determine if this row is "shifted" relative to the row above/below
    my_offset = row_offsets.get(row, 0)

    # Same row neighbors
    neighbors.append((row, col - 1))  # West
    neighbors.append((row, col + 1))  # East

    # Row above (row - 1) and row below (row + 1)
    for dr in [-1, 1]:
        nr = row + dr
        if nr not in row_offsets:
            continue
        neighbor_offset = row_offsets[nr]
        # The offset difference determines which columns are adjacent
        diff = my_offset - neighbor_offset
        # The two neighbors in the adjacent row
        neighbors.append((nr, col + diff))
        neighbors.append((nr, col + diff - 1))

    return neighbors


def _coord_to_label(row, col):
    """Convert (row, col) to a human-readable label like 'a1'."""
    return f"{chr(ord('a') + col)}{row + 1}"


def _label_to_coord(label):
    """Convert a label like 'a1' to (row, col). Returns None if invalid."""
    label = label.strip().lower()
    if len(label) < 2:
        return None
    col_part = ""
    row_part = ""
    for ch in label:
        if ch.isalpha():
            col_part += ch
        else:
            row_part += ch
    if len(col_part) != 1 or not row_part.isdigit():
        return None
    col = ord(col_part) - ord('a')
    row = int(row_part) - 1
    return (row, col)


class DvonnGame(BaseGame):
    """DVONN: A stacking game from the GIPF project series."""

    name = "DVONN"
    description = "Stacking game: move stacks, stay connected to DVONN pieces, control the most pieces"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard DVONN (49 spaces)",
        "quick": "Quick DVONN (smaller board, 2 DVONN pieces)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board = {}          # (row, col) -> list of pieces, bottom to top, e.g. ['W','R','B']
        self.valid_positions = set()
        self.row_lengths = []    # length of each row
        self.row_offsets = {}    # row -> column offset for hex neighbor calc
        self.num_rows = 0
        self.phase = 'placement'  # 'placement' or 'stacking'
        self.placement_step = 0   # which placement step we're on (0-indexed)
        self.num_dvonn = 0        # how many DVONN pieces total
        self.num_player_pieces = 0  # pieces per player
        self.passed = {1: False, 2: False}  # track consecutive passes

    def _init_board(self):
        """Initialize the board geometry."""
        if self.variation == "quick":
            self.row_lengths = [5, 6, 7, 6, 5]
            self.num_dvonn = 2
            self.num_player_pieces = 13  # (29 - 2) / 2 = 13.5 -> use 13 + 14? No: 29 - 2 = 27, not even.
            # Actually 29 - 2 = 27, which is odd. We need an odd total for alternating placement.
            # Use 2 DVONN + 13 white + 14 black = 29. But that's uneven.
            # Better: 3 DVONN on quick too would give 29-3=26, 13 each. But spec says 2.
            # With 2 DVONN: 27 player pieces. Player 1 gets 14, Player 2 gets 13.
            # Actually let's just make it work: 29 spaces, 2 DVONN, 14 white, 13 black = 29.
            # Player who goes first (white) gets the extra piece.
            self.num_player_pieces = 0  # handled specially
            self._p1_pieces = 14
            self._p2_pieces = 13
        else:
            self.row_lengths = [9, 10, 11, 10, 9]
            self.num_dvonn = 3
            self.num_player_pieces = 23
            self._p1_pieces = 23
            self._p2_pieces = 23

        self.num_rows = len(self.row_lengths)

        # Compute row offsets for the elongated hex board.
        # The widest row is the middle one. Each row above/below is shifted.
        # Offset = how many positions the row is indented from the left.
        max_len = max(self.row_lengths)
        self.row_offsets = {}
        for r, length in enumerate(self.row_lengths):
            # Center each row relative to the widest
            # For hex: the offset determines neighbor alignment
            # In a standard elongated hex, rows alternate alignment
            # Rows: 0->9, 1->10, 2->11, 3->10, 4->9
            # Offset pattern: row 0 offset 1, row 1 offset 1, row 2 offset 0, row 3 offset 0, row 4 offset 0
            # Actually for the DVONN board shape, let's use:
            # The board is like a squished hexagon. Offsets for neighbor calculation:
            self.row_offsets[r] = (max_len - length + 1) // 2

        self.valid_positions = set()
        for r in range(self.num_rows):
            for c in range(self.row_lengths[r]):
                self.valid_positions.add((r, c))

    def setup(self):
        """Initialize the board for the placement phase."""
        self._init_board()
        self.board = {}  # empty board, pieces placed during placement phase
        self.phase = 'placement'
        self.placement_step = 0
        self.passed = {1: False, 2: False}

    def _get_neighbors(self, row, col):
        """Get valid neighboring positions of (row, col)."""
        raw = _hex_neighbors(row, col, self.row_offsets)
        return [(r, c) for r, c in raw if (r, c) in self.valid_positions]

    def _is_connected_to_dvonn(self):
        """Find all positions connected to at least one DVONN piece.

        Returns the set of connected positions.
        """
        # Find all stacks containing a DVONN piece
        dvonn_positions = set()
        for pos, stack in self.board.items():
            if DVONN in stack:
                dvonn_positions.add(pos)

        if not dvonn_positions:
            return set()

        # BFS from all DVONN positions
        visited = set()
        queue = deque(dvonn_positions)
        visited.update(dvonn_positions)

        while queue:
            r, c = queue.popleft()
            for nr, nc in self._get_neighbors(r, c):
                if (nr, nc) in self.board and (nr, nc) not in visited:
                    visited.add((nr, nc))
                    queue.append((nr, nc))

        return visited

    def _remove_disconnected(self):
        """Remove all stacks not connected to a DVONN piece."""
        connected = self._is_connected_to_dvonn()
        to_remove = [pos for pos in self.board if pos not in connected]
        for pos in to_remove:
            del self.board[pos]
        return len(to_remove) > 0

    def _get_valid_moves(self, player):
        """Get all valid moves for the given player in stacking phase.

        Returns a list of (from_pos, to_pos) tuples.
        """
        piece = WHITE if player == 1 else BLACK
        moves = []

        for pos, stack in self.board.items():
            if not stack:
                continue
            # A stack is controlled by whoever's piece is on top
            top = stack[-1]
            if top != piece:
                continue

            height = len(stack)
            # Try all 6 hex directions, move exactly 'height' steps
            for nr, nc in self._get_neighbors(pos[0], pos[1]):
                # Determine direction from pos to (nr, nc)
                dr = nr - pos[0]
                dc = nc - pos[1]
                # Move 'height' steps in this direction
                dest_r = pos[0] + dr * height
                dest_c = pos[1] + dc * height

                # But we need to account for hex offset changes across rows.
                # Moving multiple steps in a hex grid with offset coords is tricky.
                # Instead, step one hex at a time in the same direction.
                dest = self._step_in_direction(pos, (dr, dc), height)
                if dest is None:
                    continue

                # Must land on an occupied space
                if dest in self.board and len(self.board[dest]) > 0:
                    moves.append((pos, dest))

        return moves

    def _step_in_direction(self, start, direction, steps):
        """Take 'steps' steps from start in the given hex direction.

        direction is (dr, dc) representing a single step from start to a neighbor.
        However, in offset coordinates, the actual column offset changes depending
        on the row. So we need to step one at a time.

        Returns the final position, or None if any intermediate step goes off the board.
        """
        r, c = start
        init_dr, init_dc = direction

        # We need to figure out which of the 6 canonical directions this corresponds to.
        # Then apply that same canonical direction repeatedly.
        # The canonical directions are defined relative to the offset system.
        # Let's identify the direction index from the first step.
        neighbors = _hex_neighbors(r, c, self.row_offsets)
        target_first = (r + init_dr, c + init_dc)

        # Find which direction index this is
        dir_idx = None
        for i, n in enumerate(neighbors):
            if n == target_first:
                dir_idx = i
                break

        if dir_idx is None:
            return None

        # Now step 'steps' times using the same direction index
        cr, cc = r, c
        for _ in range(steps):
            nbrs = _hex_neighbors(cr, cc, self.row_offsets)
            if dir_idx >= len(nbrs):
                return None
            cr, cc = nbrs[dir_idx]
            if (cr, cc) not in self.valid_positions:
                return None

        return (cr, cc)

    def _count_pieces(self, player):
        """Count total pieces controlled by player (pieces in stacks they control)."""
        piece = WHITE if player == 1 else BLACK
        count = 0
        for pos, stack in self.board.items():
            if stack and stack[-1] == piece:
                count += len(stack)
        return count

    def display(self):
        """Display the board."""
        var_label = "Standard" if self.variation == "standard" else "Quick"
        print(f"\n  === DVONN ({var_label}) ===")
        p1_label = f"{self.players[0]} (W)"
        p2_label = f"{self.players[1]} (B)"

        if self.phase == 'placement':
            phase_str = "Placement"
            total = self.num_dvonn + self._p1_pieces + self._p2_pieces
            placed = self.placement_step
            print(f"  {p1_label} vs {p2_label}  |  Phase: {phase_str} ({placed}/{total} placed)")
        else:
            phase_str = "Stacking"
            p1_count = self._count_pieces(1)
            p2_count = self._count_pieces(2)
            print(f"  {p1_label}: {p1_count} pieces  vs  {p2_label}: {p2_count} pieces  |  Phase: {phase_str}")

        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        print()

        # Column headers
        max_len = max(self.row_lengths)

        # Build display
        # Show column letters for the widest row
        header = "     "
        for c in range(max_len):
            header += f" {chr(ord('a') + c)}  "
        print(header)

        for r in range(self.num_rows):
            offset = self.row_offsets.get(r, 0)
            row_str = f"  {r + 1}: "
            row_str += "  " * offset  # indent for hex offset

            for c in range(self.row_lengths[r]):
                pos = (r, c)
                if pos in self.board and self.board[pos]:
                    stack = self.board[pos]
                    top = stack[-1]
                    height = len(stack)
                    if height > 1:
                        cell = f"{top}{height}"
                        # Pad to 3 chars
                        cell = cell.ljust(3)
                    else:
                        cell = f" {top} "
                else:
                    if (r, c) in self.valid_positions:
                        cell = " .  " if self.phase == 'placement' else "    "
                    else:
                        cell = "    "
                row_str += cell + " " if len(cell) < 4 else cell

            print(row_str)

        print()
        print("  Legend: W=White  B=Black  R=DVONN(red)  W3=White stack height 3")
        if self.phase == 'placement':
            print("  Enter a position to place a piece (e.g. 'c3')")
        else:
            print("  Enter move as 'from to' (e.g. 'c3 e3')")
        print()

    def get_move(self):
        """Get a move from the current player."""
        player = self.current_player
        name = self.players[player - 1]

        if self.phase == 'placement':
            return self._get_placement_move(name, player)
        else:
            return self._get_stacking_move(name, player)

    def _get_placement_move(self, name, player):
        """Get a placement move."""
        # Determine what piece is being placed
        total_dvonn = self.num_dvonn
        if self.placement_step < total_dvonn:
            piece_type = DVONN
            piece_label = "DVONN (R)"
        else:
            piece_type = WHITE if player == 1 else BLACK
            piece_label = "White (W)" if player == 1 else "Black (B)"

        while True:
            raw = input_with_quit(
                f"  {name}, place a {piece_label} piece (e.g. 'c3'): "
            ).strip()
            coord = _label_to_coord(raw)
            if coord is None:
                print("  Invalid format. Use letter+number (e.g. 'c3').")
                continue
            if coord not in self.valid_positions:
                print("  That position is not on the board.")
                continue
            if coord in self.board:
                print("  That position is already occupied.")
                continue
            return ('place', coord, piece_type)

    def _get_stacking_move(self, name, player):
        """Get a stacking phase move."""
        valid_moves = self._get_valid_moves(player)
        if not valid_moves:
            print(f"  {name} has no valid moves. Passing.")
            input_with_quit("  Press Enter to continue...")
            return ('pass',)

        while True:
            raw = input_with_quit(
                f"  {name}, enter move (e.g. 'c3 e3'): "
            ).strip()
            parts = raw.split()
            if len(parts) != 2:
                print("  Enter two positions separated by space (e.g. 'c3 e3').")
                continue

            from_coord = _label_to_coord(parts[0])
            to_coord = _label_to_coord(parts[1])

            if from_coord is None or to_coord is None:
                print("  Invalid position format. Use letter+number (e.g. 'c3').")
                continue

            if from_coord not in self.board or not self.board.get(from_coord):
                print("  No stack at that position.")
                continue

            piece = WHITE if player == 1 else BLACK
            stack = self.board[from_coord]
            if stack[-1] != piece:
                print(f"  You don't control that stack. Top piece is {stack[-1]}.")
                continue

            if (from_coord, to_coord) not in valid_moves:
                height = len(stack)
                print(f"  Invalid move. Stack height is {height}, must move exactly {height} "
                      f"spaces in a straight line onto another stack.")
                continue

            return ('move', from_coord, to_coord)

    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        if move[0] == 'pass':
            self.passed[self.current_player] = True
            return True

        if move[0] == 'place':
            _, pos, piece_type = move
            if pos in self.board:
                return False
            if pos not in self.valid_positions:
                return False
            self.board[pos] = [piece_type]
            self.placement_step += 1

            # Check if placement phase is over
            total = self.num_dvonn + self._p1_pieces + self._p2_pieces
            if self.placement_step >= total:
                self.phase = 'stacking'

            return True

        if move[0] == 'move':
            _, from_pos, to_pos = move
            player = self.current_player
            piece = WHITE if player == 1 else BLACK

            if from_pos not in self.board or not self.board[from_pos]:
                return False
            if self.board[from_pos][-1] != piece:
                return False

            valid_moves = self._get_valid_moves(player)
            if (from_pos, to_pos) not in valid_moves:
                return False

            # Move the stack
            moving_stack = self.board.pop(from_pos)
            if to_pos not in self.board:
                return False
            self.board[to_pos] = self.board[to_pos] + moving_stack

            # Remove disconnected stacks
            self._remove_disconnected()

            # Reset pass tracking since a move was made
            self.passed = {1: False, 2: False}

            return True

        return False

    def switch_player(self):
        """Switch player, handling placement phase logic."""
        if self.phase == 'placement' and self.placement_step <= self.num_dvonn:
            # During DVONN piece placement, alternate normally
            super().switch_player()
        else:
            super().switch_player()

    def check_game_over(self):
        """Check if the game is over."""
        if self.phase == 'placement':
            return

        # If current player just passed, check if the other player can move
        # Game ends when neither player can move
        p1_moves = self._get_valid_moves(1)
        p2_moves = self._get_valid_moves(2)

        if not p1_moves and not p2_moves:
            self.game_over = True
            p1_count = self._count_pieces(1)
            p2_count = self._count_pieces(2)
            if p1_count > p2_count:
                self.winner = 1
            elif p2_count > p1_count:
                self.winner = 2
            else:
                self.winner = None  # Draw

    def get_state(self):
        """Return serializable game state for saving."""
        # Convert board to serializable format
        board_data = {}
        for (r, c), stack in self.board.items():
            board_data[f"{r},{c}"] = stack

        return {
            'board': board_data,
            'valid_positions': [list(p) for p in sorted(self.valid_positions)],
            'row_lengths': self.row_lengths,
            'row_offsets': {str(k): v for k, v in self.row_offsets.items()},
            'num_rows': self.num_rows,
            'phase': self.phase,
            'placement_step': self.placement_step,
            'num_dvonn': self.num_dvonn,
            'num_player_pieces': self.num_player_pieces,
            'p1_pieces': self._p1_pieces,
            'p2_pieces': self._p2_pieces,
            'passed': {str(k): v for k, v in self.passed.items()},
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = {}
        for key, stack in state['board'].items():
            parts = key.split(',')
            self.board[(int(parts[0]), int(parts[1]))] = stack

        self.valid_positions = set(tuple(p) for p in state['valid_positions'])
        self.row_lengths = state['row_lengths']
        self.row_offsets = {int(k): v for k, v in state['row_offsets'].items()}
        self.num_rows = state['num_rows']
        self.phase = state['phase']
        self.placement_step = state['placement_step']
        self.num_dvonn = state['num_dvonn']
        self.num_player_pieces = state['num_player_pieces']
        self._p1_pieces = state['p1_pieces']
        self._p2_pieces = state['p2_pieces']
        self.passed = {int(k): v for k, v in state['passed'].items()}

    def get_tutorial(self):
        """Return tutorial text for DVONN."""
        return """
==============================================================
                    DVONN TUTORIAL
==============================================================

OVERVIEW
  DVONN is a stacking game from the GIPF project series,
  designed by Kris Burm. Two players compete to control the
  most pieces on an elongated hexagonal board by building
  and capturing stacks while maintaining connection to
  special DVONN pieces.

--------------------------------------------------------------
THE BOARD
--------------------------------------------------------------
  Standard: An elongated hexagonal board with 49 intersections
  arranged in 5 rows (9, 10, 11, 10, 9 spaces).

  Quick: A smaller board with 29 intersections arranged in
  5 rows (5, 6, 7, 6, 5 spaces).

  Positions are named with a letter (column) and number (row),
  e.g. 'c3' means column c, row 3.

--------------------------------------------------------------
PHASE 1: PLACEMENT
--------------------------------------------------------------
  Players take turns placing pieces one at a time onto empty
  spaces on the board:

  1. First, the DVONN pieces (red, marked 'R') are placed.
     Standard: 3 DVONN pieces. Quick: 2 DVONN pieces.
     Players alternate placing these.

  2. Then, players alternate placing their own colored pieces
     (White 'W' and Black 'B') until all spaces are filled.
     Standard: 23 white + 23 black = 46 player pieces.
     Quick: 14 white + 13 black = 27 player pieces.

  Every space on the board must be filled before the stacking
  phase begins.

--------------------------------------------------------------
PHASE 2: STACKING
--------------------------------------------------------------
  Players take turns moving stacks:

  MOVING:
  - You control a stack if YOUR piece is on top.
  - A stack moves in a straight line (one of 6 hex directions).
  - It moves exactly as many spaces as the stack is tall:
    * A single piece moves 1 space.
    * A stack of 3 moves exactly 3 spaces.
  - The stack MUST land on another occupied space (you cannot
    move to an empty space).
  - The moving stack is placed on top of the destination stack,
    creating a taller combined stack.

  CONNECTION RULE:
  - After each move, any stack that is NOT connected to at
    least one DVONN piece (through a chain of adjacent
    occupied spaces) is immediately removed from the game.
  - This is the key strategic element: you can isolate and
    eliminate your opponent's stacks!

  PASSING:
  - If you have no valid moves, you must pass.
  - The game ends when neither player can move.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  When the game ends, each player counts the total number of
  pieces in all stacks they control (where their piece is on
  top). The player with more pieces wins.

  Note: DVONN pieces count toward the total! If you control
  a stack containing DVONN pieces, those count for you.

--------------------------------------------------------------
DISPLAY
--------------------------------------------------------------
  The board shows pieces with their colors:
    W  = White piece (Player 1)
    B  = Black piece (Player 2)
    R  = DVONN piece (red, neutral)
    .  = Empty space (placement phase only)

  When stacks are taller than 1, the height is shown:
    W3 = Stack of 3 with White on top
    B5 = Stack of 5 with Black on top
    R2 = Stack of 2 with DVONN on top

--------------------------------------------------------------
INPUT FORMAT
--------------------------------------------------------------
  Placement phase:
    Enter a position: c3

  Stacking phase:
    Enter from and to positions: c3 e3

  Coordinates use letter for column, number for row.
  Row 1 is at the top, columns start from 'a' on the left.

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Place DVONN pieces centrally so they're hard to isolate.
  - During placement, think ahead to the stacking phase.
  - Tall stacks are powerful (move far) but inflexible.
  - Single pieces are vulnerable but highly mobile.
  - Disconnecting opponent stacks from DVONN pieces is the
    primary way to gain advantage.
  - Control DVONN pieces! If your piece is on top of a DVONN
    piece's stack, that connection point is secure.
  - In the endgame, focus on consolidating your stacks while
    trying to isolate your opponent's.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
