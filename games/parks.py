"""Parks - A nature trail hiking game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Resource types
RESOURCES = ["sun", "water", "mountain", "forest", "wildlife"]
RES_ICONS = {
    "sun": "S",
    "water": "W",
    "mountain": "M",
    "forest": "F",
    "wildlife": "*",
}

# Trail site types - each gives resources or special actions
TRAIL_SITES = [
    {"name": "Sunny Meadow", "gives": {"sun": 1}},
    {"name": "Mountain Vista", "gives": {"mountain": 1}},
    {"name": "Forest Path", "gives": {"forest": 1}},
    {"name": "River Crossing", "gives": {"water": 1}},
    {"name": "Wildlife Lookout", "gives": {"wildlife": 1}},
    {"name": "Sun & Water", "gives": {"sun": 1, "water": 1}},
    {"name": "Mountain & Forest", "gives": {"mountain": 1, "forest": 1}},
    {"name": "Forest & Wildlife", "gives": {"forest": 1, "wildlife": 1}},
    {"name": "Sun & Mountain", "gives": {"sun": 1, "mountain": 1}},
    {"name": "Water & Wildlife", "gives": {"water": 1, "wildlife": 1}},
    {"name": "Double Sun", "gives": {"sun": 2}},
    {"name": "Double Water", "gives": {"water": 2}},
    {"name": "Photo Op", "gives": {"sun": 1, "forest": 1}},
    {"name": "Campfire", "gives": {"mountain": 1, "water": 1}},
]


def _generate_parks(count):
    """Generate park cards with point values and resource costs."""
    all_parks = [
        {"name": "Yosemite", "points": 4, "cost": {"sun": 1, "mountain": 2}},
        {"name": "Yellowstone", "points": 5, "cost": {"water": 2, "wildlife": 1}},
        {"name": "Grand Canyon", "points": 4, "cost": {"sun": 2, "mountain": 1}},
        {"name": "Zion", "points": 3, "cost": {"sun": 1, "water": 1}},
        {"name": "Glacier", "points": 5, "cost": {"water": 1, "mountain": 2}},
        {"name": "Acadia", "points": 3, "cost": {"forest": 1, "water": 1}},
        {"name": "Olympic", "points": 4, "cost": {"forest": 2, "mountain": 1}},
        {"name": "Rocky Mountain", "points": 4, "cost": {"mountain": 1, "wildlife": 1}},
        {"name": "Great Smoky", "points": 3, "cost": {"forest": 2}},
        {"name": "Everglades", "points": 4, "cost": {"water": 2, "wildlife": 1}},
        {"name": "Joshua Tree", "points": 3, "cost": {"sun": 2}},
        {"name": "Denali", "points": 6, "cost": {"mountain": 2, "wildlife": 1}},
        {"name": "Arches", "points": 3, "cost": {"sun": 1, "mountain": 1}},
        {"name": "Redwood", "points": 5, "cost": {"forest": 2, "wildlife": 1}},
        {"name": "Badlands", "points": 3, "cost": {"sun": 1, "wildlife": 1}},
        {"name": "Crater Lake", "points": 4, "cost": {"water": 2, "mountain": 1}},
        {"name": "Sequoia", "points": 5, "cost": {"forest": 1, "mountain": 1, "wildlife": 1}},
        {"name": "Big Bend", "points": 3, "cost": {"sun": 1, "forest": 1}},
        {"name": "Death Valley", "points": 4, "cost": {"sun": 2, "water": 1}},
        {"name": "Shenandoah", "points": 3, "cost": {"forest": 1, "wildlife": 1}},
        {"name": "Rainier", "points": 5, "cost": {"water": 1, "mountain": 1, "forest": 1}},
        {"name": "Capitol Reef", "points": 4, "cost": {"sun": 1, "mountain": 1, "water": 1}},
        {"name": "Bryce Canyon", "points": 4, "cost": {"sun": 1, "mountain": 2}},
        {"name": "Canyonlands", "points": 5, "cost": {"sun": 2, "mountain": 1, "water": 1}},
    ]
    random.shuffle(all_parks)
    return all_parks[:count]


def _res_str(resources, skip_zero=False):
    """Format resources dict."""
    parts = []
    for r in RESOURCES:
        v = resources.get(r, 0)
        if skip_zero and v == 0:
            continue
        parts.append(f"{RES_ICONS[r]}:{v}")
    return " ".join(parts) if parts else "(none)"


def _cost_str(cost):
    parts = []
    for r in RESOURCES:
        v = cost.get(r, 0)
        if v > 0:
            parts.append(f"{RES_ICONS[r]}:{v}")
    return " ".join(parts) if parts else "free"


class ParksGame(BaseGame):
    """Parks: Hike trails, collect resources, visit national parks."""

    name = "Parks"
    description = "A nature trail hiking game visiting national parks"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (4 seasons)",
        "short": "Short game (2 seasons)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.trail = []              # list of trail sites for current season
        self.trail_end = None        # the end-of-trail site
        self.hiker_positions = {1: [], 2: []}  # each player has 2 hikers
        self.player_resources = [{}, {}]
        self.player_parks = [[], []]
        self.player_photos = [0, 0]    # bonus photos (1 pt each)
        self.park_display = []         # available parks to visit (3 face-up)
        self.park_deck = []
        self.season = 1
        self.max_seasons = 4
        self.canteen = [False, False]  # whether player has used canteen this season
        self.season_bonus_resource = None
        self.hikers_finished = {1: 0, 2: 0}  # how many hikers reached end

    def setup(self):
        short = self.variation == "short"
        self.max_seasons = 2 if short else 4

        total_parks = 12 if short else 20
        all_parks = _generate_parks(total_parks)
        self.park_deck = all_parks
        self.park_display = []
        for _ in range(3):
            if self.park_deck:
                self.park_display.append(self.park_deck.pop())

        for i in range(2):
            self.player_resources[i] = {r: 0 for r in RESOURCES}
            self.player_parks[i] = []
            self.player_photos[i] = 0

        self.season = 1
        self._setup_season()

    def _setup_season(self):
        """Set up a new season's trail."""
        # Trail length varies by season (gets longer)
        base_length = 4 + self.season
        sites = list(TRAIL_SITES)
        random.shuffle(sites)
        self.trail = []
        for i in range(base_length):
            site = dict(sites[i % len(sites)])
            site["occupied_by"] = None  # player number or None
            self.trail.append(site)

        # End of trail - park visit site
        self.trail_end = {"name": "Trailhead (End)", "occupied_by": []}

        # Place hikers at start (position -1 means not yet on trail)
        self.hiker_positions = {1: [-1, -1], 2: [-1, -1]}
        self.hikers_finished = {1: 0, 2: 0}
        self.canteen = [False, False]

        # Season bonus: one resource type is boosted
        self.season_bonus_resource = random.choice(RESOURCES)

        # Refill park display
        while len(self.park_display) < 3 and self.park_deck:
            self.park_display.append(self.park_deck.pop())

    def display(self):
        mode = "Standard" if self.variation == "standard" else "Short"
        print(f"\n  === PARKS ({mode}) - Season {self.season}/{self.max_seasons} ===")
        print(f"  Season bonus resource: {self.season_bonus_resource} ({RES_ICONS[self.season_bonus_resource]})")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        # Display trail
        print("  Trail:")
        for i, site in enumerate(self.trail):
            hikers_here = []
            for p in [1, 2]:
                for hi, pos in enumerate(self.hiker_positions[p]):
                    if pos == i:
                        hikers_here.append(f"P{p}h{hi + 1}")
            hiker_str = f" [{', '.join(hikers_here)}]" if hikers_here else ""
            gives = _cost_str(site["gives"])
            print(f"    [{i}] {site['name']:20s} gives: {gives}{hiker_str}")

        # End site
        end_hikers = []
        for p in [1, 2]:
            for hi, pos in enumerate(self.hiker_positions[p]):
                if pos >= len(self.trail):
                    end_hikers.append(f"P{p}h{hi + 1}")
        end_str = f" [{', '.join(end_hikers)}]" if end_hikers else ""
        print(f"    [E] Trailhead End (visit park or take 1 of any){end_str}")
        print()

        # Available parks
        print("  Parks available to visit:")
        for i, park in enumerate(self.park_display):
            print(f"    [{i + 1}] {park['name']:18s} {park['points']} pts | cost: {_cost_str(park['cost'])}")
        print(f"    Park deck remaining: {len(self.park_deck)}")
        print()

        # Player info
        for i in range(2):
            marker = " <<" if i == self.current_player - 1 else ""
            res = _res_str(self.player_resources[i])
            pts = self._player_score(i)
            parks_claimed = len(self.player_parks[i])
            hiker_locs = []
            for hi, pos in enumerate(self.hiker_positions[i + 1]):
                if pos < 0:
                    hiker_locs.append("start")
                elif pos >= len(self.trail):
                    hiker_locs.append("end")
                else:
                    hiker_locs.append(str(pos))
            canteen = "available" if not self.canteen[i] else "used"
            print(
                f"  {self.players[i]}: {pts} pts | resources: {res} | "
                f"parks: {parks_claimed} | photos: {self.player_photos[i]} | "
                f"hikers: [{', '.join(hiker_locs)}] | canteen: {canteen}{marker}"
            )
        print()

    def _player_score(self, pi):
        pts = sum(p["points"] for p in self.player_parks[pi])
        pts += self.player_photos[pi]
        return pts

    def _can_afford_park(self, pi, park):
        for r, v in park["cost"].items():
            if self.player_resources[pi].get(r, 0) < v:
                return False
        return True

    def _pay_for_park(self, pi, park):
        for r, v in park["cost"].items():
            self.player_resources[pi][r] -= v

    def get_move(self):
        pi = self.current_player - 1
        p = self.current_player
        print(f"  {self.players[pi]}, choose action:")
        print("    move H POS       - move hiker H (1 or 2) to trail position POS")
        print("    move H end       - move hiker H to trail end")
        print("    park N           - visit park N (when hiker is at trail end)")
        print("    photo            - take a photo instead of visiting park (at end)")
        print("    canteen R        - use canteen: gain 1 extra resource R on next move")
        hint_hikers = []
        for hi in range(2):
            pos = self.hiker_positions[p][hi]
            if pos < len(self.trail):
                hint_hikers.append(f"h{hi + 1}@{'start' if pos < 0 else pos}")
        if hint_hikers:
            print(f"  Hikers on trail: {', '.join(hint_hikers)}")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        pi = self.current_player - 1
        p = self.current_player
        parts = move.lower().split()
        if not parts:
            return False

        action = parts[0]

        if action == "move":
            if len(parts) < 3:
                print("  Usage: move H POS  (hiker 1 or 2, position number or 'end')")
                return False
            try:
                hiker_idx = int(parts[1]) - 1
            except ValueError:
                return False
            if hiker_idx < 0 or hiker_idx > 1:
                print("  Hiker must be 1 or 2.")
                return False

            current_pos = self.hiker_positions[p][hiker_idx]
            if current_pos >= len(self.trail):
                print("  This hiker already finished the trail.")
                return False

            if parts[2] == "end" or parts[2] == "e":
                target = len(self.trail)
            else:
                try:
                    target = int(parts[2])
                except ValueError:
                    return False

            # Must move forward
            if target <= current_pos:
                print("  Must move forward on the trail.")
                return False

            if target > len(self.trail):
                print(f"  Max position is {len(self.trail) - 1} or 'end'.")
                return False

            # Moving to trail end
            if target == len(self.trail):
                self.hiker_positions[p][hiker_idx] = target
                self.hikers_finished[p] += 1
                # At trail end, player can visit park or take photo on next action
                return True

            # Check site is not occupied by another player's hiker
            # (own hikers can't share either, unless using canteen)
            for other_p in [1, 2]:
                for hi, pos in enumerate(self.hiker_positions[other_p]):
                    if pos == target and (other_p != p or hi != hiker_idx):
                        print(f"  Position {target} is occupied.")
                        return False

            self.hiker_positions[p][hiker_idx] = target
            # Collect resources from the site
            site = self.trail[target]
            for r, v in site["gives"].items():
                self.player_resources[pi][r] = self.player_resources[pi].get(r, 0) + v
            # Season bonus: gain 1 extra of the bonus resource if site gives it
            if self.season_bonus_resource in site["gives"]:
                self.player_resources[pi][self.season_bonus_resource] += 1
            return True

        if action == "park":
            # Must have a hiker at trail end
            has_end_hiker = any(
                pos >= len(self.trail) for pos in self.hiker_positions[p]
            )
            if not has_end_hiker:
                print("  Need a hiker at the trail end to visit a park.")
                return False
            if len(parts) < 2:
                return False
            try:
                park_idx = int(parts[1]) - 1
            except ValueError:
                return False
            if park_idx < 0 or park_idx >= len(self.park_display):
                print("  Invalid park number.")
                return False

            park = self.park_display[park_idx]
            if not self._can_afford_park(pi, park):
                print(f"  Cannot afford {park['name']}.")
                return False

            self._pay_for_park(pi, park)
            claimed = self.park_display.pop(park_idx)
            self.player_parks[pi].append(claimed)
            # Refill
            if self.park_deck:
                self.park_display.append(self.park_deck.pop())
            return True

        if action == "photo":
            has_end_hiker = any(
                pos >= len(self.trail) for pos in self.hiker_positions[p]
            )
            if not has_end_hiker:
                print("  Need a hiker at the trail end to take a photo.")
                return False
            self.player_photos[pi] += 1
            return True

        if action == "canteen":
            if self.canteen[pi]:
                print("  Canteen already used this season.")
                return False
            if len(parts) < 2:
                print("  Usage: canteen RESOURCE (sun/water/mountain/forest/wildlife)")
                return False
            res = parts[1]
            if res not in RESOURCES:
                print(f"  Invalid resource. Choose: {', '.join(RESOURCES)}")
                return False
            self.player_resources[pi][res] = self.player_resources[pi].get(res, 0) + 1
            self.canteen[pi] = True
            return True

        print("  Unknown action. Use: move, park, photo, canteen")
        return False

    def check_game_over(self):
        # Check if all hikers have finished the trail
        all_done = True
        for p in [1, 2]:
            for pos in self.hiker_positions[p]:
                if pos < len(self.trail):
                    all_done = False
                    break

        if all_done:
            if self.season >= self.max_seasons:
                self.game_over = True
                s1 = self._player_score(0)
                s2 = self._player_score(1)
                if s1 > s2:
                    self.winner = 1
                elif s2 > s1:
                    self.winner = 2
                else:
                    # Tie-break: most resources
                    r1 = sum(self.player_resources[0].values())
                    r2 = sum(self.player_resources[1].values())
                    if r1 > r2:
                        self.winner = 1
                    elif r2 > r1:
                        self.winner = 2
                    else:
                        self.winner = None
            else:
                # Start next season
                self.season += 1
                self._setup_season()
                self.current_player = 1  # reset to player 1

    def get_state(self):
        return {
            "trail": list(self.trail),
            "trail_end": self.trail_end,
            "hiker_positions": {str(k): list(v) for k, v in self.hiker_positions.items()},
            "player_resources": [dict(r) for r in self.player_resources],
            "player_parks": [list(p) for p in self.player_parks],
            "player_photos": list(self.player_photos),
            "park_display": list(self.park_display),
            "park_deck": list(self.park_deck),
            "season": self.season,
            "max_seasons": self.max_seasons,
            "canteen": list(self.canteen),
            "season_bonus_resource": self.season_bonus_resource,
            "hikers_finished": {str(k): v for k, v in self.hikers_finished.items()},
        }

    def load_state(self, state):
        self.trail = list(state["trail"])
        self.trail_end = state["trail_end"]
        self.hiker_positions = {int(k): list(v) for k, v in state["hiker_positions"].items()}
        self.player_resources = [dict(r) for r in state["player_resources"]]
        self.player_parks = [list(p) for p in state["player_parks"]]
        self.player_photos = list(state["player_photos"])
        self.park_display = list(state["park_display"])
        self.park_deck = list(state["park_deck"])
        self.season = state["season"]
        self.max_seasons = state["max_seasons"]
        self.canteen = list(state["canteen"])
        self.season_bonus_resource = state["season_bonus_resource"]
        self.hikers_finished = {int(k): v for k, v in state["hikers_finished"].items()}

    def get_tutorial(self):
        return """
==================================================
  PARKS - Tutorial
==================================================

  OVERVIEW:
  PARKS is a nature trail hiking game. Move your
  two hikers along a trail to collect resources
  and visit national parks for victory points.

  RESOURCES:
  S = Sun    W = Water    M = Mountain
  F = Forest    * = Wildlife

  SETUP:
  Each player has 2 hikers. The trail has various
  sites that give resources when you land on them.

  ON YOUR TURN, choose ONE action:

  1. MOVE A HIKER
     Move one of your hikers forward to any
     unoccupied site on the trail.
     You MUST move forward (no going back).
     Collect the resources shown on that site.
     Command: move H POS  (hiker 1/2, position #)
     Command: move H end  (move to trail end)

  2. VISIT A PARK (at trail end)
     When a hiker reaches the trail end, you can
     pay resources to visit a park for points.
     Command: park N  (park number 1-3)

  3. TAKE A PHOTO (at trail end)
     Instead of visiting a park, earn 1 point.
     Command: photo

  4. USE CANTEEN
     Once per season, gain 1 resource of choice.
     Command: canteen RESOURCE

  TRAIL RULES:
  - Sites can only hold one hiker at a time.
  - You must always move forward.
  - When all hikers reach the end, a new season
    starts with a new trail layout.

  SEASON BONUS:
  Each season, one resource type is boosted. When
  you land on a site that gives that resource,
  you gain 1 extra of it.

  WINNING:
  - Standard: play 4 seasons
  - Short: play 2 seasons
  After the final season, highest score wins.
  Score = park points + photos
  Tie-break: most total resources remaining.

  STRATEGY HINTS:
  - Plan your hiker moves to collect what you
    need for available parks.
  - Don't rush to the end - collect resources!
  - The canteen is a free resource once per season.
  - Watch what parks are available and plan ahead.
  - Block valuable sites from your opponent.

==================================================
"""
