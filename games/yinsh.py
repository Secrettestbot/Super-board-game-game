"""YINSH - Abstract strategy game from the GIPF project series."""

from engine.base import BaseGame, input_with_quit, clear_screen


# Cell states
EMPTY = 0
P1_RING = 1
P1_MARKER = 2
P2_RING = 3
P2_MARKER = 4

CELL_SYMBOLS = {
    EMPTY: ' . ',
    P1_RING: '[1]',
    P1_MARKER: ' 1 ',
    P2_RING: '[2]',
    P2_MARKER: ' 2 ',
}


def _owner(cell):
    if cell in (P1_RING, P1_MARKER):
        return 1
    if cell in (P2_RING, P2_MARKER):
        return 2
    return 0


def _is_ring(cell):
    return cell in (P1_RING, P2_RING)


def _is_marker(cell):
    return cell in (P1_MARKER, P2_MARKER)


def _marker_for(player):
    return P1_MARKER if player == 1 else P2_MARKER


def _ring_for(player):
    return P1_RING if player == 1 else P2_RING


class YinshGame(BaseGame):
    """YINSH: Place markers, slide rings, flip markers, form rows of five."""

    name = "YINSH"
    description = "Abstract strategy: slide rings and flip markers to form rows of five"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard YINSH",
        "blitz": "Blitz YINSH (first to 2 rings)",
    }

    # Hex directions on an 11x11 grid: the six hex directions.
    # We use axial-like coordinates on a square grid offset system.
    # The six directions for hex movement:
    HEX_DIRS = [
        (-1, 0),   # N
        (1, 0),    # S
        (0, -1),   # W
        (0, 1),    # E
        (-1, -1),  # NW
        (1, 1),    # SE
    ]

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.size = 11
        self.board = {}  # (row, col) -> cell state; only valid hex positions
        self.valid_positions = set()
        self.rings_to_place = {1: 0, 2: 0}
        self.rings_removed = {1: 0, 2: 0}
        self.rings_target = 0
        self.total_rings = 0
        self.phase = 'placement'  # 'placement', 'main', 'remove_row', 'remove_ring'
        self.pending_rows = []  # rows of 5 that need to be resolved
        self.pending_row_player = None  # which player must remove a row

    def _init_valid_positions(self):
        """Initialize the set of valid hex positions on the 11x11 grid.

        We use a hex board approximated on a grid. The board is roughly
        circular. We define valid positions as those within distance 4.5
        from center (5,5) in hex metric, giving us the classic YINSH layout
        with 85 intersection points.
        """
        center_r, center_c = 5, 5
        self.valid_positions = set()
        for r in range(self.size):
            for c in range(self.size):
                # Hex distance from center
                dr = r - center_r
                dc = c - center_c
                # In our hex coordinate system, distance is:
                # max(|dr|, |dc|, |dr+dc|) -- this is not right for offset,
                # use axial distance for the (N/S, W/E, NW/SE) system
                # For axial coordinates with basis (1,0), (0,1), (-1,-1):
                # dist = max(|dr|, |dc|, |dr+dc|)
                dist = max(abs(dr), abs(dc), abs(dr + dc))
                if dist <= 5 and not (dist == 5 and (
                    (dr == 5 and dc == 0) or (dr == -5 and dc == 0) or
                    (dr == 0 and dc == 5) or (dr == 0 and dc == -5) or
                    (dr == 5 and dc == -5) or (dr == -5 and dc == 5)
                )):
                    # Exclude the 6 corner (tip) points for an 85-point board
                    self.valid_positions.add((r, c))

    def setup(self):
        """Initialize the board and game phase."""
        self._init_valid_positions()
        self.board = {pos: EMPTY for pos in self.valid_positions}

        if self.variation == "blitz":
            self.total_rings = 5
            self.rings_target = 2
        else:
            self.total_rings = 5
            self.rings_target = 3

        self.rings_to_place = {1: self.total_rings, 2: self.total_rings}
        self.rings_removed = {1: 0, 2: 0}
        self.phase = 'placement'
        self.pending_rows = []
        self.pending_row_player = None

    def _get_rings(self, player):
        """Return positions of all rings belonging to player."""
        ring = _ring_for(player)
        return [pos for pos, cell in self.board.items() if cell == ring]

    def _get_line_positions(self, start, direction):
        """Get all positions along a line from start in given direction."""
        positions = []
        r, c = start
        dr, dc = direction
        r, c = r + dr, c + dc
        while (r, c) in self.valid_positions:
            positions.append((r, c))
            r += dr
            c += dc
        return positions

    def _find_valid_ring_destinations(self, ring_pos):
        """Find all valid destinations for sliding a ring from ring_pos.

        A ring slides along a line. It can pass over empty spaces freely.
        Once it hits markers, it must jump over a contiguous group of markers
        and land on the first empty space after them. It cannot jump over
        rings or pass through them.
        """
        destinations = []
        for dr, dc in self.HEX_DIRS:
            r, c = ring_pos
            passed_markers = False
            while True:
                r, c = r + dr, c + dc
                if (r, c) not in self.valid_positions:
                    break
                cell = self.board[(r, c)]
                if _is_ring(cell):
                    # Cannot pass through or land on rings
                    break
                if _is_marker(cell):
                    passed_markers = True
                    continue
                # Empty cell
                if passed_markers:
                    # Must land here (first empty after markers)
                    destinations.append((r, c))
                    break
                else:
                    # Can land on any empty before hitting markers
                    destinations.append((r, c))
        return destinations

    def _flip_markers_between(self, start, end):
        """Flip all markers between start and end (exclusive of both endpoints)."""
        dr = 0 if end[0] == start[0] else (1 if end[0] > start[0] else -1)
        dc = 0 if end[1] == start[1] else (1 if end[1] > start[1] else -1)
        r, c = start[0] + dr, start[1] + dc
        while (r, c) != end:
            cell = self.board.get((r, c))
            if cell == P1_MARKER:
                self.board[(r, c)] = P2_MARKER
            elif cell == P2_MARKER:
                self.board[(r, c)] = P1_MARKER
            r += dr
            c += dc

    def _find_rows_of_five(self, player):
        """Find all rows of 5+ consecutive markers of the given player.

        Returns a list of lists, each containing the positions of 5 markers
        forming a row.
        """
        marker = _marker_for(player)
        rows_found = []

        # Check all three line directions
        checked = set()
        for pos in self.valid_positions:
            for d_idx, (dr, dc) in enumerate(self.HEX_DIRS[:3]):
                # Only check 3 directions (each line is checked from both ends)
                key = (pos, d_idx)
                if key in checked:
                    continue

                # Collect consecutive markers in this direction from pos
                line = []
                r, c = pos
                while (r, c) in self.valid_positions and self.board.get((r, c)) == marker:
                    line.append((r, c))
                    checked.add(((r, c), d_idx))
                    r += dr
                    c += dc

                if len(line) >= 5:
                    # Extract all possible contiguous groups of 5
                    for i in range(len(line) - 4):
                        rows_found.append(line[i:i + 5])

        # Deduplicate (convert each row to frozenset for comparison)
        unique = []
        seen = set()
        for row in rows_found:
            key = frozenset(row)
            if key not in seen:
                seen.add(key)
                unique.append(row)

        return unique

    def display(self):
        """Display the hex-style board."""
        print(f"\n  === YINSH ({self.variation.capitalize()}) ===")
        print(f"  {self.players[0]} (P1) [1]: rings on board {len(self._get_rings(1))}, "
              f"removed {self.rings_removed[1]}/{self.rings_target}")
        print(f"  {self.players[1]} (P2) [2]: rings on board {len(self._get_rings(2))}, "
              f"removed {self.rings_removed[2]}/{self.rings_target}")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")

        if self.phase == 'placement':
            p = self.current_player
            print(f"  Phase: Ring Placement ({self.rings_to_place[p]} rings left to place)")
        elif self.phase == 'remove_row':
            print(f"  Phase: Remove a row of 5 markers")
        elif self.phase == 'remove_ring':
            print(f"  Phase: Remove one of your rings")
        else:
            print(f"  Phase: Main game")
        print()

        # Display the board with hex-like offset
        # Column headers
        col_nums = "       "
        for c in range(self.size):
            col_nums += f" {c:2} "
        print(col_nums)

        for r in range(self.size):
            # Offset for hex appearance
            offset = "  " if r % 2 == 0 else ""
            row_str = f"  {r:2}  {offset}"
            for c in range(self.size):
                if (r, c) in self.valid_positions:
                    row_str += CELL_SYMBOLS[self.board[(r, c)]]
                else:
                    row_str += "   "
            row_str += f"  {r}"
            print(row_str)

        print(col_nums)
        print()
        print("  Legend: [1]=P1 ring  1 =P1 marker  [2]=P2 ring  2 =P2 marker  . =empty")
        print()

    def _parse_position(self, s):
        """Parse a position like 'row,col' (e.g. '3,5'). Returns (row, col) or None."""
        s = s.strip()
        parts = s.split(',')
        if len(parts) != 2:
            return None
        try:
            r = int(parts[0].strip())
            c = int(parts[1].strip())
        except ValueError:
            return None
        if (r, c) in self.valid_positions:
            return (r, c)
        return None

    def get_move(self):
        """Get a move based on current phase."""
        player = self.current_player
        name = self.players[player - 1]

        if self.phase == 'placement':
            return self._get_placement_move(name, player)
        elif self.phase == 'remove_row':
            return self._get_remove_row_move(name)
        elif self.phase == 'remove_ring':
            return self._get_remove_ring_move(name, player)
        else:
            return self._get_main_move(name, player)

    def _get_placement_move(self, name, player):
        """Get ring placement move during setup phase."""
        while True:
            raw = input_with_quit(
                f"  {name}, place a ring (row,col e.g. '5,5'): "
            ).strip()
            pos = self._parse_position(raw)
            if pos is None:
                print("  Invalid position. Use row,col format (e.g. '5,5').")
                continue
            if self.board[pos] != EMPTY:
                print("  That position is occupied.")
                continue
            return ('place_ring', pos)

    def _get_main_move(self, name, player):
        """Get a main-phase move: choose a ring, then it gets a marker and slides."""
        rings = self._get_rings(player)
        if not rings:
            # Should not happen normally
            return None

        # Check if any ring has valid moves
        movable = [(rp, self._find_valid_ring_destinations(rp)) for rp in rings]
        movable = [(rp, dests) for rp, dests in movable if dests]

        if not movable:
            # No valid ring moves; extremely rare but possible
            print("  No valid moves available! Passing turn.")
            return ('pass',)

        while True:
            raw = input_with_quit(
                f"  {name}, choose a ring to move (row,col e.g. '3,5'): "
            ).strip()
            pos = self._parse_position(raw)
            if pos is None:
                print("  Invalid position. Use row,col format.")
                continue
            if pos not in rings:
                ring_strs = [f"{r},{c}" for r, c in rings]
                print(f"  No ring of yours at that position. Your rings: {', '.join(ring_strs)}")
                continue

            dests = self._find_valid_ring_destinations(pos)
            if not dests:
                print("  That ring has no valid moves. Choose another.")
                continue

            dest_strs = [f"{r},{c}" for r, c in dests]
            print(f"  Valid destinations: {', '.join(dest_strs)}")

            while True:
                dest_raw = input_with_quit(
                    f"  Slide ring to (row,col): "
                ).strip()
                dest = self._parse_position(dest_raw)
                if dest is None:
                    print("  Invalid position.")
                    continue
                if dest not in dests:
                    print(f"  Invalid destination. Choose from: {', '.join(dest_strs)}")
                    continue
                return ('move', pos, dest)

    def _get_remove_row_move(self, name):
        """Get which row of 5 to remove."""
        if len(self.pending_rows) == 1:
            print(f"  Removing row: {', '.join(f'{r},{c}' for r, c in self.pending_rows[0])}")
            return ('remove_row', 0)

        print("  Multiple rows detected. Choose which to remove:")
        for i, row in enumerate(self.pending_rows):
            row_str = ', '.join(f'{r},{c}' for r, c in row)
            print(f"    {i + 1}: {row_str}")

        while True:
            raw = input_with_quit(
                f"  {name}, choose row number (1-{len(self.pending_rows)}): "
            ).strip()
            try:
                idx = int(raw) - 1
                if 0 <= idx < len(self.pending_rows):
                    return ('remove_row', idx)
            except ValueError:
                pass
            print(f"  Enter a number from 1 to {len(self.pending_rows)}.")

    def _get_remove_ring_move(self, name, player):
        """Get which ring to remove after clearing a row of 5."""
        rings = self._get_rings(player)
        if len(rings) == 1:
            print(f"  Removing your only ring at {rings[0][0]},{rings[0][1]}.")
            return ('remove_ring', rings[0])

        ring_strs = [f"{r},{c}" for r, c in rings]
        print(f"  Your rings: {', '.join(ring_strs)}")

        while True:
            raw = input_with_quit(
                f"  {name}, choose a ring to remove (row,col): "
            ).strip()
            pos = self._parse_position(raw)
            if pos is None:
                print("  Invalid position.")
                continue
            if pos not in rings:
                print(f"  No ring of yours there. Choose from: {', '.join(ring_strs)}")
                continue
            return ('remove_ring', pos)

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        player = self.current_player

        if move[0] == 'pass':
            return True

        if move[0] == 'place_ring':
            pos = move[1]
            if self.board.get(pos) != EMPTY:
                return False
            self.board[pos] = _ring_for(player)
            self.rings_to_place[player] -= 1

            # Check if placement phase is done
            if self.rings_to_place[1] == 0 and self.rings_to_place[2] == 0:
                self.phase = 'main'

            return True

        if move[0] == 'move':
            _, ring_pos, dest = move
            ring = _ring_for(player)
            marker = _marker_for(player)

            if self.board.get(ring_pos) != ring:
                return False
            if dest not in self._find_valid_ring_destinations(ring_pos):
                return False

            # Place marker where ring was
            self.board[ring_pos] = marker

            # Flip markers between ring_pos and dest
            self._flip_markers_between(ring_pos, dest)

            # Place ring at destination
            self.board[dest] = ring

            # Check for rows of 5 for BOTH players (current player resolves first)
            self._check_for_rows(player)

            return True

        if move[0] == 'remove_row':
            idx = move[1]
            if idx < 0 or idx >= len(self.pending_rows):
                return False
            row = self.pending_rows[idx]
            # Remove markers
            for pos in row:
                self.board[pos] = EMPTY
            self.pending_rows.pop(idx)
            self.phase = 'remove_ring'
            return True

        if move[0] == 'remove_ring':
            pos = move[1]
            ring = _ring_for(player)
            if self.board.get(pos) != ring:
                return False
            self.board[pos] = EMPTY
            self.rings_removed[player] += 1

            # Check if more rows need resolving
            # Recheck for new rows (removing markers may have changed things)
            other = 3 - player
            my_rows = self._find_rows_of_five(player)
            other_rows = self._find_rows_of_five(other)

            if my_rows:
                self.pending_rows = my_rows
                self.pending_row_player = player
                self.phase = 'remove_row'
            elif other_rows:
                self.pending_rows = other_rows
                self.pending_row_player = other
                self.phase = 'remove_row'
                # Switch to other player temporarily for removal
                self.current_player = other
            else:
                self.phase = 'main'
                # Restore current player if we switched for other player's row removal
                if self.pending_row_player and self.pending_row_player != player:
                    self.current_player = player  # will be switched by play() loop
                self.pending_row_player = None

            return True

        return False

    def _check_for_rows(self, player):
        """After a move, check for completed rows of 5."""
        other = 3 - player
        my_rows = self._find_rows_of_five(player)
        other_rows = self._find_rows_of_five(other)

        if my_rows:
            self.pending_rows = my_rows
            self.pending_row_player = player
            self.phase = 'remove_row'
        elif other_rows:
            self.pending_rows = other_rows
            self.pending_row_player = other
            self.phase = 'remove_row'

    def check_game_over(self):
        """Check if a player has removed enough rings to win."""
        for p in [1, 2]:
            if self.rings_removed[p] >= self.rings_target:
                self.game_over = True
                self.winner = p
                return

    def switch_player(self):
        """Only switch if not in a removal phase."""
        if self.phase in ('remove_row', 'remove_ring'):
            return
        super().switch_player()

    def get_state(self):
        """Return serializable game state."""
        return {
            'board': {f"{r},{c}": v for (r, c), v in self.board.items()},
            'valid_positions': [list(p) for p in self.valid_positions],
            'rings_to_place': {str(k): v for k, v in self.rings_to_place.items()},
            'rings_removed': {str(k): v for k, v in self.rings_removed.items()},
            'rings_target': self.rings_target,
            'total_rings': self.total_rings,
            'phase': self.phase,
            'pending_rows': [[list(p) for p in row] for row in self.pending_rows],
            'pending_row_player': self.pending_row_player,
        }

    def load_state(self, state):
        """Restore game state."""
        self.valid_positions = set(tuple(p) for p in state['valid_positions'])
        self.board = {}
        for key, v in state['board'].items():
            parts = key.split(',')
            self.board[(int(parts[0]), int(parts[1]))] = v
        self.rings_to_place = {int(k): v for k, v in state['rings_to_place'].items()}
        self.rings_removed = {int(k): v for k, v in state['rings_removed'].items()}
        self.rings_target = state['rings_target']
        self.total_rings = state['total_rings']
        self.phase = state['phase']
        self.pending_rows = [[tuple(p) for p in row] for row in state['pending_rows']]
        self.pending_row_player = state.get('pending_row_player')

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==============================================================
                    YINSH TUTORIAL
==============================================================

OVERVIEW
  YINSH is an abstract strategy game from the GIPF project
  series. Players place rings on a hexagonal board, then place
  markers and slide rings to flip markers. Form a row of five
  markers in your color to score, then remove a ring. The first
  player to remove enough rings wins.

--------------------------------------------------------------
SETUP PHASE
--------------------------------------------------------------
  Players take turns placing their rings on empty positions.
  Both modes use 5 rings per player.

  Input: row,col (e.g. '5,5')

--------------------------------------------------------------
MAIN GAME
--------------------------------------------------------------
  On each turn:
  1. Choose one of your rings on the board.
  2. A marker of your color is placed where the ring is.
  3. The ring then slides along a straight line to a new
     position:
     - It can slide over empty spaces freely.
     - It can jump over a contiguous group of markers (of
       either color) and must land on the first empty space
       after them.
     - It CANNOT pass through or land on other rings.
  4. All markers that the ring passed over are FLIPPED to the
     opposite color.

--------------------------------------------------------------
SCORING
--------------------------------------------------------------
  When 5 markers of your color form a straight line:
  1. Remove those 5 markers from the board.
  2. Remove one of your rings from the board.
  3. If multiple rows of 5 exist, resolve them one at a time.

  The removed ring counts toward your score.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  Standard: First to remove 3 rings wins.
  Blitz: First to remove 2 rings wins.

--------------------------------------------------------------
BOARD COORDINATES
--------------------------------------------------------------
  The board uses a hex grid mapped to an 11x11 coordinate
  system. Positions are given as row,col (e.g. '3,5').

  The board display shows:
    [1] = Player 1 ring     1  = Player 1 marker
    [2] = Player 2 ring     2  = Player 2 marker
     .  = empty position

  Movement directions follow 6 hex directions:
    N (up), S (down), W (left), E (right), NW, SE

--------------------------------------------------------------
INPUT FORMAT
--------------------------------------------------------------
  Placement phase:  row,col  (e.g. '5,5')
  Main phase:       row,col to select ring, then row,col for
                    destination
  Removal phase:    Follow prompts to choose row and ring

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Place rings in positions with many lines of influence.
  - Flipping markers is double-edged: it changes both your
    and your opponent's markers.
  - Try to set up rows that are hard for the opponent to
    disrupt.
  - Removing a ring reduces your mobility, so think about
    which ring to sacrifice.
  - In Blitz mode, games are faster and more tactical.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
