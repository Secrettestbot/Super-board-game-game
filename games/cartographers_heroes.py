"""Cartographers Heroes - Map-drawing game on an 11x11 grid.

Fill terrain on a grid based on revealed cards. Score for different goals
each season. Monsters placed by your opponent create penalties.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

TERRAIN_TYPES = ["Forest", "Village", "Farm", "Water", "Monster"]
TERRAIN_SYMBOLS = {
    "Forest": "F", "Village": "V", "Farm": "A", "Water": "W",
    "Monster": "M", "Mountain": "^", "Ruins": "R", "Empty": "."
}

# Explore cards: name, time cost, terrain options, shape (list of (dr,dc) offsets)
EXPLORE_CARDS = [
    {"name": "Sentinel Wood", "time": 1, "terrains": ["Forest"],
     "shapes": [[(0, 0), (1, 0), (1, 1)]]},
    {"name": "Treetop Village", "time": 2, "terrains": ["Forest", "Village"],
     "shapes": [[(0, 0), (0, 1), (1, 0), (2, 0)]]},
    {"name": "Farmland", "time": 1, "terrains": ["Farm"],
     "shapes": [[(0, 0), (0, 1)]]},
    {"name": "Homestead", "time": 2, "terrains": ["Farm", "Village"],
     "shapes": [[(0, 0), (1, 0), (1, 1), (2, 1)]]},
    {"name": "Great River", "time": 1, "terrains": ["Water"],
     "shapes": [[(0, 0), (1, 0), (2, 0)]]},
    {"name": "Hamlet", "time": 1, "terrains": ["Village"],
     "shapes": [[(0, 0), (0, 1), (1, 0)]]},
    {"name": "Forgotten Forest", "time": 2, "terrains": ["Forest"],
     "shapes": [[(0, 0), (0, 1), (1, 0), (1, 1)]]},
    {"name": "Orchard", "time": 2, "terrains": ["Forest", "Farm"],
     "shapes": [[(0, 0), (1, 0), (2, 0), (2, 1)]]},
    {"name": "Rift Lands", "time": 0, "terrains": ["Forest", "Village", "Farm", "Water"],
     "shapes": [[(0, 0)]]},
]

MONSTER_CARDS = [
    {"name": "Goblin Attack", "time": 0,
     "shapes": [[(0, 0), (1, 0), (1, 1)]]},
    {"name": "Dragon Assault", "time": 0,
     "shapes": [[(0, 0), (0, 1), (1, 0)]]},
    {"name": "Bugbear Raid", "time": 0,
     "shapes": [[(0, 0), (0, 1)]]},
]

# Scoring goals
SCORING_GOALS = [
    {"name": "Borderlands", "desc": "6 pts per complete row/column of filled spaces",
     "id": "borderlands"},
    {"name": "The Cauldrons", "desc": "1 pt per empty space surrounded on all 4 sides",
     "id": "cauldrons"},
    {"name": "Greengold Plains", "desc": "3 pts per village cluster adjacent to 3+ forest",
     "id": "greengold"},
    {"name": "Wildholds", "desc": "8 pts per cluster of 6+ village spaces",
     "id": "wildholds"},
    {"name": "Canal Lake", "desc": "1 pt per water adjacent to farm, 1 pt per farm adjacent to water",
     "id": "canal"},
    {"name": "Mages Valley", "desc": "2 pts per water adjacent to mountain, 1 pt per farm adjacent to mountain",
     "id": "mages"},
    {"name": "Stoneside Forest", "desc": "3 pts per mountain connected to a forest edge",
     "id": "stoneside"},
    {"name": "Shieldgate", "desc": "2 pts per filled space in second-largest row",
     "id": "shieldgate"},
]

SEASON_NAMES = ["Spring", "Summer", "Fall", "Winter"]
SEASON_TIME_LIMITS = [8, 8, 7, 6]
SKILL_CARDS = [
    {"name": "Foresight", "desc": "Preview next card before placing"},
    {"name": "Overwork", "desc": "Place 1 extra single space of any terrain"},
]


class CartographersHeroesGame(BaseGame):
    """Cartographers Heroes - Map-drawing territory game."""

    name = "Cartographers Heroes"
    description = "Map-drawing game: fill terrain on a grid, score seasonal goals"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Heroes",
        "skills": "With Skills",
    }

    GRID_SIZE = 11

    def __init__(self, variation=None):
        super().__init__(variation)
        self.use_skills = (self.variation == "skills")
        self.grids = {}
        self.season = 0
        self.time_spent = 0
        self.goals = []
        self.season_scores = {"1": [], "2": []}
        self.explore_deck = []
        self.current_card = None
        self.phase = "explore"  # explore, place, monster, score, game_end
        self.skills = {"1": [], "2": []}
        self.log = []

    def _init_grid(self):
        """Create an 11x11 grid with mountains and ruins."""
        grid = [["Empty"] * self.GRID_SIZE for _ in range(self.GRID_SIZE)]
        # Place mountains at fixed positions
        mountains = [(1, 3), (2, 8), (5, 5), (8, 2), (9, 7)]
        for r, c in mountains:
            grid[r][c] = "Mountain"
        # Place ruins
        ruins = [(1, 5), (5, 1), (5, 9), (9, 5)]
        for r, c in ruins:
            grid[r][c] = "Ruins"
        return grid

    def setup(self):
        self.grids = {"1": self._init_grid(), "2": self._init_grid()}
        self.season = 0
        self.time_spent = 0
        self.season_scores = {"1": [], "2": []}
        # Pick 4 random goals
        self.goals = random.sample(SCORING_GOALS, 4)
        self.explore_deck = list(EXPLORE_CARDS)
        random.shuffle(self.explore_deck)
        if self.use_skills:
            self.skills = {"1": list(SKILL_CARDS), "2": list(SKILL_CARDS)}
        self.phase = "explore"
        self.log = [f"Cartographers Heroes begins! Season: {SEASON_NAMES[0]}"]
        self._draw_card()

    def _draw_card(self):
        if not self.explore_deck:
            self.explore_deck = list(EXPLORE_CARDS)
            random.shuffle(self.explore_deck)
        # Chance of monster
        if random.random() < 0.15:
            self.current_card = random.choice(MONSTER_CARDS).copy()
            self.current_card["is_monster"] = True
            self.phase = "monster"
        else:
            self.current_card = self.explore_deck.pop()
            self.current_card["is_monster"] = False
            self.phase = "place"

    def _find_clusters(self, grid, terrain):
        """Find all connected clusters of a terrain type."""
        sz, visited, clusters = self.GRID_SIZE, set(), []
        for r in range(sz):
            for c in range(sz):
                if grid[r][c] == terrain and (r, c) not in visited:
                    cluster, stack = [], [(r, c)]
                    while stack:
                        cr, cc = stack.pop()
                        if (cr, cc) in visited or grid[cr][cc] != terrain:
                            continue
                        visited.add((cr, cc))
                        cluster.append((cr, cc))
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = cr + dr, cc + dc
                            if 0 <= nr < sz and 0 <= nc < sz:
                                stack.append((nr, nc))
                    clusters.append(cluster)
        return clusters

    def _adj_terrain(self, grid, r, c, terrain):
        """Check if cell (r,c) is adjacent to given terrain."""
        sz = self.GRID_SIZE
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < sz and 0 <= nc < sz and grid[nr][nc] == terrain:
                return True
        return False

    def _score_goal(self, player, goal_id):
        """Score a single goal for a player."""
        grid, sz, score = self.grids[str(player)], self.GRID_SIZE, 0
        filled = lambda r, c: grid[r][c] not in ("Empty", "Ruins")
        if goal_id == "borderlands":
            for r in range(sz):
                if all(filled(r, c) for c in range(sz)):
                    score += 6
            for c in range(sz):
                if all(filled(r, c) for r in range(sz)):
                    score += 6
        elif goal_id == "cauldrons":
            for r in range(sz):
                for c in range(sz):
                    if not filled(r, c):
                        if all(grid[r+dr][c+dc] not in ("Empty", "Ruins")
                               for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]
                               if 0 <= r+dr < sz and 0 <= c+dc < sz):
                            score += 1
        elif goal_id == "greengold":
            for cluster in self._find_clusters(grid, "Village"):
                adj_f = set()
                for cr, cc in cluster:
                    for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
                        nr, nc = cr+dr, cc+dc
                        if 0 <= nr < sz and 0 <= nc < sz and grid[nr][nc] == "Forest":
                            adj_f.add((nr, nc))
                if len(adj_f) >= 3:
                    score += 3
        elif goal_id == "wildholds":
            for cluster in self._find_clusters(grid, "Village"):
                if len(cluster) >= 6:
                    score += 8
        elif goal_id == "canal":
            for r in range(sz):
                for c in range(sz):
                    if grid[r][c] == "Water" and self._adj_terrain(grid, r, c, "Farm"):
                        score += 1
                    elif grid[r][c] == "Farm" and self._adj_terrain(grid, r, c, "Water"):
                        score += 1
        elif goal_id == "mages":
            for r in range(sz):
                for c in range(sz):
                    if grid[r][c] == "Mountain":
                        for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
                            nr, nc = r+dr, c+dc
                            if 0 <= nr < sz and 0 <= nc < sz:
                                if grid[nr][nc] == "Water": score += 2
                                elif grid[nr][nc] == "Farm": score += 1
        elif goal_id == "stoneside":
            for r in range(sz):
                for c in range(sz):
                    if grid[r][c] == "Mountain" and self._adj_terrain(grid, r, c, "Forest"):
                        score += 3
        elif goal_id == "shieldgate":
            fills = sorted((sum(1 for c in range(sz) if filled(r, c)) for r in range(sz)), reverse=True)
            score = fills[1] * 2 if len(fills) >= 2 else 0
        return score

    def _monster_penalty(self, player):
        """Count penalty for monsters: -1 per empty space adjacent to monster."""
        sp = str(player)
        grid = self.grids[sp]
        sz = self.GRID_SIZE
        penalty = 0
        for r in range(sz):
            for c in range(sz):
                if grid[r][c] == "Monster":
                    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < sz and 0 <= nc < sz:
                            if grid[nr][nc] in ("Empty", "Ruins"):
                                penalty += 1
        return penalty

    def _can_place_shape(self, grid, shape, start_r, start_c, terrain):
        """Check if a shape can be placed at position."""
        sz = self.GRID_SIZE
        for dr, dc in shape:
            r, c = start_r + dr, start_c + dc
            if r < 0 or r >= sz or c < 0 or c >= sz:
                return False
            if grid[r][c] not in ("Empty", "Ruins"):
                return False
        return True

    def display(self):
        clear_screen()
        mode = "With Skills" if self.use_skills else "Standard"
        season = SEASON_NAMES[self.season] if self.season < 4 else "Game Over"
        print(f"{'=' * 60}")
        print(f"  CARTOGRAPHERS HEROES - {mode}")
        print(f"  Season: {season} | Time: {self.time_spent}/{SEASON_TIME_LIMITS[min(self.season, 3)]}")
        print(f"{'=' * 60}")

        # Goals
        print("  Scoring Goals:")
        for i, g in enumerate(self.goals):
            active = ""
            # Each season scores 2 goals: season 0->goals 0,1; season 1->goals 1,2; etc.
            s = self.season
            if s < 4 and i in [(s) % 4, (s + 1) % 4]:
                active = " [ACTIVE]"
            print(f"    {chr(65+i)}) {g['name']}: {g['desc']}{active}")
        print()

        # Show both grids side by side
        cp = self.current_player
        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == cp else ""
            total = sum(self.season_scores[sp]) if self.season_scores[sp] else 0
            print(f"  {self.players[p-1]} (total={total}){marker}")
            grid = self.grids[sp]
            header = "    " + " ".join(f"{c:2d}" for c in range(self.GRID_SIZE))
            print(header)
            for r in range(self.GRID_SIZE):
                row_s = f"  {r:2d} "
                for c in range(self.GRID_SIZE):
                    row_s += f" {TERRAIN_SYMBOLS.get(grid[r][c], '?')} "
                print(row_s)
            print()

        if self.current_card:
            card = self.current_card
            if card.get("is_monster"):
                print(f"  Monster Card: {card['name']}")
                shape_str = self._shape_str(card["shapes"][0])
                print(f"  Shape: {shape_str}")
            else:
                terrains = "/".join(card["terrains"])
                print(f"  Explore Card: {card['name']} (time={card['time']}, terrain={terrains})")
                shape_str = self._shape_str(card["shapes"][0])
                print(f"  Shape: {shape_str}")
        print()
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def _shape_str(self, shape):
        if not shape:
            return "[]"
        max_r = max(dr for dr, dc in shape) + 1
        max_c = max(dc for dr, dc in shape) + 1
        grid = [["." for _ in range(max_c)] for _ in range(max_r)]
        for dr, dc in shape:
            grid[dr][dc] = "#"
        return " | ".join("".join(row) for row in grid)

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if self.phase == "place":
            card = self.current_card
            terrains = card["terrains"]
            print(f"  {self.players[cp-1]}, place the shape on your map.")
            if len(terrains) > 1:
                print(f"  Choose terrain: ", end="")
                for i, t in enumerate(terrains):
                    print(f"[{i+1}] {t}  ", end="")
                print()
                t_choice = input_with_quit("  Terrain: ").strip()
                try:
                    ti = int(t_choice) - 1
                    if ti < 0 or ti >= len(terrains):
                        return None
                    terrain = terrains[ti]
                except ValueError:
                    return None
            else:
                terrain = terrains[0]
            pos = input_with_quit("  Position (row,col) for top-left of shape: ").strip()
            try:
                parts = pos.split(",")
                row, col = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                return None
            return {"action": "place", "row": row, "col": col, "terrain": terrain,
                    "shape_idx": 0}

        elif self.phase == "monster":
            # Opponent places monster on current player's grid
            opp = 2 if cp == 1 else 1
            print(f"  {self.players[opp-1]}, place monster on {self.players[cp-1]}'s map!")
            pos = input_with_quit("  Position (row,col): ").strip()
            try:
                parts = pos.split(",")
                row, col = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                return None
            return {"action": "place_monster", "row": row, "col": col, "placer": opp}

        elif self.phase == "score":
            input_with_quit("  Press Enter to continue...")
            return {"action": "next_season"}

        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move["action"]

        if action == "place":
            row, col = move["row"], move["col"]
            terrain = move["terrain"]
            card = self.current_card
            shape = card["shapes"][move.get("shape_idx", 0)]
            grid = self.grids[sp]

            if not self._can_place_shape(grid, shape, row, col, terrain):
                return False
            for dr, dc in shape:
                grid[row + dr][col + dc] = terrain
            self.time_spent += card["time"]
            self.log.append(f"{self.players[cp-1]} placed {terrain} at ({row},{col}).")

            # Check if season ends
            limit = SEASON_TIME_LIMITS[min(self.season, 3)]
            if self.time_spent >= limit:
                self._score_season()
                return True

            # Next card, same player (both players place simultaneously - alternate)
            if cp == 1:
                self.current_player = 2
                # Player 2 places same card
                return True
            else:
                self._draw_card()
                self.current_player = 1
                return True

        if action == "place_monster":
            row, col = move["row"], move["col"]
            card = self.current_card
            shape = card["shapes"][0]
            # Monster goes on current player's grid
            grid = self.grids[sp]
            if not self._can_place_shape(grid, shape, row, col, "Monster"):
                return False
            for dr, dc in shape:
                grid[row + dr][col + dc] = "Monster"
            self.log.append(f"Monster placed on {self.players[cp-1]}'s map at ({row},{col})!")

            if cp == 1:
                self.current_player = 2
                return True
            else:
                self._draw_card()
                self.current_player = 1
                return True

        if action == "next_season":
            self.season += 1
            if self.season >= 4:
                self.game_over = True
                return True
            self.time_spent = 0
            self.explore_deck = list(EXPLORE_CARDS)
            random.shuffle(self.explore_deck)
            self._draw_card()
            self.current_player = 1
            self.log.append(f"Season {SEASON_NAMES[self.season]} begins!")
            return True

        return False

    def _score_season(self):
        """Score the current season for both players."""
        s = self.season
        goal_indices = [s % 4, (s + 1) % 4]
        for p in ["1", "2"]:
            total = 0
            for gi in goal_indices:
                total += self._score_goal(int(p), self.goals[gi]["id"])
            total -= self._monster_penalty(int(p))
            self.season_scores[p].append(total)

        self.phase = "score"
        self.log.append(
            f"{SEASON_NAMES[self.season]} scored! "
            f"P1: +{self.season_scores['1'][-1]}, P2: +{self.season_scores['2'][-1]}")

    def check_game_over(self):
        if self.game_over:
            s1 = sum(self.season_scores["1"])
            s2 = sum(self.season_scores["2"])
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "grids": self.grids,
            "season": self.season,
            "time_spent": self.time_spent,
            "goals": self.goals,
            "season_scores": self.season_scores,
            "explore_deck": self.explore_deck,
            "current_card": self.current_card,
            "phase": self.phase,
            "skills": self.skills,
            "log": self.log,
        }

    def load_state(self, state):
        self.grids = state["grids"]
        self.season = state["season"]
        self.time_spent = state["time_spent"]
        self.goals = state["goals"]
        self.season_scores = state["season_scores"]
        self.explore_deck = state["explore_deck"]
        self.current_card = state["current_card"]
        self.phase = state["phase"]
        self.skills = state.get("skills", {"1": [], "2": []})
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==========================================================
  CARTOGRAPHERS HEROES - Tutorial
==========================================================
  Fill terrain on 11x11 grid over 4 seasons.
  F=Forest V=Village A=Farm W=Water M=Monster ^=Mountain

  Each turn: explore card reveals shape + terrain to place.
  Monsters: opponent places on YOUR map. -1 pt per adjacent empty.
  4 goals scored in pairs each season (A+B, B+C, C+D, D+A).
  Highest total after 4 seasons wins!
==========================================================
"""
