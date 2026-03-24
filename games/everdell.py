"""Everdell - A worker placement and tableau-building game in a woodland city."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Resources
RESOURCES = ["twigs", "resin", "pebbles", "berries"]
RESOURCE_SYMBOLS = {"twigs": "T", "resin": "R", "pebbles": "P", "berries": "B"}

# Seasons and worker counts gained at start of each season
SEASONS = ["Winter", "Spring", "Summer", "Autumn"]
# Workers available at start of each season (cumulative)
SEASON_WORKERS = {
    "Winter": 2,
    "Spring": 3,
    "Summer": 4,
    "Autumn": 6,
}

# Worker placement locations
WORKER_SPOTS = [
    {"name": "Forest: 3 Twigs", "gain": {"twigs": 3}, "limit": 1},
    {"name": "Forest: 2 Resin", "gain": {"resin": 2}, "limit": 1},
    {"name": "Forest: 2 Pebbles", "gain": {"pebbles": 2}, "limit": 1},
    {"name": "Forest: 3 Berries", "gain": {"berries": 3}, "limit": 1},
    {"name": "Forest: 1 Twig + 1 Resin", "gain": {"twigs": 1, "resin": 1}, "limit": 1},
    {"name": "Forest: 1 Pebble + 1 Berry", "gain": {"pebbles": 1, "berries": 1}, "limit": 1},
    {"name": "Haven: draw 2 cards", "gain": "draw2", "limit": 2},
    {"name": "Journey: discard cards for points", "gain": "journey", "limit": 2},
]

# Card types: Construction or Critter
# Each card: name, type, cost, points, ability description
CARD_POOL = [
    # Constructions
    {"name": "Twig Barge", "type": "construction", "cost": {"twigs": 2},
     "points": 1, "ability": "Gain 1 twig when played", "on_play": {"twigs": 1}},
    {"name": "Resin Refinery", "type": "construction", "cost": {"resin": 1, "pebbles": 1},
     "points": 2, "ability": "Gain 1 resin when played", "on_play": {"resin": 1}},
    {"name": "Mine", "type": "construction", "cost": {"twigs": 1, "pebbles": 2},
     "points": 2, "ability": "Gain 1 pebble when played", "on_play": {"pebbles": 1}},
    {"name": "Farm", "type": "construction", "cost": {"twigs": 2, "resin": 1},
     "points": 2, "ability": "Gain 1 berry when played", "on_play": {"berries": 1}},
    {"name": "General Store", "type": "construction", "cost": {"resin": 1, "pebbles": 1},
     "points": 2, "ability": "Gain 1 berry when played", "on_play": {"berries": 1}},
    {"name": "Inn", "type": "construction", "cost": {"twigs": 2, "resin": 1},
     "points": 2, "ability": "Draw 1 card when played", "on_play": "draw1"},
    {"name": "Post Office", "type": "construction", "cost": {"twigs": 1, "resin": 1},
     "points": 1, "ability": "Draw 1 card when played", "on_play": "draw1"},
    {"name": "Chapel", "type": "construction", "cost": {"twigs": 2, "resin": 1, "pebbles": 1},
     "points": 3, "ability": "+1 point for each critter you have",
     "scoring": "critter_count"},
    {"name": "Palace", "type": "construction", "cost": {"twigs": 2, "resin": 2, "pebbles": 3},
     "points": 5, "ability": "Grand building worth 5 points", "on_play": None},
    {"name": "Clock Tower", "type": "construction", "cost": {"twigs": 3, "pebbles": 1},
     "points": 3, "ability": "Gain 1 of each resource when played",
     "on_play": {"twigs": 1, "resin": 1, "pebbles": 1, "berries": 1}},
    {"name": "Lookout", "type": "construction", "cost": {"twigs": 1, "pebbles": 1},
     "points": 2, "ability": "Draw 1 card when played", "on_play": "draw1"},
    {"name": "Storehouse", "type": "construction",
     "cost": {"twigs": 1, "resin": 1, "pebbles": 1},
     "points": 2, "ability": "Gain 2 twigs when played", "on_play": {"twigs": 2}},
    # Critters
    {"name": "Wanderer", "type": "critter", "cost": {"berries": 2},
     "points": 1, "ability": "Draw 2 cards when played", "on_play": "draw2"},
    {"name": "Ranger", "type": "critter", "cost": {"berries": 2},
     "points": 2, "ability": "Gain 1 twig when played", "on_play": {"twigs": 1}},
    {"name": "Monk", "type": "critter", "cost": {"berries": 1},
     "points": 1, "ability": "Gain 1 berry when played", "on_play": {"berries": 1}},
    {"name": "Shopkeeper", "type": "critter", "cost": {"berries": 2},
     "points": 2, "ability": "Gain 1 berry for each construction you have",
     "on_play": "berry_per_construction"},
    {"name": "Architect", "type": "critter", "cost": {"berries": 3},
     "points": 2, "ability": "Gain 1 resin and 1 pebble when played",
     "on_play": {"resin": 1, "pebbles": 1}},
    {"name": "Bard", "type": "critter", "cost": {"berries": 2},
     "points": 1, "ability": "Draw 2 cards when played", "on_play": "draw2"},
    {"name": "Queen", "type": "critter", "cost": {"berries": 5},
     "points": 4, "ability": "Royal critter worth 4 points", "on_play": None},
    {"name": "King", "type": "critter", "cost": {"berries": 6},
     "points": 5, "ability": "+1 point per construction in city",
     "scoring": "construction_count"},
    {"name": "Miner", "type": "critter", "cost": {"berries": 3},
     "points": 2, "ability": "Gain 2 pebbles when played", "on_play": {"pebbles": 2}},
    {"name": "Woodcarver", "type": "critter", "cost": {"berries": 2},
     "points": 1, "ability": "Gain 2 twigs when played", "on_play": {"twigs": 2}},
    {"name": "Postal Pigeon", "type": "critter", "cost": {"berries": 2},
     "points": 1, "ability": "Draw 2 cards when played", "on_play": "draw2"},
    {"name": "Fool", "type": "critter", "cost": {"berries": 1},
     "points": 0, "ability": "Cheap critter, no special ability", "on_play": None},
]

# Events (bonus scoring for end-game conditions)
EVENTS = [
    {"name": "Grand Tour", "description": "3 pts if you have 5+ constructions",
     "check": "constructions_5", "points": 3},
    {"name": "Critter Parade", "description": "3 pts if you have 5+ critters",
     "check": "critters_5", "points": 3},
    {"name": "Big City", "description": "4 pts if city has 10+ cards",
     "check": "city_10", "points": 4},
    {"name": "Rich Harvest", "description": "2 pts if you have 3+ of each resource",
     "check": "rich_harvest", "points": 2},
]


def _copy_dict(d):
    return {k: v for k, v in d.items()}


def _copy_card(card):
    return {k: (_copy_dict(v) if isinstance(v, dict) else v) for k, v in card.items()}


class EverdellGame(BaseGame):
    """Everdell: Build a woodland city through worker placement and card play."""

    name = "Everdell"
    description = "A worker placement and tableau-building game in a woodland city"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Everdell (4 seasons, 15-card city limit)",
        "beginner": "Beginner mode (3 seasons, extra starting resources)",
    }

    MAX_CITY_SIZE = 15

    def __init__(self, variation=None):
        super().__init__(variation)
        self.resources = [{}, {}]
        self.hands = [[], []]
        self.cities = [[], []]  # cards played into each player's city
        self.draw_pile = []
        self.meadow = []  # shared face-up card market (8 cards)
        self.workers_total = [0, 0]
        self.workers_placed = [[], []]  # list of spot indices where workers are
        self.season = [0, 0]  # season index per player (0=winter..3=autumn)
        self.season_advanced = [False, False]
        self.events_claimed = [[], []]
        self.available_events = []
        self.spot_occupants = {}  # spot_idx -> list of player indices
        self.scores = [0, 0]
        self.max_seasons = 4

    def setup(self):
        beginner = self.variation == "beginner"
        self.max_seasons = 3 if beginner else 4

        # Build and shuffle the draw pile (2 copies of each card)
        self.draw_pile = []
        for card in CARD_POOL:
            self.draw_pile.append(_copy_card(card))
            self.draw_pile.append(_copy_card(card))
        random.shuffle(self.draw_pile)

        # Deal starting hands
        hand_size = 5 if not beginner else 7
        for p in range(2):
            self.hands[p] = [self.draw_pile.pop() for _ in range(hand_size)]

        # Set up meadow (shared market of 8 face-up cards)
        self.meadow = [self.draw_pile.pop() for _ in range(8)]

        # Starting resources
        for p in range(2):
            if beginner:
                self.resources[p] = {"twigs": 3, "resin": 2, "pebbles": 2, "berries": 3}
            else:
                self.resources[p] = {"twigs": 0, "resin": 0, "pebbles": 0, "berries": 0}

        # Workers
        for p in range(2):
            self.workers_total[p] = SEASON_WORKERS["Winter"]
            self.workers_placed[p] = []

        self.season = [0, 0]
        self.season_advanced = [False, False]
        self.cities = [[], []]
        self.spot_occupants = {}

        # Events
        self.available_events = [_copy_dict(e) for e in EVENTS]
        self.events_claimed = [[], []]

        self._calc_scores()

    def _draw_card(self):
        if self.draw_pile:
            return self.draw_pile.pop()
        return None

    def _refill_meadow(self):
        while len(self.meadow) < 8 and self.draw_pile:
            self.meadow.append(self.draw_pile.pop())

    def _available_workers(self, p):
        return self.workers_total[p] - len(self.workers_placed[p])

    def _res_str(self, res):
        parts = []
        for r in RESOURCES:
            v = res.get(r, 0)
            parts.append(f"{RESOURCE_SYMBOLS[r]}:{v}")
        return " ".join(parts)

    def _cost_str(self, cost):
        parts = []
        for r in RESOURCES:
            v = cost.get(r, 0)
            if v > 0:
                parts.append(f"{RESOURCE_SYMBOLS[r]}:{v}")
        return " ".join(parts) if parts else "free"

    def _can_pay(self, p, cost):
        for r in RESOURCES:
            if cost.get(r, 0) > self.resources[p].get(r, 0):
                return False
        return True

    def _pay_cost(self, p, cost):
        for r in RESOURCES:
            self.resources[p][r] = self.resources[p].get(r, 0) - cost.get(r, 0)

    def _apply_on_play(self, p, card):
        effect = card.get("on_play")
        if effect is None:
            return
        if isinstance(effect, dict):
            for r, v in effect.items():
                self.resources[p][r] = self.resources[p].get(r, 0) + v
        elif effect == "draw1":
            c = self._draw_card()
            if c:
                self.hands[p].append(c)
        elif effect == "draw2":
            for _ in range(2):
                c = self._draw_card()
                if c:
                    self.hands[p].append(c)
        elif effect == "berry_per_construction":
            count = sum(1 for c in self.cities[p] if c["type"] == "construction")
            self.resources[p]["berries"] = self.resources[p].get("berries", 0) + count

    def _calc_scores(self):
        for p in range(2):
            total = 0
            construction_count = 0
            critter_count = 0
            for card in self.cities[p]:
                total += card.get("points", 0)
                if card["type"] == "construction":
                    construction_count += 1
                else:
                    critter_count += 1
                # Bonus scoring abilities
                scoring = card.get("scoring")
                if scoring == "critter_count":
                    total += critter_count
                elif scoring == "construction_count":
                    total += construction_count
            # Events
            for event in self.events_claimed[p]:
                total += event.get("points", 0)
            self.scores[p] = total

    def _check_event(self, p, event):
        check = event.get("check", "")
        if check == "constructions_5":
            return sum(1 for c in self.cities[p] if c["type"] == "construction") >= 5
        elif check == "critters_5":
            return sum(1 for c in self.cities[p] if c["type"] == "critter") >= 5
        elif check == "city_10":
            return len(self.cities[p]) >= 10
        elif check == "rich_harvest":
            return all(self.resources[p].get(r, 0) >= 3 for r in RESOURCES)
        return False

    def display(self):
        mode = "Standard" if self.variation != "beginner" else "Beginner"
        print(f"\n  === Everdell ({mode}) ===")
        print(f"  {self.players[0]} ({SEASONS[self.season[0]]}): {self.scores[0]} pts  |  "
              f"{self.players[1]} ({SEASONS[self.season[1]]}): {self.scores[1]} pts")
        print(f"  Current turn: {self.players[self.current_player - 1]}")

        # Meadow
        print("\n  --- Meadow (shared card market) ---")
        for i, card in enumerate(self.meadow):
            ctype = "C" if card["type"] == "construction" else "R"
            print(f"    [{i + 1}] ({ctype}) {card['name']} "
                  f"cost:{self._cost_str(card['cost'])} {card['points']}pts "
                  f"| {card['ability']}")

        # Worker placement spots
        print("\n  --- Worker Spots ---")
        for i, spot in enumerate(WORKER_SPOTS):
            occupants = self.spot_occupants.get(i, [])
            occ_str = ""
            if occupants:
                occ_names = [f"P{o + 1}" for o in occupants]
                occ_str = f" [occupied: {','.join(occ_names)}]"
            full = len(occupants) >= spot["limit"]
            status = " FULL" if full else ""
            print(f"    [{i + 1}] {spot['name']}{occ_str}{status}")

        # Events
        if self.available_events:
            print("\n  --- Events (claimable) ---")
            for i, event in enumerate(self.available_events):
                print(f"    [{i + 1}] {event['name']}: {event['description']}")

        # Both players
        for p in range(2):
            marker = " <<" if p == self.current_player - 1 else ""
            avail_w = self._available_workers(p)
            print(f"\n  --- {self.players[p]} (P{p + 1}) --- "
                  f"{SEASONS[self.season[p]]} | {self.scores[p]} pts | "
                  f"Workers: {avail_w}/{self.workers_total[p]}{marker}")
            print(f"  Resources: {self._res_str(self.resources[p])}")

            # Hand (only show to current player)
            if p == self.current_player - 1:
                print(f"  Hand ({len(self.hands[p])}):")
                for i, card in enumerate(self.hands[p]):
                    ctype = "C" if card["type"] == "construction" else "R"
                    print(f"    [{i + 1}] ({ctype}) {card['name']} "
                          f"cost:{self._cost_str(card['cost'])} {card['points']}pts")
            else:
                print(f"  Hand: {len(self.hands[p])} cards")

            # City
            print(f"  City ({len(self.cities[p])}/{self.MAX_CITY_SIZE}):")
            if not self.cities[p]:
                print("    (empty)")
            for i, card in enumerate(self.cities[p]):
                ctype = "C" if card["type"] == "construction" else "R"
                print(f"    ({ctype}) {card['name']} {card['points']}pts")

            # Claimed events
            if self.events_claimed[p]:
                print(f"  Events:")
                for event in self.events_claimed[p]:
                    print(f"    {event['name']} (+{event['points']}pts)")

    def get_move(self):
        p = self.current_player - 1
        avail_w = self._available_workers(p)
        print(f"\n  {self.players[p]}, choose an action:")
        print(f"    place N        - place a worker on spot N ({avail_w} workers available)")
        print("    play hand N    - play card N from your hand")
        print("    play meadow N  - play card N from the meadow")
        print("    claim N        - claim event N")
        print("    prepare        - prepare for next season (retrieve workers)")
        print("  Resources: T=twigs R=resin P=pebbles B=berries")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        p = self.current_player - 1
        parts = move.strip().split()
        if not parts:
            return False

        action = parts[0].lower()

        # --- Place a worker ---
        if action == "place":
            if len(parts) != 2:
                return False
            try:
                spot_idx = int(parts[1]) - 1
            except ValueError:
                return False
            if spot_idx < 0 or spot_idx >= len(WORKER_SPOTS):
                print("  Invalid spot number.")
                return False
            if self._available_workers(p) <= 0:
                print("  No workers available. Use 'prepare' to advance season.")
                return False
            spot = WORKER_SPOTS[spot_idx]
            occupants = self.spot_occupants.get(spot_idx, [])
            if len(occupants) >= spot["limit"]:
                print("  That spot is full.")
                return False

            # Place the worker
            self.workers_placed[p].append(spot_idx)
            if spot_idx not in self.spot_occupants:
                self.spot_occupants[spot_idx] = []
            self.spot_occupants[spot_idx].append(p)

            # Apply gain
            gain = spot["gain"]
            if isinstance(gain, dict):
                for r, v in gain.items():
                    self.resources[p][r] = self.resources[p].get(r, 0) + v
            elif gain == "draw2":
                for _ in range(2):
                    c = self._draw_card()
                    if c:
                        self.hands[p].append(c)
            elif gain == "journey":
                # Discard up to 3 cards from hand for 1 point each
                discarded = 0
                for _ in range(min(3, len(self.hands[p]))):
                    self.hands[p].pop()
                    discarded += 1
                # We track journey points as a pseudo-card in city
                if discarded > 0:
                    journey_card = {
                        "name": f"Journey ({discarded} cards)",
                        "type": "construction",
                        "cost": {},
                        "points": discarded,
                        "ability": "Journey points",
                        "on_play": None,
                    }
                    self.cities[p].append(journey_card)

            self._calc_scores()
            return True

        # --- Play a card ---
        if action == "play":
            if len(parts) != 3:
                return False
            source = parts[1].lower()
            try:
                idx = int(parts[2]) - 1
            except ValueError:
                return False

            if source == "hand":
                if idx < 0 or idx >= len(self.hands[p]):
                    print("  Invalid hand card number.")
                    return False
                card = self.hands[p][idx]
            elif source == "meadow":
                if idx < 0 or idx >= len(self.meadow):
                    print("  Invalid meadow card number.")
                    return False
                card = self.meadow[idx]
            else:
                return False

            # Check city size limit
            if len(self.cities[p]) >= self.MAX_CITY_SIZE:
                print(f"  City is full ({self.MAX_CITY_SIZE} cards max).")
                return False

            # Check cost
            if not self._can_pay(p, card["cost"]):
                print(f"  Cannot afford {card['name']}. "
                      f"Need: {self._cost_str(card['cost'])}")
                return False

            # Pay and play
            self._pay_cost(p, card["cost"])
            if source == "hand":
                self.hands[p].pop(idx)
            else:
                self.meadow.pop(idx)
                self._refill_meadow()

            self.cities[p].append(card)
            self._apply_on_play(p, card)
            self._calc_scores()
            return True

        # --- Claim an event ---
        if action == "claim":
            if len(parts) != 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.available_events):
                print("  Invalid event number.")
                return False
            event = self.available_events[idx]
            if not self._check_event(p, event):
                print(f"  You do not meet the requirements for {event['name']}.")
                return False
            self.events_claimed[p].append(self.available_events.pop(idx))
            self._calc_scores()
            return True

        # --- Prepare for next season ---
        if action == "prepare":
            if self.season[p] >= self.max_seasons - 1:
                print("  You are already in your final season. "
                      "You must pass by playing your remaining workers or "
                      "playing cards.")
                # Actually let them finish - mark as done
                self.season_advanced[p] = True
                # Retrieve workers
                for spot_idx in self.workers_placed[p]:
                    if spot_idx in self.spot_occupants:
                        if p in self.spot_occupants[spot_idx]:
                            self.spot_occupants[spot_idx].remove(p)
                self.workers_placed[p] = []
                return True

            # Advance season
            self.season[p] += 1
            new_season = SEASONS[self.season[p]]

            # Retrieve workers
            for spot_idx in self.workers_placed[p]:
                if spot_idx in self.spot_occupants:
                    if p in self.spot_occupants[spot_idx]:
                        self.spot_occupants[spot_idx].remove(p)
            self.workers_placed[p] = []

            # Gain new workers
            self.workers_total[p] = SEASON_WORKERS[new_season]

            # Season bonus: draw cards and gain resources
            if new_season == "Spring":
                # Draw 1 card
                c = self._draw_card()
                if c:
                    self.hands[p].append(c)
            elif new_season == "Summer":
                # Draw 1 card, gain 1 of each resource
                c = self._draw_card()
                if c:
                    self.hands[p].append(c)
                for r in RESOURCES:
                    self.resources[p][r] = self.resources[p].get(r, 0) + 1
            elif new_season == "Autumn":
                # Draw 2 cards
                for _ in range(2):
                    c = self._draw_card()
                    if c:
                        self.hands[p].append(c)

            self._calc_scores()
            return True

        return False

    def check_game_over(self):
        # Game ends when both players have advanced past their final season
        # and have no workers left to place
        both_done = True
        for p in range(2):
            in_final = self.season[p] >= self.max_seasons - 1
            no_workers = self._available_workers(p) <= 0
            advanced = self.season_advanced[p]
            if not (in_final and no_workers) and not advanced:
                both_done = False

        if both_done:
            self._calc_scores()
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "resources": [_copy_dict(r) for r in self.resources],
            "hands": [[_copy_card(c) for c in h] for h in self.hands],
            "cities": [[_copy_card(c) for c in ci] for ci in self.cities],
            "draw_pile": [_copy_card(c) for c in self.draw_pile],
            "meadow": [_copy_card(c) for c in self.meadow],
            "workers_total": list(self.workers_total),
            "workers_placed": [list(w) for w in self.workers_placed],
            "season": list(self.season),
            "season_advanced": list(self.season_advanced),
            "events_claimed": [[_copy_dict(e) for e in ec] for ec in self.events_claimed],
            "available_events": [_copy_dict(e) for e in self.available_events],
            "spot_occupants": {str(k): list(v) for k, v in self.spot_occupants.items()},
            "scores": list(self.scores),
            "max_seasons": self.max_seasons,
        }

    def load_state(self, state):
        self.resources = [_copy_dict(r) for r in state["resources"]]
        self.hands = [[_copy_card(c) for c in h] for h in state["hands"]]
        self.cities = [[_copy_card(c) for c in ci] for ci in state["cities"]]
        self.draw_pile = [_copy_card(c) for c in state["draw_pile"]]
        self.meadow = [_copy_card(c) for c in state["meadow"]]
        self.workers_total = list(state["workers_total"])
        self.workers_placed = [list(w) for w in state["workers_placed"]]
        self.season = list(state["season"])
        self.season_advanced = list(state["season_advanced"])
        self.events_claimed = [[_copy_dict(e) for e in ec] for ec in state["events_claimed"]]
        self.available_events = [_copy_dict(e) for e in state["available_events"]]
        self.spot_occupants = {int(k): list(v) for k, v in state["spot_occupants"].items()}
        self.scores = list(state["scores"])
        self.max_seasons = state["max_seasons"]

    def get_tutorial(self):
        return """
==================================================
  Everdell - Tutorial
==================================================

  OVERVIEW:
  Everdell is a worker placement and tableau-building
  game set in a charming woodland. Build a city of
  critters and constructions to score the most points
  across 4 seasons (3 in beginner mode).

  RESOURCES:
  T = Twigs, R = Resin, P = Pebbles, B = Berries
  Constructions cost twigs/resin/pebbles.
  Critters cost berries.

  SEASONS:
  The game progresses through seasons. Each player
  advances independently. New seasons grant more
  workers and bonuses:
  - Winter: 2 workers (starting season)
  - Spring: 3 workers, draw 1 card
  - Summer: 4 workers, draw 1 card + 1 each resource
  - Autumn: 6 workers, draw 2 cards

  ON YOUR TURN, choose ONE action:

  1. PLACE A WORKER
     Put a worker on a forest/haven/journey spot to
     gain its resources or effect.
     Command: place N  (N = spot number)

  2. PLAY A CARD
     Pay a card's cost to add it to your city.
     Cards come from your hand or the shared meadow.
     Your city can hold up to 15 cards.
     Command: play hand N   (from your hand)
     Command: play meadow N (from the meadow)

  3. CLAIM AN EVENT
     If you meet an event's condition, claim it for
     bonus points.
     Command: claim N

  4. PREPARE FOR NEXT SEASON
     Retrieve all your workers and advance to the
     next season, gaining new workers and bonuses.
     Command: prepare

  CARD TYPES:
  (C) = Construction - costs twigs/resin/pebbles
  (R) = Critter - costs berries
  Many cards give immediate bonuses when played and
  some have scoring abilities at game end.

  GAME END:
  The game ends when both players have completed
  their final season and used all their workers.
  Highest total score wins.

  SCORING:
  - Points printed on each card in your city
  - Bonus scoring from special card abilities
  - Claimed event bonuses

  STRATEGY:
  - Build resource-generating cards early to fund
    bigger plays later.
  - Balance workers and card plays efficiently.
  - Watch what your opponent takes from the meadow.
  - Time your season advancement carefully - you
    get more workers but your opponent gets more
    turns in the current season.
  - Aim for events that match your city composition.

  BEGINNER VARIATION:
  - Only 3 seasons (no Autumn)
  - Start with extra resources (3T, 2R, 2P, 3B)
  - Larger starting hand (7 cards)

==================================================
"""
