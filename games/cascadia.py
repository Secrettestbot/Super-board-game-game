"""Cascadia - A tile-drafting nature-themed ecosystem building game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


TERRAINS = ["mountain", "forest", "prairie", "wetland", "river"]
TERRAIN_CHARS = {"mountain": "M", "forest": "F", "prairie": "P", "wetland": "W", "river": "R"}
WILDLIFE = ["bear", "elk", "salmon", "hawk", "fox"]
WILDLIFE_CHARS = {"bear": "B", "elk": "E", "salmon": "S", "hawk": "H", "fox": "X"}

# Each tile has a terrain type and a list of wildlife it can accept (1-2 types)
# Format: (terrain, [acceptable_wildlife])
def _generate_tile_pool():
    """Generate the pool of habitat tiles for the game."""
    tiles = []
    tile_id = 0
    for terrain in TERRAINS:
        for _ in range(8):
            # Each tile accepts 1-2 random wildlife types
            num_slots = random.choice([1, 2])
            slots = random.sample(WILDLIFE, num_slots)
            tiles.append({
                "id": tile_id,
                "terrain": terrain,
                "wildlife_slots": slots,
                "placed_wildlife": None,
            })
            tile_id += 1
    return tiles


# Scoring patterns for wildlife (simplified for playability)
# Bear: score for groups of bears (pairs/triples)
# Elk: score for runs (lines of adjacent elk)
# Salmon: score for runs of salmon along rivers
# Hawk: score for isolated hawks (no adjacent hawks)
# Fox: score for variety of adjacent wildlife types

BEAR_SCORES = {0: 0, 1: 0, 2: 4, 3: 7, 4: 11}
ELK_RUN_SCORES = {0: 0, 1: 2, 2: 5, 3: 9, 4: 13}
SALMON_RUN_SCORES = {0: 0, 1: 2, 2: 5, 3: 8, 4: 12}
HAWK_SCORES_PER_ISOLATED = 3  # 3 pts per isolated hawk
FOX_SCORE_PER = 3  # 3 pts per unique adjacent wildlife type

# Hex grid directions (even-row offset coordinates: even rows shift right)
# Using offset coordinates (row, col) with even-row right-shift
HEX_DIRS_EVEN = [(-1, 0), (-1, 1), (0, -1), (0, 1), (1, 0), (1, 1)]
HEX_DIRS_ODD = [(-1, -1), (-1, 0), (0, -1), (0, 1), (1, -1), (1, 0)]


def hex_neighbors(row, col):
    """Return list of (r, c) neighbors for hex grid offset coordinates."""
    dirs = HEX_DIRS_EVEN if row % 2 == 0 else HEX_DIRS_ODD
    return [(row + dr, col + dc) for dr, dc in dirs]


class CascadiaGame(BaseGame):
    """Cascadia: Draft habitat tiles and wildlife tokens to build ecosystems."""

    name = "Cascadia"
    description = "A tile-drafting nature-themed ecosystem building game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Cascadia (20 turns, full scoring)",
        "family": "Family mode (15 turns, simplified scoring)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.tile_pool = []
        self.wildlife_pool = []
        self.display_pairs = []  # 4 pairs of (tile, wildlife) available to draft
        # Player boards: dict of (row, col) -> tile dict
        self.boards = [{}, {}]
        self.scores = [0, 0]
        self.nature_tokens = [0, 0]  # can spend to pick non-paired tile+wildlife
        self.max_turns = 20
        self.turns_taken = 0

    def setup(self):
        """Initialize the game."""
        if self.variation == "family":
            self.max_turns = 15
        else:
            self.max_turns = 20

        # Build tile pool
        self.tile_pool = _generate_tile_pool()
        random.shuffle(self.tile_pool)

        # Build wildlife token pool
        self.wildlife_pool = []
        tokens_per = 20
        for w in WILDLIFE:
            self.wildlife_pool.extend([w] * tokens_per)
        random.shuffle(self.wildlife_pool)

        # Each player starts with a starter habitat (3 tiles in a small cluster)
        for p in range(2):
            for i in range(3):
                if self.tile_pool:
                    tile = self.tile_pool.pop()
                    # Place at positions (2,2), (2,3), (3,2) for a starter cluster
                    positions = [(2, 2), (2, 3), (3, 2)]
                    tile["placed_wildlife"] = None
                    self.boards[p][positions[i]] = tile

        # Give each player 1 nature token to start (family gives 3)
        if self.variation == "family":
            self.nature_tokens = [3, 3]
        else:
            self.nature_tokens = [1, 1]

        self.scores = [0, 0]
        self.turns_taken = 0
        self.current_player = 1
        self._refill_display()

    def _refill_display(self):
        """Fill the 4 display slots with tile-wildlife pairs."""
        self.display_pairs = []
        for _ in range(4):
            tile = self.tile_pool.pop() if self.tile_pool else None
            wildlife = self.wildlife_pool.pop() if self.wildlife_pool else None
            if tile is not None:
                self.display_pairs.append((tile, wildlife))

    def _board_adjacent_positions(self, board):
        """Return set of empty positions adjacent to existing tiles."""
        adjacent = set()
        for (r, c) in board:
            for nr, nc in hex_neighbors(r, c):
                if (nr, nc) not in board and 0 <= nr < 8 and 0 <= nc < 8:
                    adjacent.add((nr, nc))
        return adjacent

    def display(self):
        """Display the game state."""
        var_label = "Standard" if self.variation != "family" else "Family"
        turns_left = self.max_turns - self.turns_taken
        print(f"\n  === Cascadia ({var_label}) === Turn {self.turns_taken + 1}/{self.max_turns}")
        print(f"  {self.players[0]}: Nature tokens={self.nature_tokens[0]}  |  "
              f"{self.players[1]}: Nature tokens={self.nature_tokens[1]}")
        print(f"  Current: {self.players[self.current_player - 1]}")

        # Display available pairs
        print("\n  --- Available Tile/Wildlife Pairs ---")
        for i, (tile, wildlife) in enumerate(self.display_pairs):
            t_char = TERRAIN_CHARS[tile["terrain"]]
            slots = ",".join(WILDLIFE_CHARS[w] for w in tile["wildlife_slots"])
            w_char = WILDLIFE_CHARS.get(wildlife, "?") if wildlife else "-"
            print(f"  Pair {i + 1}: Tile=[{t_char} accepts:{slots}]  Wildlife=[{w_char}]")

        # Display both player boards
        for p in range(2):
            self._display_board(p)

    def _display_board(self, p):
        """Display one player's board as a hex grid."""
        board = self.boards[p]
        if not board:
            print(f"\n  --- {self.players[p]}'s Board --- (empty)")
            return

        # Find bounds
        rows = [r for r, c in board]
        cols = [c for r, c in board]
        min_r, max_r = min(rows), max(rows)
        min_c, max_c = min(cols), max(cols)

        print(f"\n  --- {self.players[p]}'s Board ---")
        print(f"       ", end="")
        for c in range(min_c, max_c + 1):
            print(f"  {c}  ", end="")
        print()

        for r in range(min_r, max_r + 1):
            indent = "  " if r % 2 == 1 else ""
            print(f"  {r}: {indent}", end="")
            for c in range(min_c, max_c + 1):
                if (r, c) in board:
                    tile = board[(r, c)]
                    t = TERRAIN_CHARS[tile["terrain"]]
                    if tile["placed_wildlife"]:
                        w = WILDLIFE_CHARS[tile["placed_wildlife"]]
                    else:
                        w = "."
                    print(f" {t}{w}  ", end="")
                else:
                    print(f"  .  ", end="")
            print()

        # Show valid placement positions
        adj = self._board_adjacent_positions(board)
        adj_str = ", ".join(f"({r},{c})" for r, c in sorted(adj))
        print(f"  Open spots: {adj_str}")

    def get_move(self):
        """Get a move from the current player."""
        p = self.current_player - 1
        print(f"\n  {self.players[p]}, choose a pair and placement.")
        print("  Format: pair_num row col [wildlife y/n]")
        print("  e.g. '2 3 4 y' = take pair 2, place tile at (3,4), place wildlife")
        print("  e.g. '1 2 3 n' = take pair 1, place tile at (2,3), skip wildlife")
        if self.nature_tokens[p] > 0:
            print(f"  You have {self.nature_tokens[p]} nature token(s).")
            print("  Add 'token' to pick any tile+wildlife combo: 'token tile_num wildlife_num row col y'")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        p = self.current_player - 1
        parts = move.lower().split()

        use_token = False
        if parts and parts[0] == "token":
            if self.nature_tokens[p] <= 0:
                print("  No nature tokens remaining!")
                return False
            use_token = True
            parts = parts[1:]

        try:
            if use_token:
                # token tile_num wildlife_num row col y/n
                if len(parts) < 5:
                    return False
                tile_idx = int(parts[0]) - 1
                wild_idx = int(parts[1]) - 1
                row = int(parts[2])
                col = int(parts[3])
                place_wildlife = parts[4] in ("y", "yes")
            else:
                # pair_num row col y/n
                if len(parts) < 4:
                    return False
                pair_idx = int(parts[0]) - 1
                row = int(parts[1])
                col = int(parts[2])
                place_wildlife = parts[3] in ("y", "yes")
                tile_idx = pair_idx
                wild_idx = pair_idx
        except (ValueError, IndexError):
            return False

        # Validate indices
        if tile_idx < 0 or tile_idx >= len(self.display_pairs):
            return False
        if wild_idx < 0 or wild_idx >= len(self.display_pairs):
            return False

        # Get tile and wildlife
        tile, _ = self.display_pairs[tile_idx]
        _, wildlife = self.display_pairs[wild_idx]

        # Validate placement position
        board = self.boards[p]
        adj = self._board_adjacent_positions(board)
        if (row, col) not in adj:
            print(f"  ({row},{col}) is not adjacent to your tiles.")
            return False

        # Place the tile
        tile_copy = dict(tile)
        tile_copy["placed_wildlife"] = None

        # Place wildlife if requested and valid
        if place_wildlife and wildlife:
            if wildlife in tile_copy["wildlife_slots"]:
                tile_copy["placed_wildlife"] = wildlife
            else:
                print(f"  This tile doesn't accept {wildlife}.")
                return False

        board[(row, col)] = tile_copy

        # Spend nature token if used
        if use_token:
            self.nature_tokens[p] -= 1

        # Remove used tile and wildlife from display, replenish
        # Replace the used slots
        remaining_pairs = []
        for i, (t, w) in enumerate(self.display_pairs):
            if i == tile_idx and i == wild_idx:
                continue  # both consumed from same slot
            elif i == tile_idx:
                # tile taken, wildlife stays - pair with a new tile
                new_tile = self.tile_pool.pop() if self.tile_pool else None
                if new_tile:
                    remaining_pairs.append((new_tile, w))
            elif i == wild_idx:
                # wildlife taken, tile stays - pair with a new wildlife
                new_w = self.wildlife_pool.pop() if self.wildlife_pool else None
                remaining_pairs.append((t, new_w))
            else:
                remaining_pairs.append((t, w))

        if tile_idx == wild_idx:
            # Both from same pair - add a completely new pair
            new_tile = self.tile_pool.pop() if self.tile_pool else None
            new_w = self.wildlife_pool.pop() if self.wildlife_pool else None
            if new_tile:
                remaining_pairs.append((new_tile, new_w))

        self.display_pairs = remaining_pairs

        # Ensure we always have 4 display pairs if possible
        while len(self.display_pairs) < 4 and self.tile_pool:
            new_tile = self.tile_pool.pop()
            new_w = self.wildlife_pool.pop() if self.wildlife_pool else None
            self.display_pairs.append((new_tile, new_w))

        self.turns_taken += 1
        return True

    def _score_board(self, p):
        """Score a player's board."""
        board = self.boards[p]
        total = 0

        # Habitat scoring: largest contiguous group of each terrain type
        terrain_groups = self._find_terrain_groups(board)
        for terrain in TERRAINS:
            groups = terrain_groups.get(terrain, [])
            if groups:
                largest = max(len(g) for g in groups)
                total += largest  # 1 point per tile in largest group

        # Wildlife scoring
        if self.variation == "family":
            # Simplified: just count wildlife placed
            wildlife_count = sum(1 for pos, tile in board.items() if tile["placed_wildlife"])
            total += wildlife_count * 2
        else:
            total += self._score_bears(board)
            total += self._score_elk(board)
            total += self._score_salmon(board)
            total += self._score_hawks(board)
            total += self._score_foxes(board)

        return total

    def _find_terrain_groups(self, board):
        """Find contiguous groups of each terrain type."""
        visited = set()
        groups = {}
        for pos, tile in board.items():
            if pos in visited:
                continue
            terrain = tile["terrain"]
            # BFS to find connected group
            group = []
            queue = [pos]
            while queue:
                curr = queue.pop(0)
                if curr in visited:
                    continue
                if curr not in board:
                    continue
                if board[curr]["terrain"] != terrain:
                    continue
                visited.add(curr)
                group.append(curr)
                for nr, nc in hex_neighbors(curr[0], curr[1]):
                    if (nr, nc) not in visited and (nr, nc) in board:
                        queue.append((nr, nc))
            if terrain not in groups:
                groups[terrain] = []
            groups[terrain].append(group)
        return groups

    def _get_wildlife_positions(self, board, wildlife_type):
        """Get all positions with a specific wildlife type placed."""
        return [pos for pos, tile in board.items() if tile["placed_wildlife"] == wildlife_type]

    def _score_bears(self, board):
        """Bears score for pairs: 4 pts per pair of adjacent bears."""
        bear_pos = self._get_wildlife_positions(board, "bear")
        if not bear_pos:
            return 0
        # Find pairs of adjacent bears (each bear in at most one pair)
        used = set()
        pairs = 0
        for pos in bear_pos:
            if pos in used:
                continue
            for nr, nc in hex_neighbors(pos[0], pos[1]):
                if (nr, nc) in bear_pos and (nr, nc) not in used and pos not in used:
                    pairs += 1
                    used.add(pos)
                    used.add((nr, nc))
                    break
        return min(pairs, 4) * 4  # cap at 4 pairs

    def _score_elk(self, board):
        """Elk score for straight-line runs."""
        elk_pos = set(self._get_wildlife_positions(board, "elk"))
        if not elk_pos:
            return 0
        # Find longest run in any direction
        best = 0
        visited = set()
        for pos in elk_pos:
            for d_idx in range(3):  # 3 hex line directions
                length = 1
                # Go forward
                curr = pos
                while True:
                    nbrs = hex_neighbors(curr[0], curr[1])
                    if d_idx < len(nbrs):
                        nxt = nbrs[d_idx]
                        if nxt in elk_pos:
                            length += 1
                            curr = nxt
                        else:
                            break
                    else:
                        break
                best = max(best, length)
        capped = min(best, 4)
        return ELK_RUN_SCORES.get(capped, 13)

    def _score_salmon(self, board):
        """Salmon score for runs along connected salmon."""
        salmon_pos = set(self._get_wildlife_positions(board, "salmon"))
        if not salmon_pos:
            return 0
        # Find largest connected group of salmon
        visited = set()
        best = 0
        for pos in salmon_pos:
            if pos in visited:
                continue
            count = 0
            queue = [pos]
            while queue:
                curr = queue.pop(0)
                if curr in visited:
                    continue
                if curr not in salmon_pos:
                    continue
                visited.add(curr)
                count += 1
                for nr, nc in hex_neighbors(curr[0], curr[1]):
                    if (nr, nc) not in visited and (nr, nc) in salmon_pos:
                        queue.append((nr, nc))
            best = max(best, count)
        capped = min(best, 4)
        return SALMON_RUN_SCORES.get(capped, 12)

    def _score_hawks(self, board):
        """Hawks score for isolation: 3 pts per hawk with no adjacent hawks."""
        hawk_pos = set(self._get_wildlife_positions(board, "hawk"))
        score = 0
        for pos in hawk_pos:
            isolated = True
            for nr, nc in hex_neighbors(pos[0], pos[1]):
                if (nr, nc) in hawk_pos:
                    isolated = False
                    break
            if isolated:
                score += HAWK_SCORES_PER_ISOLATED
        return score

    def _score_foxes(self, board):
        """Foxes score for variety: 3 pts per unique adjacent wildlife type."""
        fox_pos = self._get_wildlife_positions(board, "fox")
        score = 0
        for pos in fox_pos:
            adj_types = set()
            for nr, nc in hex_neighbors(pos[0], pos[1]):
                if (nr, nc) in board and board[(nr, nc)]["placed_wildlife"]:
                    adj_types.add(board[(nr, nc)]["placed_wildlife"])
            score += len(adj_types) * FOX_SCORE_PER
        return score

    def check_game_over(self):
        """Check if max turns reached."""
        if self.turns_taken >= self.max_turns * 2:  # 2 players
            self.game_over = True
            self.scores[0] = self._score_board(0)
            self.scores[1] = self._score_board(1)
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None

            # Display final scores
            print(f"\n  Final Scores:")
            print(f"  {self.players[0]}: {self.scores[0]} pts")
            print(f"  {self.players[1]}: {self.scores[1]} pts")

    def get_state(self):
        """Return serializable game state."""
        def serialize_board(board):
            result = {}
            for (r, c), tile in board.items():
                key = f"{r},{c}"
                result[key] = {
                    "id": tile["id"],
                    "terrain": tile["terrain"],
                    "wildlife_slots": tile["wildlife_slots"],
                    "placed_wildlife": tile["placed_wildlife"],
                }
            return result

        def serialize_tile(tile):
            if tile is None:
                return None
            return {
                "id": tile["id"],
                "terrain": tile["terrain"],
                "wildlife_slots": tile["wildlife_slots"],
                "placed_wildlife": tile["placed_wildlife"],
            }

        return {
            "tile_pool": [serialize_tile(t) for t in self.tile_pool],
            "wildlife_pool": list(self.wildlife_pool),
            "display_pairs": [(serialize_tile(t), w) for t, w in self.display_pairs],
            "boards": [serialize_board(b) for b in self.boards],
            "scores": list(self.scores),
            "nature_tokens": list(self.nature_tokens),
            "max_turns": self.max_turns,
            "turns_taken": self.turns_taken,
        }

    def load_state(self, state):
        """Restore game state."""
        def deserialize_board(data):
            board = {}
            for key, tile_data in data.items():
                r, c = map(int, key.split(","))
                board[(r, c)] = dict(tile_data)
            return board

        self.tile_pool = [dict(t) if t else None for t in state["tile_pool"]]
        self.wildlife_pool = list(state["wildlife_pool"])
        self.display_pairs = [
            (dict(t) if t else None, w) for t, w in state["display_pairs"]
        ]
        self.boards = [deserialize_board(b) for b in state["boards"]]
        self.scores = list(state["scores"])
        self.nature_tokens = list(state["nature_tokens"])
        self.max_turns = state["max_turns"]
        self.turns_taken = state["turns_taken"]

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==================================================
  Cascadia - Tutorial
==================================================

  OVERVIEW:
  Cascadia is a tile-drafting game where you build
  a nature ecosystem by placing habitat tiles and
  wildlife tokens on your personal map.

  TERRAIN TYPES (shown on tiles):
  M = Mountain, F = Forest, P = Prairie,
  W = Wetland, R = River

  WILDLIFE TYPES (placed on tiles):
  B = Bear, E = Elk, S = Salmon, H = Hawk, X = Fox

  HOW TO PLAY:
  Each turn you select one of 4 available pairs
  (a habitat tile + a wildlife token). Place the
  tile adjacent to your existing tiles. Optionally
  place the wildlife token on the tile if it accepts
  that wildlife type.

  MOVE FORMAT:
  pair_num row col y/n
  - pair_num: 1-4 (which pair to draft)
  - row col: coordinates to place the tile
  - y/n: whether to place the wildlife token

  Example: "2 3 4 y" = take pair 2, place tile at
  row 3 col 4, and place the wildlife on it.

  NATURE TOKENS:
  Spend a nature token to pick any tile and any
  wildlife from the display (not necessarily paired).
  Format: "token tile_num wildlife_num row col y/n"

  SCORING:
  Habitat: Points for largest contiguous group of
  each terrain type (1 pt per tile in group).

  Wildlife (Standard):
  - Bear: 4 pts per adjacent pair (max 4 pairs)
  - Elk: Points for longest straight-line run
  - Salmon: Points for largest connected group
  - Hawk: 3 pts per isolated hawk (no adjacent hawks)
  - Fox: 3 pts per unique adjacent wildlife type

  Wildlife (Family): 2 pts per wildlife placed.

  GAME LENGTH:
  Standard: 20 turns per player (40 total)
  Family: 15 turns per player (30 total)

==================================================
"""
