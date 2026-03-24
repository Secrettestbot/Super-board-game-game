"""Tak - A Beautiful Game. Build roads and control the board with stacks."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


class TakGame(BaseGame):
    """Tak: Build roads and control the board with stacks.

    Tak is a two-player abstract strategy game where players place and move
    pieces on a square grid. The goal is to create a "road" -- an unbroken
    chain of flat stones and/or capstones connecting two opposite edges of
    the board.

    Piece types:
      - Flat stones: Can be part of a road, can be stacked upon.
      - Standing stones / Walls: Block movement and stacking, NOT part
        of a road. Cannot be stacked upon (except by capstone flattening).
      - Capstones: Can be part of a road, can flatten standing stones,
        cannot be covered by other pieces.

    Players alternate placing pieces or moving stacks. On the very first turn,
    each player places one of the OPPONENT's flat stones.
    """

    name = "Tak"
    description = "Build roads and control the board with stacks"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Tak (5x5)",
        "small": "Small Tak (4x4)",
        "large": "Large Tak (6x6)",
    }

    # Board size for each variation
    VARIATION_SIZES = {
        "standard": 5,
        "small": 4,
        "large": 6,
    }

    # Piece counts per board size: (flats, capstones)
    PIECE_COUNTS = {
        4: (15, 0),
        5: (21, 1),
        6: (30, 1),
    }

    # Piece type constants
    FLAT = 'F'
    WALL = 'S'
    CAPSTONE = 'C'

    # Direction name to (drow, dcol) mapping
    # Row 0 is the top of the internal board (highest display number),
    # so "up" means decreasing row index and "down" means increasing.
    DIRECTIONS = {
        'up': (-1, 0),
        'down': (1, 0),
        'left': (0, -1),
        'right': (0, 1),
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.size = 0
        self.board = []       # board[row][col] = list of (player, piece_type) bottom to top
        self.pieces = {}      # {player: {'F': count, 'C': count}}

    def setup(self):
        """Initialize the board and piece reserves."""
        self.size = self.VARIATION_SIZES.get(self.variation, 5)
        self.board = [[[] for _ in range(self.size)] for _ in range(self.size)]
        flats, caps = self.PIECE_COUNTS[self.size]
        self.pieces = {
            1: {'F': flats, 'C': caps},
            2: {'F': flats, 'C': caps},
        }

    # ------------------------------------------------------------------
    # Coordinate helpers
    # ------------------------------------------------------------------

    def _parse_coord(self, s):
        """Parse a coordinate like 'a1' into (row, col). Returns None on failure.

        Coordinate 'a1' means column a, row 1.  Row 1 is the bottom of the
        display, which maps to internal row index (size - 1).  Row N (top of
        display) maps to internal row index 0.
        """
        s = s.strip().lower()
        if len(s) < 2:
            return None
        col_ch = s[0]
        if not col_ch.isalpha():
            return None
        try:
            row_num = int(s[1:])
        except ValueError:
            return None
        col = ord(col_ch) - ord('a')
        row = self.size - row_num   # row 1 -> size-1, row N -> 0
        if 0 <= row < self.size and 0 <= col < self.size:
            return (row, col)
        return None

    def _coord_str(self, row, col):
        """Convert internal (row, col) to display label like 'a1'."""
        return f"{chr(ord('a') + col)}{self.size - row}"

    # ------------------------------------------------------------------
    # Display
    # ------------------------------------------------------------------

    @staticmethod
    def _piece_symbol(player, ptype):
        """Return the display character for a piece.

        Player 1: x = flat, X = wall, C = capstone
        Player 2: o = flat, O = wall, c = capstone
        """
        if player == 1:
            if ptype == 'F':
                return 'x'
            elif ptype == 'S':
                return 'X'
            else:               # capstone
                return 'C'
        else:
            if ptype == 'F':
                return 'o'
            elif ptype == 'S':
                return 'O'
            else:               # capstone
                return 'c'

    def display(self):
        """Display the board with stack depths and top piece symbols.

        Each occupied cell shows  <depth><symbol>  where symbol encodes
        both the owner and piece type.  Empty cells show a dot.
        """
        size = self.size
        print(f"\n  === Tak ({self.variations[self.variation]}) ==="
              f"  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (P1: x/X/C) vs "
              f"{self.players[1]} (P2: o/O/c)")
        print(f"  Current player: {self.players[self.current_player - 1]}"
              f" (P{self.current_player})")
        print()

        # Reserves
        for p in (1, 2):
            f_count = self.pieces[p]['F']
            c_count = self.pieces[p]['C']
            cap_str = (f", {c_count} capstone(s)"
                       if self.PIECE_COUNTS[size][1] > 0 else "")
            print(f"  P{p} reserves: {f_count} flat(s){cap_str}")
        print()

        # Column headers
        col_hdr = "      "
        for c in range(size):
            col_hdr += f"  {chr(ord('a') + c)}   "
        print(col_hdr)

        sep = "     +" + "-----+" * size
        print(sep)

        # Rows: internal row 0 is the top of the display (highest number)
        for r in range(size):
            row_label = f"  {size - r}  "
            row_str = row_label + "|"
            for c in range(size):
                stack = self.board[r][c]
                if not stack:
                    row_str += "  .  |"
                else:
                    owner, ptype = stack[-1]
                    sym = self._piece_symbol(owner, ptype)
                    depth = len(stack)
                    cell = f"{depth}{sym}"
                    row_str += f" {cell:>4}|"
            print(row_str)
            print(sep)

        print()
        if self.turn_number < 2:
            print("  ** First turn: place opponent's flat stone **")
            print("  Example: place flat a1")
        else:
            print("  Place: place flat a1 | place wall b3 | place cap c3")
            print("  Move:  move a1 right 1 1 1")
        print()

    # ------------------------------------------------------------------
    # Input parsing
    # ------------------------------------------------------------------

    def get_move(self):
        """Get a move from the current player.

        Accepted input formats:
          place flat a1
          place wall b3
          place cap c3
          move a1 right 1 1 1

        Returns one of:
          ('place', piece_type, row, col)
          ('move', src_row, src_col, direction, drops)
        """
        player = self.current_player

        while True:
            raw = input_with_quit(
                f"  {self.players[player - 1]}, enter move: "
            ).strip().lower()

            if not raw:
                print("  Please enter a move.")
                continue

            parts = raw.split()

            if parts[0] == 'place':
                move = self._parse_place_input(parts)
                if move is not None:
                    return move
                print("  Invalid placement. Format: "
                      "place flat a1 | place wall b3 | place cap c3")
                continue

            if parts[0] == 'move':
                move = self._parse_move_input(parts)
                if move is not None:
                    return move
                print("  Invalid move. Format: move a1 right 1 1 1")
                continue

            print("  Unknown command. Start with 'place' or 'move'.")

    def _parse_place_input(self, parts):
        """Parse ['place', 'flat', 'a1'] into ('place', ptype, row, col)."""
        if len(parts) != 3:
            return None

        ptype_map = {
            'flat': self.FLAT,
            'wall': self.WALL,
            'cap': self.CAPSTONE,
        }
        ptype = ptype_map.get(parts[1])
        if ptype is None:
            return None

        coord = self._parse_coord(parts[2])
        if coord is None:
            return None

        return ('place', ptype, coord[0], coord[1])

    def _parse_move_input(self, parts):
        """Parse ['move', 'a1', 'right', '1', '1', '1'] into a move tuple."""
        if len(parts) < 4:
            return None

        coord = self._parse_coord(parts[1])
        if coord is None:
            return None

        direction = parts[2]
        if direction not in self.DIRECTIONS:
            return None

        try:
            drops = [int(d) for d in parts[3:]]
        except ValueError:
            return None

        if not drops or any(d < 1 for d in drops):
            return None

        return ('move', coord[0], coord[1], direction, drops)

    # ------------------------------------------------------------------
    # Move execution
    # ------------------------------------------------------------------

    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        if move[0] == 'place':
            return self._make_placement(move)
        elif move[0] == 'move':
            return self._make_stack_move(move)
        return False

    def _make_placement(self, move):
        """Place a piece on an empty square."""
        _, ptype, row, col = move
        player = self.current_player

        # Target must be empty
        if self.board[row][col]:
            print("  Square is not empty!")
            return False

        # First two turns: each player places an opponent's flat stone
        if self.turn_number < 2:
            opponent = 2 if player == 1 else 1
            if ptype != self.FLAT:
                print("  First turn: you must place a flat stone "
                      "(it will be your opponent's color).")
                return False
            if self.pieces[opponent]['F'] <= 0:
                print("  Opponent has no flat stones left!")
                return False
            self.pieces[opponent]['F'] -= 1
            self.board[row][col].append((opponent, self.FLAT))
            return True

        # Normal placement
        if ptype == self.CAPSTONE:
            if self.pieces[player]['C'] <= 0:
                print("  No capstones left!")
                return False
            self.pieces[player]['C'] -= 1
        else:
            # Both flat and wall consume from the flat reserve
            if self.pieces[player]['F'] <= 0:
                print("  No flat stones left!")
                return False
            self.pieces[player]['F'] -= 1

        self.board[row][col].append((player, ptype))
        return True

    def _make_stack_move(self, move):
        """Pick up pieces from a stack and distribute them along a direction."""
        _, src_row, src_col, direction, drops = move
        player = self.current_player

        # No stack moves on the first two turns
        if self.turn_number < 2:
            print("  First turn: you must place a piece, not move a stack.")
            return False

        stack = self.board[src_row][src_col]
        if not stack:
            print("  No pieces on that square!")
            return False

        # Must own the top piece
        top_owner, _top_type = stack[-1]
        if top_owner != player:
            print("  You don't control that stack!")
            return False

        count = sum(drops)

        # Carry limit = board size
        if count > self.size:
            print(f"  Cannot carry more than {self.size} pieces!")
            return False

        if count > len(stack):
            print(f"  Only {len(stack)} piece(s) on that stack!")
            return False

        dr, dc = self.DIRECTIONS[direction]

        # ---- validation pass (no mutations) ----
        carrying = stack[-count:]
        cur_r, cur_c = src_row, src_col
        drop_idx = 0
        for i, num_drop in enumerate(drops):
            cur_r += dr
            cur_c += dc

            if not (0 <= cur_r < self.size and 0 <= cur_c < self.size):
                print("  Move goes off the board!")
                return False

            target = self.board[cur_r][cur_c]
            if target:
                t_owner, t_type = target[-1]

                if t_type == self.CAPSTONE:
                    print("  Cannot stack onto a capstone!")
                    return False

                if t_type == self.WALL:
                    # A capstone alone on the last step can flatten a wall
                    if (i == len(drops) - 1
                            and num_drop == 1
                            and carrying[drop_idx][1] == self.CAPSTONE):
                        pass   # valid: capstone flattens the wall
                    else:
                        print("  Standing stone blocks movement!")
                        return False

            drop_idx += num_drop

        # ---- apply the move ----
        picked_up = stack[-count:]
        del stack[-count:]

        cur_r, cur_c = src_row, src_col
        drop_idx = 0
        for i, num_drop in enumerate(drops):
            cur_r += dr
            cur_c += dc
            target = self.board[cur_r][cur_c]

            # Flatten wall if needed
            if target and target[-1][1] == self.WALL:
                wall_owner = target[-1][0]
                target[-1] = (wall_owner, self.FLAT)

            # Drop pieces from the bottom of what we're carrying
            target.extend(picked_up[drop_idx:drop_idx + num_drop])
            drop_idx += num_drop

        return True

    # ------------------------------------------------------------------
    # Win detection
    # ------------------------------------------------------------------

    def check_game_over(self):
        """Check for road win, board full, or out of pieces."""
        current = self.current_player
        opponent = 2 if current == 1 else 1

        # Road win -- current player has priority if both have a road
        current_road = self._check_road(current)
        opponent_road = self._check_road(opponent)

        if current_road or opponent_road:
            self.game_over = True
            self.winner = current if current_road else opponent
            return

        # Board full?
        board_full = all(
            self.board[r][c]
            for r in range(self.size)
            for c in range(self.size)
        )

        # Either player out of all pieces?
        p1_out = (self.pieces[1]['F'] == 0 and self.pieces[1]['C'] == 0)
        p2_out = (self.pieces[2]['F'] == 0 and self.pieces[2]['C'] == 0)

        if board_full or p1_out or p2_out:
            self.game_over = True
            # Flat count on top of stacks decides
            flat_count = {1: 0, 2: 0}
            for r in range(self.size):
                for c in range(self.size):
                    stack = self.board[r][c]
                    if stack:
                        owner, ptype = stack[-1]
                        if ptype == self.FLAT:
                            flat_count[owner] += 1

            if flat_count[1] > flat_count[2]:
                self.winner = 1
            elif flat_count[2] > flat_count[1]:
                self.winner = 2
            else:
                self.winner = None  # draw

    def _check_road(self, player):
        """Check if *player* has a road connecting opposite edges.

        A road is a connected orthogonal path of flat stones and/or
        capstones owned by the player, linking top-to-bottom or
        left-to-right.  Uses BFS.
        """
        size = self.size

        def is_road_piece(r, c):
            stack = self.board[r][c]
            if not stack:
                return False
            owner, ptype = stack[-1]
            return owner == player and ptype in (self.FLAT, self.CAPSTONE)

        # Top-to-bottom (row 0 to row size-1)
        if self._bfs_road(
                is_road_piece,
                start_edge=[(0, c) for c in range(size)],
                target_check=lambda r, c: r == size - 1):
            return True

        # Left-to-right (col 0 to col size-1)
        if self._bfs_road(
                is_road_piece,
                start_edge=[(r, 0) for r in range(size)],
                target_check=lambda r, c: c == size - 1):
            return True

        return False

    def _bfs_road(self, is_road_piece, start_edge, target_check):
        """BFS from *start_edge* cells; return True if any cell satisfying
        *target_check* is reachable through adjacent road pieces."""
        visited = set()
        queue = deque()

        for r, c in start_edge:
            if is_road_piece(r, c) and (r, c) not in visited:
                visited.add((r, c))
                queue.append((r, c))

        while queue:
            r, c = queue.popleft()
            if target_check(r, c):
                return True
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nr, nc = r + dr, c + dc
                if (0 <= nr < self.size and 0 <= nc < self.size
                        and (nr, nc) not in visited
                        and is_road_piece(nr, nc)):
                    visited.add((nr, nc))
                    queue.append((nr, nc))

        return False

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def get_state(self):
        """Return serializable game state for saving."""
        board_data = []
        for r in range(self.size):
            row_data = []
            for c in range(self.size):
                row_data.append(
                    [(owner, ptype) for owner, ptype in self.board[r][c]]
                )
            board_data.append(row_data)

        return {
            "size": self.size,
            "board": board_data,
            "pieces": {str(k): dict(v) for k, v in self.pieces.items()},
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.size = state["size"]
        self.board = []
        for r_data in state["board"]:
            row = []
            for stack_data in r_data:
                row.append([(owner, ptype) for owner, ptype in stack_data])
            self.board.append(row)
        self.pieces = {int(k): dict(v) for k, v in state["pieces"].items()}

    # ------------------------------------------------------------------
    # Tutorial
    # ------------------------------------------------------------------

    def get_tutorial(self):
        """Return comprehensive tutorial text for Tak."""
        return """
==============================================================
                       TAK  TUTORIAL
==============================================================

OVERVIEW
--------------------------------------------------------------
  Tak is a two-player abstract strategy game designed by
  James Ernest, inspired by Patrick Rothfuss's "Kingkiller
  Chronicle" novels. Players compete to build a "road" -- an
  unbroken chain of their flat stones and/or capstones that
  connects two opposite edges of the board.

  The game is played on a square grid. The standard board is
  5x5, but 4x4 (small / quick) and 6x6 (large / advanced)
  variants are also available.

PIECES
--------------------------------------------------------------
  Each player has a supply of pieces kept in reserve:

  FLAT STONES
    - The basic piece and the workhorse of road building.
    - Counts as part of a road.
    - Can be stacked upon by other pieces.
    - Display: 'x' for Player 1, 'o' for Player 2.

  STANDING STONES (WALLS)
    - A flat stone placed upright on its edge.
    - Blocks movement -- no piece can move or stack on top,
      with one exception (see capstone below).
    - Does NOT count as part of a road.
    - Uses the same reserve count as flat stones.
    - Display: 'X' for Player 1, 'O' for Player 2.

  CAPSTONES
    - The most powerful piece in the game.
    - Counts as part of a road.
    - Can flatten a standing stone (wall) by moving onto it
      alone as the last step of a move.
    - Cannot be covered by any other piece.
    - Display: 'C' for Player 1, 'c' for Player 2.

  Piece counts by board size:
    4x4 (small):    15 flats, 0 capstones per player
    5x5 (standard): 21 flats, 1 capstone  per player
    6x6 (large):    30 flats, 1 capstone  per player

FIRST TURN RULE
--------------------------------------------------------------
  On the very first move of the game, each player must place
  one of the OPPONENT'S flat stones on any empty square. This
  balances the first-player advantage.

    Turn 1: Player 1 places a Player 2 flat stone.
    Turn 2: Player 2 places a Player 1 flat stone.

  After these two opening placements, normal play begins.

ACTIONS -- choose ONE per turn
--------------------------------------------------------------

  1. PLACE a piece from your reserve onto any empty square.

     Command format:
       place flat a1   -- place a flat stone on square a1
       place wall b3   -- place a wall (standing stone) on b3
       place cap c3    -- place your capstone on c3

     Rules:
       - The target square must be empty (no stack present).
       - You must have the piece type available in your reserve.
       - Walls and flat stones both consume from the same flat
         stone reserve.

  2. MOVE a stack you control (your piece is on top).

     Command format:
       move <coord> <direction> <drop1> <drop2> ...

     Examples:
       move a1 right 1 1 1
         Pick up 3 pieces from a1, move right, dropping 1 on
         each of the next 3 squares (b1, c1, d1).

       move b2 up 2 1
         Pick up 3 from b2, move up, drop 2 on the first
         square and 1 on the second.

       move c3 left 1
         Pick up 1 from c3, move left, drop it on the
         adjacent square.

       move a1 down 3
         Pick up 3, move down one square, drop all 3 there.

     Directions: up, down, left, right

STACK MOVEMENT RULES
--------------------------------------------------------------
  - You control a stack if YOUR piece is on top.
  - Pick up 1 to N pieces from the top of the stack, where
    N equals the board size (the carry limit).
  - Move in exactly one cardinal direction: up, down, left,
    or right.  No diagonal movement is allowed.
  - You must drop at least 1 piece on each square you pass
    through.  The total pieces dropped must equal the number
    picked up.
  - WALLS block movement entirely -- you cannot move onto a
    square with a standing stone on top, UNLESS:
      * A capstone is the ONLY piece being dropped, AND
      * It is the LAST square in the move.
      * In this case the capstone "flattens" the wall, turning
        it into a flat stone.
  - You can NEVER stack onto a capstone.

  Example: Stack at a1 has 5 pieces (yours on top), 5x5 board.
    "move a1 right 2 2 1"
    Picks up 5, moves right, drops 2 on b1, 2 on c1, 1 on d1.

WINNING CONDITIONS
--------------------------------------------------------------
  1. ROAD WIN (immediate victory)
     Create an unbroken connected path of your flat stones
     and/or capstones linking two opposite edges of the board:
       - Top edge to bottom edge, OR
       - Left edge to right edge.
     Standing stones (walls) do NOT count as road pieces.
     Adjacency is orthogonal only (up/down/left/right).
     If the current player's move creates a road for both
     players simultaneously, the current player wins.

  2. FLAT WIN (end-of-game scoring)
     The game also ends when:
       - The board is completely full (every square occupied), OR
       - Any player runs out of ALL pieces (flats and caps).
     Count the number of flat stones showing on top of stacks
     for each player.  The player with more top-flats wins.
     Capstones and walls on top do NOT count.  Tie = draw.

BOARD DISPLAY
--------------------------------------------------------------
  Each cell shows: <stack_depth><piece_symbol>

  Piece symbols:
    P1 (Player 1): x = flat, X = wall, C = capstone
    P2 (Player 2): o = flat, O = wall, c = capstone

  Examples:
    1x  = stack of 1, Player 1 flat on top
    3o  = stack of 3, Player 2 flat on top
    2X  = stack of 2, Player 1 wall on top
    1c  = stack of 1, Player 2 capstone on top
    .   = empty square

  Columns: a, b, c, ... (left to right)
  Rows: 1, 2, 3, ... (1 at bottom, increasing upward)

COORDINATE SYSTEM
--------------------------------------------------------------
  Coordinates use column letter + row number:
    a1 = bottom-left corner
    e5 = top-right corner (on a 5x5 board)

  Directions:
    up    = toward higher row numbers
    down  = toward lower row numbers
    left  = toward column 'a'
    right = toward higher column letters

VARIATIONS
--------------------------------------------------------------
  small (4x4):
    Quick game. 15 flats, 0 capstones per player.
    No capstones means no wall-flattening ability.

  standard (5x5):
    The default Tak experience. 21 flats, 1 capstone each.
    Carry limit of 5 pieces.

  large (6x6):
    Longer game with more space. 30 flats, 1 capstone each.
    Carry limit of 6 pieces.

STRATEGY HINTS
--------------------------------------------------------------
  - Flat stones are your road-building material. Place them
    to form connections toward your target edges.
  - Walls are excellent blockers. Use them to sever your
    opponent's developing roads.
  - The capstone is your most powerful piece: it can flatten
    walls and counts toward roads. Time its placement wisely.
  - Stack movement lets you spread influence rapidly -- a
    tall stack can deposit your pieces across many squares
    in a single turn.
  - Control the center for maximum flexibility.
  - Watch for "Tak" threats -- positions where you can
    complete a road on your next turn. Force your opponent
    to respond defensively.
  - Stacking over opponent pieces buries their influence
    while extending yours.
  - In the endgame, the flat count on top matters. If no road
    seems possible, accumulate top-flats.

CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'       -- Quit the game
  'save'  / 's'       -- Save and suspend the game
  'help'  / 'h'       -- Show quick help
  'tutorial' / 't'    -- Show this tutorial
==============================================================
"""
