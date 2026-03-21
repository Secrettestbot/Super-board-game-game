"""ZÈRTZ - A GIPF project game of marble capturing on a shrinking board."""

from engine.base import BaseGame, input_with_quit, clear_screen


class ZertzGame(BaseGame):
    """ZÈRTZ: Capture marbles on a shrinking hexagonal board."""

    name = "ZÈRTZ"
    description = "Capture marbles on a shrinking hexagonal board"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard ZÈRTZ (37 spaces)",
        "quick": "Quick ZÈRTZ (19 spaces)",
    }

    # Hex directions (axial coordinates)
    DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)]

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board = {}       # (q,r) -> None (empty) or 'W'/'G'/'B'/marble color
        self.pool = {}        # shared marble pool: {'W': n, 'G': n, 'B': n}
        self.captured = {1: [], 2: []}  # marbles captured by each player
        self.must_capture = False

    def setup(self):
        self.board = {}
        self.captured = {1: [], 2: []}
        if self.variation == "quick":
            radius = 2
            self.pool = {'W': 3, 'G': 4, 'B': 5}
        else:
            radius = 3
            self.pool = {'W': 6, 'G': 8, 'B': 10}
        # Build hex board
        for q in range(-radius, radius + 1):
            for r in range(-radius, radius + 1):
                if abs(q + r) <= radius:
                    self.board[(q, r)] = None  # empty space
        self.must_capture = False
        self._check_forced_capture()

    def _neighbors(self, pos):
        q, r = pos
        return [(q + dq, r + dr) for dq, dr in self.DIRS]

    def _is_edge(self, pos):
        """Check if a position is on the edge (has at least one missing neighbor)."""
        for n in self._neighbors(pos):
            if n not in self.board:
                return True
        return False

    def _can_remove_space(self, pos):
        """A space can be removed if it's empty and on the edge."""
        return pos in self.board and self.board[pos] is None and self._is_edge(pos)

    def _removable_spaces(self):
        """Get all spaces that can be removed (empty edge spaces)."""
        return [p for p in self.board if self._can_remove_space(p)]

    def _get_all_jumps_from(self, pos):
        """Get all possible single jumps from a position."""
        jumps = []
        if pos not in self.board or self.board[pos] is None:
            return jumps
        for dq, dr in self.DIRS:
            mid = (pos[0] + dq, pos[1] + dr)
            dest = (pos[0] + 2 * dq, pos[1] + 2 * dr)
            if (mid in self.board and self.board[mid] is not None and
                    dest in self.board and self.board[dest] is None):
                jumps.append((mid, dest))
        return jumps

    def _get_all_capture_sequences(self):
        """Get all possible capture sequences (including multi-jumps)."""
        sequences = []
        for pos in list(self.board):
            if self.board.get(pos) is not None:
                self._find_sequences(pos, [pos], [], sequences)
        return sequences

    def _find_sequences(self, pos, path, captured, sequences):
        """Recursively find all capture sequences from pos."""
        jumps = self._get_all_jumps_from(pos)
        extended = False
        for mid, dest in jumps:
            if mid not in [c[0] for c in captured]:  # don't jump already-captured
                # Temporarily make the jump
                marble = self.board[pos]
                jumped_marble = self.board[mid]
                self.board[pos] = None
                self.board[mid] = None
                self.board[dest] = marble
                new_captured = captured + [(mid, jumped_marble)]
                self._find_sequences(dest, path + [dest], new_captured, sequences)
                extended = True
                # Undo
                self.board[pos] = marble
                self.board[mid] = jumped_marble
                self.board[dest] = None
        if captured:  # at least one jump was made
            sequences.append((path, captured))

    def _check_forced_capture(self):
        """Check if current player must capture."""
        sequences = self._get_all_capture_sequences()
        self.must_capture = len(sequences) > 0

    def _check_winner(self, player):
        """Check if player meets a winning condition."""
        caps = self.captured[player]
        w = caps.count('W')
        g = caps.count('G')
        b = caps.count('B')
        # Win: 2W, 3G, 4B, or 1 of each
        return w >= 2 or g >= 3 or b >= 4 or (w >= 1 and g >= 1 and b >= 1)

    def _pool_empty(self):
        return all(v == 0 for v in self.pool.values())

    def display(self):
        print(f"\n  ZÈRTZ   Turn {self.turn_number}")
        print(f"  {self.players[0]} (P1) vs {self.players[1]} (P2)")
        print(f"  Current: {self.players[self.current_player - 1]}")
        print()

        # Pool
        print(f"  Pool: W={self.pool['W']} G={self.pool['G']} B={self.pool['B']}")

        # Captures
        for p in [1, 2]:
            caps = self.captured[p]
            w, g, b = caps.count('W'), caps.count('G'), caps.count('B')
            print(f"  {self.players[p-1]} captured: W={w} G={g} B={b}")
        print()

        if self.must_capture:
            print("  ** You MUST capture (jump) this turn **")
            print()

        # Display board
        if not self.board:
            return
        all_q = [p[0] for p in self.board]
        all_r = [p[1] for p in self.board]
        min_q, max_q = min(all_q), max(all_q)
        min_r, max_r = min(all_r), max(all_r)

        # Convert to offset display
        for r in range(min_r, max_r + 1):
            indent = "  " + " " * (r - min_r)
            row_str = indent
            for q in range(min_q, max_q + 1):
                pos = (q, r)
                if pos in self.board:
                    marble = self.board[pos]
                    if marble is None:
                        row_str += " . "
                    else:
                        row_str += f" {marble} "
                else:
                    row_str += "   "
            print(row_str)
        print()

        # Coordinate help
        print("  Coordinates: column,row (e.g. 0,0 is center)")
        print()

    def get_move(self):
        if self.must_capture:
            prompt = "  Enter capture (e.g. '0,1 0,-1' or multi: '0,2 0,0 0,-2'): "
        else:
            prompt = "  Place marble (e.g. 'W 0,1 remove 1,-2') or capture: "
        move_str = input_with_quit(prompt).strip()
        return move_str

    def make_move(self, move):
        if move is None or not move.strip():
            return False

        parts = move.strip().split()

        # Check if it's a capture move (positions only)
        if all(',' in p for p in parts):
            return self._do_capture(parts)

        # Place move: "W 0,1 remove 1,-2"
        if len(parts) >= 4 and parts[0].upper() in ('W', 'G', 'B') and parts[2].lower() == 'remove':
            if self.must_capture:
                print("  You must capture this turn!")
                return False
            color = parts[0].upper()
            place_pos = self._parse_pos(parts[1])
            remove_pos = self._parse_pos(parts[3])
            if place_pos is None or remove_pos is None:
                return False
            return self._do_place(color, place_pos, remove_pos)

        return False

    def _parse_pos(self, s):
        try:
            parts = s.split(',')
            return (int(parts[0]), int(parts[1]))
        except (ValueError, IndexError):
            return None

    def _do_place(self, color, place_pos, remove_pos):
        """Place a marble and remove an edge space."""
        if self.pool.get(color, 0) <= 0:
            print(f"  No {color} marbles left in pool.")
            return False
        if place_pos not in self.board:
            print("  Invalid position.")
            return False
        if self.board[place_pos] is not None:
            print("  Position is occupied.")
            return False
        if remove_pos not in self.board:
            print("  Remove position doesn't exist.")
            return False
        if self.board[remove_pos] is not None:
            print("  Can only remove empty spaces.")
            return False
        # Place first, then check removal (the placed marble makes that pos occupied)
        self.board[place_pos] = color
        self.pool[color] -= 1

        # After placing, check if remove_pos is still removable
        if not self._is_edge(remove_pos):
            # Undo
            self.board[place_pos] = None
            self.pool[color] += 1
            print("  Can only remove edge spaces.")
            return False

        # Check that removing won't disconnect the board
        # (simplified: just remove if it's an empty edge)
        if remove_pos == place_pos:
            # Can't remove where you just placed
            self.board[place_pos] = None
            self.pool[color] += 1
            print("  Can't remove the space you just placed on.")
            return False

        del self.board[remove_pos]
        return True

    def _do_capture(self, pos_strings):
        """Execute a capture sequence."""
        positions = []
        for s in pos_strings:
            p = self._parse_pos(s)
            if p is None:
                return False
            positions.append(p)

        if len(positions) < 2:
            print("  Need at least start and end position.")
            return False

        start = positions[0]
        if start not in self.board or self.board[start] is None:
            print("  No marble at start position.")
            return False

        # Validate and execute jump sequence
        marble = self.board[start]
        captured_marbles = []
        current = start

        for i in range(1, len(positions)):
            dest = positions[i]
            dq = dest[0] - current[0]
            dr = dest[1] - current[1]

            # Must be exactly 2 steps in a hex direction
            valid_jump = False
            for ddq, ddr in self.DIRS:
                if dq == 2 * ddq and dr == 2 * ddr:
                    valid_jump = True
                    break
            if not valid_jump:
                print(f"  Invalid jump from {current} to {dest}.")
                return False

            mid = (current[0] + dq // 2, current[1] + dr // 2)
            if mid not in self.board or self.board[mid] is None:
                print(f"  No marble to jump over at {mid}.")
                return False
            if dest not in self.board or self.board[dest] is not None:
                print(f"  Destination {dest} is not empty.")
                return False

            captured_marbles.append((mid, self.board[mid]))
            self.board[mid] = None
            self.board[dest] = marble
            self.board[current] = None
            current = dest

        # Check this is a maximal capture (must continue if possible)
        further_jumps = self._get_all_jumps_from(current)
        # Filter out already-captured positions
        captured_positions = [c[0] for c in captured_marbles]
        further_jumps = [(m, d) for m, d in further_jumps if m not in captured_positions]
        if further_jumps:
            # Undo everything
            self.board[start] = marble
            for mid_pos, mid_marble in captured_marbles:
                self.board[mid_pos] = mid_marble
            self.board[current] = None
            # Undo intermediate positions
            for i in range(1, len(positions) - 1):
                self.board[positions[i]] = None
            print("  Must continue jumping if possible (multi-jump required).")
            return False

        # Award captured marbles
        for _, cap_marble in captured_marbles:
            self.captured[self.current_player].append(cap_marble)

        return True

    def check_game_over(self):
        for p in [1, 2]:
            if self._check_winner(p):
                self.game_over = True
                self.winner = p
                return

        # Check if pool empty and no captures possible
        if self._pool_empty():
            # Count total captured
            t1 = len(self.captured[1])
            t2 = len(self.captured[2])
            if t1 != t2:
                self.game_over = True
                self.winner = 1 if t1 > t2 else 2
            else:
                self.game_over = True
                self.winner = None  # draw

        # Update forced capture for next player
        if not self.game_over:
            self._check_forced_capture()

    def switch_player(self):
        super().switch_player()
        self._check_forced_capture()

    def get_state(self):
        board_ser = {f"{q},{r}": v for (q, r), v in self.board.items()}
        return {
            "board": board_ser,
            "pool": self.pool,
            "captured": {str(k): v for k, v in self.captured.items()},
        }

    def load_state(self, state):
        self.board = {}
        for k, v in state["board"].items():
            q, r = k.split(",")
            self.board[(int(q), int(r))] = v
        self.pool = state["pool"]
        self.captured = {int(k): v for k, v in state["captured"].items()}
        self._check_forced_capture()

    def get_tutorial(self):
        return """
==================================================
  ZÈRTZ - Tutorial
==================================================

  OVERVIEW
  --------
  ZÈRTZ is a game from the GIPF project. Two
  players share a pool of marbles on a shrinking
  hexagonal board. Capture marbles to win!

  BOARD
  -----
  Standard: 37-space hexagonal ring
  Quick: 19-space hexagonal ring
  Coordinates use q,r axial format (0,0 = center).

  MARBLES
  -------
  Shared pool (standard): 6 White, 8 Grey, 10 Black
  Shared pool (quick): 3 White, 4 Grey, 5 Black

  HOW TO PLAY
  -----------
  On your turn, you MUST do one of:

  1. PLACE & SHRINK (if no captures available):
     Place any marble from the pool onto an empty
     space, then remove one empty edge space.
     Format: W 0,1 remove 1,-2
     (place White at 0,1, remove space at 1,-2)

  2. CAPTURE (mandatory if possible):
     Jump one marble over an adjacent marble to
     an empty space beyond. The jumped marble is
     captured by YOU. Multi-jumps are mandatory
     if the jumping marble can continue.
     Format: 0,1 0,-1 (jump from 0,1 to 0,-1)
     Multi:  0,2 0,0 0,-2 (two jumps in sequence)

  IMPORTANT: If you CAN capture, you MUST capture.
  You may not place when a capture exists.

  WINNING
  -------
  Collect any of these sets to win:
    - 2 White marbles
    - 3 Grey marbles
    - 4 Black marbles
    - 1 of each color (White + Grey + Black)

  If the pool runs out and no one has won, the
  player with more total captured marbles wins.

  STRATEGY
  --------
  - The board shrinks each turn you place, so
    plan which spaces to remove carefully.
  - Force captures that benefit you.
  - White marbles are rarest and hardest to get.
  - Sometimes sacrificing a marble sets up a
    multi-jump for bigger gains.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
