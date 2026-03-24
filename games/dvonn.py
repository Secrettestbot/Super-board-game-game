"""DVONN - Stacking game from the GIPF project series."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


# Piece colors
WHITE = 'W'
BLACK = 'B'
DVONN = 'R'  # Red DVONN pieces

# Six axial hex directions.
# In axial coordinates (q, r), the six neighbors are:
AXIAL_DIRS = [
    (1, 0),    # E
    (-1, 0),   # W
    (0, 1),    # SE
    (0, -1),   # NW
    (1, -1),   # NE
    (-1, 1),   # SW
]


def _coord_to_label(q, r, q_offset):
    """Convert axial (q, r) to a human-readable label like 'a1'.

    q_offset: the minimum q value for this row, used to compute display column.
    Display column = q - q_offset, displayed as letter.
    Row = r + 1 (1-indexed), displayed as number.
    """
    display_col = q - q_offset
    return f"{chr(ord('a') + display_col)}{r + 1}"


def _label_to_coord(label):
    """Convert a label like 'a1' to (display_col, row_0indexed).

    Returns (display_col, row) or None if invalid.
    """
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
    display_col = ord(col_part) - ord('a')
    row = int(row_part) - 1
    return (display_col, row)


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
        self.board = {}          # (q, r) -> list of pieces bottom-to-top, e.g. ['W','R','B']
        self.valid_positions = set()  # set of (q, r) axial coords
        self.row_lengths = []    # length of each row
        self.row_q_starts = {}   # row_index -> starting q value for that row
        self.num_rows = 0
        self.phase = 'placement'  # 'placement' or 'stacking'
        self.placement_step = 0   # which placement step we are on (0-indexed)
        self.num_dvonn = 0        # total DVONN pieces
        self._p1_pieces = 0       # white pieces to place
        self._p2_pieces = 0       # black pieces to place
        self.passed = {1: False, 2: False}

    # ------------------------------------------------------------------ #
    #  Board Geometry (Axial Coordinates)
    # ------------------------------------------------------------------ #
    #
    #  The DVONN board is an elongated hexagon. We use axial hex coords
    #  (q, r) where r is the row (0 = top) and q is the column in axial
    #  space. The six directions use constant (dq, dr) offsets.
    #
    #  Standard board (rows of 9, 10, 11, 10, 9 = 49 spaces):
    #
    #       a  b  c  d  e  f  g  h  i          row 0: q=0..8,  r=0
    #      a  b  c  d  e  f  g  h  i  j         row 1: q=-1..8, r=1
    #     a  b  c  d  e  f  g  h  i  j  k        row 2: q=-2..8, r=2
    #      a  b  c  d  e  f  g  h  i  j         row 3: q=-2..7, r=3
    #       a  b  c  d  e  f  g  h  i          row 4: q=-2..6, r=4
    #
    #  Each row going down starts 1 position further left (in axial q),
    #  modeling the hex offset. Going SE is (0, +1) and going NE is (+1, -1).

    def _init_board(self):
        """Initialize the board geometry based on variation."""
        if self.variation == "quick":
            self.row_lengths = [5, 6, 7, 6, 5]
            self.num_dvonn = 2
            self._p1_pieces = 14
            self._p2_pieces = 13
        else:
            self.row_lengths = [9, 10, 11, 10, 9]
            self.num_dvonn = 3
            self._p1_pieces = 23
            self._p2_pieces = 23

        self.num_rows = len(self.row_lengths)

        # Compute starting q for each row.
        # Row 0 starts at q=0. Each subsequent row that is wider starts
        # 1 further left. Once past the widest row, q_start stays the same
        # (the rows get shorter on the right side).
        mid = self.num_rows // 2  # index of widest row
        self.row_q_starts = {}
        for r in range(self.num_rows):
            if r <= mid:
                self.row_q_starts[r] = -r
            else:
                self.row_q_starts[r] = -mid

        self.valid_positions = set()
        for r in range(self.num_rows):
            q_start = self.row_q_starts[r]
            for i in range(self.row_lengths[r]):
                self.valid_positions.add((q_start + i, r))

    def _display_to_axial(self, display_col, row):
        """Convert display coordinates to axial (q, r)."""
        q_start = self.row_q_starts.get(row, 0)
        return (q_start + display_col, row)

    def _axial_to_display(self, q, r):
        """Convert axial (q, r) to display column index."""
        q_start = self.row_q_starts.get(r, 0)
        return q - q_start

    def _get_neighbors(self, q, r):
        """Get valid neighboring positions of axial (q, r)."""
        neighbors = []
        for dq, dr in AXIAL_DIRS:
            nq, nr = q + dq, r + dr
            if (nq, nr) in self.valid_positions:
                neighbors.append((nq, nr))
        return neighbors

    # ------------------------------------------------------------------ #
    #  Setup
    # ------------------------------------------------------------------ #

    def setup(self):
        """Initialize the board for the placement phase."""
        self._init_board()
        self.board = {}
        self.phase = 'placement'
        self.placement_step = 0
        self.passed = {1: False, 2: False}

    # ------------------------------------------------------------------ #
    #  DVONN Connection Logic
    # ------------------------------------------------------------------ #

    def _is_connected_to_dvonn(self):
        """BFS from all DVONN pieces to find connected positions.

        Returns the set of all positions connected to at least one DVONN piece.
        """
        dvonn_positions = set()
        for pos, stack in self.board.items():
            if DVONN in stack:
                dvonn_positions.add(pos)

        if not dvonn_positions:
            return set()

        visited = set(dvonn_positions)
        queue = deque(dvonn_positions)

        while queue:
            q, r = queue.popleft()
            for nq, nr in self._get_neighbors(q, r):
                if (nq, nr) in self.board and (nq, nr) not in visited:
                    visited.add((nq, nr))
                    queue.append((nq, nr))

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

    # ------------------------------------------------------------------ #
    #  Move Generation
    # ------------------------------------------------------------------ #

    def _get_valid_moves(self, player):
        """Get all valid moves for the given player in stacking phase.

        A stack controlled by the player (their piece on top) of height h
        moves exactly h spaces in a straight line (one of 6 axial directions)
        and must land on another occupied space.

        Returns a list of (from_pos, to_pos) tuples.
        """
        piece = WHITE if player == 1 else BLACK
        moves = []

        for pos, stack in list(self.board.items()):
            if not stack or stack[-1] != piece:
                continue

            height = len(stack)
            for dq, dr in AXIAL_DIRS:
                dest_q = pos[0] + dq * height
                dest_r = pos[1] + dr * height

                # Destination must be a valid board position and occupied
                if (dest_q, dest_r) not in self.valid_positions:
                    continue
                if (dest_q, dest_r) not in self.board:
                    continue
                if not self.board[(dest_q, dest_r)]:
                    continue

                # All intermediate positions must be valid board spaces
                # (they can be empty or occupied, just must be on the board)
                valid_path = True
                for step in range(1, height):
                    iq = pos[0] + dq * step
                    ir = pos[1] + dr * step
                    if (iq, ir) not in self.valid_positions:
                        valid_path = False
                        break
                if not valid_path:
                    continue

                moves.append((pos, (dest_q, dest_r)))

        return moves

    def _count_pieces(self, player):
        """Count total pieces in all stacks controlled by player."""
        piece = WHITE if player == 1 else BLACK
        count = 0
        for pos, stack in self.board.items():
            if stack and stack[-1] == piece:
                count += len(stack)
        return count

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

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

        max_len = max(self.row_lengths)

        # Column header for the widest row
        header = "      "
        for c in range(max_len):
            header += f" {chr(ord('a') + c)} "
        print(header)

        for r in range(self.num_rows):
            indent = max_len - self.row_lengths[r]
            # Each indent level shifts by half a cell width (approximately 1.5 chars)
            # Use 1 space per indent level for a clean hex look
            # Actually use consistent spacing: each cell is 3 chars wide, indent is ~1.5 chars
            row_str = f"  {r + 1}:  " + " " * indent

            q_start = self.row_q_starts[r]
            for i in range(self.row_lengths[r]):
                q = q_start + i
                pos = (q, r)
                if pos in self.board and self.board[pos]:
                    stack = self.board[pos]
                    top = stack[-1]
                    height = len(stack)
                    if height > 1:
                        ht_str = str(height)
                        cell = f"{top}{ht_str}"
                        # Pad to 3 chars
                        cell = cell.ljust(3)
                    else:
                        cell = f" {top} "
                elif self.phase == 'placement' and pos in self.valid_positions:
                    cell = " . "
                else:
                    cell = "   "
                row_str += cell

            print(row_str)

        print()
        print("  Legend: W=White  B=Black  R=DVONN(red)  W3=White stack of height 3")
        if self.phase == 'placement':
            print("  Enter a position to place a piece (e.g. 'c3')")
        else:
            print("  Enter move as 'from to' (e.g. 'c3 e3')")
        print()

    # ------------------------------------------------------------------ #
    #  User Coordinate Parsing
    # ------------------------------------------------------------------ #

    def _parse_user_coord(self, label):
        """Parse user input like 'c3' into axial (q, r). Returns None if invalid."""
        parsed = _label_to_coord(label)
        if parsed is None:
            return None
        display_col, row = parsed
        if row < 0 or row >= self.num_rows:
            return None
        if display_col < 0 or display_col >= self.row_lengths[row]:
            return None
        q, r = self._display_to_axial(display_col, row)
        if (q, r) not in self.valid_positions:
            return None
        return (q, r)

    def _format_coord(self, q, r):
        """Format axial (q, r) as user-readable label."""
        display_col = self._axial_to_display(q, r)
        return f"{chr(ord('a') + display_col)}{r + 1}"

    # ------------------------------------------------------------------ #
    #  Input
    # ------------------------------------------------------------------ #

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
        if self.placement_step < self.num_dvonn:
            piece_type = DVONN
            piece_label = "DVONN (R)"
        else:
            piece_type = WHITE if player == 1 else BLACK
            piece_label = "White (W)" if player == 1 else "Black (B)"

        while True:
            raw = input_with_quit(
                f"  {name}, place a {piece_label} piece (e.g. 'c3'): "
            ).strip()
            coord = self._parse_user_coord(raw)
            if coord is None:
                print("  Invalid position. Use letter+number (e.g. 'c3').")
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

            from_coord = self._parse_user_coord(parts[0])
            to_coord = self._parse_user_coord(parts[1])

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

    # ------------------------------------------------------------------ #
    #  Move Execution
    # ------------------------------------------------------------------ #

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
            self.board[to_pos] = self.board[to_pos] + moving_stack

            # Remove stacks disconnected from any DVONN piece
            self._remove_disconnected()

            # Reset pass tracking since a valid move was made
            self.passed = {1: False, 2: False}

            return True

        return False

    # ------------------------------------------------------------------ #
    #  Game Flow
    # ------------------------------------------------------------------ #

    def switch_player(self):
        """Switch to the next player."""
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

    # ------------------------------------------------------------------ #
    #  Serialization
    # ------------------------------------------------------------------ #

    def get_state(self):
        """Return serializable game state for saving."""
        board_data = {}
        for (q, r), stack in self.board.items():
            board_data[f"{q},{r}"] = list(stack)

        return {
            'board': board_data,
            'valid_positions': [list(p) for p in sorted(self.valid_positions)],
            'row_lengths': list(self.row_lengths),
            'row_q_starts': {str(k): v for k, v in self.row_q_starts.items()},
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
        self.row_q_starts = {int(k): v for k, v in state['row_q_starts'].items()}
        self.num_rows = state['num_rows']
        self.phase = state['phase']
        self.placement_step = state['placement_step']
        self.num_dvonn = state['num_dvonn']
        self._p1_pieces = state['p1_pieces']
        self._p2_pieces = state['p2_pieces']
        self.passed = {int(k): v for k, v in state['passed'].items()}

    # ------------------------------------------------------------------ #
    #  Tutorial
    # ------------------------------------------------------------------ #

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
  arranged in 5 rows of 9, 10, 11, 10, and 9 spaces.

  Quick: A smaller board with 29 intersections arranged in
  5 rows of 5, 6, 7, 6, and 5 spaces.

  Positions are named with a letter (column) and number (row).
  The letter indicates the column within that row (a = leftmost),
  and the number indicates the row (1 = top).

  Example board (standard, after placement):

       a  b  c  d  e  f  g  h  i
  1:    W  B  W  R  B  W  B  W  B
  2:   B  W  B  W  B  W  B  W  B  W
  3:  W  R  B  W  B  W  R  B  W  B  W
  4:   B  W  B  W  B  W  B  W  B  W
  5:    W  B  W  B  W  B  W  B  W

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
  If you control a stack of 5, that is 5 points for you
  regardless of the composition of the stack.

  If both players control the same number of pieces, the
  game is a draw.

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
    (moves the stack at c3 to land on the stack at e3)

  Coordinates use letter for column (a = leftmost in the row),
  number for row (1 = top row). Note that each row may have
  a different number of columns due to the hex board shape.

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
    highly mobile (they move exactly 1 space in any direction).
  - Disconnecting opponent stacks from DVONN pieces is the
    primary way to gain a large advantage. Look for moves
    that create gaps in the chain of occupied spaces.
  - Control DVONN pieces! If your piece is on top of a stack
    containing a DVONN piece, that connection point is safe.
  - In the endgame, consolidate your stacks into fewer, taller
    stacks while trying to isolate your opponent's.
  - A stack with a DVONN piece on top cannot be moved by
    either player -- it acts as an immovable pillar.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
