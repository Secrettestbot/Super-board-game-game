"""Akrotiri - Tile-laying map building with secret temple goals."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'
RED = '\033[91m'
BLUE = '\033[94m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
DIM = '\033[2m'
BOLD = '\033[1m'
WHITE = '\033[97m'

# Terrain types
SEA = '~'
LAND = '#'
PORT = 'P'
TEMPLE_SITE = 'T'
RESOURCE_FOREST = 'F'
RESOURCE_STONE = 'S'
RESOURCE_CLAY = 'C'

TERRAIN_COLORS = {
    SEA: CYAN,
    LAND: GREEN,
    PORT: YELLOW,
    TEMPLE_SITE: RED,
    RESOURCE_FOREST: GREEN,
    RESOURCE_STONE: DIM,
    RESOURCE_CLAY: RED,
}

RESOURCE_NAMES = {
    RESOURCE_FOREST: 'Wood',
    RESOURCE_STONE: 'Stone',
    RESOURCE_CLAY: 'Clay',
}

# Tiles: each tile is a 2x2 grid of terrain types
# Format: [[top-left, top-right], [bottom-left, bottom-right]]
def _make_tile_pool():
    """Generate the pool of map tiles."""
    tiles = []
    patterns = [
        [[LAND, SEA], [SEA, SEA]],
        [[SEA, LAND], [LAND, SEA]],
        [[LAND, LAND], [SEA, SEA]],
        [[SEA, SEA], [LAND, LAND]],
        [[LAND, SEA], [LAND, SEA]],
        [[SEA, LAND], [SEA, LAND]],
        [[LAND, LAND], [LAND, SEA]],
        [[LAND, LAND], [SEA, LAND]],
        [[LAND, SEA], [LAND, LAND]],
        [[SEA, LAND], [LAND, LAND]],
        [[LAND, LAND], [LAND, LAND]],
        [[SEA, SEA], [SEA, LAND]],
    ]
    # Double the pool for 24 tiles, slight variations with resources
    resources = [RESOURCE_FOREST, RESOURCE_STONE, RESOURCE_CLAY]
    for i, pat in enumerate(patterns):
        tile = copy.deepcopy(pat)
        tiles.append(tile)
        # Second copy with a resource on one land cell
        tile2 = copy.deepcopy(pat)
        for r in range(2):
            for c in range(2):
                if tile2[r][c] == LAND:
                    tile2[r][c] = resources[i % 3]
                    break
            else:
                continue
            break
        tiles.append(tile2)
    return tiles


def _generate_goal_cards():
    """Generate secret temple goal cards.

    Each goal card specifies relative directions from a port to find a temple.
    Format: (name, directions_list, point_value)
    Directions: 'N', 'S', 'E', 'W' - each step is one tile (2 cells)
    """
    goals = [
        ("Temple of Apollo", ["N", "N"], 3),
        ("Temple of Athena", ["E", "N"], 4),
        ("Temple of Zeus", ["N", "E"], 4),
        ("Temple of Poseidon", ["W", "N"], 5),
        ("Temple of Artemis", ["N", "W"], 5),
        ("Temple of Hermes", ["E", "E"], 3),
        ("Temple of Ares", ["S", "E"], 4),
        ("Temple of Hera", ["N", "N", "E"], 6),
        ("Temple of Demeter", ["E", "N", "N"], 6),
        ("Temple of Hephaestus", ["W", "W"], 3),
        ("Temple of Dionysus", ["S", "S"], 3),
        ("Temple of Aphrodite", ["N", "E", "E"], 6),
    ]
    return goals


DIRECTION_DELTAS = {
    'N': (-1, 0),
    'S': (1, 0),
    'E': (0, 1),
    'W': (0, -1),
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
        """Initialize the game board and state."""
        # Map is a dict keyed by "r,c" -> terrain char
        # The map starts as 6x6 with a central island and surrounding sea
        self.map_height = 12
        self.map_width = 16
        self.terrain = {}

        # Initialize sea
        for r in range(self.map_height):
            for c in range(self.map_width):
                self.terrain[f"{r},{c}"] = SEA

        # Central starting island with port
        mid_r, mid_c = self.map_height // 2, self.map_width // 2
        for dr in range(-1, 2):
            for dc in range(-1, 2):
                self.terrain[f"{mid_r + dr},{mid_c + dc}"] = LAND
        self.terrain[f"{mid_r},{mid_c}"] = PORT
        self.terrain[f"{mid_r - 1},{mid_c + 1}"] = RESOURCE_FOREST
        self.terrain[f"{mid_r + 1},{mid_c - 1}"] = RESOURCE_STONE

        # Tile pool
        all_tiles = _make_tile_pool()
        random.shuffle(all_tiles)
        if self.variation == 'quick':
            self.tile_pool = all_tiles[:16]
        else:
            self.tile_pool = all_tiles[:24]

        # Market: 3 face-up tiles
        self.market = []
        for _ in range(min(3, len(self.tile_pool))):
            self.market.append(self.tile_pool.pop())

        # Goal cards
        all_goals = _generate_goal_cards()
        random.shuffle(all_goals)

        # Player state
        self.player_data = {}
        for p in [1, 2]:
            self.player_data[str(p)] = {
                'resources': {RESOURCE_FOREST: 0, RESOURCE_STONE: 0, RESOURCE_CLAY: 0},
                'goals': [],
                'discovered_temples': [],
                'score': 0,
                'boat_pos': [mid_r, mid_c],  # Start at port
                'actions_remaining': 2,
            }
            # Deal 3 goal cards each
            for _ in range(3):
                if all_goals:
                    g = all_goals.pop()
                    self.player_data[str(p)]['goals'].append(list(g))

        self.remaining_goals = [list(g) for g in all_goals]
        self.phase = 'action'  # 'action' or 'tile'
        self.message = "Game started! Each turn: do 2 actions, then place a tile."

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        pd = self.player_data[str(p)]
        color = BLUE if p == 1 else RED

        print(f"{BOLD}{'=' * 60}")
        print(f"  AKROTIRI - {self.players[p - 1]}'s Turn (Turn {self.turn_number + 1})")
        print(f"{'=' * 60}{RESET}")

        # Draw map
        print(f"\n  {'  ' + ''.join(f'{c:2d}' for c in range(self.map_width))}")
        for r in range(self.map_height):
            row_str = f"  {r:2d} "
            for c in range(self.map_width):
                key = f"{r},{c}"
                terr = self.terrain.get(key, SEA)
                # Check if any boat is here
                boat_here = None
                for bp in [1, 2]:
                    bpos = self.player_data[str(bp)]['boat_pos']
                    if bpos[0] == r and bpos[1] == c:
                        boat_here = bp
                if boat_here:
                    bc = BLUE if boat_here == 1 else RED
                    row_str += f"{bc}\u2588{RESET} "
                else:
                    tc = TERRAIN_COLORS.get(terr, WHITE)
                    ch = terr
                    row_str += f"{tc}{ch}{RESET} "
            print(row_str)

        # Legend
        print(f"\n  {CYAN}~{RESET}=Sea  {GREEN}#{RESET}=Land  {YELLOW}P{RESET}=Port  "
              f"{GREEN}F{RESET}=Wood  {DIM}S{RESET}=Stone  {RED}C{RESET}=Clay  "
              f"{BLUE}\u2588{RESET}=P1boat  {RED}\u2588{RESET}=P2boat")

        # Player info
        print(f"\n  {color}{self.players[p - 1]}{RESET}")
        res = pd['resources']
        print(f"  Resources: Wood={res[RESOURCE_FOREST]}  Stone={res[RESOURCE_STONE]}  Clay={res[RESOURCE_CLAY]}")
        print(f"  Score: {pd['score']}  |  Temples found: {len(pd['discovered_temples'])}")
        print(f"  Boat at: ({pd['boat_pos'][0]}, {pd['boat_pos'][1]})")

        # Goals (secret - only show to current player)
        if pd['goals']:
            print(f"  Secret Goals:")
            for i, g in enumerate(pd['goals']):
                dirs = '->'.join(g[1])
                print(f"    [{i + 1}] {g[0]} (go {dirs} from a port) = {g[2]} pts")
                cost = self._temple_cost(g[2])
                print(f"        Cost: {cost}")

        # Market
        print(f"\n  Tile Market:")
        for i, tile in enumerate(self.market):
            t_str = f"[{i + 1}] {tile[0][0]}{tile[0][1]} / {tile[1][0]}{tile[1][1]}"
            print(f"    {t_str}")

        print(f"\n  Actions remaining: {pd['actions_remaining']}")
        if self.message:
            print(f"\n  {YELLOW}>> {self.message}{RESET}")

    def _temple_cost(self, points):
        """Calculate resource cost to discover a temple based on point value."""
        if points <= 3:
            return "1 of any resource"
        elif points <= 5:
            return "1 of each of 2 different resources"
        else:
            return "1 of each resource (Wood+Stone+Clay)"

    def _can_afford_temple(self, player, points):
        """Check if player can afford to discover a temple."""
        res = self.player_data[str(player)]['resources']
        total = sum(res.values())
        distinct = sum(1 for v in res.values() if v > 0)
        if points <= 3:
            return total >= 1
        elif points <= 5:
            return distinct >= 2
        else:
            return distinct >= 3

    def _pay_temple_cost(self, player, points):
        """Deduct resources for temple discovery."""
        res = self.player_data[str(player)]['resources']
        if points <= 3:
            for rtype in [RESOURCE_FOREST, RESOURCE_STONE, RESOURCE_CLAY]:
                if res[rtype] > 0:
                    res[rtype] -= 1
                    return True
        elif points <= 5:
            paid = 0
            for rtype in [RESOURCE_FOREST, RESOURCE_STONE, RESOURCE_CLAY]:
                if res[rtype] > 0 and paid < 2:
                    res[rtype] -= 1
                    paid += 1
            return paid == 2
        else:
            if all(res[rt] > 0 for rt in [RESOURCE_FOREST, RESOURCE_STONE, RESOURCE_CLAY]):
                for rt in [RESOURCE_FOREST, RESOURCE_STONE, RESOURCE_CLAY]:
                    res[rt] -= 1
                return True
        return False

    def get_move(self):
        """Get a move from the current player."""
        pd = self.player_data[str(self.current_player)]

        if pd['actions_remaining'] > 0:
            print(f"\n  Actions: [m]ove boat, [g]ather resource, [d]iscover temple, [p]ass")
            choice = input_with_quit("  Your action: ").strip().lower()
            if choice == 'm':
                dest = input_with_quit("  Move boat to (row,col): ").strip()
                return ('move_boat', dest)
            elif choice == 'g':
                return ('gather', '')
            elif choice == 'd':
                idx = input_with_quit("  Which goal card? (1-3): ").strip()
                return ('discover', idx)
            elif choice == 'p':
                return ('pass_action', '')
            else:
                return ('invalid', '')
        else:
            # Must place a tile
            print(f"\n  Place a tile from market.")
            idx = input_with_quit("  Tile number (1-3): ").strip()
            pos = input_with_quit("  Place at (row,col) for top-left corner: ").strip()
            rot = input_with_quit("  Rotate? (0/90/180/270): ").strip()
            return ('place_tile', idx, pos, rot)

    def make_move(self, move):
        """Apply a move to the game state."""
        pd = self.player_data[str(self.current_player)]

        if move[0] == 'invalid':
            self.message = "Invalid command."
            return False

        if move[0] == 'pass_action':
            pd['actions_remaining'] -= 1
            self.message = "Passed an action."
            if pd['actions_remaining'] > 0:
                # Don't switch player yet
                return True
            return True

        if move[0] == 'move_boat':
            try:
                parts = move[1].replace(' ', '').split(',')
                tr, tc = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                self.message = "Invalid coordinates. Use row,col format."
                return False
            br, bc = pd['boat_pos']
            dist = abs(tr - br) + abs(tc - bc)
            if dist > 3:
                self.message = "Too far! Boat can move up to 3 cells."
                return False
            if not (0 <= tr < self.map_height and 0 <= tc < self.map_width):
                self.message = "Out of bounds!"
                return False
            # Boat must travel through sea or ports
            terr = self.terrain.get(f"{tr},{tc}", SEA)
            if terr not in [SEA, PORT]:
                self.message = "Boat can only move on sea or port cells."
                return False
            pd['boat_pos'] = [tr, tc]
            pd['actions_remaining'] -= 1
            self.message = f"Boat moved to ({tr},{tc})."
            if pd['actions_remaining'] > 0:
                return True
            return True

        if move[0] == 'gather':
            br, bc = pd['boat_pos']
            gathered = False
            for dr in range(-1, 2):
                for dc in range(-1, 2):
                    key = f"{br + dr},{bc + dc}"
                    terr = self.terrain.get(key, SEA)
                    if terr in RESOURCE_NAMES:
                        pd['resources'][terr] += 1
                        gathered = True
                        self.message = f"Gathered {RESOURCE_NAMES[terr]}!"
                        pd['actions_remaining'] -= 1
                        if pd['actions_remaining'] > 0:
                            return True
                        return True
            if not gathered:
                self.message = "No resources adjacent to boat!"
                return False

        if move[0] == 'discover':
            try:
                idx = int(move[1]) - 1
            except (ValueError, IndexError):
                self.message = "Invalid goal index."
                return False
            if idx < 0 or idx >= len(pd['goals']):
                self.message = "Invalid goal index."
                return False
            goal = pd['goals'][idx]
            gname, dirs, pts = goal[0], goal[1], goal[2]

            # Check if player can afford it
            if not self._can_afford_temple(self.current_player, pts):
                self.message = "Not enough resources!"
                return False

            # Check if boat is at a valid temple location
            # Temple location: from any port, follow the directions
            valid = False
            for r in range(self.map_height):
                for c in range(self.map_width):
                    if self.terrain.get(f"{r},{c}") == PORT:
                        # Follow directions from this port
                        cr, cc = r, c
                        reachable = True
                        for d in dirs:
                            dr, dc = DIRECTION_DELTAS[d]
                            cr += dr * 2
                            cc += dc * 2
                            if not (0 <= cr < self.map_height and 0 <= cc < self.map_width):
                                reachable = False
                                break
                        if reachable:
                            terr = self.terrain.get(f"{cr},{cc}", SEA)
                            if terr in [LAND, RESOURCE_FOREST, RESOURCE_STONE, RESOURCE_CLAY]:
                                # Boat must be adjacent (within 1 cell)
                                br, bc = pd['boat_pos']
                                if abs(br - cr) <= 1 and abs(bc - cc) <= 1:
                                    valid = True
                                    # Mark temple on map
                                    self.terrain[f"{cr},{cc}"] = TEMPLE_SITE
                                    break
                if valid:
                    break

            if not valid:
                self.message = "No valid temple site near boat matching this goal!"
                return False

            self._pay_temple_cost(self.current_player, pts)
            pd['score'] += pts
            pd['discovered_temples'].append(gname)
            pd['goals'].pop(idx)
            # Draw a new goal if available
            if self.remaining_goals:
                pd['goals'].append(self.remaining_goals.pop())
            pd['actions_remaining'] -= 1
            self.message = f"Discovered {gname} for {pts} points!"
            if pd['actions_remaining'] > 0:
                return True
            return True

        if move[0] == 'place_tile':
            try:
                tidx = int(move[1]) - 1
                parts = move[2].replace(' ', '').split(',')
                pr, pc = int(parts[0]), int(parts[1])
                rot = int(move[3]) if move[3] else 0
            except (ValueError, IndexError):
                self.message = "Invalid tile placement input."
                return False

            if tidx < 0 or tidx >= len(self.market):
                self.message = "Invalid tile index."
                return False

            tile = copy.deepcopy(self.market[tidx])

            # Apply rotation
            for _ in range((rot // 90) % 4):
                tile = [[tile[1][0], tile[0][0]], [tile[1][1], tile[0][1]]]

            # Check placement validity: must be adjacent to existing non-sea tile
            # and placed on sea cells
            adjacent_to_land = False
            for dr in range(2):
                for dc in range(2):
                    r, c = pr + dr, pc + dc
                    if not (0 <= r < self.map_height and 0 <= c < self.map_width):
                        self.message = "Tile goes out of bounds!"
                        return False
                    current = self.terrain.get(f"{r},{c}", SEA)
                    if current != SEA:
                        self.message = "Can only place tiles on empty sea cells!"
                        return False
                    # Check adjacency to non-sea
                    for ar, ac in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        adj_key = f"{r + ar},{c + ac}"
                        adj_terr = self.terrain.get(adj_key, SEA)
                        if adj_terr != SEA:
                            adjacent_to_land = True

            if not adjacent_to_land:
                self.message = "Tile must be placed adjacent to existing land!"
                return False

            # Place the tile
            for dr in range(2):
                for dc in range(2):
                    self.terrain[f"{pr + dr},{pc + dc}"] = tile[dr][dc]

            self.market.pop(tidx)
            if self.tile_pool:
                self.market.append(self.tile_pool.pop())

            # Reset actions for next player
            other = 1 if self.current_player == 2 else 2
            self.player_data[str(other)]['actions_remaining'] = 2
            self.message = f"Tile placed at ({pr},{pc})."
            return True

        self.message = "Unknown action."
        return False

    def check_game_over(self):
        """Check if the game is over."""
        # Game ends when tile pool and market are exhausted
        if not self.tile_pool and not self.market:
            self.game_over = True
            s1 = self.player_data['1']['score']
            s2 = self.player_data['2']['score']
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
            self.message = f"Game over! P1={s1} P2={s2}"
            return

        # Also check if all goals discovered
        for p in [1, 2]:
            if self.player_data[str(p)]['score'] >= 20:
                self.game_over = True
                self.winner = p
                return

    def get_state(self):
        """Return serializable game state."""
        return {
            'terrain': self.terrain,
            'tile_pool': self.tile_pool,
            'market': self.market,
            'player_data': self.player_data,
            'remaining_goals': self.remaining_goals,
            'phase': self.phase,
            'message': self.message,
            'map_height': self.map_height,
            'map_width': self.map_width,
        }

    def load_state(self, state):
        """Restore game state."""
        self.terrain = state['terrain']
        self.tile_pool = state['tile_pool']
        self.market = state['market']
        self.player_data = state['player_data']
        self.remaining_goals = state['remaining_goals']
        self.phase = state['phase']
        self.message = state['message']
        self.map_height = state['map_height']
        self.map_width = state['map_width']

    def get_tutorial(self):
        return f"""{BOLD}=== AKROTIRI TUTORIAL ==={RESET}

Akrotiri is a tile-laying game set in the ancient Mediterranean.

{BOLD}OBJECTIVE:{RESET}
  Score points by discovering hidden temples using secret goal cards.

{BOLD}EACH TURN:{RESET}
  1. Perform 2 actions (move boat, gather resources, or discover a temple)
  2. Place a tile from the market onto the map

{BOLD}ACTIONS:{RESET}
  [m]ove boat  - Move your boat up to 3 sea/port cells (Manhattan distance)
  [g]ather     - Collect a resource adjacent to your boat (F=Wood, S=Stone, C=Clay)
  [d]iscover   - Discover a temple if your boat is near a valid temple site
  [p]ass       - Skip an action

{BOLD}DISCOVERING TEMPLES:{RESET}
  Each goal card shows directions from a port (e.g., N->E means go North then East).
  Each direction step = 2 cells on the map.
  Your boat must be adjacent to the resulting land cell.
  You must pay resources based on the temple's point value:
    3 pts = 1 resource  |  4-5 pts = 2 different  |  6 pts = all 3

{BOLD}PLACING TILES:{RESET}
  Choose a tile from the market (1-3) and place its 2x2 grid on sea cells
  adjacent to existing land. You may rotate (0/90/180/270 degrees).

{BOLD}GAME END:{RESET}
  When all tiles are placed or a player reaches 20 points.
  Highest score wins!

{BOLD}CONTROLS:{RESET}
  Type 'q' to quit, 's' to save, 'h' for help, 't' for tutorial.
"""
