"""Cartographers - A map-drawing territory game."""

import random
import copy

from engine.base import BaseGame, input_with_quit, clear_screen


# Terrain types
EMPTY = '.'
MOUNTAIN = 'X'
FOREST = 'F'
VILLAGE = 'V'
WATER = 'W'
FARM = 'A'
MONSTER = 'M'

TERRAIN_NAMES = {
    FOREST: 'Forest',
    VILLAGE: 'Village',
    WATER: 'Water',
    FARM: 'Farm',
    MONSTER: 'Monster',
}

TERRAIN_DISPLAY = {
    EMPTY: '.',
    MOUNTAIN: 'X',
    FOREST: 'F',
    VILLAGE: 'V',
    WATER: 'W',
    FARM: 'A',
    MONSTER: 'M',
}

# Exploration cards: (name, terrain_type, time_cost, shape_cells)
# shape_cells are list of (row_offset, col_offset) from top-left of bounding box
EXPLORATION_CARDS = [
    # Forests
    ("Sentinel Wood", FOREST, 1, [(0, 0), (1, 0)]),
    ("Treetop Village", FOREST, 2, [(0, 0), (0, 1), (1, 0), (1, 1)]),
    ("Great Forest", FOREST, 2, [(0, 0), (0, 1), (0, 2), (1, 1)]),
    ("Overgrown Ruins", FOREST, 1, [(0, 0)]),
    # Villages
    ("Farmstead", VILLAGE, 1, [(0, 0), (1, 0)]),
    ("Village Square", VILLAGE, 2, [(0, 0), (0, 1), (1, 0), (1, 1)]),
    ("Hamlet", VILLAGE, 2, [(0, 0), (1, 0), (1, 1), (2, 1)]),
    ("Outpost", VILLAGE, 1, [(0, 0)]),
    # Water
    ("Fishing Lake", WATER, 1, [(0, 0), (0, 1)]),
    ("River Bend", WATER, 2, [(0, 0), (1, 0), (1, 1), (2, 1)]),
    ("Marshlands", WATER, 2, [(0, 0), (0, 1), (0, 2), (1, 0)]),
    ("Wellspring", WATER, 1, [(0, 0)]),
    # Farms
    ("Homestead", FARM, 1, [(0, 0), (0, 1)]),
    ("Orchard", FARM, 2, [(0, 0), (0, 1), (1, 0), (1, 1)]),
    ("Wheat Fields", FARM, 2, [(0, 0), (0, 1), (0, 2)]),
    ("Pasture", FARM, 1, [(0, 0)]),
    # Mixed terrain cards (player chooses terrain)
    ("Borderlands", None, 2, [(0, 0), (0, 1), (1, 0), (2, 0)]),
    ("Lost Barony", None, 2, [(0, 0), (1, 0), (1, 1), (2, 0)]),
    ("Crossroads", None, 1, [(0, 0), (0, 1), (1, 0)]),
]

# Monster ambush cards
MONSTER_CARDS = [
    ("Goblin Attack", [(0, 0), (0, 1), (1, 0)]),
    ("Bugbear Assault", [(0, 0), (1, 0), (1, 1)]),
    ("Gnoll Raid", [(0, 0), (0, 1), (1, 1)]),
    ("Kobold Onslaught", [(0, 0), (1, 0), (2, 0)]),
]

# Scoring objectives
SCORING_OBJECTIVES = {
    'A': [
        ("Sentinel Forest", "Score 1 per Forest cell adjacent to the edge of the map."),
        ("Greenbough", "Score 1 per row and column with at least 1 Forest cell."),
    ],
    'B': [
        ("Wildholds", "Score 8 per cluster of 6+ Village cells."),
        ("Great City", "Score 1 per Village cell in the largest Village cluster not adjacent to a Mountain."),
    ],
    'C': [
        ("Canal Lake", "Score 1 per Water cell adjacent to at least 1 Farm cell. Score 1 per Farm cell adjacent to at least 1 Water cell."),
        ("Golden Granary", "Score 1 per Water cell adjacent to a Mountain. Score 3 per Farm cell adjacent to a Mountain."),
    ],
    'D': [
        ("Borderlands Row", "Score 6 per complete row of the map."),
        ("The Cauldrons", "Score 1 per empty cell surrounded on all 4 sides by filled cells or map edges."),
    ],
}

# Seasons: (name, time_limit, scoring_pair)
SEASONS = [
    ("Spring", 8, ('A', 'B')),
    ("Summer", 8, ('B', 'C')),
    ("Autumn", 7, ('C', 'D')),
    ("Winter", 6, ('D', 'A')),
]


def rotate_shape(cells, times=1):
    """Rotate shape cells 90 degrees clockwise, times number of rotations."""
    result = list(cells)
    for _ in range(times % 4):
        result = [(c, -r) for r, c in result]
        # Normalize to top-left origin
        min_r = min(r for r, c in result)
        min_c = min(c for r, c in result)
        result = [(r - min_r, c - min_c) for r, c in result]
    return result


def flip_shape(cells):
    """Flip shape cells horizontally."""
    max_c = max(c for r, c in cells)
    result = [(r, max_c - c) for r, c in cells]
    min_r = min(r for r, c in result)
    min_c = min(c for r, c in result)
    result = [(r - min_r, c - min_c) for r, c in result]
    return result


def shape_variants(cells):
    """Get all unique rotations and flips of a shape."""
    variants = []
    seen = set()
    for do_flip in [False, True]:
        base = flip_shape(cells) if do_flip else list(cells)
        for rot in range(4):
            variant = rotate_shape(base, rot)
            variant_sorted = tuple(sorted(variant))
            if variant_sorted not in seen:
                seen.add(variant_sorted)
                variants.append(variant)
    return variants


class CartographersGame(BaseGame):
    """Cartographers: A map-drawing territory game where players fill an 11x11
    grid with terrain shapes and score based on seasonal objectives."""

    name = "Cartographers"
    description = "A map-drawing territory game with seasonal scoring"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full 4-season game (Spring, Summer, Autumn, Winter)",
        "quick": "Quick 2-season game (Spring and Summer only)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.grid_size = 11
        self.grids = [[], []]  # 11x11 grid per player
        self.scores = [0, 0]
        self.season_scores = [[], []]  # per-player per-season scores
        self.season_index = 0
        self.season_time = 0
        self.deck = []
        self.current_card = None
        self.current_card_index = 0
        self.objectives = {}  # letter -> (name, description)
        self.mountains = []  # list of (row, col) for pre-placed mountains
        self.phase = "explore"  # "explore" or "monster"
        self.monster_target = 0  # which player gets the monster placed on them
        self.seasons_to_play = 4

    def setup(self):
        """Initialize grids, objectives, and deck."""
        if self.variation == "quick":
            self.seasons_to_play = 2
        else:
            self.seasons_to_play = 4

        # Initialize grids
        for p in range(2):
            self.grids[p] = [[EMPTY] * self.grid_size for _ in range(self.grid_size)]

        # Place mountains (fixed positions for both players)
        self.mountains = [(1, 3), (2, 8), (5, 5), (8, 2), (9, 7)]
        for p in range(2):
            for r, c in self.mountains:
                self.grids[p][r][c] = MOUNTAIN

        # Select one scoring objective per letter
        self.objectives = {}
        for letter in ['A', 'B', 'C', 'D']:
            obj = random.choice(SCORING_OBJECTIVES[letter])
            self.objectives[letter] = obj

        # Build and shuffle deck
        self._build_deck()

        self.season_index = 0
        self.season_time = 0
        self.scores = [0, 0]
        self.season_scores = [[], []]
        self.phase = "explore"
        self.current_player = 1
        self._draw_card()

    def _build_deck(self):
        """Build and shuffle the exploration deck."""
        self.deck = list(range(len(EXPLORATION_CARDS)))
        random.shuffle(self.deck)
        self.current_card_index = 0

    def _draw_card(self):
        """Draw the next exploration card."""
        if self.current_card_index >= len(self.deck):
            self._build_deck()

        card_idx = self.deck[self.current_card_index]
        self.current_card_index += 1

        # Small chance of monster ambush (roughly 1 in 6 draws)
        if random.random() < 0.15:
            monster = random.choice(MONSTER_CARDS)
            self.current_card = {
                'type': 'monster',
                'name': monster[0],
                'shape': monster[1],
                'time': 0,
            }
            self.phase = "monster"
            # Monster is placed on the opponent's map
            self.monster_target = 2 if self.current_player == 1 else 1
        else:
            card = EXPLORATION_CARDS[card_idx]
            self.current_card = {
                'type': 'explore',
                'name': card[0],
                'terrain': card[1],
                'time': card[2],
                'shape': card[3],
            }
            self.phase = "explore"

    def _get_season(self):
        """Get current season info."""
        if self.season_index < len(SEASONS):
            return SEASONS[self.season_index]
        return None

    def display(self):
        """Display current game state."""
        clear_screen()
        season = self._get_season()
        season_name = season[0] if season else "Game Over"
        season_limit = season[1] if season else 0
        scoring_pair = season[2] if season else ('A', 'A')

        var_label = "Standard" if self.variation != "quick" else "Quick"
        print(f"\n  === Cartographers ({var_label}) ===")
        print(f"  Season: {season_name} | Time: {self.season_time}/{season_limit}")
        print(f"  Scoring this season: {scoring_pair[0]}: {self.objectives[scoring_pair[0]][0]}")
        print(f"                       {scoring_pair[1]}: {self.objectives[scoring_pair[1]][0]}")
        print(f"  Scores: {self.players[0]}={self.scores[0]}  {self.players[1]}={self.scores[1]}")

        # Show current card
        if self.current_card:
            card = self.current_card
            if card['type'] == 'monster':
                print(f"\n  ** MONSTER AMBUSH: {card['name']} **")
                print(f"  {self.players[self.monster_target - 1]} must place monsters on their map!")
            else:
                terrain_name = TERRAIN_NAMES.get(card['terrain'], "Choice") if card['terrain'] else "Choice (F/V/W/A)"
                print(f"\n  Card: {card['name']} | Terrain: {terrain_name} | Time: {card['time']}")

            # Display shape
            self._display_shape(card['shape'])

        # Display current player's grid
        p = self.current_player - 1
        if self.phase == "monster":
            p = self.monster_target - 1
        print(f"\n  --- {self.players[p]}'s Map ---")
        self._display_grid(p)

    def _display_shape(self, cells):
        """Display a shape as ASCII."""
        if not cells:
            return
        max_r = max(r for r, c in cells)
        max_c = max(c for r, c in cells)
        print("  Shape:")
        for r in range(max_r + 1):
            row_str = "    "
            for c in range(max_c + 1):
                if (r, c) in cells:
                    row_str += "#"
                else:
                    row_str += " "
            print(row_str)

    def _display_grid(self, player_idx):
        """Display a player's 11x11 grid with coordinates."""
        grid = self.grids[player_idx]
        # Column headers
        header = "     "
        for c in range(self.grid_size):
            header += f"{c:2d}"
        print(header)
        print("    +" + "--" * self.grid_size + "-+")

        for r in range(self.grid_size):
            row_str = f" {r:2d} |"
            for c in range(self.grid_size):
                cell = grid[r][c]
                row_str += f" {TERRAIN_DISPLAY.get(cell, cell)}"
            row_str += " |"
            print(row_str)

        print("    +" + "--" * self.grid_size + "-+")

    def get_move(self):
        """Get move from current player."""
        card = self.current_card
        if not card:
            return None

        if card['type'] == 'monster':
            print(f"\n  {self.players[self.monster_target - 1]}, place the monster shape on your map.")
        else:
            print(f"\n  {self.players[self.current_player - 1]}, place the shape on your map.")

        if card['terrain'] is None and card['type'] != 'monster':
            print("  Choose terrain: F=Forest, V=Village, W=Water, A=Farm")

        print("  Enter: row col [rotation 0-3] [f to flip] [terrain if choice]")
        print("  Example: 3 4 1 f   or   3 4   or   3 4 0 V")

        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if not self.current_card:
            return False

        card = self.current_card
        shape = list(card['shape'])
        parts = move.upper().split()

        if len(parts) < 2:
            return False

        try:
            row = int(parts[0])
            col = int(parts[1])
        except ValueError:
            return False

        rotation = 0
        do_flip = False
        chosen_terrain = None

        # Parse optional arguments
        for part in parts[2:]:
            if part == 'F':
                do_flip = True
            elif part in ('0', '1', '2', '3'):
                rotation = int(part)
            elif part in (FOREST, VILLAGE, WATER, FARM):
                chosen_terrain = part

        # Determine terrain
        if card['type'] == 'monster':
            terrain = MONSTER
        elif card['terrain'] is not None:
            terrain = card['terrain']
        elif chosen_terrain is not None:
            terrain = chosen_terrain
        else:
            print("  You must specify a terrain type for this card (F/V/W/A).")
            return False

        # Apply transformations
        if do_flip:
            shape = flip_shape(shape)
        shape = rotate_shape(shape, rotation)

        # Calculate absolute positions
        positions = [(row + dr, col + dc) for dr, dc in shape]

        # Determine target grid
        if card['type'] == 'monster':
            target_p = self.monster_target - 1
        else:
            target_p = self.current_player - 1

        # Validate placement
        grid = self.grids[target_p]
        for r, c in positions:
            if r < 0 or r >= self.grid_size or c < 0 or c >= self.grid_size:
                print("  Shape goes out of bounds!")
                return False
            if grid[r][c] != EMPTY:
                print(f"  Cell ({r},{c}) is already occupied by '{grid[r][c]}'!")
                return False

        # Place the shape
        for r, c in positions:
            grid[r][c] = terrain

        # Advance time and handle season progression
        if card['type'] != 'monster':
            self.season_time += card['time']

        # Check if season is over
        season = self._get_season()
        if season and self.season_time >= season[1]:
            self._end_season()
        else:
            # Draw next card
            self._draw_card()

        return True

    def _end_season(self):
        """Score the current season and advance to the next."""
        season = self._get_season()
        if not season:
            return

        scoring_pair = season[2]

        for p in range(2):
            season_total = 0
            for letter in scoring_pair:
                score = self._score_objective(p, letter)
                season_total += score
            # Monster penalty: -1 per empty cell adjacent to a monster
            monster_penalty = self._score_monster_penalty(p)
            season_total += monster_penalty  # penalty is negative
            self.season_scores[p].append(season_total)
            self.scores[p] += season_total

        # Advance season
        self.season_index += 1

        # Check if game continues
        if self.season_index < self.seasons_to_play:
            self.season_time = 0
            self._build_deck()
            self._draw_card()
        else:
            self.current_card = None

    def _score_objective(self, player_idx, letter):
        """Score a specific objective for a player."""
        obj_name, obj_desc = self.objectives[letter]
        grid = self.grids[player_idx]

        if letter == 'A':
            return self._score_a_objective(grid, obj_name)
        elif letter == 'B':
            return self._score_b_objective(grid, obj_name)
        elif letter == 'C':
            return self._score_c_objective(grid, obj_name)
        elif letter == 'D':
            return self._score_d_objective(grid, obj_name)
        return 0

    def _score_a_objective(self, grid, obj_name):
        """Score A-type objectives (Forest-related)."""
        if obj_name == "Sentinel Forest":
            # 1 per Forest cell adjacent to the edge
            score = 0
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if grid[r][c] == FOREST:
                        if r == 0 or r == self.grid_size - 1 or c == 0 or c == self.grid_size - 1:
                            score += 1
            return score
        elif obj_name == "Greenbough":
            # 1 per row and column with at least 1 Forest
            score = 0
            for r in range(self.grid_size):
                if any(grid[r][c] == FOREST for c in range(self.grid_size)):
                    score += 1
            for c in range(self.grid_size):
                if any(grid[r][c] == FOREST for r in range(self.grid_size)):
                    score += 1
            return score
        return 0

    def _score_b_objective(self, grid, obj_name):
        """Score B-type objectives (Village-related)."""
        clusters = self._find_clusters(grid, VILLAGE)
        if obj_name == "Wildholds":
            # 8 per cluster of 6+ villages
            return sum(8 for cluster in clusters if len(cluster) >= 6)
        elif obj_name == "Great City":
            # Largest village cluster not adjacent to mountain
            best = 0
            for cluster in clusters:
                adjacent_to_mountain = False
                for r, c in cluster:
                    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                            if grid[nr][nc] == MOUNTAIN:
                                adjacent_to_mountain = True
                                break
                    if adjacent_to_mountain:
                        break
                if not adjacent_to_mountain:
                    best = max(best, len(cluster))
            return best
        return 0

    def _score_c_objective(self, grid, obj_name):
        """Score C-type objectives (Water/Farm related)."""
        if obj_name == "Canal Lake":
            # 1 per Water adj to Farm + 1 per Farm adj to Water
            score = 0
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if grid[r][c] == WATER:
                        if self._has_adjacent(grid, r, c, FARM):
                            score += 1
                    elif grid[r][c] == FARM:
                        if self._has_adjacent(grid, r, c, WATER):
                            score += 1
            return score
        elif obj_name == "Golden Granary":
            # 1 per Water adj to Mountain + 3 per Farm adj to Mountain
            score = 0
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if grid[r][c] == WATER:
                        if self._has_adjacent(grid, r, c, MOUNTAIN):
                            score += 1
                    elif grid[r][c] == FARM:
                        if self._has_adjacent(grid, r, c, MOUNTAIN):
                            score += 3
            return score
        return 0

    def _score_d_objective(self, grid, obj_name):
        """Score D-type objectives (map completion related)."""
        if obj_name == "Borderlands Row":
            # 6 per complete row
            score = 0
            for r in range(self.grid_size):
                if all(grid[r][c] != EMPTY for c in range(self.grid_size)):
                    score += 6
            return score
        elif obj_name == "The Cauldrons":
            # 1 per empty cell surrounded on all 4 sides by filled cells or edges
            score = 0
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if grid[r][c] == EMPTY:
                        surrounded = True
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                                if grid[nr][nc] == EMPTY:
                                    surrounded = False
                                    break
                        if surrounded:
                            score += 1
            return score
        return 0

    def _score_monster_penalty(self, player_idx):
        """Calculate monster penalty: -1 per empty cell adjacent to a monster."""
        grid = self.grids[player_idx]
        penalty = 0
        for r in range(self.grid_size):
            for c in range(self.grid_size):
                if grid[r][c] == MONSTER:
                    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                            if grid[nr][nc] == EMPTY:
                                penalty -= 1
        return penalty

    def _find_clusters(self, grid, terrain):
        """Find all connected clusters of a given terrain type."""
        visited = set()
        clusters = []
        for r in range(self.grid_size):
            for c in range(self.grid_size):
                if grid[r][c] == terrain and (r, c) not in visited:
                    cluster = []
                    stack = [(r, c)]
                    while stack:
                        cr, cc = stack.pop()
                        if (cr, cc) in visited:
                            continue
                        visited.add((cr, cc))
                        cluster.append((cr, cc))
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = cr + dr, cc + dc
                            if (0 <= nr < self.grid_size and 0 <= nc < self.grid_size
                                    and grid[nr][nc] == terrain and (nr, nc) not in visited):
                                stack.append((nr, nc))
                    clusters.append(cluster)
        return clusters

    def _has_adjacent(self, grid, r, c, terrain):
        """Check if cell (r,c) has an adjacent cell of the given terrain."""
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                if grid[nr][nc] == terrain:
                    return True
        return False

    def check_game_over(self):
        """Check if the game is over (all seasons completed)."""
        if self.season_index >= self.seasons_to_play:
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None  # draw

    def get_state(self):
        """Return JSON-serializable game state."""
        return {
            'grids': [
                [row[:] for row in self.grids[0]],
                [row[:] for row in self.grids[1]],
            ],
            'scores': self.scores[:],
            'season_scores': [list(s) for s in self.season_scores],
            'season_index': self.season_index,
            'season_time': self.season_time,
            'deck': self.deck[:],
            'current_card_index': self.current_card_index,
            'current_card': copy.deepcopy(self.current_card) if self.current_card else None,
            'objectives': {k: list(v) for k, v in self.objectives.items()},
            'mountains': [list(m) for m in self.mountains],
            'phase': self.phase,
            'monster_target': self.monster_target,
            'seasons_to_play': self.seasons_to_play,
            'current_player': self.current_player,
            'game_over': self.game_over,
            'winner': self.winner,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.grids = [
            [row[:] for row in state['grids'][0]],
            [row[:] for row in state['grids'][1]],
        ]
        self.scores = state['scores'][:]
        self.season_scores = [list(s) for s in state['season_scores']]
        self.season_index = state['season_index']
        self.season_time = state['season_time']
        self.deck = state['deck'][:]
        self.current_card_index = state['current_card_index']
        self.current_card = copy.deepcopy(state['current_card']) if state['current_card'] else None
        self.objectives = {k: tuple(v) for k, v in state['objectives'].items()}
        self.mountains = [tuple(m) for m in state['mountains']]
        self.phase = state['phase']
        self.monster_target = state['monster_target']
        self.seasons_to_play = state['seasons_to_play']
        self.current_player = state['current_player']
        self.game_over = state['game_over']
        self.winner = state['winner']

    def get_tutorial(self):
        """Return tutorial text for Cartographers."""
        return """
==========================================================
  CARTOGRAPHERS - Tutorial
==========================================================

  OVERVIEW:
  Cartographers is a map-drawing territory game. Each
  player fills an 11x11 grid with terrain shapes drawn
  from exploration cards. Score points by fulfilling
  seasonal scoring objectives.

  TERRAIN TYPES:
    F = Forest    V = Village    W = Water
    A = Farm      M = Monster    X = Mountain (pre-placed)
    . = Empty

  HOW TO PLAY:
  Each turn, an exploration card is revealed showing a
  shape and terrain type. Both players place the shape
  on their own map.

  PLACING SHAPES:
  Enter: row col [rotation] [f] [terrain]
    row col   - Top-left position (0-10)
    rotation  - 0=none, 1=90CW, 2=180, 3=270CW
    f         - Flip the shape horizontally
    terrain   - For choice cards: F, V, W, or A

  Examples:
    3 4         - Place at row 3, col 4, no rotation
    3 4 1       - Place at row 3, col 4, rotate 90 CW
    3 4 2 f     - Place at row 3, col 4, rotate 180, flip
    3 4 0 V     - Place at row 3, col 4, terrain=Village

  SEASONS:
  The game has 4 seasons (2 in quick mode):
    Spring (time limit 8) - Score objectives A & B
    Summer (time limit 8) - Score objectives B & C
    Autumn (time limit 7) - Score objectives C & D
    Winter (time limit 6) - Score objectives D & A

  Each card costs time. When total time reaches the
  season limit, the season ends and scoring occurs.
  Each objective is scored in 2 consecutive seasons.

  MONSTERS:
  Monster ambush cards force the opponent to place
  monster shapes on their map. At season end, each
  empty cell adjacent to a monster scores -1 point.

  SCORING OBJECTIVES:
  A-type: Forest-based scoring
  B-type: Village cluster scoring
  C-type: Water and Farm interaction scoring
  D-type: Map completion scoring

  WINNING:
  The player with the most points at the end of all
  seasons wins!

  CONTROLS:
  Type 'help' or 'h' for in-game help
  Type 'save' or 's' to save and suspend
  Type 'quit' or 'q' to quit
==========================================================
"""
