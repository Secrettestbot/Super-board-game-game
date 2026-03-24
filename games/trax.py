"""Trax - A connection game with colored track tiles on an infinite board."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


# Edge colors for each tile type at each edge (N, E, S, W)
# There are 4 tile types based on how tracks cross:
#   '/'  orientation A (NE-SW curves): N=W, E=R, S=R, W=W  (top-left white, bottom-right red... no)
# Actually in Trax each tile has two curved or two straight paths.
# We define edges as: N, E, S, W. Each edge is either 'W' (white) or 'R' (red).
# Tile types (using Trax conventions):
#   Type 0: curves NW-SE: N connects to W (white curve top-left), E connects to S (red curve bottom-right)
#           Edges: N=W, E=R, S=R, W=W
#   Type 1: curves NE-SW: N connects to E (red curve top-right), S connects to W (white curve bottom-left)
#           Edges: N=R, E=R, S=W, W=W
#   Type 2: straights N-S and E-W: N connects to S (white), E connects to W (red)
#           Edges: N=W, E=R, S=W, W=R
#   Type 3: straights N-S and E-W: N connects to S (red), E connects to W (white)
#           Edges: N=R, E=W, S=R, W=W  -- wait, this doesn't work for straights
# Let me reconsider. In Trax:
# Each tile has two tracks crossing. Each track is one color (W or R).
# There are 6 possible tile faces but due to symmetry there are effectively 4:
#
# Curved tiles (two curves crossing):
#   Type 0 "+\\": NW white curve + SE red curve
#       N=W, E=R, S=R, W=W   (N-W white, E-S red)
#   Type 1 "+/": NE red curve + SW white curve
#       N=R, E=R, S=W, W=W   (N-E red, S-W white)
#
# Straight tiles (two straight lines crossing):
#   Type 2 "||": N-S white + E-W red
#       N=W, E=R, S=W, W=R
#   Type 3 "=": N-S red + E-W white
#       N=R, E=W, S=R, W=W  -- that gives W two whites, but for straights
#       N=R, E=W, S=R, W=W is wrong. Let me think again.
#
# For straight tiles: one track goes N-S, other goes E-W.
#   Type 2: N-S is white, E-W is red -> N=W, E=R, S=W, W=R
#   Type 3: N-S is red, E-W is white -> N=R, E=W, S=R, W=W... no W=W doesn't make sense
#     -> N=R, E=W, S=R, W=W is wrong. W edge must be the same color as E edge's track.
#     E-W is white, so E=W, W=W. N-S is red, so N=R, S=R. -> N=R, E=W, S=R, W=W
#     Actually that IS right: the E-W track is white so both E and W edges are white.

# Edge indices
N, E, S, W = 0, 1, 2, 3

# Opposite edge mapping
OPPOSITE = {N: S, S: N, E: W, W: E}

# Direction offsets: (drow, dcol) for each edge direction
DIRECTION = {
    N: (-1, 0),
    E: (0, 1),
    S: (1, 0),
    W: (0, -1),
}

# Tile edge colors: tile_type -> (N_color, E_color, S_color, W_color)
# 'W' = white, 'R' = red
TILE_EDGES = {
    0: ('W', 'R', 'R', 'W'),  # NW white curve + SE red curve (backslash-like)
    1: ('R', 'R', 'W', 'W'),  # NE red curve + SW white curve (slash-like)
    2: ('W', 'R', 'W', 'R'),  # N-S white straight + E-W red straight
    3: ('R', 'W', 'R', 'W'),  # N-S red straight + E-W white straight
}

# Internal connections: tile_type -> list of (edge_a, edge_b) pairs connected
TILE_CONNECTIONS = {
    0: [(N, W), (E, S)],  # NW curve, SE curve
    1: [(N, E), (S, W)],  # NE curve, SW curve
    2: [(N, S), (E, W)],  # N-S straight, E-W straight
    3: [(N, S), (E, W)],  # N-S straight, E-W straight
}

# Display characters for tiles (3x3 sub-grid per tile)
# Each tile is shown as a 3x3 character block
# We use the color letter at curve/line positions
TILE_DISPLAY = {
    0: [  # NW white curve + SE red curve (backslash)
        ['W', ' ', ' '],
        [' ', ' ', ' '],
        [' ', ' ', 'R'],
    ],
    1: [  # NE red curve + SW white curve (slash)
        [' ', ' ', 'R'],
        [' ', ' ', ' '],
        ['W', ' ', ' '],
    ],
    2: [  # N-S white + E-W red
        [' ', 'W', ' '],
        ['R', ' ', 'R'],
        [' ', 'W', ' '],
    ],
    3: [  # N-S red + E-W white
        [' ', 'R', ' '],
        ['W', ' ', 'W'],
        [' ', 'R', ' '],
    ],
}


class TraxGame(BaseGame):
    """Trax: A two-player connection game with colored track tiles."""

    name = "Trax"
    description = "Place tiles to form loops or lines with your color"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Trax",
        "small": "Small Trax (win with loop or 6-line)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.tiles = {}  # (row, col) -> tile_type (0-3)
        self.min_row = 0
        self.max_row = 0
        self.min_col = 0
        self.max_col = 0
        self.forced_log = []  # Track forced placements for display
        self.win_line_length = 8  # standard

    def setup(self):
        """Initialize empty board."""
        self.tiles = {}
        self.min_row = 0
        self.max_row = 0
        self.min_col = 0
        self.max_col = 0
        self.forced_log = []
        if self.variation == "small":
            self.win_line_length = 6
        else:
            self.win_line_length = 8

    def _update_bounds(self):
        """Recalculate board bounds from placed tiles."""
        if not self.tiles:
            self.min_row = self.max_row = 0
            self.min_col = self.max_col = 0
            return
        rows = [r for r, c in self.tiles]
        cols = [c for r, c in self.tiles]
        self.min_row = min(rows)
        self.max_row = max(rows)
        self.min_col = min(cols)
        self.max_col = max(cols)

    def _get_edge_color(self, row, col, edge):
        """Get the color at a specific edge of a tile, or None if no tile."""
        if (row, col) not in self.tiles:
            return None
        return TILE_EDGES[self.tiles[(row, col)]][edge]

    def _get_neighbor_edge_color(self, row, col, edge):
        """Get the color that the neighbor requires at this edge, or None."""
        dr, dc = DIRECTION[edge]
        nr, nc = row + dr, col + dc
        if (nr, nc) not in self.tiles:
            return None
        return TILE_EDGES[self.tiles[(nr, nc)]][OPPOSITE[edge]]

    def _get_required_edges(self, row, col):
        """Get the required edge colors for a position based on neighbors.
        Returns dict: edge -> required_color, only for edges with neighbors."""
        required = {}
        for edge in [N, E, S, W]:
            color = self._get_neighbor_edge_color(row, col, edge)
            if color is not None:
                required[edge] = color
        return required

    def _valid_tiles_for_position(self, row, col):
        """Return list of tile types that are valid at position (row, col)."""
        required = self._get_required_edges(row, col)
        if not required:
            return []  # No neighbors, can't determine validity (need adjacency)
        valid = []
        for tile_type in range(4):
            edges = TILE_EDGES[tile_type]
            ok = True
            for edge, req_color in required.items():
                if edges[edge] != req_color:
                    ok = False
                    break
            if ok:
                valid.append(tile_type)
        return valid

    def _has_neighbor(self, row, col):
        """Check if position has at least one adjacent tile."""
        for edge in [N, E, S, W]:
            dr, dc = DIRECTION[edge]
            if (row + dr, col + dc) in self.tiles:
                return True
        return False

    def _tile_type_from_input(self, type_str, row, col):
        """Convert user input type string to tile type number.
        '/' = slash-like curves (type 1 or type 0 depending on required edges)
        '\\' = backslash-like curves (type 0 or type 1)
        '+' = straight lines (type 2 or type 3)
        Returns tile_type or None if invalid."""
        required = self._get_required_edges(row, col)
        if type_str == '/':
            candidates = [1, 0]  # Prefer slash (type 1), then backslash (type 0)
        elif type_str == '\\':
            candidates = [0, 1]  # Prefer backslash (type 0), then slash (type 1)
        elif type_str == '+':
            candidates = [2, 3]  # Straight tiles
        else:
            return None

        # Among the candidates, find one that matches required edges
        for tile_type in candidates:
            edges = TILE_EDGES[tile_type]
            ok = True
            for edge, req_color in required.items():
                if edges[edge] != req_color:
                    ok = False
                    break
            if ok:
                return tile_type
        return None

    def _process_forced_plays(self):
        """After placing a tile, check for forced plays and execute them.
        Returns True if all forced plays are valid, False if contradiction."""
        self.forced_log = []
        changed = True
        while changed:
            changed = False
            # Check all empty positions adjacent to existing tiles
            candidates = set()
            for (r, c) in list(self.tiles.keys()):
                for edge in [N, E, S, W]:
                    dr, dc = DIRECTION[edge]
                    nr, nc = r + dr, c + dc
                    if (nr, nc) not in self.tiles:
                        candidates.add((nr, nc))

            for (r, c) in candidates:
                required = self._get_required_edges(r, c)
                if len(required) < 2:
                    # Need at least 2 constrained edges for a forced play
                    continue
                valid = self._valid_tiles_for_position(r, c)
                if len(valid) == 0:
                    # Contradiction - no valid tile fits
                    return False
                elif len(valid) == 1:
                    # Forced play
                    self.tiles[(r, c)] = valid[0]
                    self.forced_log.append((r, c, valid[0]))
                    self._update_bounds()
                    changed = True
        return True

    def display(self):
        """Display the current board state."""
        print(f"\n  === Trax ({self.variations[self.variation]}) ===")
        print(f"  {self.players[0]} (White/W)  vs  {self.players[1]} (Red/R)")
        print(f"  Current turn: {self.players[self.current_player - 1]}"
              f" ({'White' if self.current_player == 1 else 'Red'})")
        win_len = self.win_line_length
        print(f"  Win: loop of your color OR line spanning {win_len}+ rows/cols")
        print()

        if not self.tiles:
            print("  Board is empty. Place the first tile at row 0, col 0.")
            print()
            return

        # Display bounds with one row/col of margin
        r_min = self.min_row
        r_max = self.max_row
        c_min = self.min_col
        c_max = self.max_col

        # Column headers
        header = "     "
        for c in range(c_min, c_max + 1):
            header += f" {c:>3} "
        print(header)

        # Top border
        border = "     "
        for c in range(c_min, c_max + 1):
            border += "+----"
        border += "+"
        print(border)

        for r in range(r_min, r_max + 1):
            # Each tile is 3 rows high in display
            for sub_row in range(3):
                if sub_row == 1:
                    line = f" {r:>3} |"
                else:
                    line = "     |"
                for c in range(c_min, c_max + 1):
                    if (r, c) in self.tiles:
                        tile_type = self.tiles[(r, c)]
                        disp = TILE_DISPLAY[tile_type]
                        cell = ""
                        for sub_col in range(3):
                            ch = disp[sub_row][sub_col]
                            if ch == ' ':
                                cell += ' '
                            else:
                                cell += ch
                        line += f" {cell}|"
                    else:
                        line += "    |"
                print(line)
            # Row separator
            sep = "     "
            for c in range(c_min, c_max + 1):
                sep += "+----"
            sep += "+"
            print(sep)

        print()

        if self.forced_log:
            print("  Forced placements this turn:")
            for fr, fc, ft in self.forced_log:
                tname = self._tile_type_name(ft)
                print(f"    ({fr}, {fc}): {tname}")
            print()

    def _tile_type_name(self, tile_type):
        """Return a human-readable name for a tile type."""
        names = {
            0: "\\ (NW white curve + SE red curve)",
            1: "/ (NE red curve + SW white curve)",
            2: "+ (N-S white + E-W red straights)",
            3: "+ (N-S red + E-W white straights)",
        }
        return names.get(tile_type, "?")

    def get_move(self):
        """Get a move from the current player."""
        player_name = self.players[self.current_player - 1]
        color = "White" if self.current_player == 1 else "Red"

        while True:
            if not self.tiles:
                prompt = f"  {player_name} ({color}), place first tile (type / \\ or +): "
                raw = input_with_quit(prompt).strip()
                tile_char = raw
                if tile_char not in ('/', '\\', '+'):
                    print("  Invalid type. Use / \\ or +")
                    continue
                # First tile: player chooses type, placed at (0,0)
                # For first tile, any orientation is valid. Pick based on input.
                if tile_char == '/':
                    return (0, 0, 1)  # slash
                elif tile_char == '\\':
                    return (0, 0, 0)  # backslash
                else:
                    return (0, 0, 2)  # straight (N-S white by default)
            else:
                prompt = (f"  {player_name} ({color}), enter move "
                          f"(row col type, e.g. '0 1 /' or '1 0 +'): ")
                raw = input_with_quit(prompt).strip()
                parts = raw.split()
                if len(parts) < 3:
                    print("  Enter: row col type (e.g. '0 1 /'). Type is / \\ or +")
                    continue
                try:
                    row = int(parts[0])
                    col = int(parts[1])
                except ValueError:
                    print("  Row and col must be integers.")
                    continue
                type_str = parts[2]
                if type_str not in ('/', '\\', '+'):
                    print("  Type must be / \\ or +")
                    continue

                if (row, col) in self.tiles:
                    print("  That position already has a tile!")
                    continue

                if not self._has_neighbor(row, col):
                    print("  Tile must be adjacent to an existing tile!")
                    continue

                tile_type = self._tile_type_from_input(type_str, row, col)
                if tile_type is None:
                    print("  That tile type doesn't match the required edge colors!")
                    valid = self._valid_tiles_for_position(row, col)
                    if valid:
                        print("  Valid tiles for this position:")
                        for vt in valid:
                            print(f"    {self._tile_type_name(vt)}")
                    else:
                        print("  No valid tiles exist for this position.")
                    continue

                return (row, col, tile_type)

    def make_move(self, move):
        """Place a tile and process forced plays. Returns True if valid."""
        row, col, tile_type = move

        # For non-first moves, verify adjacency and edge matching
        if self.tiles:
            if (row, col) in self.tiles:
                return False
            if not self._has_neighbor(row, col):
                return False
            required = self._get_required_edges(row, col)
            edges = TILE_EDGES[tile_type]
            for edge, req_color in required.items():
                if edges[edge] != req_color:
                    return False

        # Place the tile
        self.tiles[(row, col)] = tile_type
        self._update_bounds()

        # Process forced plays (chain reactions)
        if not self._process_forced_plays():
            # Contradiction from forced plays - undo everything
            del self.tiles[(row, col)]
            for fr, fc, ft in self.forced_log:
                if (fr, fc) in self.tiles:
                    del self.tiles[(fr, fc)]
            self.forced_log = []
            self._update_bounds()
            print("  This placement leads to a contradiction in forced plays!")
            return False

        return True

    def check_game_over(self):
        """Check for loops or spanning lines."""
        # Check both colors
        for color in ['W', 'R']:
            player = 1 if color == 'W' else 2

            # Check for loop
            if self._check_loop(color):
                self.game_over = True
                self.winner = player
                return

            # Check for spanning line
            if self._check_line(color):
                self.game_over = True
                self.winner = player
                return

    def _get_track_segments(self, color):
        """Build a graph of track segments for a given color.
        Returns a dict mapping (row, col, edge) -> (row, col, edge) for internal connections,
        and edges that connect to neighbors."""
        # For each tile, find the connection pair that matches this color
        # and create edges in the track graph
        segments = []  # list of ((r1,c1,edge1), (r1,c1,edge2)) for internal
        for (r, c), tile_type in self.tiles.items():
            edges_colors = TILE_EDGES[tile_type]
            connections = TILE_CONNECTIONS[tile_type]
            for edge_a, edge_b in connections:
                if edges_colors[edge_a] == color:
                    segments.append(((r, c, edge_a), (r, c, edge_b)))
        return segments

    def _build_track_graph(self, color):
        """Build adjacency list for track nodes of given color.
        A node is (row, col, edge). Edges connect:
        1) Internally within a tile (the two ends of a track)
        2) Externally between adjacent tiles (matching edges)"""
        graph = {}

        def add_edge(a, b):
            if a not in graph:
                graph[a] = []
            graph[a].append(b)
            if b not in graph:
                graph[b] = []
            graph[b].append(a)

        for (r, c), tile_type in self.tiles.items():
            edges_colors = TILE_EDGES[tile_type]
            connections = TILE_CONNECTIONS[tile_type]
            for edge_a, edge_b in connections:
                if edges_colors[edge_a] == color:
                    node_a = (r, c, edge_a)
                    node_b = (r, c, edge_b)
                    add_edge(node_a, node_b)

        # External connections between adjacent tiles
        for (r, c), tile_type in self.tiles.items():
            for edge in [N, E, S, W]:
                if TILE_EDGES[tile_type][edge] != color:
                    continue
                dr, dc = DIRECTION[edge]
                nr, nc = r + dr, c + dc
                if (nr, nc) in self.tiles:
                    opp = OPPOSITE[edge]
                    if TILE_EDGES[self.tiles[(nr, nc)]][opp] == color:
                        node_a = (r, c, edge)
                        node_b = (nr, nc, opp)
                        # Avoid duplicate edges
                        if node_a in graph and node_b in graph[node_a]:
                            continue
                        add_edge(node_a, node_b)

        return graph

    def _check_loop(self, color):
        """Check if there's a loop (cycle) in the track graph for given color.
        A loop requires at least 4 tiles (to be meaningful)."""
        graph = self._build_track_graph(color)
        if not graph:
            return False

        visited = set()
        for start in graph:
            if start in visited:
                continue
            # BFS/DFS tracking parent to detect cycle
            stack = [(start, None)]
            component_visited = set()
            while stack:
                node, parent = stack.pop()
                if node in component_visited:
                    # Found a cycle - check it involves enough tiles
                    tiles_in_component = set()
                    for n in component_visited:
                        tiles_in_component.add((n[0], n[1]))
                    if len(tiles_in_component) >= 4:
                        return True
                    continue
                component_visited.add(node)
                visited.add(node)
                for neighbor in graph.get(node, []):
                    if neighbor != parent:
                        stack.append((neighbor, node))
        return False

    def _check_line(self, color):
        """Check if there's a line of given color spanning win_line_length rows or columns."""
        graph = self._build_track_graph(color)
        if not graph:
            return False

        # Find all connected components and check their row/col span
        visited = set()
        for start in graph:
            if start in visited:
                continue
            # BFS to find component
            component_tiles = set()
            queue = deque([start])
            while queue:
                node = queue.popleft()
                if node in visited:
                    continue
                visited.add(node)
                component_tiles.add((node[0], node[1]))
                for neighbor in graph.get(node, []):
                    if neighbor not in visited:
                        queue.append(neighbor)

            if len(component_tiles) < self.win_line_length:
                continue

            rows = [r for r, c in component_tiles]
            cols = [c for r, c in component_tiles]
            row_span = max(rows) - min(rows) + 1
            col_span = max(cols) - min(cols) + 1

            if row_span >= self.win_line_length or col_span >= self.win_line_length:
                return True

        return False

    def get_state(self):
        """Return serializable game state."""
        # Convert tuple keys to strings for JSON
        tiles_ser = {f"{r},{c}": t for (r, c), t in self.tiles.items()}
        return {
            "tiles": tiles_ser,
            "min_row": self.min_row,
            "max_row": self.max_row,
            "min_col": self.min_col,
            "max_col": self.max_col,
            "win_line_length": self.win_line_length,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.tiles = {}
        for key, t in state["tiles"].items():
            r, c = key.split(",")
            self.tiles[(int(r), int(c))] = t
        self.min_row = state["min_row"]
        self.max_row = state["max_row"]
        self.min_col = state["min_col"]
        self.max_col = state["max_col"]
        self.win_line_length = state.get("win_line_length", 8)

    def get_tutorial(self):
        """Return tutorial text for Trax."""
        return """
==============================================================
                      TRAX  TUTORIAL
==============================================================

OVERVIEW
  Trax is a two-player connection game played on an infinite
  board. Players place square tiles with colored tracks to
  form loops or spanning lines.

--------------------------------------------------------------
TILES
--------------------------------------------------------------
  Each tile has two tracks crossing it. One track is White (W)
  and the other is Red (R). There are three tile shapes:

  /  (slash curves):
       NE red curve + SW white curve
       Displayed as:        R

                        W

  \\  (backslash curves):
       NW white curve + SE red curve
       Displayed as:  W

                            R

  +  (straight lines):
       N-S and E-W straight tracks
       The colors are chosen automatically to match neighbors.
       Displayed as:     W          or      R
                       R   R              W   W
                         W                  R

--------------------------------------------------------------
RULES
--------------------------------------------------------------
  1. Player 1 is White, Player 2 is Red.

  2. On your turn, place a tile adjacent to any existing tile.

  3. Track colors MUST match at shared edges. The game will
     automatically choose the correct orientation variant
     (e.g., which color goes which way on a + tile).

  4. FORCED PLAYS: After placing a tile, if any empty space
     has 2+ neighboring edges that force exactly one valid
     tile, that tile is automatically placed. This can chain.

  5. If a forced play leads to a contradiction (no valid tile
     fits), the original move is illegal.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  You win by forming either:

  a) A LOOP of your color - a closed path of your color
     that returns to its starting point (at least 4 tiles).

  b) A LINE of your color - a connected path that spans
     at least {win_len} rows OR {win_len} columns.

  Standard Trax: line must span 8+ rows or columns.
  Small Trax: line must span 6+ rows or columns.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  For the first tile: just enter the tile type: / \\ or +

  After that: row col type
  Examples:
    0 1 /    -- place a slash tile at row 0, col 1
    1 0 +    -- place a straight tile at row 1, col 0
    -1 0 \\   -- place a backslash tile at row -1, col 0

  Row and col coordinates match the board display.
  Negative coordinates are fine (the board grows infinitely).

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Forced plays can be powerful. Place tiles that trigger
    chain reactions extending your tracks.
  - Watch both colors. A move that helps you might also
    inadvertently help your opponent.
  - Blocking your opponent's loops and lines is as important
    as building your own.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
""".replace("{win_len}", str(self.win_line_length))
