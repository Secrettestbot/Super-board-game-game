"""Cartographers - Map-drawing territory game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'
RED = '\033[91m'
BLUE = '\033[94m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
MAGENTA = '\033[95m'
DIM = '\033[2m'
BOLD = '\033[1m'
WHITE = '\033[97m'

# Terrain types
EMPTY = '.'
FOREST = 'F'
VILLAGE = 'V'
WATER = 'W'
FARM = 'A'
MONSTER = 'M'
MOUNTAIN = '^'

TERRAIN_COLORS = {
    EMPTY: DIM,
    FOREST: GREEN,
    VILLAGE: RED,
    WATER: CYAN,
    FARM: YELLOW,
    MONSTER: MAGENTA,
    MOUNTAIN: WHITE,
}

TERRAIN_NAMES = {
    FOREST: 'Forest',
    VILLAGE: 'Village',
    WATER: 'Water',
    FARM: 'Farm',
}

# Exploration cards: each has a shape (relative coords) and terrain options
EXPLORATION_CARDS = [
    {'name': 'Great River', 'shapes': [[(0, 0), (1, 0), (2, 0)]], 'terrains': [WATER, FARM]},
    {'name': 'Farmland', 'shapes': [[(0, 0), (0, 1), (1, 0)]], 'terrains': [FARM, VILLAGE]},
    {'name': 'Forgotten Forest', 'shapes': [[(0, 0), (0, 1), (1, 1), (2, 1)]], 'terrains': [FOREST]},
    {'name': 'Hinterland Stream', 'shapes': [[(0, 0), (1, 0), (1, 1)]], 'terrains': [WATER, FOREST]},
    {'name': 'Hamlet', 'shapes': [[(0, 0), (0, 1), (0, 2), (1, 1)]], 'terrains': [VILLAGE]},
    {'name': 'Orchard', 'shapes': [[(0, 0), (1, 0)]], 'terrains': [FOREST, FARM]},
    {'name': 'Fishing Village', 'shapes': [[(0, 0), (0, 1), (1, 0), (1, 1)]], 'terrains': [VILLAGE, WATER]},
    {'name': 'Treetop Village', 'shapes': [[(0, 0), (0, 1), (0, 2), (1, 0), (1, 2)]], 'terrains': [FOREST, VILLAGE]},
    {'name': 'Marshlands', 'shapes': [[(0, 0), (1, 0), (1, 1), (2, 1)]], 'terrains': [WATER]},
    {'name': 'Homestead', 'shapes': [[(0, 0), (1, 0), (2, 0), (2, 1)]], 'terrains': [FARM]},
    {'name': 'Rift Lands', 'shapes': [[(0, 0)]], 'terrains': [FOREST, VILLAGE, WATER, FARM]},
    {'name': 'Borderlands', 'shapes': [[(0, 0), (0, 1), (0, 2)]], 'terrains': [FOREST, FARM, WATER]},
]

# Monster cards
MONSTER_CARDS = [
    {'name': 'Goblin Attack', 'shapes': [[(0, 0), (0, 1), (1, 0)]]},
    {'name': 'Bugbear Assault', 'shapes': [[(0, 0), (1, 0), (1, 1), (2, 1)]]},
]

# Scoring objectives
SCORING_OBJECTIVES = [
    {
        'name': 'Sentinel Wood',
        'description': '1 pt per Forest on map edge',
        'id': 'sentinel_wood',
    },
    {
        'name': 'Greenbough',
        'description': '1 pt per row/column containing at least one Forest',
        'id': 'greenbough',
    },
    {
        'name': 'Stoneside Forest',
        'description': '3 pts per Mountain fully surrounded by Forest',
        'id': 'stoneside_forest',
    },
    {
        'name': 'Canal Lake',
        'description': '1 pt per Water adjacent to at least one Farm',
        'id': 'canal_lake',
    },
    {
        'name': 'Mages Valley',
        'description': '2 pts per Water adj to Mountain, 1 pt per Farm adj to Mountain',
        'id': 'mages_valley',
    },
    {
        'name': 'Golden Granary',
        'description': '3 pts per Farm adjacent to Water',
        'id': 'golden_granary',
    },
    {
        'name': 'Wildholds',
        'description': '8 pts per cluster of 6+ connected Villages',
        'id': 'wildholds',
    },
    {
        'name': 'Great City',
        'description': '1 pt per Village NOT adjacent to a Mountain',
        'id': 'great_city',
    },
    {
        'name': 'Shieldgate',
        'description': '2 pts per Village on the second row/column from edge',
        'id': 'shieldgate',
    },
    {
        'name': 'Borderlands Obj',
        'description': '6 pts per completely filled row or column',
        'id': 'borderlands_obj',
    },
    {
        'name': 'The Broken Road',
        'description': '3 pts per diagonal run of 3+ filled cells from left edge',
        'id': 'broken_road',
    },
    {
        'name': 'Lost Barony',
        'description': '3 pts per cell in the largest filled square',
        'id': 'lost_barony',
    },
]

SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter']
SEASON_TIME_LIMITS = [8, 8, 7, 6]


def _rotate_shape(shape):
    """Rotate shape 90 degrees clockwise."""
    return [(c, -r) for r, c in shape]


def _flip_shape(shape):
    """Flip shape horizontally."""
    return [(r, -c) for r, c in shape]


def _normalize_shape(shape):
    """Normalize so min r,c = 0,0."""
    min_r = min(r for r, c in shape)
    min_c = min(c for r, c in shape)
    return sorted((r - min_r, c - min_c) for r, c in shape)


class CartographersGame(BaseGame):
    name = "Cartographers"
    description = "Map-drawing territory game with seasonal scoring"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game: 4 seasons',
        'quick': 'Quick game: 2 seasons (Spring and Summer only)',
    }

    def setup(self):
        """Initialize the game."""
        self.grid_size = 11
        if self.variation == 'quick':
            self.num_seasons = 2
        else:
            self.num_seasons = 4

        # Each player has their own map
        self.maps = {}
        for p in [1, 2]:
            grid = []
            for r in range(self.grid_size):
                row = []
                for c in range(self.grid_size):
                    row.append(EMPTY)
                grid.append(row)
            self.maps[str(p)] = grid

        # Place mountains on both maps (same positions)
        mountain_positions = [(1, 3), (2, 8), (5, 5), (8, 2), (9, 7)]
        for p in [1, 2]:
            for mr, mc in mountain_positions:
                self.maps[str(p)][mr][mc] = MOUNTAIN

        # Select 4 scoring objectives
        all_obj = copy.deepcopy(SCORING_OBJECTIVES)
        random.shuffle(all_obj)
        self.objectives = all_obj[:4]

        # Season tracking
        self.current_season = 0
        self.season_time_spent = 0

        # Card decks
        self.explore_deck = copy.deepcopy(EXPLORATION_CARDS)
        self.monster_deck = copy.deepcopy(MONSTER_CARDS)
        random.shuffle(self.explore_deck)

        # Current card
        self.current_card = None
        self.is_monster_card = False
        self.card_time = 0
        self._draw_card()

        # Scoring
        self.season_scores = {}
        for p in [1, 2]:
            self.season_scores[str(p)] = []

        self.total_scores = {'1': 0, '2': 0}
        self.message = f"Season: {SEASON_NAMES[0]} - Draw and place terrain!"

        # Phase tracking: both players place on same card
        self.players_placed = []

    def _draw_card(self):
        """Draw next exploration card."""
        # Small chance of monster
        if random.random() < 0.15 and self.monster_deck:
            mc = random.choice(self.monster_deck)
            self.current_card = mc
            self.is_monster_card = True
            self.card_time = 0
        else:
            if not self.explore_deck:
                self.explore_deck = copy.deepcopy(EXPLORATION_CARDS)
                random.shuffle(self.explore_deck)
            self.current_card = self.explore_deck.pop()
            self.is_monster_card = False
            shape = self.current_card['shapes'][0]
            self.card_time = max(1, len(shape) - 1)

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        pmap = self.maps[str(p)]
        color = BLUE if p == 1 else RED

        season = SEASON_NAMES[self.current_season] if self.current_season < len(SEASON_NAMES) else "End"
        time_limit = SEASON_TIME_LIMITS[self.current_season] if self.current_season < len(SEASON_TIME_LIMITS) else 0

        print(f"{BOLD}{'=' * 60}")
        print(f"  CARTOGRAPHERS - {season} "
              f"(Time: {self.season_time_spent}/{time_limit}) - "
              f"{self.players[p - 1]}'s Turn")
        print(f"{'=' * 60}{RESET}")

        # Scoring objectives for this season
        obj_a = self.current_season % 4
        obj_b = (self.current_season + 1) % 4
        print(f"\n  {BOLD}Scoring this season:{RESET}")
        print(f"    A: {self.objectives[obj_a]['name']} - {self.objectives[obj_a]['description']}")
        print(f"    B: {self.objectives[obj_b]['name']} - {self.objectives[obj_b]['description']}")

        # Draw map
        print(f"\n     {''.join(f'{c:3d}' for c in range(self.grid_size))}")
        print(f"    +{'---' * self.grid_size}+")
        for r in range(self.grid_size):
            row_str = f"  {r:2d}|"
            for c in range(self.grid_size):
                ch = pmap[r][c]
                tc = TERRAIN_COLORS.get(ch, WHITE)
                row_str += f" {tc}{ch}{RESET} "
            row_str += "|"
            print(row_str)
        print(f"    +{'---' * self.grid_size}+")

        # Legend
        print(f"  {DIM}.{RESET}=Empty {GREEN}F{RESET}=Forest {RED}V{RESET}=Village "
              f"{CYAN}W{RESET}=Water {YELLOW}A{RESET}=Farm "
              f"{WHITE}^{RESET}=Mountain {MAGENTA}M{RESET}=Monster")

        # Current card
        print(f"\n  {BOLD}Current Card:{RESET} {self.current_card['name']}")
        if self.is_monster_card:
            print(f"    {MAGENTA}MONSTER!{RESET} - Place on opponent's map!")
            shape = self.current_card['shapes'][0]
        else:
            terrains = ', '.join(TERRAIN_NAMES.get(t, t) for t in self.current_card['terrains'])
            print(f"    Terrain options: {terrains}")
            shape = self.current_card['shapes'][0]
        # Show shape
        shape_norm = _normalize_shape(shape)
        max_r = max(r for r, c in shape_norm) + 1
        max_c = max(c for r, c in shape_norm) + 1
        print(f"    Shape:")
        for r in range(max_r):
            line = "      "
            for c in range(max_c):
                if (r, c) in shape_norm:
                    line += "# "
                else:
                    line += ". "
            print(line)

        # Scores
        print(f"\n  {BOLD}Scores:{RESET}")
        for pp in [1, 2]:
            pc = BLUE if pp == 1 else RED
            ss = self.season_scores[str(pp)]
            ss_str = '+'.join(str(s) for s in ss) if ss else '0'
            print(f"    {pc}P{pp}{RESET}: {self.total_scores[str(pp)]} "
                  f"(seasons: {ss_str})")

        if self.message:
            print(f"\n  {YELLOW}>> {self.message}{RESET}")

    def get_move(self):
        """Get a move from the current player."""
        if self.is_monster_card:
            print(f"\n  Place monster shape on {self.players[2 - self.current_player]}'s map!")
            pos = input_with_quit("  Top-left position (row,col): ").strip()
            rot = input_with_quit("  Rotation (0/90/180/270): ").strip()
            flip = input_with_quit("  Flip? (y/n): ").strip().lower()
            return ('monster', pos, rot, flip)
        else:
            if len(self.current_card['terrains']) > 1:
                print(f"\n  Available terrains:")
                for i, t in enumerate(self.current_card['terrains']):
                    print(f"    [{i + 1}] {TERRAIN_NAMES.get(t, t)}")
                tidx = input_with_quit("  Choose terrain: ").strip()
            else:
                tidx = '1'
            pos = input_with_quit("  Top-left position (row,col): ").strip()
            rot = input_with_quit("  Rotation (0/90/180/270): ").strip()
            flip = input_with_quit("  Flip? (y/n): ").strip().lower()
            return ('place', tidx, pos, rot, flip)

    def _get_transformed_shape(self, shape, rot, flip):
        """Apply rotation and flip to shape."""
        current = list(shape)
        rot_count = (int(rot) // 90) % 4
        for _ in range(rot_count):
            current = _rotate_shape(current)
        if flip:
            current = _flip_shape(current)
        return _normalize_shape(current)

    def make_move(self, move):
        """Apply a move to the game state."""
        if move[0] == 'monster':
            try:
                parts = move[1].replace(' ', '').split(',')
                pr, pc = int(parts[0]), int(parts[1])
                rot = int(move[2]) if move[2] else 0
                do_flip = move[3] == 'y'
            except (ValueError, IndexError):
                self.message = "Invalid input."
                return False

            shape = self.current_card['shapes'][0]
            transformed = self._get_transformed_shape(shape, rot, do_flip)

            # Place on opponent's map
            target = 2 if self.current_player == 1 else 1
            tmap = self.maps[str(target)]

            for r, c in transformed:
                nr, nc = pr + r, pc + c
                if not (0 <= nr < self.grid_size and 0 <= nc < self.grid_size):
                    self.message = "Shape goes out of bounds!"
                    return False
                if tmap[nr][nc] != EMPTY:
                    self.message = "Cannot overlap existing terrain!"
                    return False

            for r, c in transformed:
                tmap[pr + r][pc + c] = MONSTER

            self.players_placed.append(self.current_player)
            self.message = f"Monster placed on P{target}'s map!"

        elif move[0] == 'place':
            try:
                tidx = int(move[1]) - 1
                parts = move[2].replace(' ', '').split(',')
                pr, pc = int(parts[0]), int(parts[1])
                rot = int(move[3]) if move[3] else 0
                do_flip = move[4] == 'y'
            except (ValueError, IndexError):
                self.message = "Invalid input."
                return False

            terrains = self.current_card['terrains']
            if tidx < 0 or tidx >= len(terrains):
                self.message = "Invalid terrain choice."
                return False
            terrain = terrains[tidx]

            shape = self.current_card['shapes'][0]
            transformed = self._get_transformed_shape(shape, rot, do_flip)

            pmap = self.maps[str(self.current_player)]
            for r, c in transformed:
                nr, nc = pr + r, pc + c
                if not (0 <= nr < self.grid_size and 0 <= nc < self.grid_size):
                    self.message = "Shape goes out of bounds!"
                    return False
                if pmap[nr][nc] != EMPTY:
                    self.message = "Cannot overlap existing terrain!"
                    return False

            for r, c in transformed:
                pmap[pr + r][pc + c] = terrain

            self.players_placed.append(self.current_player)
            self.message = f"Placed {TERRAIN_NAMES.get(terrain, terrain)}!"

        else:
            self.message = "Unknown action."
            return False

        # After both players placed, advance card
        if len(self.players_placed) >= 2:
            self.players_placed = []
            self.season_time_spent += self.card_time

            time_limit = SEASON_TIME_LIMITS[self.current_season] if self.current_season < len(SEASON_TIME_LIMITS) else 0
            if self.season_time_spent >= time_limit:
                self._end_season()
            else:
                self._draw_card()
                self.message = f"New card: {self.current_card['name']}"

        return True

    def _end_season(self):
        """Score the end of a season."""
        obj_a = self.current_season % 4
        obj_b = (self.current_season + 1) % 4

        for p in [1, 2]:
            pmap = self.maps[str(p)]
            score_a = self._score_objective(pmap, self.objectives[obj_a])
            score_b = self._score_objective(pmap, self.objectives[obj_b])
            # Monster penalty: -1 per empty cell adjacent to a monster
            monster_penalty = 0
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if pmap[r][c] == MONSTER:
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                                if pmap[nr][nc] == EMPTY:
                                    monster_penalty += 1

            season_total = max(0, score_a + score_b - monster_penalty)
            self.season_scores[str(p)].append(season_total)
            self.total_scores[str(p)] += season_total

        self.current_season += 1
        if self.current_season < self.num_seasons:
            self.season_time_spent = 0
            self._draw_card()
            self.message = (f"{SEASON_NAMES[self.current_season]} begins! "
                            f"Scored previous season.")
        else:
            self.message = "Game over! Final scores calculated."

    def _score_objective(self, pmap, objective):
        """Score a single objective for a player's map."""
        oid = objective['id']
        score = 0

        if oid == 'sentinel_wood':
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if pmap[r][c] == FOREST:
                        if r == 0 or r == self.grid_size - 1 or c == 0 or c == self.grid_size - 1:
                            score += 1

        elif oid == 'greenbough':
            for r in range(self.grid_size):
                if any(pmap[r][c] == FOREST for c in range(self.grid_size)):
                    score += 1
            for c in range(self.grid_size):
                if any(pmap[r][c] == FOREST for r in range(self.grid_size)):
                    score += 1

        elif oid == 'stoneside_forest':
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if pmap[r][c] == MOUNTAIN:
                        all_forest = True
                        has_adj = False
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                                has_adj = True
                                if pmap[nr][nc] != FOREST:
                                    all_forest = False
                        if has_adj and all_forest:
                            score += 3

        elif oid == 'canal_lake':
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if pmap[r][c] == WATER:
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                                if pmap[nr][nc] == FARM:
                                    score += 1
                                    break

        elif oid == 'mages_valley':
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if pmap[r][c] in (WATER, FARM):
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                                if pmap[nr][nc] == MOUNTAIN:
                                    score += 2 if pmap[r][c] == WATER else 1
                                    break

        elif oid == 'golden_granary':
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if pmap[r][c] == FARM:
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                                if pmap[nr][nc] == WATER:
                                    score += 3
                                    break

        elif oid == 'wildholds':
            visited = [[False] * self.grid_size for _ in range(self.grid_size)]
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if pmap[r][c] == VILLAGE and not visited[r][c]:
                        cluster = self._flood_fill(pmap, visited, r, c, VILLAGE)
                        if cluster >= 6:
                            score += 8

        elif oid == 'great_city':
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if pmap[r][c] == VILLAGE:
                        adj_mountain = False
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                                if pmap[nr][nc] == MOUNTAIN:
                                    adj_mountain = True
                        if not adj_mountain:
                            score += 1

        elif oid == 'shieldgate':
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if pmap[r][c] == VILLAGE:
                        if r == 1 or r == self.grid_size - 2 or c == 1 or c == self.grid_size - 2:
                            score += 2

        elif oid == 'borderlands_obj':
            for r in range(self.grid_size):
                if all(pmap[r][c] != EMPTY for c in range(self.grid_size)):
                    score += 6
            for c in range(self.grid_size):
                if all(pmap[r][c] != EMPTY for r in range(self.grid_size)):
                    score += 6

        elif oid == 'broken_road':
            for r in range(self.grid_size):
                length = 0
                cr, cc = r, 0
                while 0 <= cr < self.grid_size and 0 <= cc < self.grid_size:
                    if pmap[cr][cc] != EMPTY:
                        length += 1
                    else:
                        if length >= 3:
                            score += 3
                        length = 0
                    cr += 1
                    cc += 1
                if length >= 3:
                    score += 3

        elif oid == 'lost_barony':
            max_sq = 0
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    for size in range(1, self.grid_size - max(r, c) + 1):
                        all_filled = True
                        for dr in range(size):
                            for dc in range(size):
                                if pmap[r + dr][c + dc] == EMPTY:
                                    all_filled = False
                                    break
                            if not all_filled:
                                break
                        if all_filled:
                            max_sq = max(max_sq, size)
                        else:
                            break
            score = max_sq * max_sq * 3

        return score

    def _flood_fill(self, pmap, visited, r, c, target):
        """Count connected cells of same type."""
        if (r < 0 or r >= self.grid_size or c < 0 or c >= self.grid_size
                or visited[r][c] or pmap[r][c] != target):
            return 0
        visited[r][c] = True
        count = 1
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            count += self._flood_fill(pmap, visited, r + dr, c + dc, target)
        return count

    def check_game_over(self):
        """Check if the game is over."""
        if self.current_season >= self.num_seasons:
            self.game_over = True
            s1 = self.total_scores['1']
            s2 = self.total_scores['2']
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        """Return serializable game state."""
        return {
            'grid_size': self.grid_size,
            'num_seasons': self.num_seasons,
            'maps': self.maps,
            'objectives': self.objectives,
            'current_season': self.current_season,
            'season_time_spent': self.season_time_spent,
            'explore_deck': self.explore_deck,
            'monster_deck': self.monster_deck,
            'current_card': self.current_card,
            'is_monster_card': self.is_monster_card,
            'card_time': self.card_time,
            'season_scores': self.season_scores,
            'total_scores': self.total_scores,
            'message': self.message,
            'players_placed': self.players_placed,
        }

    def load_state(self, state):
        """Restore game state."""
        self.grid_size = state['grid_size']
        self.num_seasons = state['num_seasons']
        self.maps = state['maps']
        self.objectives = state['objectives']
        self.current_season = state['current_season']
        self.season_time_spent = state['season_time_spent']
        self.explore_deck = state['explore_deck']
        self.monster_deck = state['monster_deck']
        self.current_card = state['current_card']
        self.is_monster_card = state['is_monster_card']
        self.card_time = state['card_time']
        self.season_scores = state['season_scores']
        self.total_scores = state['total_scores']
        self.message = state['message']
        self.players_placed = state['players_placed']

    def get_tutorial(self):
        return f"""{BOLD}=== CARTOGRAPHERS TUTORIAL ==={RESET}

Cartographers is a map-drawing territory game for 2 players.

{BOLD}OBJECTIVE:{RESET}
  Score the most points by filling your 11x11 map with terrain shapes
  that match seasonal scoring objectives.

{BOLD}EACH TURN:{RESET}
  1. An exploration card is revealed with a shape and terrain options
  2. Both players place the shape on their own map with chosen terrain
  3. Choose rotation (0/90/180/270) and optional flip

{BOLD}TERRAIN TYPES:{RESET}
  F=Forest  V=Village  W=Water  A=Farm  ^=Mountain (pre-placed)

{BOLD}SEASONS:{RESET}
  Each season has a time limit. Cards cost time based on shape size.
  When time runs out, the season is scored using 2 of 4 objectives.
  Objectives rotate: Spring=A+B, Summer=B+C, Autumn=C+D, Winter=D+A.

{BOLD}MONSTERS:{RESET}
  Monster cards let you place the shape on your opponent's map!
  At season end, each empty cell adjacent to a monster = -1 point.

{BOLD}SCORING:{RESET}
  Points come from matching scoring objectives.
  Monster penalties are subtracted each season.
  Highest total across all seasons wins!

{BOLD}PLACEMENT:{RESET}
  Enter row,col for the top-left corner of the shape.
  Shape cannot overlap existing terrain or go out of bounds.

{BOLD}CONTROLS:{RESET}
  Type 'q' to quit, 's' to save, 'h' for help, 't' for tutorial.
"""
