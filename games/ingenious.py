"""Ingenious - A hexagonal tile-laying game by Reiner Knizia."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# The 6 colors used in the game
COLORS = ["R", "O", "Y", "G", "B", "P"]  # Red, Orange, Yellow, Green, Blue, Purple
COLOR_NAMES = {
    "R": "Red", "O": "Orange", "Y": "Yellow",
    "G": "Green", "B": "Blue", "P": "Purple",
}
COLOR_DISPLAY = {
    "R": "\033[91mR\033[0m",
    "O": "\033[33mO\033[0m",
    "Y": "\033[93mY\033[0m",
    "G": "\033[92mG\033[0m",
    "B": "\033[94mB\033[0m",
    "P": "\033[95mP\033[0m",
    None: ".",
}


class IngeniousGame(BaseGame):
    """Ingenious: Score by matching colors along hex lines."""

    name = "Ingenious"
    description = "Hexagonal tile-laying game -- balance your colors to win"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (base-6 hex board, 120 tiles)",
        "small": "Small (base-4 hex board, 60 tiles)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.base = 0
        self.board = {}           # (r, c) -> color letter or None
        self.cells = set()        # all valid (r, c) positions
        self.scores = {1: {}, 2: {}}  # player -> {color: score}
        self.hands = {1: [], 2: []}   # player -> list of (color1, color2)
        self.bag = []             # remaining tiles
        self.bonus_turn = False   # whether current player gets a bonus turn
        self.hand_size = 6

    def setup(self):
        """Initialize the hex board, tile bag, and player hands."""
        if self.variation == "small":
            self.base = 4
        else:
            self.base = 6

        b = self.base
        self.board = {}
        self.cells = set()

        # Build hex grid (same coordinate scheme as Havannah)
        total_rows = 2 * b - 1
        for r in range(total_rows):
            row_len = self._row_length(r)
            for c in range(row_len):
                self.cells.add((r, c))

        # Initialize scores: 0 for each color for each player
        for p in [1, 2]:
            self.scores[p] = {color: 0 for color in COLORS}

        # Build the tile bag: all combinations of 2 colors (with repetition)
        self.bag = []
        for i, c1 in enumerate(COLORS):
            for c2 in COLORS[i:]:
                # In a standard game, there are multiple copies of each tile
                if self.variation == "small":
                    copies = 2
                else:
                    copies = 4
                for _ in range(copies):
                    self.bag.append((c1, c2))
        random.shuffle(self.bag)

        # Deal initial hands
        for p in [1, 2]:
            self.hands[p] = []
            for _ in range(self.hand_size):
                if self.bag:
                    self.hands[p].append(self.bag.pop())

    def _row_length(self, r):
        """Return the number of columns in row r."""
        b = self.base
        if r < b:
            return b + r
        else:
            return b + (2 * b - 2 - r)

    def _neighbors(self, r, c):
        """Return list of valid neighbor cells for (r, c)."""
        b = self.base
        if r < b - 1:
            candidates = [
                (r, c - 1), (r, c + 1),
                (r - 1, c - 1), (r - 1, c),
                (r + 1, c), (r + 1, c + 1),
            ]
        elif r == b - 1:
            candidates = [
                (r, c - 1), (r, c + 1),
                (r - 1, c - 1), (r - 1, c),
                (r + 1, c - 1), (r + 1, c),
            ]
        else:
            candidates = [
                (r, c - 1), (r, c + 1),
                (r - 1, c), (r - 1, c + 1),
                (r + 1, c - 1), (r + 1, c),
            ]
        return [(nr, nc) for nr, nc in candidates if (nr, nc) in self.cells]

    def _direction_vectors(self, r, c):
        """Return the 6 direction neighbor offsets for cell (r, c).

        Returns a list of 6 (dr, dc) pairs, grouped into 3 opposing pairs:
        directions[0] and directions[3] are opposites, etc.
        This is used for line scoring.
        """
        b = self.base
        if r < b - 1:
            # Top half: row below is longer, row above is shorter
            return [
                (0, -1),   # left
                (0, 1),    # right
                (-1, -1),  # upper-left
                (-1, 0),   # upper-right
                (1, 0),    # lower-left
                (1, 1),    # lower-right
            ]
        elif r == b - 1:
            # Middle row
            return [
                (0, -1),   # left
                (0, 1),    # right
                (-1, -1),  # upper-left
                (-1, 0),   # upper-right
                (1, -1),   # lower-left
                (1, 0),    # lower-right
            ]
        else:
            # Bottom half: row below is shorter, row above is longer
            return [
                (0, -1),   # left
                (0, 1),    # right
                (-1, 0),   # upper-left
                (-1, 1),   # upper-right
                (1, -1),   # lower-left
                (1, 0),    # lower-right
            ]

    def _count_line(self, r, c, dr, dc, color):
        """Count consecutive cells of `color` starting from (r,c) going in direction (dr,dc).

        Does NOT count the starting cell itself.
        """
        count = 0
        cr, cc = r + dr, c + dc
        while True:
            if (cr, cc) not in self.cells:
                break
            if self.board.get((cr, cc)) != color:
                break
            count += 1
            # Need to get the correct direction vector for the new cell
            new_dirs = self._direction_vectors(cr, cc)
            old_dirs = self._direction_vectors(r, c) if count == 1 else self._direction_vectors(cr - dr, cc - dc)
            # Find the matching direction from the new cell
            # The direction we came from is the opposite of where we want to go
            # We need to continue in the "same" hex direction
            # For hex grids with variable offsets, we need to recompute dr, dc
            # based on the current cell's position
            next_r, next_c = cr + self._get_continuation(cr, cc, r if count == 1 else cr - dr, c if count == 1 else cc - dc, dr, dc)
            # This is getting complex. Let's use a simpler approach.
            break  # placeholder

        # Simpler approach: use neighbor-based line tracing
        return count

    def _trace_line(self, start_r, start_c, dir_idx, color):
        """Trace a line from (start_r, start_c) in direction dir_idx, counting matching colors.

        dir_idx is 0-5, indexing into the direction vectors.
        Does NOT count the starting cell.
        Returns the count of consecutive matching-color cells.
        """
        count = 0
        cr, cc = start_r, start_c

        while True:
            dirs = self._direction_vectors(cr, cc)
            dr, dc = dirs[dir_idx]
            nr, nc = cr + dr, cc + dc
            if (nr, nc) not in self.cells:
                break
            if self.board.get((nr, nc)) != color:
                break
            count += 1
            cr, cc = nr, nc

        return count

    def _score_placement(self, r1, c1, color1, r2, c2, color2):
        """Calculate scores earned by placing tile with color1 at (r1,c1) and color2 at (r2,c2).

        For each end, score = sum of matching colors in 5 directions (all except toward the other end).
        Returns dict {color: points_earned}.
        """
        score_gains = {color: 0 for color in COLORS}

        # Find which direction index connects (r1,c1) to (r2,c2) and vice versa
        dirs1 = self._direction_vectors(r1, c1)
        dir_to_2 = None
        for i, (dr, dc) in enumerate(dirs1):
            if (r1 + dr, c1 + dc) == (r2, c2):
                dir_to_2 = i
                break

        dirs2 = self._direction_vectors(r2, c2)
        dir_to_1 = None
        for i, (dr, dc) in enumerate(dirs2):
            if (r2 + dr, c2 + dc) == (r1, c1):
                dir_to_1 = i
                break

        # Score from end 1: trace in all 6 directions except toward end 2
        for d in range(6):
            if d == dir_to_2:
                continue
            score_gains[color1] += self._trace_line(r1, c1, d, color1)

        # Score from end 2: trace in all 6 directions except toward end 1
        for d in range(6):
            if d == dir_to_1:
                continue
            score_gains[color2] += self._trace_line(r2, c2, d, color2)

        return score_gains

    def _get_valid_placements(self):
        """Return all valid (r1, c1, r2, c2) pairs where a tile can be placed.

        Both cells must be empty and adjacent to each other.
        """
        placements = []
        empty_cells = [cell for cell in self.cells if cell not in self.board]
        empty_set = set(empty_cells)

        for (r, c) in empty_cells:
            for (nr, nc) in self._neighbors(r, c):
                if (nr, nc) in empty_set:
                    # Avoid duplicates: only add if (r,c) < (nr,nc) lexicographically
                    if (r, c) < (nr, nc):
                        placements.append((r, c, nr, nc))
        return placements

    def _can_place_any(self, player):
        """Check if the player can place any tile from their hand."""
        placements = self._get_valid_placements()
        return len(placements) > 0 and len(self.hands[player]) > 0

    def display(self):
        """Display the hex board with colored tiles and score info."""
        b = self.base
        total_rows = 2 * b - 1
        max_row_len = 2 * b - 1

        player_name = self.players[self.current_player - 1]
        opp = 3 - self.current_player

        print(f"\n  === Ingenious ({self.variation.title()}) ===")
        print(f"  {self.players[0]} (P1) vs {self.players[1]} (P2)")
        if self.bonus_turn:
            print(f"  *** BONUS TURN for {player_name}! ***")
        else:
            print(f"  Current turn: {player_name}")
        print()

        # Display scores side by side
        print("  Scores:")
        for color in COLORS:
            c_disp = COLOR_DISPLAY[color]
            s1 = self.scores[1][color]
            s2 = self.scores[2][color]
            bar1 = "#" * s1 + "." * (18 - s1)
            bar2 = "#" * s2 + "." * (18 - s2)
            print(f"    {c_disp} {COLOR_NAMES[color]:>7}: P1 [{bar1}] {s1:2}  P2 [{bar2}] {s2:2}")

        # Show minimum scores
        min1 = min(self.scores[1].values())
        min2 = min(self.scores[2].values())
        print(f"    Minimum:  P1 = {min1}   P2 = {min2}")
        print()

        # Display the board
        for r in range(total_rows):
            row_len = self._row_length(r)
            indent = max_row_len - row_len
            row_label = f"{r + 1:>3}"
            line_parts = [" " * indent + row_label + "  "]
            for c in range(row_len):
                cell_val = self.board.get((r, c))
                if cell_val is not None:
                    line_parts.append(COLOR_DISPLAY[cell_val])
                else:
                    line_parts.append(".")
            line = " ".join(line_parts)
            line += f"    (cols a-{chr(ord('a') + row_len - 1)})"
            print(line)

        print()

        # Show current player's hand
        print(f"  {player_name}'s hand:")
        for i, (c1, c2) in enumerate(self.hands[self.current_player]):
            d1 = COLOR_DISPLAY[c1]
            d2 = COLOR_DISPLAY[c2]
            print(f"    {i + 1}. [{d1}-{d2}]  ({COLOR_NAMES[c1]}-{COLOR_NAMES[c2]})")
        print(f"  Tiles remaining in bag: {len(self.bag)}")
        print()

    def get_move(self):
        """Get a tile placement from the current player.

        Format: tile_number row1 col1 row2 col2
        e.g. '1 3 d 3 e' means place tile 1 with first end at (3,d) and second at (3,e).
        """
        player_name = self.players[self.current_player - 1]
        hand = self.hands[self.current_player]
        b = self.base
        total_rows = 2 * b - 1

        while True:
            raw = input_with_quit(
                f"  {player_name}, enter tile# row1 col1 row2 col2 (e.g. '1 3 d 3 e'): "
            ).strip().lower()

            parts = raw.split()
            if len(parts) != 5:
                print("  Format: tile# row1 col1 row2 col2 (e.g. '1 3 d 3 e')")
                continue

            try:
                tile_idx = int(parts[0]) - 1
            except ValueError:
                print("  Tile number must be a number.")
                continue

            if tile_idx < 0 or tile_idx >= len(hand):
                print(f"  Tile number must be 1-{len(hand)}.")
                continue

            # Parse the two cell coordinates
            coords = []
            valid = True
            for i in range(2):
                row_str = parts[1 + i * 2]
                col_str = parts[2 + i * 2]
                try:
                    row_num = int(row_str)
                except ValueError:
                    # Maybe col first: try swapping
                    try:
                        row_num = int(col_str)
                        col_str = row_str
                    except ValueError:
                        print(f"  Invalid coordinates for end {i + 1}.")
                        valid = False
                        break

                if len(col_str) != 1 or not col_str.isalpha():
                    print(f"  Column must be a single letter.")
                    valid = False
                    break

                r = row_num - 1
                c = ord(col_str) - ord('a')

                if r < 0 or r >= total_rows:
                    print(f"  Row must be 1 to {total_rows}.")
                    valid = False
                    break

                row_len = self._row_length(r)
                if c < 0 or c >= row_len:
                    print(f"  Column must be a-{chr(ord('a') + row_len - 1)} for row {row_num}.")
                    valid = False
                    break

                if (r, c) not in self.cells:
                    print(f"  Invalid cell.")
                    valid = False
                    break

                coords.append((r, c))

            if not valid:
                continue

            r1, c1 = coords[0]
            r2, c2 = coords[1]

            # Check cells are empty
            if (r1, c1) in self.board:
                print(f"  Cell ({parts[1]}, {parts[2]}) is already occupied.")
                continue
            if (r2, c2) in self.board:
                print(f"  Cell ({parts[3]}, {parts[4]}) is already occupied.")
                continue

            # Check cells are adjacent
            if (r2, c2) not in self._neighbors(r1, c1):
                print("  The two cells must be adjacent!")
                continue

            # Check cells are different
            if (r1, c1) == (r2, c2):
                print("  The two cells must be different!")
                continue

            return (tile_idx, r1, c1, r2, c2)

    def make_move(self, move):
        """Place a tile on the board, update scores.

        Returns True if the move was valid.
        """
        tile_idx, r1, c1, r2, c2 = move
        player = self.current_player
        hand = self.hands[player]

        if tile_idx < 0 or tile_idx >= len(hand):
            print("  Invalid tile index!")
            return False

        if (r1, c1) in self.board or (r2, c2) in self.board:
            print("  One or both cells are occupied!")
            return False

        if (r2, c2) not in self._neighbors(r1, c1):
            print("  Cells are not adjacent!")
            return False

        color1, color2 = hand[tile_idx]

        # Place tile on board
        self.board[(r1, c1)] = color1
        self.board[(r2, c2)] = color2

        # Calculate score
        score_gains = self._score_placement(r1, c1, color1, r2, c2, color2)

        # Apply scores (cap at 18)
        hit_18 = False
        for color in COLORS:
            if score_gains[color] > 0:
                old_score = self.scores[player][color]
                new_score = min(18, old_score + score_gains[color])
                self.scores[player][color] = new_score
                if new_score == 18 and old_score < 18:
                    hit_18 = True

        # Remove tile from hand
        hand.pop(tile_idx)

        # Refill hand from bag
        while len(hand) < self.hand_size and self.bag:
            hand.append(self.bag.pop())

        # Check for bonus turn (hitting 18 in any color)
        self.bonus_turn = hit_18

        return True

    def check_game_over(self):
        """Check if the game is over (no valid placements possible)."""
        # Check if any placements exist at all
        placements = self._get_valid_placements()

        if not placements:
            self.game_over = True
            # Determine winner by highest minimum score
            min1 = min(self.scores[1].values())
            min2 = min(self.scores[2].values())
            if min1 > min2:
                self.winner = 1
            elif min2 > min1:
                self.winner = 2
            else:
                # Tiebreak: compare second-lowest, then third-lowest, etc.
                sorted1 = sorted(self.scores[1].values())
                sorted2 = sorted(self.scores[2].values())
                if sorted1 > sorted2:
                    self.winner = 1
                elif sorted2 > sorted1:
                    self.winner = 2
                else:
                    self.winner = None  # Draw
            return

        # Also check if current player has no tiles (and bag is empty)
        if not self.hands[self.current_player] and not self.bag:
            # Check if the other player also has no tiles
            other = 3 - self.current_player
            if not self.hands[other]:
                self.game_over = True
                min1 = min(self.scores[1].values())
                min2 = min(self.scores[2].values())
                if min1 > min2:
                    self.winner = 1
                elif min2 > min1:
                    self.winner = 2
                else:
                    sorted1 = sorted(self.scores[1].values())
                    sorted2 = sorted(self.scores[2].values())
                    if sorted1 > sorted2:
                        self.winner = 1
                    elif sorted2 > sorted1:
                        self.winner = 2
                    else:
                        self.winner = None

    def switch_player(self):
        """Switch player, but grant bonus turn if a color hit 18."""
        if self.bonus_turn:
            self.bonus_turn = False
            # Stay on the same player - don't switch
            # But only if the player can actually place a tile
            if self._can_place_any(self.current_player):
                return
        self.current_player = 2 if self.current_player == 1 else 1

    def get_state(self):
        """Return serializable game state."""
        board_serialized = {f"{r},{c}": v for (r, c), v in self.board.items()}
        return {
            "base": self.base,
            "board": board_serialized,
            "scores": {str(k): v for k, v in self.scores.items()},
            "hands": {str(k): v for k, v in self.hands.items()},
            "bag": self.bag,
            "bonus_turn": self.bonus_turn,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.base = state["base"]
        self.variation = "small" if self.base == 4 else "standard"
        self.bonus_turn = state.get("bonus_turn", False)

        # Rebuild cells
        self.cells = set()
        total_rows = 2 * self.base - 1
        for r in range(total_rows):
            row_len = self._row_length(r)
            for c in range(row_len):
                self.cells.add((r, c))

        # Restore board
        self.board = {}
        for key, v in state["board"].items():
            r, c = key.split(",")
            self.board[(int(r), int(c))] = v

        # Restore scores
        self.scores = {}
        for k, v in state["scores"].items():
            self.scores[int(k)] = v

        # Restore hands (convert lists back to tuples)
        self.hands = {}
        for k, v in state["hands"].items():
            self.hands[int(k)] = [tuple(tile) for tile in v]

        # Restore bag
        self.bag = [tuple(tile) for tile in state.get("bag", [])]

    def get_tutorial(self):
        """Return tutorial text for Ingenious."""
        return """
==============================================================
                   INGENIOUS  TUTORIAL
==============================================================

OVERVIEW
  Ingenious is a two-player abstract strategy game designed
  by Reiner Knizia. Players take turns placing domino-like
  tiles on a hexagonal board. Each tile has two colored ends
  (from 6 possible colors). The goal is to score points in
  all six colors as evenly as possible, because your final
  score is your LOWEST color score.

--------------------------------------------------------------
THE BOARD
--------------------------------------------------------------
  The game is played on a hexagonal grid:

    Standard : Base 6 (91 cells)
    Small    : Base 4 (37 cells)

  Each cell is a hexagon with up to 6 neighbors.

--------------------------------------------------------------
TILES
--------------------------------------------------------------
  Each tile is a domino with two colored hexagonal ends.
  There are 6 colors: Red (R), Orange (O), Yellow (Y),
  Green (G), Blue (B), and Purple (P).

  Tiles can have two different colors or the same color on
  both ends (e.g., R-R, R-O, G-B, etc.).

  Each player holds a hand of 6 tiles. After placing a tile,
  you draw a replacement from the bag (if available).

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  On your turn:
  1. Choose a tile from your hand (numbered 1-6).
  2. Choose two adjacent empty cells on the board.
  3. Place the tile so one colored end goes on each cell.

  Enter your move as: tile# row1 col1 row2 col2
  Example: 1 3 d 3 e
    This places tile 1 with its first end at row 3 col d
    and its second end at row 3 col e.

--------------------------------------------------------------
SCORING
--------------------------------------------------------------
  When you place a tile, you score points for EACH end:

  For each end of the tile, look in all 5 directions radiating
  outward (not toward the other end of the tile). Count
  consecutive cells of the SAME color as that end.

  Example: If you place a Red end and there are 3 red cells
  in a line in one direction and 2 in another, you score
  3 + 2 = 5 points for Red.

  Each color score is tracked separately and maxes out at 18.

--------------------------------------------------------------
BONUS TURN
--------------------------------------------------------------
  If any of your color scores reaches exactly 18 on a turn,
  you immediately get a bonus turn! This encourages pushing
  one color to the maximum.

--------------------------------------------------------------
GAME END AND WINNING
--------------------------------------------------------------
  The game ends when no more tiles can be placed on the board
  (no pair of adjacent empty cells remains).

  Your final score is your LOWEST color score among all six
  colors. The player with the higher minimum score wins.

  This means you must balance all colors! Having 18 in five
  colors but 0 in one means your score is 0.

  Tiebreaker: If minimum scores are equal, compare second-
  lowest, then third-lowest, and so on. If all are equal,
  the game is a draw.

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Focus on raising your weakest color score. Your final
    score is only as good as your worst color.
  - Try to hit 18 in a color to earn bonus turns.
  - Deny your opponent scoring opportunities by blocking
    lines of their weak colors.
  - Plan ahead: think about which tiles remain and what
    placements will be available in future turns.
  - The center of the board is valuable early on because
    lines radiate in all directions.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
