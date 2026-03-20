"""DVONN - Stacking game from the GIPF project series."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


# Piece colors
WHITE = 'W'
BLACK = 'B'
DVONN = 'R'  # Red DVONN pieces


# Six canonical hex direction indices (used for consistent straight-line movement).
# We define directions abstractly and compute actual neighbor offsets per row parity.
# Direction 0: East       (same row, col+1)
# Direction 1: West       (same row, col-1)
# Direction 2: NE         (row above, right neighbor)
# Direction 3: NW         (row above, left neighbor)
# Direction 4: SE         (row below, right neighbor)
# Direction 5: SW         (row below, left neighbor)

# For even-offset rows (offset=0 or even): row above/below neighbors differ from odd-offset rows.
# We use the row_offsets dict to compute neighbors consistently.


def _hex_neighbors_with_dirs(row, col, row_offsets):
    """Return list of (direction_index, (nr, nc)) for the six hex neighbors.

    direction_index is stable across rows so that stepping in the same
    direction repeatedly produces a straight line on the hex board.

    Directions:
      0: East  (same row, col+1)
      1: West  (same row, col-1)
      2: NE    (row-1, right-side neighbor)
      3: NW    (row-1, left-side neighbor)
      4: SE    (row+1, right-side neighbor)
      5: SW    (row+1, left-side neighbor)
    """
    my_offset = row_offsets.get(row, 0)
    neighbors = []

    # East / West (same row)
    neighbors.append((0, (row, col + 1)))
    neighbors.append((1, (row, col - 1)))

    # Row above (row - 1)
    if (row - 1) in row_offsets:
        above_offset = row_offsets[row - 1]
        diff = my_offset - above_offset
        # The two neighbors in the row above
        neighbors.append((2, (row - 1, col + diff)))      # NE (rightward)
        neighbors.append((3, (row - 1, col + diff - 1)))   # NW (leftward)

    # Row below (row + 1)
    if (row + 1) in row_offsets:
        below_offset = row_offsets[row + 1]
        diff = my_offset - below_offset
        neighbors.append((4, (row + 1, col + diff)))      # SE (rightward)
        neighbors.append((5, (row + 1, col + diff - 1)))   # SW (leftward)

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
        "quick": "Quick DVONN (smaller board, 29 spaces)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board = {}          # (row, col) -> list of pieces bottom-to-top, e.g. ['W','R','B']
        self.valid_positions = set()
        self.row_lengths = []    # length of each row
        self.row_offsets = {}    # row index -> column offset for hex neighbor calc
        self.num_rows = 0
        self.phase = 'placement'  # 'placement' or 'stacking'
        self.placement_step = 0   # which placement step we are on (0-indexed)
        self.num_dvonn = 0        # total DVONN pieces
        self._p1_pieces = 0      # white pieces to place
        self._p2_pieces = 0      # black pieces to place
        self.passed = {1: False, 2: False}  # track consecutive passes

    def _init_board(self):
        """Initialize the board geometry based on variation."""
        if self.variation == "quick":
            self.row_lengths = [5, 6, 7, 6, 5]
            self.num_dvonn = 2
            # 29 total spaces - 2 DVONN = 27 player pieces
            # White (P1) gets 14, Black (P2) gets 13 so all spaces are filled
            self._p1_pieces = 14
            self._p2_pieces = 13
        else:
            self.row_lengths = [9, 10, 11, 10, 9]
            self.num_dvonn = 3
            self._p1_pieces = 23
            self._p2_pieces = 23

        self.num_rows = len(self.row_lengths)

        # Compute row offsets for hex neighbor calculation.
        # The widest row (middle) has offset 0; rows above/below are shifted.
        max_len = max(self.row_lengths)
        self.row_offsets = {}
        for r, length in enumerate(self.row_lengths):
            self.row_offsets[r] = (max_len - length + 1) // 2

        self.valid_positions = set()
        for r in range(self.num_rows):
            for c in range(self.row_lengths[r]):
                self.valid_positions.add((r, c))

    def setup(self):
        """Initialize the board for the placement phase."""
        self._init_board()
        self.board = {}
        self.phase = 'placement'
        self.placement_step = 0
        self.passed = {1: False, 2: False}

    def _get_neighbors(self, row, col):
        """Get valid neighboring positions of (row, col) as a list of (r, c)."""
        return [
            pos for _, pos in _hex_neighbors_with_dirs(row, col, self.row_offsets)
            if pos in self.valid_positions
        ]

    def _get_neighbors_with_dirs(self, row, col):
        """Get valid neighbors with direction indices: list of (dir_idx, (r, c))."""
        return [
            (d, pos) for d, pos in _hex_neighbors_with_dirs(row, col, self.row_offsets)
            if pos in self.valid_positions
        ]

    def _step_in_direction(self, start, direction_idx, steps):
        """Take 'steps' steps from start in the given canonical hex direction.

        Returns the final position, or None if any step goes off the board
        or lands on an invalid position.
        """
        r, c = start
        for _ in range(steps):
            # Get all neighbors with their direction indices
            nbrs = _hex_neighbors_with_dirs(r, c, self.row_offsets)
            # Find the neighbor in the desired direction
            found = False
            for d, (nr, nc) in nbrs:
                if d == direction_idx:
                    if (nr, nc) not in self.valid_positions:
                        return None
                    r, c = nr, nc
                    found = True
                    break
            if not found:
                return None
        return (r, c)

    def _is_connected_to_dvonn(self):
        """Find all positions connected to at least one DVONN piece via BFS.

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
        visited = set(dvonn_positions)
        queue = deque(dvonn_positions)

        while queue:
            r, c = queue.popleft()
            for nr, nc in self._get_neighbors(r, c):
                if (nr, nc) in self.board and (nr, nc) not in visited:
                    visited.add((nr, nc))
                    queue.append((nr, nc))

        return visited

    def _remove_disconnected(self):
        """Remove all stacks not connected to a DVONN piece.

        Returns True if any stacks were removed.
        """
        connected = self._is_connected_to_dvonn()
        to_remove = [pos for pos in self.board if pos not in connected]
        for pos in to_remove:
            del self.board[pos]
        return len(to_remove) > 0

    def _get_valid_moves(self, player):
        """Get all valid moves for the given player in stacking phase.

        A player controls a stack if their piece is on top.
        A stack of height h must move exactly h spaces in a straight line
        and land on another occupied space.

        Returns a list of (from_pos, to_pos) tuples.
        """
        piece = WHITE if player == 1 else BLACK
        moves = []

        for pos, stack in self.board.items():
            if not stack:
                continue
            # Stack is controlled by the piece on top
            if stack[-1] != piece:
                continue

            height = len(stack)
            # Try all 6 hex directions
            for dir_idx, neighbor in self._get_neighbors_with_dirs(pos[0], pos[1]):
                # Move exactly 'height' steps in this direction
                dest = self._step_in_direction(pos, dir_idx, height)
                if dest is None:
                    continue
                # Must land on an occupied space
                if dest in self.board and len(self.board[dest]) > 0:
                    moves.append((pos, dest))

        return moves

    def _count_pieces(self, player):
        """Count total pieces in all stacks controlled by player.

        A stack is controlled by the player whose piece is on top.
        All pieces in that stack count (including opponent and DVONN pieces).
        """
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
            total = self.num_dvonn + self._p1_pieces + self._p2_pieces
            placed = self.placement_step
            print(f"  {p1_label} vs {p2_label}  |  Phase: Placement ({placed}/{total} placed)")
        else:
            p1_count = self._count_pieces(1)
            p2_count = self._count_pieces(2)
            print(f"  {p1_label}: {p1_count} pieces  vs  {p2_label}: {p2_count} pieces  |  Phase: Stacking")

        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        print()

        # Determine the max row length for column header
        max_len = max(self.row_lengths)

        # Column headers
        header = "      "
        for c in range(max_len):
            header += f" {chr(ord('a') + c)}  "
        print(header)

        for r in range(self.num_rows):
            offset = self.row_offsets.get(r, 0)
            row_str = f"  {r + 1}:  "
            row_str += "    " * offset  # indent for hex offset (4 chars per offset)

            for c in range(self.row_lengths[r]):
                pos = (r, c)
                if pos in self.board and self.board[pos]:
                    stack = self.board[pos]
                    top = stack[-1]
                    height = len(stack)
                    if height > 1:
                        cell = f"{top}{height:<2}"
                    else:
                        cell = f" {top} "
                else:
                    if self.phase == 'placement':
                        cell = " .  "
                    else:
                        cell = "    "
                row_str += cell + " " if len(cell) < 4 else cell

            print(row_str)

        print()
        print("  Legend: W=White  B=Black  R=DVONN(red)  W3=White stack height 3")
        if self.phase == 'placement':
            print("  Enter a position to place a piece (e.g. 'c3')")
        else:
            print("  Enter move as 'from to' (e.g. 'c3 e3'), or 'pass' if shown")
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
        """Get a placement move during Phase 1."""
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
        """Get a stacking phase move during Phase 2."""
        valid_moves = self._get_valid_moves(player)
        if not valid_moves:
            print(f"  {name} has no valid moves. Passing.")
            input_with_quit("  Press Enter to continue...")
            return ('pass',)

        while True:
            raw = input_with_quit(
                f"  {name}, enter move 'from to' (e.g. 'c3 e3'): "
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
                print(f"  Invalid move. Stack height is {height}; must move exactly {height} "
                      f"spaces in a straight hex line onto another stack.")
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

            # Move the stack: place moving stack ON TOP of destination stack
            moving_stack = self.board.pop(from_pos)
            if to_pos not in self.board:
                return False
            self.board[to_pos] = self.board[to_pos] + moving_stack

            # Remove stacks disconnected from any DVONN piece
            self._remove_disconnected()

            # Reset pass tracking since a valid move was made
            self.passed = {1: False, 2: False}

            return True

        return False

    def switch_player(self):
        """Switch to the next player, handling placement phase logic."""
        if self.phase == 'placement' and self.placement_step <= self.num_dvonn:
            # During DVONN piece placement, alternate normally
            super().switch_player()
        else:
            super().switch_player()

    def check_game_over(self):
        """Check if the game is over.

        The game ends when neither player can move. The player controlling
        the most total pieces (in stacks where their piece is on top) wins.
        """
        if self.phase == 'placement':
            return

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
        board_data = {}
        for (r, c), stack in self.board.items():
            board_data[f"{r},{c}"] = list(stack)

        return {
            'board': board_data,
            'valid_positions': [list(p) for p in sorted(self.valid_positions)],
            'row_lengths': list(self.row_lengths),
            'row_offsets': {str(k): v for k, v in self.row_offsets.items()},
            'num_rows': self.num_rows,
            'phase': self.phase,
            'placement_step': self.placement_step,
            'num_dvonn': self.num_dvonn,
            'p1_pieces': self._p1_pieces,
            'p2_pieces': self._p2_pieces,
            'passed': {str(k): v for k, v in self.passed.items()},
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = {}
        for key, stack in state['board'].items():
            parts = key.split(',')
            self.board[(int(parts[0]), int(parts[1]))] = list(stack)

        self.valid_positions = set(tuple(p) for p in state['valid_positions'])
        self.row_lengths = list(state['row_lengths'])
        self.row_offsets = {int(k): v for k, v in state['row_offsets'].items()}
        self.num_rows = state['num_rows']
        self.phase = state['phase']
        self.placement_step = state['placement_step']
        self.num_dvonn = state['num_dvonn']
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

  CONNECTION RULE (most important rule!):
  - After each move, any stack that is NOT connected to at
    least one DVONN piece (through a chain of adjacent
    occupied spaces) is immediately removed from the game.
  - This is checked using breadth-first search from all
    DVONN piece positions.
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

  Note: ALL pieces in a controlled stack count, including
  DVONN pieces and opponent's pieces buried in the stack.
  If you control a stack of 5 pieces, that is 5 points for
  you regardless of the composition of the stack.

  If both players control the same total, the game is a draw.

--------------------------------------------------------------
DISPLAY
--------------------------------------------------------------
  The board shows pieces with their colors:
    W  = White piece (Player 1), single piece
    B  = Black piece (Player 2), single piece
    R  = DVONN piece (red, neutral), single piece
    .  = Empty space (placement phase only)

  When stacks are taller than 1, the height is shown:
    W3 = Stack of 3 with White on top
    B5 = Stack of 5 with Black on top
    R2 = Stack of 2 with DVONN on top

--------------------------------------------------------------
INPUT FORMAT
--------------------------------------------------------------
  Placement phase:
    Enter a position to place a piece: c3

  Stacking phase:
    Enter source and destination: c3 e3
    (moves stack at c3 to land on stack at e3)

  Coordinates use letter for column, number for row.
  Row 1 is at the top, columns start from 'a' on the left.

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Place DVONN pieces centrally so they are hard to isolate.
  - During placement, think ahead to the stacking phase and
    position your pieces near DVONN pieces.
  - Tall stacks move far, which can be powerful for reaching
    distant targets, but they are inflexible since they must
    move exactly their height.
  - Single pieces are vulnerable to being captured but are
    highly mobile (move exactly 1 space).
  - Disconnecting opponent stacks from DVONN pieces is the
    primary way to gain a large advantage. Look for cutting
    moves that isolate groups of opponent stacks.
  - Control DVONN pieces! If your piece is on top of a DVONN
    piece's stack, that connection point is secure for you.
  - In the endgame, consolidate your stacks into fewer, taller
    stacks while trying to isolate your opponent's.
  - A stack controlled by neither player (DVONN on top) cannot
    be moved by either player -- these act as blocking pillars.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
