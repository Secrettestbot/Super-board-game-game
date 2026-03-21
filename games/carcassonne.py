"""Carcassonne - Simplified tile-laying game with cities, roads, and fields."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Edge types: C=City, R=Road, F=Field
# Tile format: (north, east, south, west, has_monastery, label)
# label is a short description for display/debug
TILE_DEFS = [
    # 0: Start tile - road south/north, city east
    ("R", "C", "R", "F", False, "RCR"),
    # 1: All city
    ("C", "C", "C", "C", False, "CCCC"),
    # 2: City north
    ("C", "F", "F", "F", False, "CFFF"),
    # 3: City north and east
    ("C", "C", "F", "F", False, "CCFF"),
    # 4: City north and south (across)
    ("C", "F", "C", "F", False, "CFCF"),
    # 5: City north, road east-west
    ("C", "R", "F", "R", False, "CRFR"),
    # 6: City north, road south-east
    ("C", "F", "R", "R", False, "CFRR"),
    # 7: City north, road south-west
    ("C", "R", "R", "F", False, "CRRF"),
    # 8: Road north-south
    ("R", "F", "R", "F", False, "RFRF"),
    # 9: Road east-west
    ("F", "R", "F", "R", False, "FRFR"),
    # 10: Road north-east turn
    ("R", "R", "F", "F", False, "RRFF"),
    # 11: Road south-west turn
    ("F", "F", "R", "R", False, "FFRR"),
    # 12: Road north-west turn
    ("R", "F", "F", "R", False, "RFFR"),
    # 13: Road south-east turn
    ("F", "R", "R", "F", False, "FRRF"),
    # 14: Three-way road (T)
    ("R", "R", "R", "F", False, "RRRF"),
    # 15: Four-way crossroad
    ("R", "R", "R", "R", False, "RRRR"),
    # 16: Monastery with road south
    ("F", "F", "R", "F", True, "M+R"),
    # 17: Monastery all field
    ("F", "F", "F", "F", True, "MNST"),
    # 18: City north and west
    ("C", "F", "F", "C", False, "CFFC"),
    # 19: City east and south
    ("F", "C", "C", "F", False, "FCCF"),
    # 20: City east
    ("F", "C", "F", "F", False, "FCFF"),
    # 21: City south
    ("F", "F", "C", "F", False, "FFCF"),
    # 22: Three city sides
    ("C", "C", "F", "C", False, "CCFC"),
    # 23: City west
    ("F", "F", "F", "C", False, "FFFC"),
]

# Distribution: how many of each tile type in the bag
TILE_COUNTS = [
    3,  # 0
    1,  # 1
    4,  # 2
    3,  # 3
    2,  # 4
    3,  # 5
    2,  # 6
    2,  # 7
    3,  # 8
    3,  # 9
    2,  # 10
    2,  # 11
    2,  # 12
    2,  # 13
    2,  # 14
    1,  # 15
    2,  # 16
    2,  # 17
    2,  # 18
    2,  # 19
    3,  # 20
    3,  # 21
    2,  # 22
    3,  # 23
]

# Simple variation uses subset (no monasteries, fewer types)
SIMPLE_TILES = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23]

DIRECTIONS = [(-1, 0), (0, 1), (1, 0), (0, -1)]  # N, E, S, W
DIR_NAMES = ["north", "east", "south", "west"]
OPPOSITE = [2, 3, 0, 1]  # opposite edge indices


def rotate_tile(edges, times):
    """Rotate tile edges clockwise by 'times' steps."""
    n, e, s, w = edges
    lst = [n, e, s, w]
    for _ in range(times % 4):
        lst = [lst[3], lst[0], lst[1], lst[2]]
    return tuple(lst)


def tile_char(edges, has_monastery):
    """Return a single display character for a tile."""
    if has_monastery:
        return "M"
    city_count = edges.count("C")
    road_count = edges.count("R")
    if city_count >= 3:
        return "C"
    if city_count == 2:
        return "c"
    if city_count == 1 and road_count == 0:
        return "c"
    if road_count >= 2:
        return "+"
    if road_count == 1:
        return "-"
    return "."


class CarcassonneGame(BaseGame):
    """Carcassonne: A tile-laying game of cities, roads, and fields."""

    name = "Carcassonne"
    description = "Tile-laying game with cities, roads, and fields"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Carcassonne",
        "simple": "Simple (roads and cities only)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board = {}          # (row, col) -> (edges_tuple, has_monastery, player_meeple_info)
        self.tile_bag = []       # list of tile indices
        self.current_tile = None # index into TILE_DEFS
        self.scores = [0, 0]
        self.meeples = [7, 7]   # each player starts with 7
        self.meeple_map = {}    # (row, col) -> (player, feature)
        self.phase = "place"    # "place" or "meeple"
        self.last_placed = None # (row, col) where tile was just placed
        self.last_edges = None  # edges of last placed tile
        self.last_monastery = False

    def setup(self):
        """Initialize the game: create tile bag, place starting tile."""
        self.board = {}
        self.scores = [0, 0]
        self.meeples = [7, 7]
        self.meeple_map = {}
        self.phase = "place"
        self.last_placed = None
        self.last_edges = None
        self.last_monastery = False

        # Build tile bag
        self.tile_bag = []
        if self.variation == "simple":
            allowed = set(SIMPLE_TILES)
        else:
            allowed = set(range(len(TILE_DEFS)))

        for idx in range(len(TILE_DEFS)):
            if idx in allowed:
                self.tile_bag.extend([idx] * TILE_COUNTS[idx])

        random.shuffle(self.tile_bag)

        # Place starting tile at (0, 0) - always tile 0 with no rotation
        start_def = TILE_DEFS[0]
        start_edges = (start_def[0], start_def[1], start_def[2], start_def[3])
        self.board[(0, 0)] = (start_edges, start_def[4])

        # Remove one copy of tile 0 from bag if present
        if 0 in self.tile_bag:
            self.tile_bag.remove(0)

        # Draw first tile
        self._draw_tile()

    def _draw_tile(self):
        """Draw the next tile from the bag."""
        if self.tile_bag:
            self.current_tile = self.tile_bag.pop()
        else:
            self.current_tile = None

    def _get_bounds(self):
        """Get the bounding box of placed tiles."""
        if not self.board:
            return 0, 0, 0, 0
        rows = [r for r, c in self.board]
        cols = [c for r, c in self.board]
        return min(rows), max(rows), min(cols), max(cols)

    def _valid_positions(self, edges):
        """Return set of (row, col) where tile with given edges can be placed."""
        occupied = set(self.board.keys())
        candidates = set()
        for (r, c) in occupied:
            for dr, dc in DIRECTIONS:
                nr, nc = r + dr, c + dc
                if (nr, nc) not in occupied:
                    candidates.add((nr, nc))

        valid = set()
        for (r, c) in candidates:
            if self._can_place(r, c, edges):
                valid.add((r, c))
        return valid

    def _can_place(self, row, col, edges):
        """Check if tile with given edges can be placed at (row, col)."""
        if (row, col) in self.board:
            return False
        has_neighbor = False
        for d_idx, (dr, dc) in enumerate(DIRECTIONS):
            nr, nc = row + dr, col + dc
            if (nr, nc) in self.board:
                has_neighbor = True
                neighbor_edges = self.board[(nr, nc)][0]
                # Our edge d_idx must match neighbor's opposite edge
                if edges[d_idx] != neighbor_edges[OPPOSITE[d_idx]]:
                    return False
        return has_neighbor

    def display(self):
        """Display the current game state."""
        var_label = self.variations.get(self.variation, self.variation)
        print(f"\n  === Carcassonne ({var_label}) ===")
        print(f"  {self.players[0]}: {self.scores[0]} pts, {self.meeples[0]} meeples")
        print(f"  {self.players[1]}: {self.scores[1]} pts, {self.meeples[1]} meeples")
        print(f"  Tiles remaining: {len(self.tile_bag)}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        # Show board
        min_r, max_r, min_c, max_c = self._get_bounds()
        # Expand bounds by 1 for context
        min_r -= 1
        max_r += 1
        min_c -= 1
        max_c += 1

        # Column headers
        col_labels = ""
        for c in range(min_c, max_c + 1):
            col_labels += f"{c:>3}"
        print(f"     {col_labels}")
        print(f"    +" + "---" * (max_c - min_c + 1) + "+")

        for r in range(min_r, max_r + 1):
            row_str = f" {r:>2} |"
            for c in range(min_c, max_c + 1):
                if (r, c) in self.board:
                    edges, has_mon = self.board[(r, c)]
                    ch = tile_char(edges, has_mon)
                    # Show meeple if present
                    if (r, c) in self.meeple_map:
                        player, feature = self.meeple_map[(r, c)]
                        ch = str(player)
                    row_str += f" {ch} "
                else:
                    # Check if this is a valid placement for display
                    row_str += " . "
            row_str += "|"
            print(row_str)

        print(f"    +" + "---" * (max_c - min_c + 1) + "+")
        print()

        # Show current tile
        if self.phase == "place" and self.current_tile is not None:
            td = TILE_DEFS[self.current_tile]
            edges = (td[0], td[1], td[2], td[3])
            print(f"  Current tile to place ({td[5]}):")
            self._display_tile_preview(edges, td[4])
            print()
        elif self.phase == "meeple" and self.last_placed is not None:
            r, c = self.last_placed
            edges, has_mon = self.board[(r, c)]
            print(f"  Tile placed at ({r}, {c}):")
            self._display_tile_preview(edges, has_mon)
            available = self._available_meeple_features(r, c, edges, has_mon)
            if available and self.meeples[self.current_player - 1] > 0:
                print(f"  Available features for meeple: {', '.join(available)}")
            else:
                if self.meeples[self.current_player - 1] == 0:
                    print("  No meeples available.")
                else:
                    print("  No features available for meeple placement.")
            print()

    def _display_tile_preview(self, edges, has_monastery):
        """Display a tile with its edges."""
        n, e, s, w = edges
        center = "M" if has_monastery else " "
        print(f"        [{n}]")
        print(f"      [{w}][{center}][{e}]")
        print(f"        [{s}]")

    def get_move(self):
        """Get a move from the current player."""
        if self.phase == "place":
            if self.current_tile is None:
                return None
            td = TILE_DEFS[self.current_tile]
            edges_base = (td[0], td[1], td[2], td[3])
            # Check if any rotation works anywhere
            any_valid = False
            for rot in range(4):
                re = rotate_tile(edges_base, rot)
                if self._valid_positions(re):
                    any_valid = True
                    break
            if not any_valid:
                print("  No valid placement for this tile. Discarding and drawing next.")
                input("  Press Enter to continue...")
                return "skip"

            while True:
                raw = input_with_quit(f"  {self.players[self.current_player - 1]}, place tile (row col rotation[0-3]): ")
                parts = raw.strip().split()
                if len(parts) != 3:
                    print("  Enter: row col rotation (e.g. '1 0 2')")
                    continue
                try:
                    row, col, rot = int(parts[0]), int(parts[1]), int(parts[2])
                except ValueError:
                    print("  Invalid numbers. Try again.")
                    continue
                if rot < 0 or rot > 3:
                    print("  Rotation must be 0-3.")
                    continue
                edges = rotate_tile(edges_base, rot)
                if not self._can_place(row, col, edges):
                    print("  Invalid placement. Edges must match neighbors.")
                    continue
                return ("place", row, col, rot)
        else:
            # Meeple phase
            while True:
                raw = input_with_quit(f"  {self.players[self.current_player - 1]}, place meeple (feature) or 'pass': ")
                text = raw.strip().lower()
                if text == "pass":
                    return ("meeple", "pass")
                if text in ("city", "road", "field", "monastery"):
                    return ("meeple", text)
                print("  Enter 'city', 'road', 'field', 'monastery', or 'pass'.")

    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        if move == "skip":
            self._draw_tile()
            return True

        if move is None:
            return True

        action = move[0]

        if action == "place":
            _, row, col, rot = move
            td = TILE_DEFS[self.current_tile]
            edges_base = (td[0], td[1], td[2], td[3])
            edges = rotate_tile(edges_base, rot)
            has_mon = td[4]

            if not self._can_place(row, col, edges):
                return False

            if self.variation == "simple" and has_mon:
                has_mon = False

            self.board[(row, col)] = (edges, has_mon)
            self.last_placed = (row, col)
            self.last_edges = edges
            self.last_monastery = has_mon

            # Check if meeple placement is possible
            available = self._available_meeple_features(row, col, edges, has_mon)
            if available and self.meeples[self.current_player - 1] > 0:
                self.phase = "meeple"
            else:
                self.phase = "place"
                self._check_completed_features(row, col)
                self._draw_tile()

            return True

        elif action == "meeple":
            feature = move[1]
            r, c = self.last_placed
            edges, has_mon = self.board[(r, c)]

            if feature == "pass":
                self.phase = "place"
                self._check_completed_features(r, c)
                self._draw_tile()
                return True

            if self.variation == "simple" and feature in ("monastery", "field"):
                print(f"  {feature} not available in simple mode.")
                return False

            available = self._available_meeple_features(r, c, edges, has_mon)
            if feature not in available:
                print(f"  Cannot place meeple on '{feature}' here.")
                return False

            if self.meeples[self.current_player - 1] <= 0:
                print("  No meeples available!")
                return False

            # Check if the connected feature already has a meeple
            if feature in ("city", "road"):
                if self._feature_has_meeple(r, c, feature):
                    print(f"  This connected {feature} already has a meeple!")
                    return False

            self.meeple_map[(r, c)] = (self.current_player, feature)
            self.meeples[self.current_player - 1] -= 1
            self.phase = "place"
            self._check_completed_features(r, c)
            self._draw_tile()
            return True

        return False

    def _available_meeple_features(self, row, col, edges, has_monastery):
        """Return list of features available for meeple placement on this tile."""
        features = []
        n, e, s, w = edges
        edge_set = set(edges)
        if "C" in edge_set:
            features.append("city")
        if "R" in edge_set:
            features.append("road")
        if self.variation != "simple":
            if "F" in edge_set:
                features.append("field")
            if has_monastery:
                features.append("monastery")
        return features

    def _feature_has_meeple(self, row, col, feature):
        """Check if the connected feature (city/road) already has a meeple."""
        visited = set()
        stack = [(row, col)]
        while stack:
            r, c = stack.pop()
            if (r, c) in visited:
                continue
            visited.add((r, c))
            if (r, c) not in self.board:
                continue
            edges, _ = self.board[(r, c)]
            # Check if this tile has a meeple on this feature
            if (r, c) in self.meeple_map and (r, c) != (row, col):
                mp, mf = self.meeple_map[(r, c)]
                if mf == feature:
                    return True
            # Follow connections
            for d_idx, (dr, dc) in enumerate(DIRECTIONS):
                if edges[d_idx] == feature[0].upper():
                    nr, nc = r + dr, c + dc
                    if (nr, nc) in self.board and (nr, nc) not in visited:
                        nb_edges, _ = self.board[(nr, nc)]
                        if nb_edges[OPPOSITE[d_idx]] == feature[0].upper():
                            stack.append((nr, nc))
        return False

    def _check_completed_features(self, row, col):
        """Check for completed features around the placed tile and score them."""
        # Check cities
        self._check_completed_city(row, col)
        # Check roads
        self._check_completed_road(row, col)
        # Check monasteries (placed tile and all neighbors)
        if self.variation != "simple":
            self._check_monasteries(row, col)

    def _trace_feature(self, start_row, start_col, feature_char):
        """Trace a connected feature. Returns (tiles_set, is_complete)."""
        visited = set()
        stack = [(start_row, start_col)]
        complete = True

        while stack:
            r, c = stack.pop()
            if (r, c) in visited:
                continue
            visited.add((r, c))
            if (r, c) not in self.board:
                continue
            edges, _ = self.board[(r, c)]

            for d_idx, (dr, dc) in enumerate(DIRECTIONS):
                if edges[d_idx] == feature_char:
                    nr, nc = r + dr, c + dc
                    if (nr, nc) not in self.board:
                        complete = False
                    elif (nr, nc) not in visited:
                        nb_edges, _ = self.board[(nr, nc)]
                        if nb_edges[OPPOSITE[d_idx]] == feature_char:
                            stack.append((nr, nc))

        return visited, complete

    def _check_completed_city(self, row, col):
        """Check if placing at (row,col) completed any city."""
        edges, _ = self.board[(row, col)]
        if "C" not in edges:
            return

        tiles_in_city, is_complete = self._trace_feature(row, col, "C")
        if not is_complete:
            return

        # Score: 2 pts per tile in completed city
        points = len(tiles_in_city) * 2

        # Find meeples on this city and score
        self._score_feature(tiles_in_city, "city", points)

    def _check_completed_road(self, row, col):
        """Check if placing at (row,col) completed any road."""
        edges, _ = self.board[(row, col)]
        if "R" not in edges:
            return

        tiles_in_road, is_complete = self._trace_feature(row, col, "R")
        if not is_complete:
            return

        # Score: 1 pt per tile in completed road
        points = len(tiles_in_road)

        self._score_feature(tiles_in_road, "road", points)

    def _check_monasteries(self, row, col):
        """Check if any monastery is completed (all 8 surrounding tiles filled)."""
        # Check the placed tile and all neighbors
        positions_to_check = [(row, col)]
        for dr in range(-1, 2):
            for dc in range(-1, 2):
                if dr == 0 and dc == 0:
                    continue
                positions_to_check.append((row + dr, col + dc))

        for (r, c) in positions_to_check:
            if (r, c) not in self.board:
                continue
            _, has_mon = self.board[(r, c)]
            if not has_mon:
                continue
            # Check if all 8 surrounding tiles exist
            surrounded = True
            for dr in range(-1, 2):
                for dc in range(-1, 2):
                    if dr == 0 and dc == 0:
                        continue
                    if (r + dr, c + dc) not in self.board:
                        surrounded = False
                        break
                if not surrounded:
                    break

            if surrounded:
                # Score monastery: 9 points
                if (r, c) in self.meeple_map:
                    player, feature = self.meeple_map[(r, c)]
                    if feature == "monastery":
                        self.scores[player - 1] += 9
                        self.meeples[player - 1] += 1
                        del self.meeple_map[(r, c)]

    def _score_feature(self, tiles, feature, points):
        """Score a completed feature, return meeples, handle majority."""
        # Count meeples per player on this feature
        player_meeples = [0, 0]
        meeple_positions = []
        for (r, c) in tiles:
            if (r, c) in self.meeple_map:
                mp, mf = self.meeple_map[(r, c)]
                if mf == feature:
                    player_meeples[mp - 1] += 1
                    meeple_positions.append((r, c))

        if sum(player_meeples) == 0:
            return  # No meeples, no scoring

        # Player with most meeples gets points (tie: both get points)
        if player_meeples[0] > player_meeples[1]:
            self.scores[0] += points
        elif player_meeples[1] > player_meeples[0]:
            self.scores[1] += points
        else:
            # Tie - both score
            self.scores[0] += points
            self.scores[1] += points

        # Return all meeples
        for (r, c) in meeple_positions:
            mp, _ = self.meeple_map[(r, c)]
            self.meeples[mp - 1] += 1
            del self.meeple_map[(r, c)]

    def check_game_over(self):
        """Check if the game is over (no tiles left)."""
        if self.current_tile is None and self.phase == "place":
            # Score incomplete features
            self._score_end_game()
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None  # Draw

    def _score_end_game(self):
        """Score incomplete features at game end (reduced rate)."""
        scored_tiles = set()

        for (r, c), (player, feature) in list(self.meeple_map.items()):
            if feature == "city":
                tiles, _ = self._trace_feature(r, c, "C")
                key = frozenset(tiles)
                if key not in scored_tiles:
                    scored_tiles.add(key)
                    # Incomplete city: 1 pt per tile
                    points = len(tiles)
                    self._score_feature_endgame(tiles, "city", points)
            elif feature == "road":
                tiles, _ = self._trace_feature(r, c, "R")
                key = frozenset(tiles)
                if key not in scored_tiles:
                    scored_tiles.add(key)
                    # Incomplete road: 1 pt per tile
                    points = len(tiles)
                    self._score_feature_endgame(tiles, "road", points)
            elif feature == "monastery":
                # Count surrounding tiles + 1 for the monastery tile itself
                count = 1
                for dr in range(-1, 2):
                    for dc in range(-1, 2):
                        if dr == 0 and dc == 0:
                            continue
                        if (r + dr, c + dc) in self.board:
                            count += 1
                self.scores[player - 1] += count

    def _score_feature_endgame(self, tiles, feature, points):
        """Score an incomplete feature at game end."""
        player_meeples = [0, 0]
        for (r, c) in tiles:
            if (r, c) in self.meeple_map:
                mp, mf = self.meeple_map[(r, c)]
                if mf == feature:
                    player_meeples[mp - 1] += 1

        if sum(player_meeples) == 0:
            return

        if player_meeples[0] > player_meeples[1]:
            self.scores[0] += points
        elif player_meeples[1] > player_meeples[0]:
            self.scores[1] += points
        else:
            self.scores[0] += points
            self.scores[1] += points

    def get_state(self):
        """Return serializable game state for saving."""
        board_ser = {}
        for (r, c), (edges, has_mon) in self.board.items():
            board_ser[f"{r},{c}"] = {
                "edges": list(edges),
                "monastery": has_mon,
            }
        meeple_ser = {}
        for (r, c), (player, feature) in self.meeple_map.items():
            meeple_ser[f"{r},{c}"] = {"player": player, "feature": feature}
        return {
            "board": board_ser,
            "tile_bag": list(self.tile_bag),
            "current_tile": self.current_tile,
            "scores": list(self.scores),
            "meeples": list(self.meeples),
            "meeple_map": meeple_ser,
            "phase": self.phase,
            "last_placed": list(self.last_placed) if self.last_placed else None,
            "last_edges": list(self.last_edges) if self.last_edges else None,
            "last_monastery": self.last_monastery,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = {}
        for key, val in state["board"].items():
            r, c = key.split(",")
            self.board[(int(r), int(c))] = (tuple(val["edges"]), val["monastery"])
        self.tile_bag = list(state["tile_bag"])
        self.current_tile = state["current_tile"]
        self.scores = list(state["scores"])
        self.meeples = list(state["meeples"])
        self.meeple_map = {}
        for key, val in state["meeple_map"].items():
            r, c = key.split(",")
            self.meeple_map[(int(r), int(c))] = (val["player"], val["feature"])
        self.phase = state["phase"]
        lp = state.get("last_placed")
        self.last_placed = tuple(lp) if lp else None
        le = state.get("last_edges")
        self.last_edges = tuple(le) if le else None
        self.last_monastery = state.get("last_monastery", False)

    def get_tutorial(self):
        """Return tutorial text for Carcassonne."""
        return """
==============================================================
               CARCASSONNE  TUTORIAL
==============================================================

OVERVIEW
  Carcassonne is a tile-laying game where players draw and
  place tiles to build a medieval landscape of cities, roads,
  and monasteries. Score points by completing features with
  your meeples (followers) placed on them.

--------------------------------------------------------------
SETUP
--------------------------------------------------------------
  A starting tile is placed at position (0, 0). Each player
  begins with 7 meeples and 0 points.

--------------------------------------------------------------
TILE EDGES
--------------------------------------------------------------
  Each tile has 4 edges: North, East, South, West.
  Edge types:
    C = City    R = Road    F = Field

  Tiles are shown as:
        [N]
      [W][ ][E]       (M in center = monastery)
        [S]

--------------------------------------------------------------
PLACING TILES
--------------------------------------------------------------
  Each turn you draw a random tile. You must place it adjacent
  to an existing tile so that all touching edges MATCH:
    City must touch City, Road must touch Road, etc.

  Enter: row col rotation
    - row/col: position on the grid (starting tile is at 0,0)
    - rotation: 0 = as shown, 1 = 90 clockwise, 2 = 180, 3 = 270

--------------------------------------------------------------
PLACING MEEPLES
--------------------------------------------------------------
  After placing a tile, you may place one meeple on a feature
  of that tile (city, road, field, or monastery).

  Restrictions:
    - The connected feature must not already have any meeple
      (yours or opponent's) on it.
    - You must have meeples available (max 7).

  Enter a feature name or 'pass' to skip.

--------------------------------------------------------------
SCORING
--------------------------------------------------------------
  Completed city:      2 points per tile in the city
  Completed road:      1 point per tile in the road
  Completed monastery: 9 points (tile + all 8 neighbors filled)

  Meeples are returned when their feature is completed.

  Game ends when all tiles are drawn. Incomplete features
  score at a reduced rate:
    Incomplete city:      1 point per tile
    Incomplete road:      1 point per tile
    Incomplete monastery: 1 point per tile (including itself
                          and each filled neighbor)

--------------------------------------------------------------
BOARD DISPLAY
--------------------------------------------------------------
  Tiles on the board show:
    C/c = city tile, +/- = road tile, M = monastery, . = field
    1 or 2 = tile with that player's meeple

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  Standard:  Full rules with cities, roads, fields, monasteries
  Simple:    Roads and cities only (no monasteries, no fields)

--------------------------------------------------------------
COMMANDS
--------------------------------------------------------------
  'quit' or 'q'     - Quit game
  'save' or 's'     - Save and suspend game
  'help' or 'h'     - Show help
  'tutorial' or 't' - Show this tutorial
==============================================================
"""
