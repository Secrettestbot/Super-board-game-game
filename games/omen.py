"""Omen: A Reign of War - Ancient warfare card game with battlefield control."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Card types and their properties
UNIT_TYPES = {
    "Soldier": {"symbol": "S", "color": "\033[93m"},
    "Beast": {"symbol": "B", "color": "\033[91m"},
    "Oracle": {"symbol": "O", "color": "\033[96m"},
}
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"

# Predefined card pool
CARD_POOL = [
    # Soldiers - cheap, moderate strength
    {"name": "Hoplite", "type": "Soldier", "cost": 1, "strength": 2, "ability": None},
    {"name": "Peltast", "type": "Soldier", "cost": 1, "strength": 1, "ability": "draw1"},
    {"name": "Spearman", "type": "Soldier", "cost": 2, "strength": 3, "ability": None},
    {"name": "Shield Bearer", "type": "Soldier", "cost": 2, "strength": 2, "ability": "gold1"},
    {"name": "Legionary", "type": "Soldier", "cost": 3, "strength": 4, "ability": None},
    {"name": "Centurion", "type": "Soldier", "cost": 3, "strength": 3, "ability": "draw1"},
    {"name": "Pikeman", "type": "Soldier", "cost": 1, "strength": 2, "ability": None},
    {"name": "Swordsman", "type": "Soldier", "cost": 2, "strength": 3, "ability": None},
    # Beasts - expensive, high strength
    {"name": "War Elephant", "type": "Beast", "cost": 4, "strength": 6, "ability": None},
    {"name": "Cerberus", "type": "Beast", "cost": 3, "strength": 5, "ability": None},
    {"name": "Minotaur", "type": "Beast", "cost": 3, "strength": 4, "ability": "destroy1"},
    {"name": "Griffin", "type": "Beast", "cost": 4, "strength": 5, "ability": "draw1"},
    {"name": "Hydra", "type": "Beast", "cost": 5, "strength": 7, "ability": None},
    {"name": "Chimera", "type": "Beast", "cost": 4, "strength": 5, "ability": None},
    {"name": "Manticore", "type": "Beast", "cost": 3, "strength": 4, "ability": None},
    {"name": "Wyvern", "type": "Beast", "cost": 4, "strength": 6, "ability": None},
    # Oracles - moderate cost, low strength, powerful abilities
    {"name": "Pythia", "type": "Oracle", "cost": 2, "strength": 1, "ability": "draw2"},
    {"name": "Cassandra", "type": "Oracle", "cost": 2, "strength": 1, "ability": "gold2"},
    {"name": "Sibyl", "type": "Oracle", "cost": 3, "strength": 2, "ability": "draw2_gold1"},
    {"name": "Tiresias", "type": "Oracle", "cost": 2, "strength": 1, "ability": "move1"},
    {"name": "Augur", "type": "Oracle", "cost": 1, "strength": 1, "ability": "draw1"},
    {"name": "Seer", "type": "Oracle", "cost": 2, "strength": 1, "ability": "gold2"},
    {"name": "Diviner", "type": "Oracle", "cost": 3, "strength": 2, "ability": "draw1_gold1"},
    {"name": "Prophet", "type": "Oracle", "cost": 2, "strength": 1, "ability": "draw2"},
]

ABILITY_DESC = {
    None: "",
    "draw1": "Draw 1 card",
    "draw2": "Draw 2 cards",
    "gold1": "Gain 1 gold",
    "gold2": "Gain 2 gold",
    "draw1_gold1": "Draw 1, gain 1 gold",
    "draw2_gold1": "Draw 2, gain 1 gold",
    "destroy1": "Destroy 1 enemy unit at this city",
    "move1": "Move 1 of your units to another city",
}

CITY_NAMES = [
    "Athens", "Sparta", "Thebes", "Corinth", "Argos",
    "Delphi", "Olympia", "Mycenae", "Troy", "Rhodes",
]


def card_display(card):
    """Short display string for a card."""
    info = UNIT_TYPES[card["type"]]
    ability_str = ""
    if card["ability"]:
        ability_str = f" [{ABILITY_DESC[card['ability']]}]"
    return (f"{info['color']}{info['symbol']}{RESET} "
            f"{card['name']} (C:{card['cost']} S:{card['strength']}){ability_str}")


class OmenGame(BaseGame):
    """Omen: A Reign of War - Ancient warfare card game."""

    name = "Omen"
    description = "Ancient warfare card game - deploy units to conquer cities"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - first to claim 5 cities wins",
        "quick": "Quick game - first to claim 3 cities wins",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.cities_to_win = 5 if self.variation != "quick" else 3
        self.deck = []
        self.discard = []
        self.hands = {1: [], 2: []}
        self.gold = {1: 0, 2: 0}
        self.cities = []
        self.cities_claimed = {1: 0, 2: 0}
        self.phase = "offering"  # offering, action, war
        self.actions_left = 0
        self.log = []
        self.round_num = 0
        self.war_resolved = False

    def setup(self):
        """Initialize deck, hands, cities."""
        # Build deck: 2 copies of each card
        self.deck = []
        for card in CARD_POOL:
            for _ in range(2):
                self.deck.append(dict(card))
        random.shuffle(self.deck)

        self.discard = []
        self.hands = {1: [], 2: []}
        self.gold = {1: 3, 2: 3}

        # Deal 5 cards each
        for _ in range(5):
            if self.deck:
                self.hands[1].append(self.deck.pop())
            if self.deck:
                self.hands[2].append(self.deck.pop())

        # Setup cities
        city_names = random.sample(CITY_NAMES, 3)
        self.cities = []
        for name in city_names:
            self.cities.append({
                "name": name,
                "units": {1: [], 2: []},
                "claimed_by": 0,
            })

        self.cities_claimed = {1: 0, 2: 0}
        self.phase = "offering"
        self.round_num = 1
        self.log = []

    def _draw_cards(self, player, count):
        """Draw cards for a player."""
        drawn = 0
        for _ in range(count):
            if not self.deck:
                if self.discard:
                    self.deck = list(self.discard)
                    self.discard = []
                    random.shuffle(self.deck)
                else:
                    break
            if self.deck:
                self.hands[player].append(self.deck.pop())
                drawn += 1
        return drawn

    def _total_strength(self, player, city_idx):
        """Calculate total strength of a player's units at a city."""
        return sum(u["strength"] for u in self.cities[city_idx]["units"][player])

    def display(self):
        """Display the game state."""
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1

        print(f"{BOLD}=== OMEN: A Reign of War ==={RESET}")
        print(f"Round {self.round_num} | "
              f"Cities to win: {self.cities_to_win} | "
              f"Deck: {len(self.deck)} cards")
        print()

        # Score
        print(f"  {self.players[0]}: {self.cities_claimed[1]} cities claimed | "
              f"Gold: {self.gold[1]}")
        print(f"  {self.players[1]}: {self.cities_claimed[2]} cities claimed | "
              f"Gold: {self.gold[2]}")
        print()

        # Cities
        print(f"{BOLD}--- Battlefields ---{RESET}")
        for i, city in enumerate(self.cities):
            status = ""
            if city["claimed_by"] > 0:
                status = f" [Claimed by {self.players[city['claimed_by'] - 1]}]"
            print(f"  City {i + 1}: {city['name']}{status}")

            for pl in [1, 2]:
                units = city["units"][pl]
                if units:
                    unit_strs = []
                    for u in units:
                        info = UNIT_TYPES[u["type"]]
                        unit_strs.append(
                            f"{info['color']}{u['name']}(S:{u['strength']}){RESET}")
                    total = self._total_strength(pl, i)
                    print(f"    {self.players[pl - 1]}: "
                          f"{', '.join(unit_strs)} = {total} str")
                else:
                    print(f"    {self.players[pl - 1]}: (empty)")
        print()

        # Current player's hand
        print(f"{BOLD}--- {self.players[p - 1]}'s Hand "
              f"(Gold: {self.gold[p]}) ---{RESET}")
        for i, card in enumerate(self.hands[p]):
            print(f"  [{i + 1}] {card_display(card)}")
        print()

        # Phase indicator
        if self.phase == "offering":
            print(f"Phase: OFFERING - Draw 1 card and gain 1 gold, "
                  f"OR draw 3 cards and gain 0 gold")
        elif self.phase == "action":
            print(f"Phase: ACTION - Play cards to cities "
                  f"(Actions left: {self.actions_left})")
        elif self.phase == "war":
            print(f"Phase: WAR - Resolve battles at cities with "
                  f"units from both players")
        print()

        # Log
        if self.log:
            print(f"{DIM}Recent: {self.log[-1]}{RESET}")

    def get_move(self):
        """Get player input based on current phase."""
        p = self.current_player

        if self.phase == "offering":
            print("Choose offering:")
            print("  [1] Draw 1 card, gain 1 gold (modest)")
            print("  [2] Draw 3 cards, gain 0 gold (greedy)")
            choice = input_with_quit("Your choice (1-2): ").strip()
            return ("offering", choice)

        elif self.phase == "action":
            print("Actions:")
            print("  [P] Play a card to a city")
            print("  [A] Activate an Oracle ability at a city")
            print("  [D] Done (end action phase)")
            choice = input_with_quit("Your choice: ").strip().upper()

            if choice == "P":
                if not self.hands[p]:
                    print("No cards in hand!")
                    input_with_quit("Press Enter...")
                    return ("action", "none")
                card_idx = input_with_quit(
                    f"Card number (1-{len(self.hands[p])}): ").strip()
                city_idx = input_with_quit(
                    f"City number (1-{len(self.cities)}): ").strip()
                return ("play", card_idx, city_idx)

            elif choice == "A":
                city_idx = input_with_quit(
                    f"City to activate Oracle at (1-{len(self.cities)}): "
                ).strip()
                return ("activate", city_idx)

            elif choice == "D":
                return ("action", "done")
            else:
                return ("action", "none")

        elif self.phase == "war":
            print("Press Enter to resolve war...")
            input_with_quit("")
            return ("war",)

        return ("none",)

    def _apply_ability(self, player, ability, city_idx):
        """Apply a card ability."""
        opp = 2 if player == 1 else 1
        if ability == "draw1":
            drawn = self._draw_cards(player, 1)
            self.log.append(f"{self.players[player - 1]} drew {drawn} card(s)")
        elif ability == "draw2":
            drawn = self._draw_cards(player, 2)
            self.log.append(f"{self.players[player - 1]} drew {drawn} card(s)")
        elif ability == "gold1":
            self.gold[player] += 1
            self.log.append(f"{self.players[player - 1]} gained 1 gold")
        elif ability == "gold2":
            self.gold[player] += 2
            self.log.append(f"{self.players[player - 1]} gained 2 gold")
        elif ability == "draw1_gold1":
            self._draw_cards(player, 1)
            self.gold[player] += 1
            self.log.append(
                f"{self.players[player - 1]} drew 1 card and gained 1 gold")
        elif ability == "draw2_gold1":
            self._draw_cards(player, 2)
            self.gold[player] += 1
            self.log.append(
                f"{self.players[player - 1]} drew 2 cards and gained 1 gold")
        elif ability == "destroy1":
            enemy_units = self.cities[city_idx]["units"][opp]
            if enemy_units:
                destroyed = enemy_units.pop(0)
                self.discard.append(destroyed)
                self.log.append(
                    f"{self.players[player - 1]} destroyed "
                    f"{destroyed['name']} at {self.cities[city_idx]['name']}")
            else:
                self.log.append("No enemy units to destroy")
        elif ability == "move1":
            # Move first own unit at this city to another city
            own_units = self.cities[city_idx]["units"][player]
            if own_units and len(self.cities) > 1:
                unit = own_units.pop(0)
                # Move to next unclaimed city
                targets = [j for j in range(len(self.cities))
                           if j != city_idx and self.cities[j]["claimed_by"] == 0]
                if targets:
                    target = targets[0]
                    self.cities[target]["units"][player].append(unit)
                    self.log.append(
                        f"{self.players[player - 1]} moved {unit['name']} "
                        f"to {self.cities[target]['name']}")
                else:
                    own_units.insert(0, unit)
                    self.log.append("No valid city to move to")

    def make_move(self, move):
        """Process a move."""
        p = self.current_player

        if move[0] == "offering":
            choice = move[1]
            if choice == "1":
                self._draw_cards(p, 1)
                self.gold[p] += 1
                self.log.append(
                    f"{self.players[p - 1]} drew 1 card and gained 1 gold")
            elif choice == "2":
                self._draw_cards(p, 3)
                self.log.append(f"{self.players[p - 1]} drew 3 cards")
            else:
                return False
            self.phase = "action"
            self.actions_left = 3
            return True

        elif move[0] == "play":
            try:
                card_idx = int(move[1]) - 1
                city_idx = int(move[2]) - 1
            except (ValueError, IndexError):
                return False

            if card_idx < 0 or card_idx >= len(self.hands[p]):
                return False
            if city_idx < 0 or city_idx >= len(self.cities):
                return False
            if self.cities[city_idx]["claimed_by"] != 0:
                self.log.append("That city is already claimed!")
                return False

            card = self.hands[p][card_idx]
            if self.gold[p] < card["cost"]:
                self.log.append(
                    f"Not enough gold! Need {card['cost']}, "
                    f"have {self.gold[p]}")
                return False

            # Play the card
            self.gold[p] -= card["cost"]
            played = self.hands[p].pop(card_idx)
            self.cities[city_idx]["units"][p].append(played)
            self.log.append(
                f"{self.players[p - 1]} played {played['name']} "
                f"at {self.cities[city_idx]['name']}")

            # Apply ability on play if it's an Oracle
            if played["type"] == "Oracle" and played["ability"]:
                self._apply_ability(p, played["ability"], city_idx)

            self.actions_left -= 1
            if self.actions_left <= 0:
                self.phase = "war"
            return True

        elif move[0] == "activate":
            try:
                city_idx = int(move[1]) - 1
            except (ValueError, IndexError):
                return False
            if city_idx < 0 or city_idx >= len(self.cities):
                return False

            # Find an Oracle at this city
            oracles = [u for u in self.cities[city_idx]["units"][p]
                       if u["type"] == "Oracle" and u.get("ability")]
            if not oracles:
                self.log.append("No Oracle with ability at this city!")
                return False

            oracle = oracles[0]
            self._apply_ability(p, oracle["ability"], city_idx)
            self.actions_left -= 1
            if self.actions_left <= 0:
                self.phase = "war"
            return True

        elif move[0] == "action":
            if move[1] == "done":
                self.phase = "war"
                return True
            return False

        elif move[0] == "war":
            self._resolve_war()
            self.phase = "offering"
            if self.current_player == 2:
                self.round_num += 1
            return True

        return False

    def _resolve_war(self):
        """Resolve battles at each city."""
        for i, city in enumerate(self.cities):
            if city["claimed_by"] != 0:
                continue
            p1_str = self._total_strength(1, i)
            p2_str = self._total_strength(2, i)
            p1_units = len(city["units"][1])
            p2_units = len(city["units"][2])

            # Only resolve if both players have units
            if p1_units == 0 and p2_units == 0:
                continue
            if p1_units == 0 or p2_units == 0:
                continue

            if p1_str > p2_str:
                city["claimed_by"] = 1
                self.cities_claimed[1] += 1
                self.log.append(
                    f"{self.players[0]} claimed {city['name']}! "
                    f"({p1_str} vs {p2_str})")
            elif p2_str > p1_str:
                city["claimed_by"] = 2
                self.cities_claimed[2] += 1
                self.log.append(
                    f"{self.players[1]} claimed {city['name']}! "
                    f"({p2_str} vs {p1_str})")
            else:
                # Tie - no one claims, units fight again next round
                self.log.append(
                    f"Tie at {city['name']}! ({p1_str} vs {p2_str})")

            # Discard all units at resolved city (if claimed)
            if city["claimed_by"] != 0:
                for u in city["units"][1]:
                    self.discard.append(u)
                for u in city["units"][2]:
                    self.discard.append(u)
                city["units"][1] = []
                city["units"][2] = []

        # Replace any claimed cities with new ones
        used_names = [c["name"] for c in self.cities]
        available = [n for n in CITY_NAMES if n not in used_names]
        for i, city in enumerate(self.cities):
            if city["claimed_by"] != 0:
                if available:
                    new_name = random.choice(available)
                    available.remove(new_name)
                    self.cities[i] = {
                        "name": new_name,
                        "units": {1: [], 2: []},
                        "claimed_by": 0,
                    }

    def check_game_over(self):
        """Check if someone has claimed enough cities."""
        for player in [1, 2]:
            if self.cities_claimed[player] >= self.cities_to_win:
                self.game_over = True
                self.winner = player
                return

        # Also check if deck is empty and no one can act
        if (not self.deck and not self.discard
                and not self.hands[1] and not self.hands[2]):
            self.game_over = True
            if self.cities_claimed[1] > self.cities_claimed[2]:
                self.winner = 1
            elif self.cities_claimed[2] > self.cities_claimed[1]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        """Return serializable game state."""
        return {
            "deck": self.deck,
            "discard": self.discard,
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "gold": {"1": self.gold[1], "2": self.gold[2]},
            "cities": self.cities,
            "cities_claimed": {"1": self.cities_claimed[1],
                               "2": self.cities_claimed[2]},
            "phase": self.phase,
            "actions_left": self.actions_left,
            "round_num": self.round_num,
            "log": self.log,
            "cities_to_win": self.cities_to_win,
        }

    def load_state(self, state):
        """Restore game state."""
        self.deck = state["deck"]
        self.discard = state["discard"]
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.gold = {1: state["gold"]["1"], 2: state["gold"]["2"]}
        self.cities = state["cities"]
        # Convert units keys back to int
        for city in self.cities:
            if "1" in city["units"] and 1 not in city["units"]:
                city["units"] = {1: city["units"]["1"], 2: city["units"]["2"]}
        self.cities_claimed = {1: state["cities_claimed"]["1"],
                               2: state["cities_claimed"]["2"]}
        self.phase = state["phase"]
        self.actions_left = state["actions_left"]
        self.round_num = state["round_num"]
        self.log = state.get("log", [])
        self.cities_to_win = state.get("cities_to_win", 5)

    def get_tutorial(self):
        """Return tutorial text."""
        return f"""{BOLD}=== OMEN: A REIGN OF WAR - Tutorial ==={RESET}

Omen is a card game of ancient warfare. Two players compete to
conquer cities by deploying units to 3 active battlefields.

{BOLD}GOAL:{RESET}
  Be the first to claim {self.cities_to_win} cities.

{BOLD}CARD TYPES:{RESET}
  {UNIT_TYPES['Soldier']['color']}SOLDIERS{RESET} - Affordable fighters with moderate strength.
  {UNIT_TYPES['Beast']['color']}BEASTS{RESET}   - Powerful units with high strength but costly.
  {UNIT_TYPES['Oracle']['color']}ORACLES{RESET}  - Weak fighters but grant special abilities.

{BOLD}TURN PHASES:{RESET}
  1. OFFERING - Choose your resources:
     - Modest: Draw 1 card, gain 1 gold
     - Greedy: Draw 3 cards, gain 0 gold

  2. ACTION (3 actions) - For each action you can:
     - Play a card from hand to a city (costs gold)
     - Activate an Oracle's ability at a city
     - End early with 'Done'

  3. WAR - At each city where both players have units,
     compare total strength. The stronger force claims
     the city. Ties leave the city contested.

{BOLD}ORACLE ABILITIES:{RESET}
  Draw cards, gain gold, destroy enemy units, or move units.
  Abilities trigger when played AND can be activated again.

{BOLD}STRATEGY TIPS:{RESET}
  - Balance gold income with card advantage
  - Soldiers are efficient but Beasts can dominate
  - Oracles provide utility - don't underestimate them
  - Spread forces or concentrate? Both can work!
  - Watch what your opponent deploys and counter it

Type 'q' to quit, 's' to save, 'h' for help during play.
"""
