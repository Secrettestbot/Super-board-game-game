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
      - Flat stones (F): Can be part of a road, can be stacked upon.
      - Standing stones / Walls (S): Block movement and stacking, NOT part
        of a road. Cannot be stacked upon (except by capstone flattening).
      - Capstones (C): Can be part of a road, can flatten standing stones,
        cannot be covered by other pieces.

    Players alternate placing pieces or moving stacks. On the very first turn,
    each player places one of the OPPONENT's flat stones.
    """

    name = "Tak"
    description = "Build roads and control the board with stacks"
    min_players = 2
    max_players = 2
    variations = {
        "5x5": "5x5 Board (Standard)",
        "4x4": "4x4 Board (Quick)",
        "6x6": "6x6 Board (Advanced)",
    }

    # Piece counts per board size: (flats, capstones)
    PIECE_COUNTS = {
        4: (15, 0),
        5: (21, 1),
        6: (30, 1),
    }

    # Piece type constants
    FLAT = 'F'
    STANDING = 'S'
    CAPSTONE = 'C'

    def __init__(self, variation=None):
        super().__init__(variation or "5x5")
        self.size = 0
        self.board = []       # board[row][col] = list of (player, piece_type) bottom to top
        self.pieces = {}      # {player: {'F': count, 'C': count}}

    def setup(self):
        """Initialize the board and piece reserves."""
        self.size = int(self.variation.split("x")[0])
        self.board = [[[] for _ in range(self.size)] for _ in range(self.size)]
        flats, caps = self.PIECE_COUNTS[self.size]
        self.pieces = {
            1: {'F': flats, 'C': caps},
            2: {'F': flats, 'C': caps},
        }

    def display(self):
        """Display the board with stack heights and top piece info."""
        size = self.size
        player_syms = {1: 'W', 2: 'B'}  # White and Black
        piece_syms = {self.FLAT: '', self.STANDING: 'S', self.CAPSTONE: 'C'}

        print(f"\n  === Tak ({self.variation}) ===  Turn {self.turn_number}")
        print(f"  {self.players[0]} (White/W) vs {self.players[1]} (Black/B)")
        print(f"  Current: {self.players[self.current_player - 1]} "
              f"({player_syms[self.current_player]})")
        print()

        # Show piece reserves
        for p in [1, 2]:
            sym = player_syms[p]
            f_count = self.pieces[p]['F']
            c_count = self.pieces[p]['C']
            print(f"  {sym} reserves: {f_count} flats, {c_count} capstones")
        print()

        # Column headers
        col_hdr = "      "
        for c in range(size):
            col_hdr += f"  {chr(ord('a') + c)}   "
        print(col_hdr)

        sep = "     +" + "-----+" * size
        print(sep)

        # Rows displayed from top (highest number) to bottom (1)
        for r in range(size - 1, -1, -1):
            row_label = f"  {r + 1}  "
            row_str = row_label + "|"
            for c in range(size):
                stack = self.board[r][c]
                if not stack:
                    row_str += "  .  |"
                else:
                    owner, ptype = stack[-1]  # top piece
                    sym = player_syms[owner]
                    ps = piece_syms[ptype]
                    height = len(stack)
                    cell = f"{height}{sym}{ps}"
                    row_str += f" {cell:>4}|"
            print(row_str)
            print(sep)

        print()
        if self.turn_number < 2:
            print("  ** First turn: place opponent's flat stone **")
        print("  Place: Pa1 (flat), Sa1 (standing), Ca1 (capstone)")
        print("  Move:  a1 a2 (simple) or 3a1+111 (detailed stack move)")
        print()

    def _parse_coord(self, s):
        """Parse a coordinate like 'a1' into (row, col). Returns None on failure."""
        s = s.strip().lower()
        if len(s) < 2:
            return None
        col_ch = s[0]
        try:
            row_num = int(s[1:])
        except ValueError:
            return None
        col = ord(col_ch) - ord('a')
        row = row_num - 1
        if 0 <= row < self.size and 0 <= col < self.size:
            return (row, col)
        return None

    def _coord_str(self, row, col):
        """Convert (row, col) to string like 'a1'."""
        return f"{chr(ord('a') + col)}{row + 1}"

    def get_move(self):
        """Get a move from the current player.

        Returns one of:
          ('place', piece_type, row, col)
          ('move', src_row, src_col, direction, drops)
            where drops is a list of ints (how many to drop at each step)
        """
        player = self.current_player

        while True:
            raw = input_with_quit(
                f"  {self.players[player - 1]}, enter move: "
            ).strip()

            if not raw:
                print("  Please enter a move.")
                continue

            # Try placement: Pa1, Sa1, Ca1 or just a1 (defaults to flat)
            if raw[0].upper() in ('P', 'S', 'C') and len(raw) >= 3:
                ptype_ch = raw[0].upper()
                coord = self._parse_coord(raw[1:])
                if coord is not None:
                    if ptype_ch == 'P':
                        ptype = self.FLAT
                    elif ptype_ch == 'S':
                        ptype = self.STANDING
                    else:
                        ptype = self.CAPSTONE
                    return ('place', ptype, coord[0], coord[1])

            # Try bare coordinate as flat placement: e.g. "a1"
            coord = self._parse_coord(raw)
            if coord is not None and ' ' not in raw:
                return ('place', self.FLAT, coord[0], coord[1])

            # Try simple stack move: "a1 a2" (source destination)
            parts = raw.split()
            if len(parts) == 2:
                src = self._parse_coord(parts[0])
                dst = self._parse_coord(parts[1])
                if src and dst:
                    sr, sc = src
                    dr, dc = dst
                    # Determine direction and distance
                    move_info = self._simple_move_to_detailed(sr, sc, dr, dc)
                    if move_info:
                        direction, drops = move_info
                        return ('move', sr, sc, direction, drops)
                    else:
                        print("  Invalid move: source and destination must be in a straight line.")
                        continue

            # Try detailed stack move: "3a1+111" or "2a1>21" or "3a1-12"
            parsed = self._parse_stack_notation(raw)
            if parsed:
                return parsed

            print("  Invalid input. Examples: Pa1, Sa1, Ca1, a1 a2, 3a1+111")

    def _simple_move_to_detailed(self, sr, sc, dr, dc):
        """Convert a simple src->dst move to (direction, drops).

        Moves the entire stack (up to carry limit) one space.
        Returns (direction, drops) or None.
        """
        row_diff = dr - sr
        col_diff = dc - sc

        # Must be exactly one step in a cardinal direction
        if row_diff == 0 and col_diff == 0:
            return None

        # Determine direction
        if row_diff != 0 and col_diff != 0:
            return None  # diagonal not allowed

        if row_diff > 0:
            direction = '+'   # up (increasing row = north in display)
            dist = row_diff
        elif row_diff < 0:
            direction = '-'   # down
            dist = -row_diff
        elif col_diff > 0:
            direction = '>'   # right
            dist = col_diff
        else:
            direction = '<'   # left
            dist = -col_diff

        if dist < 1 or dist > self.size:
            return None

        # Pick up entire stack (up to carry limit), drop 1 at each step
        stack = self.board[sr][sc]
        carry = min(len(stack), self.size)
        # Distribute: drop pieces evenly, 1+ per space
        # For simple move over distance, we need to figure out drops
        # Default: distribute as many 1s as possible, remainder on last
        if dist > carry:
            return None

        drops = [1] * dist
        remaining = carry - dist
        drops[-1] += remaining

        return (direction, drops)

    def _parse_stack_notation(self, raw):
        """Parse detailed stack notation like '3a1+111'.

        Format: [count]coord[direction][drops]
        count: number of pieces to pick up (optional, defaults to stack height up to limit)
        coord: e.g. a1
        direction: + (up/north), - (down/south), > (right/east), < (left/west)
        drops: sequence of digits for how many to drop at each space

        Returns ('move', row, col, direction, drops_list) or None.
        """
        raw = raw.strip()
        if not raw:
            return None

        # Extract leading count
        idx = 0
        count_str = ""
        while idx < len(raw) and raw[idx].isdigit():
            count_str += raw[idx]
            idx += 1

        count = int(count_str) if count_str else None

        # Extract coordinate
        if idx >= len(raw):
            return None
        coord_start = idx
        # Letter(s) then digit(s)
        while idx < len(raw) and raw[idx].isalpha():
            idx += 1
        while idx < len(raw) and raw[idx].isdigit():
            idx += 1

        coord_s = raw[coord_start:idx]
        coord = self._parse_coord(coord_s)
        if coord is None:
            return None

        # Extract direction
        if idx >= len(raw):
            return None
        direction = raw[idx]
        if direction not in ('+', '-', '>', '<'):
            return None
        idx += 1

        # Extract drops
        drops_str = raw[idx:]
        if not drops_str:
            return None
        try:
            drops = [int(ch) for ch in drops_str]
        except ValueError:
            return None

        if any(d < 1 for d in drops):
            return None

        total_dropped = sum(drops)
        if count is not None and total_dropped != count:
            return None

        if count is None:
            count = total_dropped

        return ('move', coord[0], coord[1], direction, drops)

    def _direction_delta(self, direction):
        """Return (drow, dcol) for a direction character."""
        return {
            '+': (1, 0),    # north (increasing row numbers)
            '-': (-1, 0),   # south
            '>': (0, 1),    # east
            '<': (0, -1),   # west
        }[direction]

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move[0] == 'place':
            return self._make_placement(move)
        elif move[0] == 'move':
            return self._make_stack_move(move)
        return False

    def _make_placement(self, move):
        """Place a piece on the board."""
        _, ptype, row, col = move
        player = self.current_player

        # Check square is empty
        if self.board[row][col]:
            print("  Square is not empty!")
            return False

        # First two turns: must place opponent's flat stone
        if self.turn_number < 2:
            opponent = 2 if player == 1 else 1
            if ptype != self.FLAT:
                print("  First turn: you must place a flat stone (opponent's color).")
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
            # Both flat and standing use flat stone reserves
            if self.pieces[player]['F'] <= 0:
                print("  No flat stones left!")
                return False
            self.pieces[player]['F'] -= 1

        self.board[row][col].append((player, ptype))
        return True

    def _make_stack_move(self, move):
        """Move pieces from a stack."""
        _, src_row, src_col, direction, drops = move
        player = self.current_player

        # Cannot move stacks on first two turns
        if self.turn_number < 2:
            print("  First turn: you must place a piece, not move a stack.")
            return False

        stack = self.board[src_row][src_col]
        if not stack:
            print("  No pieces on that square!")
            return False

        # Must control the top piece
        top_owner, top_type = stack[-1]
        if top_owner != player:
            print("  You don't control that stack!")
            return False

        count = sum(drops)

        # Cannot pick up more than carry limit
        if count > self.size:
            print(f"  Cannot carry more than {self.size} pieces!")
            return False

        if count > len(stack):
            print(f"  Only {len(stack)} pieces on that stack!")
            return False

        dr, dc = self._direction_delta(direction)

        # Validate the entire move before applying
        # Pick up 'count' pieces from top
        carrying = stack[-count:]

        cur_r, cur_c = src_row, src_col
        for i, num_drop in enumerate(drops):
            cur_r += dr
            cur_c += dc

            # Check bounds
            if not (0 <= cur_r < self.size and 0 <= cur_c < self.size):
                print("  Move goes off the board!")
                return False

            target = self.board[cur_r][cur_c]

            if target:
                target_top_owner, target_top_type = target[-1]

                if target_top_type == self.STANDING:
                    # Only capstone can flatten a wall, and only on the last drop
                    # and only dropping exactly 1 piece (the capstone itself)
                    if i == len(drops) - 1 and num_drop == 1:
                        # The piece being dropped must be a capstone
                        # carrying is consumed from bottom to top
                        drop_idx = sum(drops[:i])
                        piece_to_drop = carrying[drop_idx]
                        if piece_to_drop[1] == self.CAPSTONE:
                            # This is valid: capstone flattens the wall
                            pass
                        else:
                            print("  Standing stone blocks movement!")
                            return False
                    else:
                        print("  Standing stone blocks movement!")
                        return False

                if target_top_type == self.CAPSTONE:
                    print("  Cannot stack onto a capstone!")
                    return False

        # Move is valid -- apply it
        picked_up = stack[-count:]
        del stack[-count:]

        cur_r, cur_c = src_row, src_col
        drop_idx = 0
        for i, num_drop in enumerate(drops):
            cur_r += dr
            cur_c += dc
            target = self.board[cur_r][cur_c]

            # Check for wall flattening
            if target and target[-1][1] == self.STANDING:
                # Flatten the standing stone to a flat
                owner_wall = target[-1][0]
                target[-1] = (owner_wall, self.FLAT)

            # Drop pieces
            pieces_to_drop = picked_up[drop_idx:drop_idx + num_drop]
            target.extend(pieces_to_drop)
            drop_idx += num_drop

        return True

    def check_game_over(self):
        """Check for road win, board full, or out of pieces."""
        # Check road win for both players
        for p in [1, 2]:
            if self._check_road(p):
                self.game_over = True
                # If current player just moved and created a road, they win.
                # If both players have a road, the player who just moved wins.
                self.winner = self.current_player if self._check_road(self.current_player) else p
                return

        # Check if board is full
        full = True
        for r in range(self.size):
            for c in range(self.size):
                if not self.board[r][c]:
                    full = False
                    break
            if not full:
                break

        # Check if either player is out of all pieces
        p1_out = self.pieces[1]['F'] == 0 and self.pieces[1]['C'] == 0
        p2_out = self.pieces[2]['F'] == 0 and self.pieces[2]['C'] == 0

        if full or p1_out or p2_out:
            self.game_over = True
            # Count flat stones on top
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
        """Check if player has a road connecting opposite edges.

        A road is a connected path of flat stones and/or capstones owned by
        the player, connecting either top-bottom or left-right.
        """
        size = self.size

        def is_road_piece(r, c):
            stack = self.board[r][c]
            if not stack:
                return False
            owner, ptype = stack[-1]
            return owner == player and ptype in (self.FLAT, self.CAPSTONE)

        # Check top-to-bottom
        if self._bfs_road(player, is_road_piece,
                          start_edge=[(0, c) for c in range(size)],
                          target_check=lambda r, c: r == size - 1):
            return True

        # Check left-to-right
        if self._bfs_road(player, is_road_piece,
                          start_edge=[(r, 0) for r in range(size)],
                          target_check=lambda r, c: c == size - 1):
            return True

        return False

    def _bfs_road(self, player, is_road_piece, start_edge, target_check):
        """BFS to find a connected road from start_edge to target."""
        size = self.size
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
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < size and 0 <= nc < size:
                    if (nr, nc) not in visited and is_road_piece(nr, nc):
                        visited.add((nr, nc))
                        queue.append((nr, nc))

        return False

    def get_state(self):
        """Return serializable game state."""
        # Convert board stacks to serializable lists
        board_data = []
        for r in range(self.size):
            row_data = []
            for c in range(self.size):
                row_data.append([(owner, ptype) for owner, ptype in self.board[r][c]])
            board_data.append(row_data)

        return {
            "size": self.size,
            "board": board_data,
            "pieces": {
                str(k): dict(v) for k, v in self.pieces.items()
            },
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
        self.pieces = {
            int(k): dict(v) for k, v in state["pieces"].items()
        }

    def get_tutorial(self):
        """Return tutorial text for Tak."""
        return """
==============================================================
                       TAK  TUTORIAL
==============================================================

OVERVIEW
  Tak is a two-player abstract strategy game designed by
  James Ernest, inspired by Patrick Rothfuss's "Kingkiller
  Chronicle" novels. Players compete to build a "road" -- an
  unbroken chain of their pieces connecting two opposite edges
  of the board.

--------------------------------------------------------------
PIECES
--------------------------------------------------------------
  Each player has a supply of pieces:

  FLAT STONES (F)
    - The basic piece. Placed flat on the board.
    - Count as part of a road.
    - Can be stacked upon.

  STANDING STONES / WALLS (S)
    - A flat stone placed on its side.
    - Block movement -- pieces cannot stack on top of them.
    - Do NOT count as part of a road.
    - Use the same reserve as flat stones.

  CAPSTONES (C)
    - The most powerful piece.
    - Count as part of a road.
    - Can flatten a standing stone by moving onto it.
    - Cannot be covered by other pieces.

  Piece counts by board size:
    4x4: 15 flats, 0 capstones per player
    5x5: 21 flats, 1 capstone per player
    6x6: 30 flats, 1 capstone per player

--------------------------------------------------------------
FIRST TURN RULE
--------------------------------------------------------------
  On the very first turn, each player places one of their
  OPPONENT'S flat stones on any empty square. This means
  Player 1 places a Player 2 flat, then Player 2 places a
  Player 1 flat. After that, normal play begins.

--------------------------------------------------------------
ACTIONS (each turn, choose ONE)
--------------------------------------------------------------
  1. PLACE a piece from your reserve onto any empty square.
     - Flat stone: type Pa1 (or just a1)
     - Standing stone: type Sa1
     - Capstone: type Ca1

  2. MOVE a stack you control (your piece is on top).
     - Simple: type source and destination, e.g. "a1 a2"
       (moves the entire stack, up to carry limit, one space)
     - Detailed: type count, source, direction, drops
       e.g. "3a1+111" picks up 3 from a1, moves north (+),
       dropping 1-1-1 on successive squares.

--------------------------------------------------------------
STACK MOVEMENT RULES
--------------------------------------------------------------
  - You control a stack if YOUR piece is on top.
  - Pick up 1 to N pieces from the top (N = board size).
  - Move in one cardinal direction (no diagonals).
  - Drop 1 or more pieces on each square you cross.
  - You must drop at least 1 piece on each square.
  - Standing stones block movement UNLESS a capstone is the
    only piece being dropped on the last square (it flattens
    the wall into a flat stone).
  - You cannot stack onto a capstone.

  Direction codes:
    + = North (up)       - = South (down)
    > = East (right)     < = West (left)

  Example: "3a1+111"
    Pick up 3 pieces from a1, move north, drop 1 on a2,
    1 on a3, and 1 on a4.

  Example: "2b3>11"
    Pick up 2 pieces from b3, move east, drop 1 on c3
    and 1 on d3.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  1. ROAD WIN: Create an unbroken path of your flat stones
     and/or capstones connecting two opposite edges of the
     board (top-to-bottom or left-to-right). Standing stones
     do NOT count as part of a road. The player who completes
     a road wins immediately (even if it happens during the
     opponent's turn, the moving player wins).

  2. FLAT WIN: If the board is completely full, or a player
     runs out of all pieces, the game ends. The player with
     the most flat stones showing on top of stacks wins.
     (Capstones and standing stones on top do not count.)

--------------------------------------------------------------
BOARD DISPLAY
--------------------------------------------------------------
  Each cell shows: [height][owner][type]
    1W  = 1 piece, White flat on top
    3BS = 3 pieces, Black standing stone on top
    2WC = 2 pieces, White capstone on top
    .   = empty square

  Columns: a, b, c, ...
  Rows: 1, 2, 3, ... (1 at bottom, increasing upward)

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  4x4 : Quick game, 15 flats, 0 capstones per player.
  5x5 : Standard game, 21 flats, 1 capstone per player.
  6x6 : Advanced game, 30 flats, 1 capstone per player.

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Flat stones are your road-building material. Place them
    strategically to connect your edges.
  - Standing stones are excellent blockers. Use them to cut
    off your opponent's road attempts.
  - The capstone is your most powerful piece. It can flatten
    walls and join roads. Time its use carefully.
  - Stack movement lets you spread influence quickly. A tall
    stack can place your pieces across multiple squares.
  - Control the center for maximum flexibility.
  - Watch for "Tak" threats -- positions where you can
    complete a road on your next turn.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
