"""Wingspan Card Game - A bird-themed engine-building card game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Food types
FOOD_TYPES = ["Invertebrate", "Seed", "Fish", "Fruit", "Rodent"]
FOOD_ICONS = {"Invertebrate": "I", "Seed": "S", "Fish": "F", "Fruit": "U", "Rodent": "R"}

# Habitats
HABITATS = ["Forest", "Grassland", "Wetland"]
HABITAT_ACTIONS = {
    "Forest": "Gain 1 food from the birdfeeder",
    "Grassland": "Lay 1 egg on a bird with room",
    "Wetland": "Draw 1 bird card",
}

# Bird card definitions: (name, habitat, food_cost, points, egg_capacity, power)
BIRD_CARDS = [
    ("Robin", "Forest", ["Invertebrate"], 3, 3, "When played: draw 1 card"),
    ("Blue Jay", "Forest", ["Seed"], 4, 2, "When activated: gain 1 Seed"),
    ("Cardinal", "Forest", ["Seed", "Fruit"], 5, 3, "When played: draw 2 cards"),
    ("Woodpecker", "Forest", ["Invertebrate"], 4, 2, "When activated: gain 1 Invertebrate"),
    ("Owl", "Forest", ["Rodent"], 6, 2, "When activated: gain 1 Rodent"),
    ("Hawk", "Forest", ["Rodent", "Fish"], 7, 1, "Predator: worth 7 points"),
    ("Sparrow", "Grassland", ["Seed"], 2, 4, "When played: lay 1 egg"),
    ("Meadowlark", "Grassland", ["Invertebrate"], 3, 4, "When activated: lay 1 egg"),
    ("Quail", "Grassland", ["Seed"], 3, 5, "Nest: holds many eggs"),
    ("Prairie Chicken", "Grassland", ["Seed", "Invertebrate"], 4, 3, "When played: lay 2 eggs"),
    ("Killdeer", "Grassland", ["Invertebrate"], 2, 3, "When activated: lay 1 egg"),
    ("Pheasant", "Grassland", ["Seed", "Fruit"], 5, 4, "Display: worth 5 points"),
    ("Heron", "Wetland", ["Fish"], 4, 2, "When activated: gain 1 Fish"),
    ("Duck", "Wetland", ["Seed"], 2, 4, "When played: draw 1 card"),
    ("Pelican", "Wetland", ["Fish"], 5, 2, "When activated: gain 2 Fish"),
    ("Crane", "Wetland", ["Fish", "Invertebrate"], 6, 2, "When played: draw 2 cards"),
    ("Kingfisher", "Wetland", ["Fish"], 4, 3, "When activated: gain 1 Fish"),
    ("Egret", "Wetland", ["Fish", "Invertebrate"], 5, 2, "When activated: draw 1 card"),
    ("Finch", "Forest", ["Seed"], 2, 3, "When played: gain 1 Seed"),
    ("Warbler", "Forest", ["Invertebrate"], 3, 3, "When activated: draw 1 card"),
    ("Swallow", "Grassland", ["Invertebrate"], 2, 3, "When played: lay 1 egg"),
    ("Goose", "Wetland", ["Seed"], 3, 4, "When played: lay 1 egg"),
    ("Sandpiper", "Wetland", ["Invertebrate"], 2, 3, "When activated: draw 1 card"),
    ("Chickadee", "Forest", ["Seed", "Invertebrate"], 3, 3, "When activated: gain 1 food (any)"),
    ("Wren", "Forest", ["Invertebrate"], 2, 4, "Nest: holds many eggs"),
    ("Dove", "Grassland", ["Seed"], 3, 4, "When activated: lay 1 egg"),
    ("Flamingo", "Wetland", ["Fish", "Invertebrate"], 6, 2, "Display: worth 6 points"),
    ("Osprey", "Wetland", ["Fish"], 7, 1, "Predator: worth 7 points"),
    ("Eagle", "Forest", ["Rodent", "Fish"], 8, 1, "Predator: worth 8 points"),
    ("Crow", "Forest", ["Seed", "Fruit"], 4, 3, "When played: gain 2 food (any)"),
]

# Bonus cards
BONUS_CARDS = [
    ("Forest Lover", "Score 3 points for each bird in your Forest"),
    ("Grassland Lover", "Score 3 points for each bird in your Grassland"),
    ("Wetland Lover", "Score 3 points for each bird in your Wetland"),
    ("Egg Collector", "Score 1 point per egg on your birds"),
    ("Food Hoarder", "Score 1 point per cached food"),
    ("Bird Counter", "Score 2 points for each bird you played"),
]

# End-of-round goals
ROUND_GOALS = [
    ("Most birds in Forest", "forest_birds"),
    ("Most birds in Grassland", "grassland_birds"),
    ("Most birds in Wetland", "wetland_birds"),
    ("Most eggs on birds", "total_eggs"),
    ("Most cached food", "total_cached_food"),
    ("Most total birds", "total_birds"),
]


class BirdCard:
    """Represents a bird card."""
    def __init__(self, name, habitat, food_cost, points, egg_capacity, power):
        self.name = name
        self.habitat = habitat
        self.food_cost = list(food_cost)
        self.points = points
        self.egg_capacity = egg_capacity
        self.power = power
        self.eggs = 0
        self.cached_food = 0

    def to_dict(self):
        return {
            "name": self.name,
            "habitat": self.habitat,
            "food_cost": self.food_cost,
            "points": self.points,
            "egg_capacity": self.egg_capacity,
            "power": self.power,
            "eggs": self.eggs,
            "cached_food": self.cached_food,
        }

    @classmethod
    def from_dict(cls, d):
        b = cls(d["name"], d["habitat"], d["food_cost"], d["points"],
                d["egg_capacity"], d["power"])
        b.eggs = d["eggs"]
        b.cached_food = d["cached_food"]
        return b

    def cost_str(self):
        if not self.food_cost:
            return "Free"
        return "+".join(FOOD_ICONS.get(f, f[0]) for f in self.food_cost)

    def __str__(self):
        return (f"{self.name} [{self.habitat}] Cost:{self.cost_str()} "
                f"Pts:{self.points} Eggs:{self.eggs}/{self.egg_capacity} "
                f"Cache:{self.cached_food} | {self.power}")


class WingspanCardGame(BaseGame):
    """Wingspan Card Game: Build the best bird habitats to score points."""

    name = "Wingspan Card"
    description = "A bird-themed engine-building card game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - 4 rounds, 8 turns per round",
        "quick": "Quick game - 3 rounds, 5 turns per round",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_rounds = 4
        self.turns_per_round = 8
        self.deck = []
        self.hands = [[], []]       # bird cards in hand (list of BirdCard)
        self.food = [{}, {}]        # food supply per player {type: count}
        self.habitats = [           # per player: {habitat: [BirdCard]}
            {"Forest": [], "Grassland": [], "Wetland": []},
            {"Forest": [], "Grassland": [], "Wetland": []},
        ]
        self.bonus_cards = [None, None]  # one bonus per player
        self.round_goals = []       # selected round goals
        self.round_scores = [[], []]  # round goal scores
        self.birdfeeder = []        # food dice in the feeder
        self.tray = []              # face-up bird cards to draw
        self.round_number = 1
        self.turns_left = [0, 0]    # turns left this round per player
        self.round_over = False

    def setup(self):
        if self.variation == "quick":
            self.num_rounds = 3
            self.turns_per_round = 5
        else:
            self.num_rounds = 4
            self.turns_per_round = 8

        # Build deck
        self.deck = []
        for name, habitat, cost, pts, cap, power in BIRD_CARDS:
            self.deck.append(BirdCard(name, habitat, cost, pts, cap, power))
            # Add a second copy of cheaper birds
            if pts <= 4:
                self.deck.append(BirdCard(name, habitat, cost, pts, cap, power))
        random.shuffle(self.deck)

        # Deal starting hands (5 cards each, keep all in this version)
        self.hands = [[], []]
        for _ in range(5):
            for pi in range(2):
                if self.deck:
                    self.hands[pi].append(self.deck.pop())

        # Starting food: 1 of each type (simplified)
        self.food = [
            {"Invertebrate": 1, "Seed": 1, "Fish": 1, "Fruit": 1, "Rodent": 1},
            {"Invertebrate": 1, "Seed": 1, "Fish": 1, "Fruit": 1, "Rodent": 1},
        ]

        self.habitats = [
            {"Forest": [], "Grassland": [], "Wetland": []},
            {"Forest": [], "Grassland": [], "Wetland": []},
        ]

        # Assign bonus cards
        bonus_pool = list(BONUS_CARDS)
        random.shuffle(bonus_pool)
        self.bonus_cards = [bonus_pool[0], bonus_pool[1]]

        # Select round goals
        goal_pool = list(ROUND_GOALS)
        random.shuffle(goal_pool)
        self.round_goals = goal_pool[:self.num_rounds]

        self.round_scores = [[], []]

        # Fill birdfeeder
        self._refill_birdfeeder()

        # Fill tray (3 face-up cards)
        self.tray = []
        for _ in range(3):
            if self.deck:
                self.tray.append(self.deck.pop())

        self.round_number = 1
        self.turns_left = [self.turns_per_round, self.turns_per_round]
        self.round_over = False
        self.current_player = 1

    def _refill_birdfeeder(self):
        """Refill the birdfeeder with random food."""
        self.birdfeeder = [random.choice(FOOD_TYPES) for _ in range(5)]

    def _refill_tray(self):
        """Top up the face-up tray to 3 cards."""
        while len(self.tray) < 3 and self.deck:
            self.tray.append(self.deck.pop())

    def _evaluate_goal(self, player_idx, goal_key):
        """Evaluate a round goal for a player."""
        h = self.habitats[player_idx]
        if goal_key == "forest_birds":
            return len(h["Forest"])
        elif goal_key == "grassland_birds":
            return len(h["Grassland"])
        elif goal_key == "wetland_birds":
            return len(h["Wetland"])
        elif goal_key == "total_eggs":
            return sum(b.eggs for hab in h.values() for b in hab)
        elif goal_key == "total_cached_food":
            return sum(b.cached_food for hab in h.values() for b in hab)
        elif goal_key == "total_birds":
            return sum(len(hab) for hab in h.values())
        return 0

    def _score_bonus(self, player_idx):
        """Score bonus card for a player."""
        if not self.bonus_cards[player_idx]:
            return 0
        name, _ = self.bonus_cards[player_idx]
        h = self.habitats[player_idx]
        if name == "Forest Lover":
            return len(h["Forest"]) * 3
        elif name == "Grassland Lover":
            return len(h["Grassland"]) * 3
        elif name == "Wetland Lover":
            return len(h["Wetland"]) * 3
        elif name == "Egg Collector":
            return sum(b.eggs for hab in h.values() for b in hab)
        elif name == "Food Hoarder":
            return sum(b.cached_food for hab in h.values() for b in hab)
        elif name == "Bird Counter":
            return sum(len(hab) for hab in h.values()) * 2
        return 0

    def _calculate_final_scores(self):
        """Calculate final scores for both players."""
        scores = [0, 0]
        for pi in range(2):
            # Points from birds
            for hab in self.habitats[pi].values():
                for bird in hab:
                    scores[pi] += bird.points
            # Points from eggs (1 pt each)
            for hab in self.habitats[pi].values():
                for bird in hab:
                    scores[pi] += bird.eggs
            # Points from cached food (1 pt each)
            for hab in self.habitats[pi].values():
                for bird in hab:
                    scores[pi] += bird.cached_food
            # Bonus card
            scores[pi] += self._score_bonus(pi)
            # Round goal scores
            for rs in self.round_scores[pi]:
                scores[pi] += rs
        return scores

    def _activate_habitat_birds(self, player_idx, habitat):
        """Activate powers of birds in a habitat (right to left)."""
        birds = self.habitats[player_idx][habitat]
        for bird in reversed(birds):
            power = bird.power.lower()
            if "when activated" not in power:
                continue
            if "gain 1 seed" in power:
                self.food[player_idx]["Seed"] = self.food[player_idx].get("Seed", 0) + 1
            elif "gain 1 invertebrate" in power:
                self.food[player_idx]["Invertebrate"] = self.food[player_idx].get("Invertebrate", 0) + 1
            elif "gain 1 rodent" in power:
                self.food[player_idx]["Rodent"] = self.food[player_idx].get("Rodent", 0) + 1
            elif "gain 1 fish" in power:
                self.food[player_idx]["Fish"] = self.food[player_idx].get("Fish", 0) + 1
            elif "gain 2 fish" in power:
                self.food[player_idx]["Fish"] = self.food[player_idx].get("Fish", 0) + 2
            elif "gain 1 food (any)" in power:
                if self.birdfeeder:
                    gained = random.choice(self.birdfeeder)
                    self.food[player_idx][gained] = self.food[player_idx].get(gained, 0) + 1
            elif "lay 1 egg" in power:
                if bird.eggs < bird.egg_capacity:
                    bird.eggs += 1
            elif "draw 1 card" in power:
                if self.deck:
                    self.hands[player_idx].append(self.deck.pop())

    def _apply_play_power(self, player_idx, bird):
        """Apply a bird's 'when played' power."""
        power = bird.power.lower()
        if "when played" not in power:
            return
        if "draw 1 card" in power:
            if self.deck:
                self.hands[player_idx].append(self.deck.pop())
        elif "draw 2 cards" in power:
            for _ in range(2):
                if self.deck:
                    self.hands[player_idx].append(self.deck.pop())
        elif "lay 1 egg" in power:
            if bird.eggs < bird.egg_capacity:
                bird.eggs += 1
        elif "lay 2 eggs" in power:
            bird.eggs = min(bird.eggs + 2, bird.egg_capacity)
        elif "gain 1 seed" in power:
            self.food[player_idx]["Seed"] = self.food[player_idx].get("Seed", 0) + 1
        elif "gain 2 food (any)" in power:
            for _ in range(2):
                f = random.choice(FOOD_TYPES)
                self.food[player_idx][f] = self.food[player_idx].get(f, 0) + 1

    def display(self):
        pi = self.current_player - 1

        print(f"\n  === WINGSPAN CARD GAME === Round {self.round_number}/{self.num_rounds}")
        print(f"  Turns left: {self.players[0]}={self.turns_left[0]}  {self.players[1]}={self.turns_left[1]}")
        print(f"  Current: {self.players[pi]}")

        if self.round_number <= len(self.round_goals):
            goal_name, _ = self.round_goals[self.round_number - 1]
            print(f"  Round Goal: {goal_name}")
        print()

        # Show current player's habitats
        print(f"  --- {self.players[pi]}'s Habitats ---")
        for hab in HABITATS:
            action = HABITAT_ACTIONS[hab]
            birds = self.habitats[pi][hab]
            print(f"  [{hab}] Action: {action}")
            if birds:
                for i, bird in enumerate(birds):
                    egg_str = "o" * bird.eggs + "." * (bird.egg_capacity - bird.eggs)
                    print(f"    {i+1}. {bird.name} ({bird.points}pts) "
                          f"Eggs:[{egg_str}] Cache:{bird.cached_food} | {bird.power}")
            else:
                print(f"    (empty)")
        print()

        # Show food supply
        food_str = "  Food: "
        for ft in FOOD_TYPES:
            count = self.food[pi].get(ft, 0)
            food_str += f"{FOOD_ICONS[ft]}={count} "
        print(food_str)

        # Show birdfeeder
        feeder_str = "  Birdfeeder: " + " ".join(FOOD_ICONS.get(f, "?") for f in self.birdfeeder)
        print(feeder_str)
        print()

        # Show hand
        print(f"  Hand ({len(self.hands[pi])} cards):")
        for i, card in enumerate(self.hands[pi]):
            print(f"    {i+1}. {card}")
        print()

        # Show tray
        print(f"  Face-up Tray:")
        for i, card in enumerate(self.tray):
            print(f"    {i+1}. {card.name} [{card.habitat}] Cost:{card.cost_str()} Pts:{card.points}")
        print()

        # Show bonus card
        if self.bonus_cards[pi]:
            bname, bdesc = self.bonus_cards[pi]
            print(f"  Bonus Card: {bname} - {bdesc}")
        print()

        # Opponent summary
        oi = 1 - pi
        opp_birds = sum(len(self.habitats[oi][h]) for h in HABITATS)
        opp_eggs = sum(b.eggs for h in HABITATS for b in self.habitats[oi][h])
        print(f"  Opponent ({self.players[oi]}): {opp_birds} birds, {opp_eggs} eggs, {len(self.hands[oi])} cards in hand")

    def get_move(self):
        pi = self.current_player - 1

        print("  Actions:")
        print("    play <hand#> <habitat>  - Play a bird card (e.g. play 1 forest)")
        print("    food                    - Gain food (Forest action)")
        print("    egg                     - Lay eggs (Grassland action)")
        print("    draw [tray#|deck]       - Draw bird cards (Wetland action)")
        print()

        raw = input_with_quit(f"  {self.players[pi]}> ").strip().lower()
        parts = raw.split()
        if not parts:
            return None

        action = parts[0]

        if action == "play" and len(parts) >= 3:
            try:
                card_idx = int(parts[1]) - 1
            except ValueError:
                return None
            habitat = parts[2].capitalize()
            if habitat not in HABITATS:
                return None
            return ("play", card_idx, habitat)

        elif action == "food":
            return ("food",)

        elif action == "egg":
            return ("egg",)

        elif action == "draw":
            if len(parts) >= 2:
                if parts[1] == "deck":
                    return ("draw", "deck")
                try:
                    tray_idx = int(parts[1]) - 1
                    return ("draw", tray_idx)
                except ValueError:
                    return None
            return ("draw", "deck")

        return None

    def make_move(self, move):
        if move is None:
            return False

        pi = self.current_player - 1
        action = move[0]

        if action == "play":
            _, card_idx, habitat = move
            if card_idx < 0 or card_idx >= len(self.hands[pi]):
                print("  Invalid card number!")
                return False

            bird = self.hands[pi][card_idx]

            # Check habitat match
            if bird.habitat != habitat:
                print(f"  {bird.name} belongs in {bird.habitat}, not {habitat}!")
                return False

            # Check habitat capacity (max 5 birds per habitat)
            if len(self.habitats[pi][habitat]) >= 5:
                print(f"  {habitat} is full (max 5 birds)!")
                return False

            # Check food cost - need egg cost for column position
            col = len(self.habitats[pi][habitat])
            egg_cost = 0
            if col >= 2:
                egg_cost = 1
            if col >= 4:
                egg_cost = 2

            # Check food
            for food_needed in bird.food_cost:
                if self.food[pi].get(food_needed, 0) < 1:
                    # Check for wild food (any food can substitute if player has extra)
                    print(f"  Not enough {food_needed}! You need: {bird.cost_str()}")
                    return False

            # Check eggs for column cost
            total_eggs = sum(b.eggs for h in HABITATS for b in self.habitats[pi][h])
            if total_eggs < egg_cost:
                print(f"  Need {egg_cost} egg(s) to place in column {col + 1}!")
                return False

            # Pay food cost
            for food_needed in bird.food_cost:
                self.food[pi][food_needed] -= 1

            # Pay egg cost (remove from any birds)
            eggs_to_remove = egg_cost
            for hab in HABITATS:
                for b in self.habitats[pi][hab]:
                    while eggs_to_remove > 0 and b.eggs > 0:
                        b.eggs -= 1
                        eggs_to_remove -= 1

            # Place bird
            self.hands[pi].pop(card_idx)
            self.habitats[pi][habitat].append(bird)

            # Apply when-played power
            self._apply_play_power(pi, bird)

            self.turns_left[pi] -= 1
            return True

        elif action == "food":
            # Forest action: gain food from birdfeeder
            if not self.birdfeeder:
                self._refill_birdfeeder()
            if self.birdfeeder:
                gained = self.birdfeeder.pop(random.randint(0, len(self.birdfeeder) - 1))
                self.food[pi][gained] = self.food[pi].get(gained, 0) + 1
                print(f"  Gained 1 {gained} from the birdfeeder.")
                if not self.birdfeeder:
                    self._refill_birdfeeder()

            # Activate forest birds
            self._activate_habitat_birds(pi, "Forest")

            self.turns_left[pi] -= 1
            return True

        elif action == "egg":
            # Grassland action: lay an egg
            # Find a bird with room for eggs
            all_birds = [(h, i, b) for h in HABITATS
                         for i, b in enumerate(self.habitats[pi][h])
                         if b.eggs < b.egg_capacity]
            if all_birds:
                # Lay on the bird with most capacity remaining
                all_birds.sort(key=lambda x: x[2].egg_capacity - x[2].eggs, reverse=True)
                hab, idx, bird = all_birds[0]
                bird.eggs += 1
                print(f"  Laid an egg on {bird.name} in {hab}.")
            else:
                print("  No birds with room for eggs! Turn spent anyway.")

            # Activate grassland birds
            self._activate_habitat_birds(pi, "Grassland")

            self.turns_left[pi] -= 1
            return True

        elif action == "draw":
            source = move[1] if len(move) > 1 else "deck"
            if isinstance(source, int):
                # Draw from tray
                if source < 0 or source >= len(self.tray):
                    print("  Invalid tray position!")
                    return False
                card = self.tray.pop(source)
                self.hands[pi].append(card)
                self._refill_tray()
                print(f"  Drew {card.name} from the tray.")
            else:
                # Draw from deck
                if self.deck:
                    card = self.deck.pop()
                    self.hands[pi].append(card)
                    print(f"  Drew {card.name} from the deck.")
                else:
                    print("  Deck is empty!")
                    return False

            # Activate wetland birds
            self._activate_habitat_birds(pi, "Wetland")

            self.turns_left[pi] -= 1
            return True

        return False

    def _end_round(self):
        """Handle end of round scoring and setup."""
        if self.round_number <= len(self.round_goals):
            goal_name, goal_key = self.round_goals[self.round_number - 1]
            scores = [self._evaluate_goal(i, goal_key) for i in range(2)]
            for i in range(2):
                if scores[i] > scores[1 - i]:
                    self.round_scores[i].append(4)
                elif scores[i] == scores[1 - i]:
                    self.round_scores[i].append(2)
                else:
                    self.round_scores[i].append(1)

            clear_screen()
            print(f"\n  === End of Round {self.round_number} ===")
            print(f"  Goal: {goal_name}")
            for i in range(2):
                print(f"  {self.players[i]}: {scores[i]} -> earns {self.round_scores[i][-1]} points")
            input("\n  Press Enter to continue...")

    def check_game_over(self):
        # Check if both players used all turns this round
        if self.turns_left[0] <= 0 and self.turns_left[1] <= 0:
            self._end_round()
            if self.round_number >= self.num_rounds:
                # Game over - final scoring
                self.game_over = True
                final = self._calculate_final_scores()
                clear_screen()
                print("\n  === FINAL SCORING ===")
                for i in range(2):
                    bird_pts = sum(b.points for h in HABITATS for b in self.habitats[i][h])
                    egg_pts = sum(b.eggs for h in HABITATS for b in self.habitats[i][h])
                    cache_pts = sum(b.cached_food for h in HABITATS for b in self.habitats[i][h])
                    bonus_pts = self._score_bonus(i)
                    round_pts = sum(self.round_scores[i])
                    print(f"\n  {self.players[i]}:")
                    print(f"    Birds: {bird_pts}")
                    print(f"    Eggs:  {egg_pts}")
                    print(f"    Cache: {cache_pts}")
                    print(f"    Bonus: {bonus_pts} ({self.bonus_cards[i][0] if self.bonus_cards[i] else 'none'})")
                    print(f"    Goals: {round_pts}")
                    print(f"    TOTAL: {final[i]}")

                if final[0] > final[1]:
                    self.winner = 1
                elif final[1] > final[0]:
                    self.winner = 2
                else:
                    self.winner = None
                input("\n  Press Enter...")
            else:
                # Next round
                self.round_number += 1
                # Each round players get 1 fewer turn (like wingspan)
                turns = self.turns_per_round - (self.round_number - 1)
                if turns < 3:
                    turns = 3
                self.turns_left = [turns, turns]
                self.current_player = 1
        else:
            # Switch to player who still has turns, or alternate
            if self.turns_left[self.current_player - 1] <= 0:
                # Current player done, don't switch back to them
                other = 2 if self.current_player == 1 else 1
                if self.turns_left[other - 1] > 0:
                    self.current_player = other

    def switch_player(self):
        """Override to handle asymmetric turn counts."""
        other = 2 if self.current_player == 1 else 1
        if self.turns_left[other - 1] > 0:
            self.current_player = other
        # If other player has no turns, stay on current player

    def get_state(self):
        return {
            "num_rounds": self.num_rounds,
            "turns_per_round": self.turns_per_round,
            "deck": [c.to_dict() for c in self.deck],
            "hands": [[c.to_dict() for c in h] for h in self.hands],
            "food": self.food,
            "habitats": [
                {hab: [b.to_dict() for b in birds] for hab, birds in h.items()}
                for h in self.habitats
            ],
            "bonus_cards": self.bonus_cards,
            "round_goals": self.round_goals,
            "round_scores": self.round_scores,
            "birdfeeder": self.birdfeeder,
            "tray": [c.to_dict() for c in self.tray],
            "round_number": self.round_number,
            "turns_left": self.turns_left,
            "current_player": self.current_player,
            "turn_number": self.turn_number,
            "game_over": self.game_over,
            "winner": self.winner,
        }

    def load_state(self, state):
        self.num_rounds = state["num_rounds"]
        self.turns_per_round = state["turns_per_round"]
        self.deck = [BirdCard.from_dict(d) for d in state["deck"]]
        self.hands = [[BirdCard.from_dict(d) for d in h] for h in state["hands"]]
        self.food = state["food"]
        self.habitats = [
            {hab: [BirdCard.from_dict(d) for d in birds] for hab, birds in h.items()}
            for h in state["habitats"]
        ]
        self.bonus_cards = [tuple(b) if b else None for b in state["bonus_cards"]]
        self.round_goals = [tuple(g) for g in state["round_goals"]]
        self.round_scores = state["round_scores"]
        self.birdfeeder = state["birdfeeder"]
        self.tray = [BirdCard.from_dict(d) for d in state["tray"]]
        self.round_number = state["round_number"]
        self.turns_left = state["turns_left"]
        self.current_player = state["current_player"]
        self.turn_number = state["turn_number"]
        self.game_over = state["game_over"]
        self.winner = state["winner"]

    def get_tutorial(self):
        return """
=== WINGSPAN CARD GAME TUTORIAL ===

OVERVIEW:
  Attract birds to your wildlife habitats! Play bird cards into three
  habitats (Forest, Grassland, Wetland), each with unique actions.
  Score points from birds, eggs, cached food, bonus cards, and goals.

HABITATS & ACTIONS:
  Forest    - FOOD action: Gain food from the birdfeeder
  Grassland - EGG action: Lay eggs on your birds
  Wetland   - DRAW action: Draw new bird cards

TURN ACTIONS (pick one):
  1. PLAY A BIRD (play <hand#> <habitat>):
     Pay the bird's food cost and any egg cost for the column.
     The bird must match the habitat. Columns 3+ cost 1 egg,
     columns 5 cost 2 eggs.

  2. GAIN FOOD (food):
     Take food from the birdfeeder, then activate Forest birds.

  3. LAY EGGS (egg):
     Place an egg on a bird with room, then activate Grassland birds.

  4. DRAW CARDS (draw [tray#|deck]):
     Draw from the face-up tray or the deck, then activate Wetland birds.

BIRD POWERS:
  "When played" - Triggers once when the bird enters play
  "When activated" - Triggers each time you use that habitat's action

SCORING:
  - Face value of each bird card
  - 1 point per egg on birds
  - 1 point per cached food on birds
  - Bonus card points
  - Round goal points (4 for winner, 2 for tie, 1 for loser)

FOOD TYPES: I=Invertebrate S=Seed F=Fish U=Fruit R=Rodent

COMMANDS:
  play <#> <habitat>  - Play bird from hand
  food                - Gain food (Forest)
  egg                 - Lay eggs (Grassland)
  draw [#|deck]       - Draw cards (Wetland)
  quit/q              - Quit game
  save/s              - Save game
  help/h              - Show help
"""
