"""Hive - Insect-themed tile placement game on a hex grid."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


# Hex coordinate helpers using axial coordinates (q, r)
# Flat-top hex directions: E, NE, NW, W, SW, SE
HEX_DIRS = [(1, 0), (0, -1), (-1, -1), (-1, 0), (0, 1), (1, 1)]


def hex_neighbors(pos):
    """Return the 6 hex neighbors of a position."""
    q, r = pos
    return [(q + dq, r + dr) for dq, dr in HEX_DIRS]


def hex_distance(a, b):
    """Manhattan distance on hex grid (axial coordinates)."""
    dq = a[0] - b[0]
    dr = a[1] - b[1]
    return max(abs(dq), abs(dr), abs(dq + dr))


class HiveGame(BaseGame):
    """Hive: Insect-themed tile placement game."""

    name = "Hive"
    description = "Insect-themed tile placement game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Hive",
        "pocket": "Hive Pocket (with Mosquito & Ladybug)",
    }

    # Piece abbreviations for display
    PIECE_ABBR = {
        "Queen": "Q", "Ant": "A", "Spider": "S",
        "Beetle": "B", "Grasshopper": "G",
        "Mosquito": "M", "Ladybug": "L",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        # board maps (q, r) -> list of (player, piece_type) stacked bottom-up
        self.board = {}
        # pieces remaining in each player's hand: {player: {piece_type: count}}
        self.hands = {}
        # track how many pieces each player has placed (for queen-by-4th rule)
        self.pieces_placed = {1: 0, 2: 0}
        # whether each player's queen has been placed
        self.queen_placed = {1: False, 2: False}
        # position of each player's queen (for surrounding check)
        self.queen_pos = {1: None, 2: None}

    # ------------------------------------------------------------------ #
    #  Setup
    # ------------------------------------------------------------------ #

    def setup(self):
        """Initialize pieces for both players."""
        base_hand = {
            "Queen": 1, "Spider": 2, "Beetle": 2,
            "Grasshopper": 3, "Ant": 3,
        }
        if self.variation == "pocket":
            base_hand["Mosquito"] = 1
            base_hand["Ladybug"] = 1

        self.board = {}
        self.hands = {1: dict(base_hand), 2: dict(base_hand)}
        self.pieces_placed = {1: 0, 2: 0}
        self.queen_placed = {1: False, 2: False}
        self.queen_pos = {1: None, 2: None}

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

    def _pos_to_label(self, q, r):
        """Convert axial (q, r) to a human label like a1, b2, etc.

        We use q for column letter and r for row number.
        To keep labels friendly, we offset so the first placed piece
        area stays in positive-looking coordinates.
        """
        # We'll display raw axial coords as letter+number
        # Map q to letters, r to numbers, with offsets so things look nice
        col_char = chr(ord('a') + q + 26) if q < 0 else chr(ord('a') + q)
        # Wrap for very large offsets
        col_idx = (q % 26)
        col_char = chr(ord('a') + col_idx)
        row_label = str(r)
        return f"{col_char}{row_label}"

    def _label_to_pos(self, label):
        """Convert a human label like 'a0' to axial (q, r).

        Returns (q, r) or None if invalid.
        """
        label = label.strip().lower()
        if len(label) < 2:
            return None
        col_char = label[0]
        if not col_char.isalpha():
            return None
        rest = label[1:]
        # Handle negative row numbers
        try:
            r = int(rest)
        except ValueError:
            return None
        q = ord(col_char) - ord('a')
        return (q, r)

    def _top_piece(self, pos):
        """Return the top (player, piece_type) at pos, or None."""
        stack = self.board.get(pos)
        if stack:
            return stack[-1]
        return None

    def _piece_symbol(self, player, piece_type):
        """Short display symbol for a piece: e.g. '1Q', '2A'."""
        return f"{player}{self.PIECE_ABBR[piece_type]}"

    def display(self):
        """Display the hive as an ASCII hex grid."""
        print(f"\n  === Hive ({self.variations[self.variation]}) ===")
        print(f"  Turn {self.turn_number + 1}")

        # Show hands
        for p in [1, 2]:
            hand_str = ", ".join(
                f"{self.PIECE_ABBR[t]}x{c}" for t, c in self.hands[p].items() if c > 0
            )
            marker = " <<" if self.current_player == p else ""
            print(f"  Player {p}: [{hand_str}]{marker}")

        if not self.board:
            print("\n  Board is empty. Place your first piece!")
            print()
            return

        # Determine bounding box in axial coordinates
        all_positions = set(self.board.keys())
        # Also show empty neighbors as potential placement spots
        min_q = min(p[0] for p in all_positions) - 1
        max_q = max(p[0] for p in all_positions) + 1
        min_r = min(p[1] for p in all_positions) - 1
        max_r = max(p[1] for p in all_positions) + 1

        print()

        # Column header
        col_letters = []
        for q in range(min_q, max_q + 1):
            col_letters.append(chr(ord('a') + (q % 26)))

        # Print header
        header = "      " + "   ".join(col_letters)
        print(header)

        for r in range(min_r, max_r + 1):
            # Indent odd rows for hex stagger effect
            offset = "  " if (r % 2) != 0 else ""
            row_label = f"  {r:>3} {offset}"
            cells = []
            for q in range(min_q, max_q + 1):
                pos = (q, r)
                top = self._top_piece(pos)
                if top:
                    player, ptype = top
                    stack = self.board[pos]
                    sym = self._piece_symbol(player, ptype)
                    if len(stack) > 1:
                        sym += f"({len(stack)})"
                    cells.append(f"{sym:^4}")
                else:
                    # Show coordinate label for empty cells adjacent to hive
                    if any(n in self.board for n in hex_neighbors(pos)):
                        lbl = self._pos_to_label(q, r)
                        cells.append(f"{lbl:^4}")
                    else:
                        cells.append(" .  ")
            print(row_label + " ".join(cells))

        print()
        print(f"  Current player: Player {self.current_player}")
        print('  Place: "<piece> <coord>" (e.g. "Q a0")  Move: "<from> <to>" (e.g. "a0 b1")')
        print()

    # ------------------------------------------------------------------ #
    #  Coordinate / placement helpers
    # ------------------------------------------------------------------ #

    def _occupied_positions(self):
        """Set of all positions with at least one piece."""
        return set(self.board.keys())

    def _all_pieces_on_board(self, player=None):
        """Yield (pos, player, piece_type) for every top-level piece, optionally filtered."""
        for pos, stack in self.board.items():
            p, pt = stack[-1]
            if player is None or p == player:
                yield pos, p, pt

    def _valid_placement_positions(self, player):
        """Return set of positions where player can place a new piece.

        A new piece must be adjacent to a friendly piece and NOT adjacent
        to any opponent piece. Exception: the very first two placements.
        """
        occupied = self._occupied_positions()

        # Very first piece of the game
        if not occupied:
            return {(0, 0)}

        # Second piece of the game: must be adjacent to first piece
        if len(occupied) == 1:
            existing_pos = next(iter(occupied))
            return set(hex_neighbors(existing_pos)) - occupied

        # Normal placement: adjacent to own pieces, not adjacent to opponent
        own_positions = set()
        opp_positions = set()
        for pos, stack in self.board.items():
            top_player = stack[-1][0]
            if top_player == player:
                own_positions.add(pos)
            else:
                opp_positions.add(pos)

        # Candidate positions: empty cells adjacent to own pieces
        candidates = set()
        for pos in own_positions:
            for n in hex_neighbors(pos):
                if n not in occupied:
                    candidates.add(n)

        # Filter: must not be adjacent to opponent pieces
        valid = set()
        for c in candidates:
            if not any(n in opp_positions for n in hex_neighbors(c)):
                valid.add(c)

        return valid

    # ------------------------------------------------------------------ #
    #  One-hive rule
    # ------------------------------------------------------------------ #

    def _is_hive_connected(self, exclude=None):
        """Check if all pieces form one connected group (ignoring exclude pos).

        If exclude is given, we check connectivity as if that position's
        top piece were removed.
        """
        positions = set(self.board.keys())
        if exclude is not None:
            # If removing top piece leaves stack, position stays
            stack = self.board.get(exclude, [])
            if len(stack) <= 1:
                positions.discard(exclude)

        if not positions:
            return True

        start = next(iter(positions))
        visited = set()
        queue = deque([start])
        visited.add(start)

        while queue:
            cur = queue.popleft()
            for n in hex_neighbors(cur):
                if n in positions and n not in visited:
                    visited.add(n)
                    queue.append(n)

        return visited == positions

    def _can_slide(self, from_pos, to_pos):
        """Check if a piece can physically slide from from_pos to to_pos.

        The slide is valid if:
        - to_pos is a neighbor of from_pos
        - There's a shared neighbor that is empty (gate is not blocked)
        - The piece stays connected to the hive after moving
        """
        if to_pos not in hex_neighbors(from_pos):
            return False

        # Gate check: the two common neighbors of from_pos and to_pos
        from_neighbors = set(hex_neighbors(from_pos))
        to_neighbors = set(hex_neighbors(to_pos))
        common = from_neighbors & to_neighbors

        occupied = self._occupied_positions() - {from_pos}
        # At least one common neighbor must be empty for the piece to slide through
        blocked = all(c in occupied for c in common)
        if blocked:
            return False

        # Must stay touching the hive
        if to_pos not in occupied:
            # to_pos must be adjacent to at least one occupied cell (other than from_pos)
            if not any(n in occupied for n in hex_neighbors(to_pos)):
                return False

        return True

    # ------------------------------------------------------------------ #
    #  Movement per piece type
    # ------------------------------------------------------------------ #

    def _get_valid_moves_for_piece(self, pos):
        """Return set of valid destination positions for the piece at pos."""
        stack = self.board.get(pos, [])
        if not stack:
            return set()

        player, piece_type = stack[-1]

        # One-hive check: can we remove this piece?
        if len(stack) == 1:
            if not self._is_hive_connected(exclude=pos):
                return set()

        if piece_type == "Queen":
            return self._queen_moves(pos)
        elif piece_type == "Ant":
            return self._ant_moves(pos)
        elif piece_type == "Spider":
            return self._spider_moves(pos)
        elif piece_type == "Beetle":
            return self._beetle_moves(pos)
        elif piece_type == "Grasshopper":
            return self._grasshopper_moves(pos)
        elif piece_type == "Mosquito":
            return self._mosquito_moves(pos)
        elif piece_type == "Ladybug":
            return self._ladybug_moves(pos)
        return set()

    def _queen_moves(self, pos):
        """Queen: slide exactly 1 space."""
        moves = set()
        for n in hex_neighbors(pos):
            if n not in self.board and self._can_slide(pos, n):
                moves.add(n)
        return moves

    def _ant_moves(self, pos):
        """Ant: slide any number of spaces around the perimeter."""
        # BFS along the perimeter
        occupied = self._occupied_positions() - {pos}
        visited = set()
        queue = deque()

        # Start: all valid single slides from pos
        for n in hex_neighbors(pos):
            if n not in occupied and self._can_slide(pos, n):
                # Also verify n stays adjacent to hive
                if any(nn in occupied for nn in hex_neighbors(n)):
                    visited.add(n)
                    queue.append(n)

        while queue:
            cur = queue.popleft()
            for n in hex_neighbors(cur):
                if n not in occupied and n not in visited and n != pos:
                    if self._can_slide_at(cur, n, occupied):
                        if any(nn in occupied for nn in hex_neighbors(n)):
                            visited.add(n)
                            queue.append(n)

        return visited

    def _can_slide_at(self, from_pos, to_pos, occupied):
        """Check slide between two positions given a set of occupied cells."""
        if to_pos not in hex_neighbors(from_pos):
            return False
        from_neighbors = set(hex_neighbors(from_pos))
        to_neighbors = set(hex_neighbors(to_pos))
        common = from_neighbors & to_neighbors
        blocked = all(c in occupied for c in common)
        return not blocked

    def _spider_moves(self, pos):
        """Spider: exactly 3 slides along the perimeter."""
        occupied = self._occupied_positions() - {pos}
        # DFS/BFS tracking exactly 3 steps
        results = set()

        def dfs(cur, steps, visited_path):
            if steps == 3:
                results.add(cur)
                return
            for n in hex_neighbors(cur):
                if n not in occupied and n != pos and n not in visited_path:
                    if self._can_slide_at(cur, n, occupied):
                        if any(nn in occupied for nn in hex_neighbors(n)):
                            visited_path.add(n)
                            dfs(n, steps + 1, visited_path)
                            visited_path.discard(n)

        dfs(pos, 0, {pos})
        return results

    def _beetle_moves(self, pos):
        """Beetle: move 1 space, can climb on top of the hive."""
        moves = set()
        stack = self.board.get(pos, [])
        on_top = len(stack) > 1  # beetle is on top of another piece

        for n in hex_neighbors(pos):
            if n in self.board:
                # Moving onto another piece (climbing) - always allowed
                # as long as it doesn't violate gate rule when on ground level
                if on_top:
                    moves.add(n)
                else:
                    # Ground level beetle climbing up onto adjacent piece
                    moves.add(n)
            else:
                # Moving to empty space
                if on_top:
                    # Coming down from on top - always possible to adjacent empty
                    # as long as it stays connected
                    occupied_without = self._occupied_positions() - {pos} if len(stack) <= 1 else self._occupied_positions()
                    if any(nn in occupied_without for nn in hex_neighbors(n)):
                        moves.add(n)
                else:
                    # Regular ground slide
                    if self._can_slide(pos, n):
                        moves.add(n)
        return moves

    def _grasshopper_moves(self, pos):
        """Grasshopper: jump in a straight line over at least one piece."""
        moves = set()
        for dq, dr in HEX_DIRS:
            # Move in direction until we find an empty cell after passing pieces
            q, r = pos
            q += dq
            r += dr
            if (q, r) not in self.board:
                continue  # must jump over at least one piece
            while (q, r) in self.board:
                q += dq
                r += dr
            moves.add((q, r))
        return moves

    def _mosquito_moves(self, pos):
        """Mosquito: copies the movement of any adjacent piece type."""
        stack = self.board.get(pos, [])
        # If mosquito is on top of the hive (stacked), it moves as beetle
        if len(stack) > 1:
            return self._beetle_moves(pos)

        moves = set()
        piece_types_seen = set()
        for n in hex_neighbors(pos):
            top = self._top_piece(n)
            if top:
                _, ptype = top
                if ptype == "Mosquito":
                    continue  # don't copy another mosquito
                if ptype not in piece_types_seen:
                    piece_types_seen.add(ptype)
                    if ptype == "Queen":
                        moves |= self._queen_moves(pos)
                    elif ptype == "Ant":
                        moves |= self._ant_moves(pos)
                    elif ptype == "Spider":
                        moves |= self._spider_moves(pos)
                    elif ptype == "Beetle":
                        moves |= self._beetle_moves(pos)
                    elif ptype == "Grasshopper":
                        moves |= self._grasshopper_moves(pos)
                    elif ptype == "Ladybug":
                        moves |= self._ladybug_moves(pos)
        return moves

    def _ladybug_moves(self, pos):
        """Ladybug: 2 moves on top of the hive, then 1 move down.

        Step 1: climb onto an adjacent occupied cell
        Step 2: move on top to another occupied cell
        Step 3: move down to an empty adjacent cell
        """
        occupied = self._occupied_positions() - {pos}
        results = set()

        # Step 1: move onto an adjacent piece
        for n1 in hex_neighbors(pos):
            if n1 in occupied:
                # Step 2: move on top to another adjacent piece
                for n2 in hex_neighbors(n1):
                    if n2 in occupied and n2 != pos:
                        # Step 3: come down to an empty adjacent cell
                        for n3 in hex_neighbors(n2):
                            if n3 not in occupied and n3 != pos:
                                # Must be adjacent to hive when landing
                                if any(nn in occupied for nn in hex_neighbors(n3)):
                                    results.add(n3)
        return results

    # ------------------------------------------------------------------ #
    #  Win condition
    # ------------------------------------------------------------------ #

    def _is_surrounded(self, pos):
        """Check if all 6 hex neighbors of pos are occupied."""
        if pos is None:
            return False
        return all(n in self.board for n in hex_neighbors(pos))

    # ------------------------------------------------------------------ #
    #  Input
    # ------------------------------------------------------------------ #

    def get_move(self):
        """Get a move from the current player.

        Format:
          Place: "<piece_abbr> <coord>" e.g. "Q a0"
          Move:  "<from_coord> <to_coord>" e.g. "a0 b1"
        """
        player = self.current_player
        player_name = self.players[player - 1]

        while True:
            raw = input_with_quit(
                f"  {player_name} (P{player}), enter move: "
            ).strip()

            parts = raw.split()
            if len(parts) == 2:
                first = parts[0].upper()

                # Check if first part is a piece abbreviation (placement)
                abbr_to_type = {v: k for k, v in self.PIECE_ABBR.items()}
                if first in abbr_to_type:
                    piece_type = abbr_to_type[first]
                    dest = self._label_to_pos(parts[1])
                    if dest is None:
                        print("  Invalid coordinate. Use format like 'a0'.")
                        continue
                    return ("place", piece_type, dest)
                else:
                    # Movement: from to
                    src = self._label_to_pos(parts[0])
                    dst = self._label_to_pos(parts[1])
                    if src is None or dst is None:
                        print("  Invalid coordinates. Use format like 'a0 b1'.")
                        continue
                    return ("move", src, dst)
            else:
                print('  Invalid format. Place: "Q a0"  Move: "a0 b1"')

    # ------------------------------------------------------------------ #
    #  Make move
    # ------------------------------------------------------------------ #

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        player = self.current_player

        if move[0] == "place":
            return self._do_place(player, move[1], move[2])
        elif move[0] == "move":
            return self._do_move(player, move[1], move[2])
        return False

    def _do_place(self, player, piece_type, dest):
        """Place a piece from hand onto the board."""
        # Check piece is in hand
        if self.hands[player].get(piece_type, 0) <= 0:
            print(f"  You have no {piece_type} left to place.")
            return False

        # Queen-by-4th-turn rule: if this is the 4th piece and queen not placed
        placing_count = self.pieces_placed[player]
        if placing_count == 3 and not self.queen_placed[player]:
            if piece_type != "Queen":
                print("  You must place your Queen by your 4th turn!")
                return False

        # Check valid placement position
        valid_positions = self._valid_placement_positions(player)
        if dest not in valid_positions:
            print("  Invalid placement position.")
            return False

        # Place the piece
        self.board.setdefault(dest, []).append((player, piece_type))
        self.hands[player][piece_type] -= 1
        self.pieces_placed[player] += 1

        if piece_type == "Queen":
            self.queen_placed[player] = True
            self.queen_pos[player] = dest

        return True

    def _do_move(self, player, src, dst):
        """Move a piece on the board."""
        # Must have placed queen before moving
        if not self.queen_placed[player]:
            print("  You must place your Queen before moving pieces.")
            return False

        # Check there's a piece at src belonging to player
        stack = self.board.get(src)
        if not stack:
            print("  No piece at that position.")
            return False

        top_player, top_type = stack[-1]
        if top_player != player:
            print("  That piece doesn't belong to you.")
            return False

        # Check destination is valid for this piece type
        valid_dests = self._get_valid_moves_for_piece(src)
        if dst not in valid_dests:
            print("  Invalid move for that piece.")
            return False

        # Execute the move
        piece = stack.pop()
        if not stack:
            del self.board[src]

        self.board.setdefault(dst, []).append(piece)

        # Update queen position if queen moved
        if top_type == "Queen":
            self.queen_pos[player] = dst

        return True

    # ------------------------------------------------------------------ #
    #  Game over check
    # ------------------------------------------------------------------ #

    def check_game_over(self):
        """Check if either queen is surrounded."""
        p1_surrounded = self._is_surrounded(self.queen_pos.get(1))
        p2_surrounded = self._is_surrounded(self.queen_pos.get(2))

        if p1_surrounded and p2_surrounded:
            # Both surrounded = draw
            self.game_over = True
            self.winner = None
        elif p1_surrounded:
            self.game_over = True
            self.winner = 2
        elif p2_surrounded:
            self.game_over = True
            self.winner = 1

    # ------------------------------------------------------------------ #
    #  State serialization
    # ------------------------------------------------------------------ #

    def get_state(self):
        """Return serializable game state."""
        # Convert board keys from tuples to strings for JSON
        board_serial = {}
        for pos, stack in self.board.items():
            key = f"{pos[0]},{pos[1]}"
            board_serial[key] = [(p, t) for p, t in stack]

        return {
            "board": board_serial,
            "hands": {str(k): dict(v) for k, v in self.hands.items()},
            "pieces_placed": {str(k): v for k, v in self.pieces_placed.items()},
            "queen_placed": {str(k): v for k, v in self.queen_placed.items()},
            "queen_pos": {
                str(k): list(v) if v else None
                for k, v in self.queen_pos.items()
            },
            "variation": self.variation,
        }

    def load_state(self, state):
        """Restore game state."""
        self.variation = state["variation"]
        self.board = {}
        for key, stack in state["board"].items():
            q, r = key.split(",")
            pos = (int(q), int(r))
            self.board[pos] = [(p, t) for p, t in stack]

        self.hands = {int(k): dict(v) for k, v in state["hands"].items()}
        self.pieces_placed = {int(k): v for k, v in state["pieces_placed"].items()}
        self.queen_placed = {int(k): v for k, v in state["queen_placed"].items()}
        self.queen_pos = {}
        for k, v in state["queen_pos"].items():
            self.queen_pos[int(k)] = tuple(v) if v else None

    # ------------------------------------------------------------------ #
    #  Tutorial
    # ------------------------------------------------------------------ #

    def get_tutorial(self):
        """Return tutorial text for Hive."""
        pocket_text = ""
        if self.variation == "pocket":
            pocket_text = """
  POCKET EDITION PIECES
  ---------------------
  Mosquito (M) x1 : Copies the movement ability of any
                     adjacent piece. If on top of the hive,
                     moves as a Beetle.

  Ladybug (L) x1  : Moves exactly 3 spaces: 2 on top of
                     the hive, then 1 down. Can reach
                     positions other pieces cannot.
"""

        return f"""
==============================================================
                     HIVE  TUTORIAL
==============================================================

OVERVIEW
  Hive is a two-player strategy game where insect tiles are
  placed and moved on a hexagonal grid that grows as the game
  progresses. There is no fixed board -- the "hive" is formed
  by the pieces themselves.

  The goal is to completely surround your opponent's Queen Bee.

--------------------------------------------------------------
PIECES (per player)
--------------------------------------------------------------
  Queen Bee (Q) x1    : Moves 1 space by sliding.
                        Must be placed by your 4th turn.

  Ant (A) x3          : Slides any number of spaces around
                        the outside of the hive.

  Spider (S) x2       : Slides exactly 3 spaces around the
                        outside of the hive.

  Beetle (B) x2       : Moves 1 space. Can climb on top of
                        other pieces, pinning them.

  Grasshopper (G) x3  : Jumps in a straight line over one or
                        more pieces to the first empty space.
{pocket_text}
--------------------------------------------------------------
PLACEMENT RULES
--------------------------------------------------------------
  1. First piece: placed anywhere (convention: a0).
  2. Second piece: must be adjacent to the first piece.
  3. All subsequent placements must be adjacent to at least
     one of your own pieces and NOT adjacent to any opponent
     piece.
  4. Your Queen Bee MUST be placed by your 4th turn.

--------------------------------------------------------------
MOVEMENT RULES
--------------------------------------------------------------
  - You may only move pieces after your Queen is placed.
  - ONE-HIVE RULE: Moving a piece must not split the hive
    into disconnected groups.
  - Freedom of movement: a piece can only slide between two
    other pieces if the gap is wide enough.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  A player wins when the opponent's Queen Bee is completely
  surrounded on all 6 sides (by any combination of pieces,
  including the winner's own). If both queens are surrounded
  simultaneously, the game is a draw.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Placing a piece:
    <piece_letter> <coordinate>
    Examples: Q a0    (place Queen at a0)
              A b1    (place Ant at b1)

  Moving a piece:
    <from_coordinate> <to_coordinate>
    Examples: a0 b1   (move piece from a0 to b1)

  Coordinates use column letter + row number as shown on the
  displayed board.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
