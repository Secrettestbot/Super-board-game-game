"""Akrotiri - Tile-laying map building with secret temple goals."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'
RED = '\033[91m'
BLUE = '\033[94m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
DIM = '\033[2m'
BOLD = '\033[1m'

# Terrain types
SEA = '~'
LAND = '.'
MOUNTAIN = '^'
FOREST = 'T'
MARKET = 'M'
TEMPLE = '*'

TERRAIN_COLORS = {
    SEA: CYAN,
    LAND: GREEN,
    MOUNTAIN: DIM,
    FOREST: GREEN + BOLD,
    MARKET: YELLOW,
    TEMPLE: RED + BOLD,
}

# Resource types gained from land tiles
RESOURCES = ['wood', 'stone', 'pottery']

# Tile definitions: each tile is a 2x2 grid of terrain
# Format: ((top-left, top-right), (bottom-left, bottom-right))
TILE_POOL = [
    ((SEA, LAND), (LAND, SEA)),
    ((LAND, SEA), (SEA, LAND)),
    ((SEA, SEA), (LAND, LAND)),
    ((LAND, LAND), (SEA, SEA)),
    ((SEA, LAND), (SEA, LAND)),
    ((LAND, SEA), (LAND, SEA)),
    ((LAND, LAND), (LAND, SEA)),
    ((SEA, LAND), (LAND, LAND)),
    ((LAND, LAND), (SEA, LAND)),
    ((LAND, SEA), (LAND, LAND)),
    ((SEA, SEA), (SEA, LAND)),
    ((LAND, SEA), (SEA, SEA)),
    ((SEA, SEA), (LAND, SEA)),
    ((SEA, LAND), (SEA, SEA)),
    ((MOUNTAIN, SEA), (LAND, LAND)),
    ((SEA, MOUNTAIN), (LAND, LAND)),
    ((LAND, LAND), (MOUNTAIN, SEA)),
    ((LAND, LAND), (SEA, MOUNTAIN)),
    ((FOREST, SEA), (SEA, LAND)),
    ((SEA, FOREST), (LAND, SEA)),
    ((MARKET, LAND), (SEA, SEA)),
    ((SEA, SEA), (LAND, MARKET)),
    ((FOREST, LAND), (LAND, SEA)),
    ((SEA, LAND), (LAND, FOREST)),
]

# Goal cards: each specifies relative directions from a landmark to find a temple
# Format: (landmark_terrain, [(direction, distance)], point_value, description)
GOAL_TEMPLATES = [
    (MOUNTAIN, [('N', 2)], 3, "2 north of a mountain"),
    (MOUNTAIN, [('S', 2)], 3, "2 south of a mountain"),
    (MOUNTAIN, [('E', 2)], 3, "2 east of a mountain"),
    (MOUNTAIN, [('W', 2)], 3, "2 west of a mountain"),
    (FOREST, [('N', 1)], 2, "1 north of a forest"),
    (FOREST, [('S', 1)], 2, "1 south of a forest"),
    (FOREST, [('E', 1)], 2, "1 east of a forest"),
    (FOREST, [('W', 1)], 2, "1 west of a forest"),
    (MARKET, [('N', 1)], 4, "1 north of a market"),
    (MARKET, [('S', 1)], 4, "1 south of a market"),
    (MARKET, [('E', 1)], 4, "1 east of a market"),
    (MARKET, [('W', 1)], 4, "1 west of a market"),
    (MOUNTAIN, [('N', 1), ('E', 1)], 5, "1 NE of a mountain"),
    (MOUNTAIN, [('S', 1), ('W', 1)], 5, "1 SW of a mountain"),
    (FOREST, [('N', 1), ('W', 1)], 4, "1 NW of a forest"),
    (FOREST, [('S', 1), ('E', 1)], 4, "1 SE of a forest"),
]

DIRECTION_OFFSETS = {
    'N': (-1, 0), 'S': (1, 0), 'E': (0, 1), 'W': (0, -1),
}


class AkrotiriGame(BaseGame):
    name = "Akrotiri"
    description = "Tile-laying map building with secret temple goals"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Full game with 24 tiles',
        'quick': 'Quick game with 16 tiles',
    }

    def setup(self):
        tile_count = 24 if self.variation == 'standard' else 16
        # Map is a dict keyed by "r,c" -> terrain char
        # Start with a 4x4 island in the center of a 12x12 conceptual grid
        self.map_size = 16
        self.grid = {}
        center = self.map_size // 2
        # Starting island
        for r in range(center - 1, center + 1):
            for c in range(center - 1, center + 1):
                self.grid[f"{r},{c}"] = LAND
        # Place a market on the starting island
        self.grid[f"{center},{center}"] = MARKET

        # Surround with sea
        for r in range(center - 3, center + 3):
            for c in range(center - 3, center + 3):
                key = f"{r},{c}"
                if key not in self.grid:
                    self.grid[key] = SEA

        # Tile draw pool
        pool = list(TILE_POOL[:tile_count])
        random.shuffle(pool)
        # Serialize tiles as lists of lists
        self.tile_pool = [[list(row) for row in tile] for tile in pool]
        self.tiles_remaining = len(self.tile_pool)

        # Players: boats, resources, goals, score, discovered temples
        self.player_data = {}
        for p in [1, 2]:
            goals = random.sample(GOAL_TEMPLATES, 3)
            self.player_data[str(p)] = {
                'boat_r': center,
                'boat_c': center,
                'resources': {'wood': 0, 'stone': 0, 'pottery': 0},
                'goals': [
                    {'landmark': g[0], 'directions': g[1], 'points': g[2], 'desc': g[3], 'completed': False}
                    for g in goals
                ],
                'score': 0,
                'temples_discovered': 0,
            }

        # Current tile to place (drawn at start of turn)
        self.current_tile = None
        self.phase = 'draw_tile'  # draw_tile, place_tile, move_boat, discover, end_turn
        self.message = "Game begins! Each turn: place a tile, then move your boat."

    def _get_map_bounds(self):
        if not self.grid:
            c = self.map_size // 2
            return c - 3, c + 3, c - 3, c + 3
        rows = []
        cols = []
        for key in self.grid:
            r, c = key.split(',')
            rows.append(int(r))
            cols.append(int(c))
        # Also include boat positions
        for p in ['1', '2']:
            rows.append(self.player_data[p]['boat_r'])
            cols.append(self.player_data[p]['boat_c'])
        return min(rows) - 1, max(rows) + 2, min(cols) - 1, max(cols) + 2

    def display(self):
        clear_screen()
        p = str(self.current_player)
        pd = self.player_data[p]
        print(f"{BOLD}=== AKROTIRI ==={RESET}")
        print(f"Turn {self.turn_number + 1} | {self.players[self.current_player - 1]}'s turn")
        print(f"Tiles remaining: {self.tiles_remaining} | Phase: {self.phase}")
        if self.message:
            print(f"{YELLOW}{self.message}{RESET}")
        print()

        min_r, max_r, min_c, max_c = self._get_map_bounds()

        # Column headers
        header = "    "
        for c in range(min_c, max_c):
            header += f"{c % 100:2d}"
        print(header)

        for r in range(min_r, max_r):
            row_str = f"{r:3d} "
            for c in range(min_c, max_c):
                key = f"{r},{c}"
                # Check for boats
                boat_here = None
                for bp in ['1', '2']:
                    if self.player_data[bp]['boat_r'] == r and self.player_data[bp]['boat_c'] == c:
                        boat_here = bp
                if boat_here:
                    color = BLUE if boat_here == '1' else RED
                    row_str += f"{color}B{boat_here}{RESET}"
                elif key in self.grid:
                    terrain = self.grid[key]
                    tc = TERRAIN_COLORS.get(terrain, '')
                    row_str += f"{tc}{terrain} {RESET}"
                else:
                    row_str += f"{DIM}  {RESET}"
            print(row_str)

        print()
        # Player info
        color = BLUE if p == '1' else RED
        print(f"{color}--- Your Info ---{RESET}")
        res = pd['resources']
        print(f"  Resources: Wood={res['wood']} Stone={res['stone']} Pottery={res['pottery']}")
        print(f"  Score: {pd['score']} | Temples found: {pd['temples_discovered']}")
        print(f"  Boat at: ({pd['boat_r']}, {pd['boat_c']})")
        print(f"  Goals:")
        for i, g in enumerate(pd['goals']):
            status = f"{GREEN}DONE{RESET}" if g['completed'] else f"({g['points']}pts)"
            print(f"    {i + 1}. Temple {g['desc']} {status}")

        if self.current_tile:
            print(f"\n  Current tile to place:")
            for row in self.current_tile:
                line = "    "
                for cell in row:
                    tc = TERRAIN_COLORS.get(cell, '')
                    line += f"{tc}{cell} {RESET}"
                print(line)

        print(f"\n{DIM}Legend: ~=Sea .=Land ^=Mountain T=Forest M=Market *=Temple B#=Boat{RESET}")
        print()

    def get_move(self):
        p = str(self.current_player)
        pd = self.player_data[p]

        if self.phase == 'draw_tile':
            if self.tiles_remaining > 0:
                self.current_tile = self.tile_pool.pop()
                self.tiles_remaining = len(self.tile_pool)
                self.phase = 'place_tile'
                self.message = "Tile drawn! Place it adjacent to existing tiles."
                return {'action': 'draw'}
            else:
                self.phase = 'move_boat'
                self.message = "No tiles left. Move your boat."
                return {'action': 'skip_draw'}

        if self.phase == 'place_tile':
            print("Place tile: enter top-left position as 'row,col' (or 'r' to rotate):")
            val = input_with_quit("  > ")
            if val.strip().lower() == 'r':
                return {'action': 'rotate_tile'}
            try:
                parts = val.strip().split(',')
                r, c = int(parts[0].strip()), int(parts[1].strip())
                return {'action': 'place_tile', 'row': r, 'col': c}
            except (ValueError, IndexError):
                return {'action': 'invalid'}

        if self.phase == 'move_boat':
            print(f"Move boat (currently at {pd['boat_r']},{pd['boat_c']}).")
            print("Enter destination 'row,col' on sea tiles, or 'skip' to stay:")
            val = input_with_quit("  > ")
            if val.strip().lower() == 'skip':
                return {'action': 'skip_move'}
            try:
                parts = val.strip().split(',')
                r, c = int(parts[0].strip()), int(parts[1].strip())
                return {'action': 'move_boat', 'row': r, 'col': c}
            except (ValueError, IndexError):
                return {'action': 'invalid'}

        if self.phase == 'discover':
            print("You are adjacent to land. Attempt temple discovery?")
            print("Enter goal number (1-3) to attempt, or 'skip':")
            val = input_with_quit("  > ")
            if val.strip().lower() == 'skip':
                return {'action': 'skip_discover'}
            try:
                goal_idx = int(val.strip()) - 1
                return {'action': 'discover', 'goal': goal_idx}
            except (ValueError, IndexError):
                return {'action': 'invalid'}

        return {'action': 'invalid'}

    def _can_place_tile(self, r, c):
        """Check if a 2x2 tile can be placed at (r, c)."""
        # All 4 cells must be empty
        for dr in range(2):
            for dc in range(2):
                key = f"{r + dr},{c + dc}"
                if key in self.grid:
                    return False
        # At least one cell must be adjacent to existing grid
        adjacent = False
        for dr in range(2):
            for dc in range(2):
                for ar, ac in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = r + dr + ar, c + dc + ac
                    # Don't count other cells of this same tile
                    if 0 <= nr - r <= 1 and 0 <= nc - c <= 1:
                        continue
                    key = f"{nr},{nc}"
                    if key in self.grid:
                        adjacent = True
                        break
                if adjacent:
                    break
            if adjacent:
                break
        return adjacent

    def _is_sea_connected(self, r1, c1, r2, c2):
        """Check if boat can travel from (r1,c1) to (r2,c2) via sea tiles."""
        start = (r1, c1)
        end = (r2, c2)
        if start == end:
            return True
        # BFS over sea tiles
        visited = set()
        queue = [start]
        visited.add(start)
        while queue:
            cr, cc = queue.pop(0)
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = cr + dr, cc + dc
                if (nr, nc) == end:
                    return True
                key = f"{nr},{nc}"
                if (nr, nc) not in visited and key in self.grid and self.grid[key] == SEA:
                    visited.add((nr, nc))
                    queue.append((nr, nc))
        return False

    def _adjacent_land(self, r, c):
        """Return list of adjacent land tiles."""
        result = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            key = f"{nr},{nc}"
            if key in self.grid and self.grid[key] not in (SEA, None):
                result.append((nr, nc))
        return result

    def _check_goal_at(self, goal, r, c):
        """Check if a goal can be fulfilled by placing a temple at (r, c)."""
        landmark = goal['landmark']
        directions = goal['directions']
        # The temple location must be reachable from a landmark via the directions
        # Work backwards: from (r,c), go opposite directions to find the landmark
        cr, cc = r, c
        for d_dir, d_dist in directions:
            # Opposite direction
            opp = {'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E'}[d_dir]
            dr, dc = DIRECTION_OFFSETS[opp]
            cr += dr * d_dist
            cc += dc * d_dist
        # Check if there's a landmark at (cr, cc)
        key = f"{cr},{cc}"
        if key in self.grid and self.grid[key] == landmark:
            return True
        return False

    def make_move(self, move):
        if move['action'] == 'invalid':
            self.message = "Invalid input. Try again."
            return False

        if move['action'] == 'draw' or move['action'] == 'skip_draw':
            return True

        if move['action'] == 'rotate_tile':
            if self.current_tile:
                # Rotate 90 degrees clockwise
                old = self.current_tile
                self.current_tile = [
                    [old[1][0], old[0][0]],
                    [old[1][1], old[0][1]],
                ]
                self.message = "Tile rotated."
            return False  # Stay in same phase

        if move['action'] == 'place_tile':
            r, c = move['row'], move['col']
            if not self._can_place_tile(r, c):
                self.message = "Cannot place tile there. Must be empty and adjacent to existing map."
                return False
            # Place the tile
            for dr in range(2):
                for dc in range(2):
                    key = f"{r + dr},{c + dc}"
                    self.grid[key] = self.current_tile[dr][dc]
            self.current_tile = None
            # Give resources for land tiles placed
            p = str(self.current_player)
            for dr in range(2):
                for dc in range(2):
                    terrain = self.grid[f"{r + dr},{c + dc}"]
                    if terrain == LAND:
                        res = random.choice(RESOURCES)
                        self.player_data[p]['resources'][res] += 1
                    elif terrain == FOREST:
                        self.player_data[p]['resources']['wood'] += 1
                    elif terrain == MOUNTAIN:
                        self.player_data[p]['resources']['stone'] += 1
                    elif terrain == MARKET:
                        self.player_data[p]['resources']['pottery'] += 1
            self.phase = 'move_boat'
            self.message = "Tile placed! Now move your boat on sea tiles."
            return False  # Don't switch player yet

        if move['action'] == 'skip_move':
            p = str(self.current_player)
            pd = self.player_data[p]
            adj = self._adjacent_land(pd['boat_r'], pd['boat_c'])
            if adj:
                self.phase = 'discover'
                self.message = "You're adjacent to land. Attempt temple discovery?"
                return False
            self.phase = 'draw_tile'
            self.message = ""
            return True  # End turn

        if move['action'] == 'move_boat':
            p = str(self.current_player)
            pd = self.player_data[p]
            r, c = move['row'], move['col']
            key = f"{r},{c}"
            # Destination must be a sea tile
            if key not in self.grid or self.grid[key] != SEA:
                self.message = "Boat must move to a sea tile."
                return False
            # Must be reachable via sea
            if not self._is_sea_connected(pd['boat_r'], pd['boat_c'], r, c):
                self.message = "Cannot reach that tile by sea."
                return False
            pd['boat_r'] = r
            pd['boat_c'] = c
            # Check for adjacent land for discovery
            adj = self._adjacent_land(r, c)
            if adj:
                self.phase = 'discover'
                self.message = "You're adjacent to land! Attempt temple discovery?"
                return False
            self.phase = 'draw_tile'
            self.message = ""
            return True  # End turn

        if move['action'] == 'skip_discover':
            self.phase = 'draw_tile'
            self.message = ""
            return True  # End turn

        if move['action'] == 'discover':
            p = str(self.current_player)
            pd = self.player_data[p]
            goal_idx = move['goal']
            if goal_idx < 0 or goal_idx >= len(pd['goals']):
                self.message = "Invalid goal number."
                return False
            goal = pd['goals'][goal_idx]
            if goal['completed']:
                self.message = "That goal is already completed."
                return False
            # Need resources to discover
            total_res = sum(pd['resources'].values())
            cost = 2  # Base cost to discover
            if total_res < cost:
                self.message = f"Need {cost} total resources to attempt discovery. You have {total_res}."
                return False
            # Check adjacent land tiles for valid goal fulfillment
            adj = self._adjacent_land(pd['boat_r'], pd['boat_c'])
            found = False
            temple_pos = None
            for ar, ac in adj:
                if self._check_goal_at(goal, ar, ac):
                    found = True
                    temple_pos = (ar, ac)
                    break
            if not found:
                self.message = "No valid temple location adjacent. Goal directions don't match any landmark."
                return False
            # Spend resources (spend cheapest first)
            spent = 0
            for res in RESOURCES:
                while pd['resources'][res] > 0 and spent < cost:
                    pd['resources'][res] -= 1
                    spent += 1
            # Place temple
            self.grid[f"{temple_pos[0]},{temple_pos[1]}"] = TEMPLE
            goal['completed'] = True
            pd['score'] += goal['points']
            pd['temples_discovered'] += 1
            self.message = f"Temple discovered! +{goal['points']} points!"
            self.phase = 'draw_tile'
            return True  # End turn

        return False

    def check_game_over(self):
        # Game ends when all tiles placed and both players have had equal turns
        if self.tiles_remaining == 0 and self.current_tile is None:
            # Check if current player has no more actions
            all_goals_done = True
            for p in ['1', '2']:
                for g in self.player_data[p]['goals']:
                    if not g['completed']:
                        all_goals_done = False
            if all_goals_done or self.turn_number >= (24 if self.variation == 'standard' else 16) * 2:
                self.game_over = True
                s1 = self.player_data['1']['score']
                s2 = self.player_data['2']['score']
                if s1 > s2:
                    self.winner = 1
                elif s2 > s1:
                    self.winner = 2
                else:
                    self.winner = None

    def get_state(self):
        return {
            'grid': dict(self.grid),
            'tile_pool': self.tile_pool,
            'tiles_remaining': self.tiles_remaining,
            'current_tile': self.current_tile,
            'player_data': self.player_data,
            'phase': self.phase,
            'message': self.message,
            'map_size': self.map_size,
        }

    def load_state(self, state):
        self.grid = state['grid']
        self.tile_pool = state['tile_pool']
        self.tiles_remaining = state['tiles_remaining']
        self.current_tile = state['current_tile']
        self.player_data = state['player_data']
        self.phase = state['phase']
        self.message = state['message']
        self.map_size = state['map_size']

    def get_tutorial(self):
        return f"""{BOLD}=== AKROTIRI TUTORIAL ==={RESET}

Akrotiri is a tile-laying game set in the Mediterranean.

{BOLD}OVERVIEW:{RESET}
  Each turn you draw a 2x2 tile and place it adjacent to the existing map,
  then move your boat across sea tiles. When near land, you can attempt
  to discover temples using your secret goal cards.

{BOLD}PHASES:{RESET}
  1. DRAW & PLACE TILE: A 2x2 tile is drawn. Place it by entering the
     top-left coordinate (row,col). Type 'r' to rotate the tile first.
     The tile must be placed on empty spaces adjacent to existing map.

  2. MOVE BOAT: Move your boat to any sea tile (~) reachable by
     connected sea tiles. Enter destination as row,col or 'skip'.

  3. DISCOVER TEMPLE: If your boat is adjacent to land, you may
     attempt to discover a temple using one of your goal cards.
     Each goal specifies a direction from a landmark (^=Mountain,
     T=Forest, M=Market). Costs 2 resources.

{BOLD}RESOURCES:{RESET}
  Placing land tiles grants resources (wood, stone, pottery).
  Resources are spent to discover temples.

{BOLD}SCORING:{RESET}
  Each discovered temple scores the points shown on the goal card.
  Highest score when all tiles are placed wins!

{BOLD}TERRAIN KEY:{RESET}
  ~ = Sea    . = Land    ^ = Mountain
  T = Forest  M = Market  * = Temple
  B1/B2 = Player boats

{BOLD}COMMANDS:{RESET}
  'q' = Quit  's' = Save  'h' = Help  't' = Tutorial
"""
