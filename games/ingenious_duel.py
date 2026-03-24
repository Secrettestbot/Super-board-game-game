"""Ingenious Duel - 2-player hex-based tile placement scoring game.

Each tile is a domino of 2 colored hexes. Place tiles on a hex board and score
points in each color by matching adjacent hexes. Your score equals your LOWEST
color track. Highest lowest-score wins.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

COLORS_FULL = ["Red", "Orange", "Yellow", "Green", "Blue", "Purple"]
COLORS_QUICK = ["Red", "Green", "Blue", "Purple"]
COLOR_ABBREV = {"Red": "R", "Orange": "O", "Yellow": "Y", "Green": "G", "Blue": "B", "Purple": "P"}

# Hex directions: even-row offset coordinates (col, row)
# For even rows: neighbors differ from odd rows
EVEN_ROW_DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1)]
ODD_ROW_DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1), (1, -1), (1, 1)]


def hex_neighbors(col, row):
    """Get all 6 hex neighbors of a position using offset coordinates."""
    if row % 2 == 0:
        dirs = EVEN_ROW_DIRS
    else:
        dirs = ODD_ROW_DIRS
    return [(col + dc, row + dr) for dc, dr in dirs]


def generate_tiles(colors):
    """Generate all unique domino tiles for given colors."""
    tiles = []
    for i, c1 in enumerate(colors):
        for c2 in colors[i:]:
            tiles.append([c1, c2])
    return tiles


class IngeniousDuelGame(BaseGame):
    """Ingenious Duel - Hex tile placement scoring game."""

    name = "Ingenious Duel"
    description = "Hex-based tile placement where your lowest color score determines victory"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full board (11x11 hex grid), 6 colors, 6 tiles per hand",
        "quick": "Smaller board (7x7 hex grid), 4 colors, 4 tiles per hand",
    }

    def setup(self):
        if self.variation == "quick":
            self.colors = list(COLORS_QUICK)
            self.board_size = 7
            self.hand_size = 4
        else:
            self.colors = list(COLORS_FULL)
            self.board_size = 11
            self.hand_size = 6

        # Board: dict mapping "col,row" -> color string
        self.board = {}
        self._init_board_bounds()

        # Score tracks per player per color
        self.scores = {
            1: {c: 0 for c in self.colors},
            2: {c: 0 for c in self.colors},
        }
        self.max_score = 18

        # Tile bag
        base_tiles = generate_tiles(self.colors)
        self.bag = []
        copies = 3 if self.variation == "standard" else 2
        for _ in range(copies):
            for t in base_tiles:
                self.bag.append(list(t))
        random.shuffle(self.bag)

        # Hands
        self.hands = {1: [], 2: []}
        for p in [1, 2]:
            for _ in range(self.hand_size):
                if self.bag:
                    self.hands[p].append(self.bag.pop())

        self.bonus_turn = False
        self.message = ""

    def _init_board_bounds(self):
        """Compute valid hex positions for the board (hexagonal shape)."""
        self.valid_positions = set()
        center = self.board_size // 2
        for row in range(self.board_size):
            for col in range(self.board_size):
                # Use distance from center to create hex shape
                dr = row - center
                dc = col - center
                # Adjust for offset coords
                adj = dr / 2 if row % 2 != center % 2 else 0
                dist = abs(dr) + abs(dc + adj)
                if dist <= center + 0.5:
                    self.valid_positions.add((col, row))

    def _pos_key(self, col, row):
        return f"{col},{row}"

    def _is_valid_empty(self, col, row):
        return (col, row) in self.valid_positions and self._pos_key(col, row) not in self.board

    def _is_occupied(self, col, row):
        return self._pos_key(col, row) in self.board

    def display(self):
        clear_screen()
        print(f"=== Ingenious Duel - {self.variation.title()} ===")
        print(f"Turn {self.turn_number + 1} | {self.players[self.current_player - 1]}'s turn")
        if self.bonus_turn:
            print("*** BONUS TURN (scored 18 in a color!) ***")
        print()

        # Display scores
        for p in [1, 2]:
            scores_str = " ".join(
                f"{COLOR_ABBREV[c]}:{self.scores[p][c]:2d}" for c in self.colors
            )
            lowest = min(self.scores[p].values())
            print(f"  {self.players[p-1]}: {scores_str}  (Lowest: {lowest})")
        print()

        # Display board
        center = self.board_size // 2
        for row in range(self.board_size):
            indent = "  " if row % 2 == 1 else ""
            line = indent
            for col in range(self.board_size):
                key = self._pos_key(col, row)
                if (col, row) not in self.valid_positions:
                    line += "   "
                elif key in self.board:
                    c = self.board[key]
                    line += f" {COLOR_ABBREV[c]} "
                else:
                    line += " . "
            print(line)
        print()

        # Show current player's hand
        print(f"Your tiles:")
        hand = self.hands[self.current_player]
        for i, tile in enumerate(hand):
            a1 = COLOR_ABBREV[tile[0]]
            a2 = COLOR_ABBREV[tile[1]]
            print(f"  {i+1}: [{a1}]-[{a2}]")
        print()

        if self.message:
            print(self.message)
            self.message = ""

    def get_move(self):
        """Get tile selection and placement from player."""
        hand = self.hands[self.current_player]
        if not hand:
            return "pass"

        # Check if any legal move exists
        if not self._has_legal_move():
            print("No legal moves available. Passing turn.")
            input_with_quit("Press Enter to continue...")
            return "pass"

        print("Select tile number (1-{0}), then two hex positions col,row for each hex.".format(len(hand)))
        print("Format: TILE_NUM COL1,ROW1 COL2,ROW2")
        print("The two positions must be adjacent hexes.")
        move_str = input_with_quit("> ")
        return move_str

    def make_move(self, move):
        if move == "pass":
            return True

        try:
            parts = move.strip().split()
            if len(parts) != 3:
                self.message = "Format: TILE_NUM COL1,ROW1 COL2,ROW2"
                return False

            tile_idx = int(parts[0]) - 1
            hand = self.hands[self.current_player]
            if tile_idx < 0 or tile_idx >= len(hand):
                self.message = "Invalid tile number."
                return False

            c1, r1 = map(int, parts[1].split(","))
            c2, r2 = map(int, parts[2].split(","))

            # Validate positions
            if not self._is_valid_empty(c1, r1) or not self._is_valid_empty(c2, r2):
                self.message = "Positions must be valid empty hexes on the board."
                return False

            # Check adjacency
            if (c2, r2) not in hex_neighbors(c1, r1):
                self.message = "The two hexes must be adjacent."
                return False

            # First move: at least one hex must be near center or board is empty
            if not self.board:
                center = self.board_size // 2
                if (c1, r1) != (center, center) and (c2, r2) != (center, center):
                    self.message = "First tile must include the center hex."
                    return False
            else:
                # Must be adjacent to at least one existing hex
                adj1 = any(self._is_occupied(nc, nr) for nc, nr in hex_neighbors(c1, r1))
                adj2 = any(self._is_occupied(nc, nr) for nc, nr in hex_neighbors(c2, r2))
                # The tile itself counts - one hex is adjacent to the other
                # But we also need at least one hex adjacent to existing board
                if not adj1 and not adj2:
                    self.message = "Tile must be adjacent to an existing tile."
                    return False

            tile = hand[tile_idx]
            # Place the tile
            self.board[self._pos_key(c1, r1)] = tile[0]
            self.board[self._pos_key(c2, r2)] = tile[1]

            # Score for each hex
            scored_18 = False
            for (col, row), color in [((c1, r1), tile[0]), ((c2, r2), tile[1])]:
                points = self._count_lines(col, row, color)
                old_score = self.scores[self.current_player][color]
                new_score = min(old_score + points, self.max_score)
                self.scores[self.current_player][color] = new_score
                if new_score == self.max_score and old_score < self.max_score:
                    scored_18 = True

            # Remove tile from hand
            hand.pop(tile_idx)

            # Refill hand
            if self.bag:
                hand.append(self.bag.pop())

            # Bonus turn if scored 18
            if scored_18 and not self.bonus_turn:
                self.bonus_turn = True
                self.message = "You scored 18 in a color! Take a bonus turn!"
                # Don't switch player - handled by returning True and check_game_over
                return True

            self.bonus_turn = False
            return True

        except (ValueError, IndexError):
            self.message = "Invalid move format. Use: TILE_NUM COL1,ROW1 COL2,ROW2"
            return False

    def _count_lines(self, col, row, color):
        """Count matching colors in all 6 directions from placed hex (not counting self)."""
        total = 0
        # 3 axes for hex grid
        if row % 2 == 0:
            axes = [
                [(-1, 0), (1, 0)],     # horizontal
                [(0, -1), (0, 1)],      # vertical-ish
                [(-1, -1), (1, 1)],     # diagonal
            ]
            axes2 = [
                [(-1, 0), (1, 0)],
                [(-1, -1), (1, 1)],
                [(-1, 1), (1, -1)],
            ]
        else:
            axes2 = [
                [(-1, 0), (1, 0)],
                [(1, -1), (-1, 1)],
                [(1, 1), (-1, -1)],
            ]

        for axis in axes2:
            for dc, dr in axis:
                nc, nr = col + dc, row + dr
                while self._pos_key(nc, nr) in self.board and self.board[self._pos_key(nc, nr)] == color:
                    total += 1
                    # Continue in same direction - need to handle even/odd row transitions
                    if nr % 2 == 0:
                        nc, nr = nc + dc, nr + dr
                    else:
                        # Adjust direction for odd rows
                        if dr != 0:
                            nc_new = nc + dc + (1 if nr % 2 == 1 else 0) - (1 if (nr + dr) % 2 == 1 else 0)
                            # Simplified: just step in same direction
                            nc, nr = nc + dc, nr + dr
                        else:
                            nc, nr = nc + dc, nr + dr
        return total

    def _has_legal_move(self):
        """Check if current player can place any tile."""
        hand = self.hands[self.current_player]
        if not hand:
            return False

        if not self.board:
            return True

        # Find all empty positions adjacent to existing tiles
        candidates = set()
        for key in self.board:
            c, r = map(int, key.split(","))
            for nc, nr in hex_neighbors(c, r):
                if self._is_valid_empty(nc, nr):
                    candidates.add((nc, nr))

        # Check if any pair of adjacent candidates exists
        for pos1 in candidates:
            for pos2 in hex_neighbors(pos1[0], pos1[1]):
                if pos2 in candidates or (pos2[0], pos2[1]) in candidates:
                    return True
                # Also check if pos2 is valid and empty
                if self._is_valid_empty(pos2[0], pos2[1]):
                    # At least one of them is adjacent to existing
                    return True
        return False

    def check_game_over(self):
        if self.bonus_turn:
            # Don't end turn, don't switch player
            return

        # Game over if bag is empty and both hands empty, or no legal moves
        hands_empty = len(self.hands[1]) == 0 and len(self.hands[2]) == 0
        if hands_empty and len(self.bag) == 0:
            self.game_over = True
        elif not self._has_legal_move():
            # Check if other player also can't move
            self.switch_player()
            if not self._has_legal_move():
                self.game_over = True
                self.switch_player()
            else:
                self.switch_player()

        if self.game_over:
            self._determine_winner()

    def _determine_winner(self):
        low1 = min(self.scores[1].values())
        low2 = min(self.scores[2].values())
        if low1 > low2:
            self.winner = 1
        elif low2 > low1:
            self.winner = 2
        else:
            # Tiebreak: second lowest, etc.
            s1 = sorted(self.scores[1].values())
            s2 = sorted(self.scores[2].values())
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None  # Draw

    def switch_player(self):
        if self.bonus_turn:
            self.bonus_turn = False
            return
        super().switch_player()

    def get_state(self):
        return {
            "board": dict(self.board),
            "scores": {str(k): dict(v) for k, v in self.scores.items()},
            "hands": {str(k): [list(t) for t in v] for k, v in self.hands.items()},
            "bag": [list(t) for t in self.bag],
            "colors": list(self.colors),
            "board_size": self.board_size,
            "hand_size": self.hand_size,
            "max_score": self.max_score,
            "bonus_turn": self.bonus_turn,
            "message": self.message,
            "valid_positions": [[c, r] for c, r in self.valid_positions],
        }

    def load_state(self, state):
        self.board = state["board"]
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.bag = state["bag"]
        self.colors = state["colors"]
        self.board_size = state["board_size"]
        self.hand_size = state["hand_size"]
        self.max_score = state["max_score"]
        self.bonus_turn = state["bonus_turn"]
        self.message = state.get("message", "")
        self.valid_positions = set((c, r) for c, r in state["valid_positions"])

    def get_tutorial(self):
        return """
=== INGENIOUS DUEL TUTORIAL ===

OVERVIEW:
  Ingenious Duel is a 2-player hex tile placement game. Each tile is a domino
  made of two colored hexes. Place tiles on the board to score points in each
  color. Your final score equals your LOWEST color track!

GAMEPLAY:
  1. On your turn, place one tile (two connected hexes) on the board
  2. The tile must be adjacent to at least one existing tile
  3. For each hex placed, score 1 point per matching adjacent hex in each
     direction line extending from that hex
  4. If you reach 18 in any color, you get a bonus turn!

SCORING:
  - When you place a hex, look in all 6 directions
  - Count consecutive hexes of the SAME color in each line
  - Add those counts to your score track for that color

WINNING:
  - Your score = your LOWEST color track
  - The player with the higher lowest-score wins
  - Ties broken by next-lowest score, etc.

MOVES:
  Enter: TILE_NUMBER COL,ROW COL,ROW
  Example: 1 5,5 5,6  (places tile 1 at positions (5,5) and (5,6))

COLORS: """ + ", ".join(f"{c}={COLOR_ABBREV[c]}" for c in COLORS_FULL) + """

TIP: Balance your colors! A single weak color will drag your score down.
"""
