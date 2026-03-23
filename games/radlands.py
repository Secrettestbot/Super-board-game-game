"""Radlands - A post-apocalyptic dueling card game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Camp definitions
CAMPS = [
    {"name": "Outpost", "hp": 3, "ability": "Draw 1 extra card"},
    {"name": "Bunker", "hp": 4, "ability": "Reduce damage by 1"},
    {"name": "Garage", "hp": 3, "ability": "Restore 1 water"},
    {"name": "Vault", "hp": 5, "ability": "Protected from steal"},
    {"name": "Oasis", "hp": 3, "ability": "Heal 1 to any camp"},
    {"name": "Armory", "hp": 4, "ability": "+1 damage to attacks"},
    {"name": "Watchtower", "hp": 3, "ability": "See top deck card"},
    {"name": "Workshop", "hp": 4, "ability": "Reduce play cost by 1"},
]

# People cards (raiders and specialists)
PEOPLE_CARDS = [
    {"name": "Raider", "cost": 1, "attack": 2, "hp": 1, "ability": "none",
     "type": "raider", "count": 4},
    {"name": "Sniper", "cost": 2, "attack": 3, "hp": 1, "ability": "damage",
     "type": "raider", "count": 3},
    {"name": "Brute", "cost": 2, "attack": 2, "hp": 3, "ability": "none",
     "type": "raider", "count": 3},
    {"name": "Medic", "cost": 2, "attack": 1, "hp": 2, "ability": "heal",
     "type": "specialist", "count": 2},
    {"name": "Scavenger", "cost": 1, "attack": 1, "hp": 1, "ability": "draw",
     "type": "specialist", "count": 3},
    {"name": "Shield Bearer", "cost": 3, "attack": 1, "hp": 4, "ability": "protect",
     "type": "specialist", "count": 2},
    {"name": "Saboteur", "cost": 3, "attack": 2, "hp": 2, "ability": "destroy",
     "type": "specialist", "count": 2},
    {"name": "Thief", "cost": 2, "attack": 1, "hp": 1, "ability": "steal",
     "type": "specialist", "count": 2},
    {"name": "Berserker", "cost": 3, "attack": 4, "hp": 2, "ability": "none",
     "type": "raider", "count": 2},
    {"name": "Gunner", "cost": 2, "attack": 2, "hp": 2, "ability": "damage",
     "type": "raider", "count": 3},
]


def _build_deck():
    """Build the people card deck."""
    deck = []
    for card_def in PEOPLE_CARDS:
        for _ in range(card_def["count"]):
            deck.append({
                "name": card_def["name"],
                "cost": card_def["cost"],
                "attack": card_def["attack"],
                "hp": card_def["hp"],
                "max_hp": card_def["hp"],
                "ability": card_def["ability"],
                "type": card_def["type"],
            })
    random.shuffle(deck)
    return deck


class RadlandsGame(BaseGame):
    """Radlands - post-apocalyptic dueling card game."""

    name = "Radlands"
    description = "Post-apocalyptic duel - destroy your opponent's camps"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "3 camps each, 3 water per turn",
        "quick": "2 camps each, 4 water per turn",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_camps = 3 if self.variation == "standard" else 2
        self.water_per_turn = 3 if self.variation == "standard" else 4

        self.deck = []
        self.hands = {1: [], 2: []}
        self.camps = {1: [], 2: []}  # list of camp dicts
        self.people = {1: [], 2: []}  # deployed people cards
        self.water = {1: 0, 2: 0}
        self.discard_pile = []
        self.log = []
        self.actions_done = False

    def setup(self):
        """Initialize the game."""
        self.deck = _build_deck()

        # Assign random camps
        available_camps = list(CAMPS)
        random.shuffle(available_camps)
        for p in [1, 2]:
            for i in range(self.num_camps):
                camp = available_camps.pop()
                self.camps[p].append({
                    "name": camp["name"],
                    "hp": camp["hp"],
                    "max_hp": camp["hp"],
                    "ability": camp["ability"],
                    "destroyed": False,
                })

        # Deal starting hands
        for p in [1, 2]:
            for _ in range(3):
                if self.deck:
                    self.hands[p].append(self.deck.pop())

        # Starting water
        self.water = {1: self.water_per_turn, 2: self.water_per_turn}
        self.log.append("The wasteland war begins!")

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1

        print("=" * 62)
        print(f"  RADLANDS - {self.variation.upper()}")
        print("=" * 62)
        print(f"  Deck: {len(self.deck)} | Turn: {self.turn_number + 1}")
        print("-" * 62)

        # Opponent's area (top)
        print(f"  {self.players[opp-1]} | Water: {'~' * self.water[opp]} ({self.water[opp]})")
        print(f"  Hand: {len(self.hands[opp])} card(s) [hidden]")
        print()

        # Opponent's camps
        print("  Camps:")
        for i, camp in enumerate(self.camps[opp]):
            if camp["destroyed"]:
                print(f"    [{i+1}] XXXX {camp['name']} (DESTROYED)")
            else:
                hp_bar = "#" * camp["hp"] + "." * (camp["max_hp"] - camp["hp"])
                print(f"    [{i+1}] [{hp_bar}] {camp['name']} "
                      f"(HP:{camp['hp']}/{camp['max_hp']}) - {camp['ability']}")

        # Opponent's people
        if self.people[opp]:
            print("  People:")
            for i, person in enumerate(self.people[opp]):
                hp_bar = "#" * person["hp"] + "." * (person["max_hp"] - person["hp"])
                print(f"    <{i+1}> [{hp_bar}] {person['name']} "
                      f"ATK:{person['attack']} HP:{person['hp']}/{person['max_hp']} "
                      f"({person['ability']})")
        else:
            print("  People: (none)")

        print()
        print("  " + "~" * 58)
        print("  " + "~" * 22 + " WASTELAND " + "~" * 25)
        print("  " + "~" * 58)
        print()

        # Current player's people
        if self.people[p]:
            print("  Your People:")
            for i, person in enumerate(self.people[p]):
                hp_bar = "#" * person["hp"] + "." * (person["max_hp"] - person["hp"])
                print(f"    <{i+1}> [{hp_bar}] {person['name']} "
                      f"ATK:{person['attack']} HP:{person['hp']}/{person['max_hp']} "
                      f"({person['ability']})")
        else:
            print("  Your People: (none)")

        # Current player's camps
        print(f"\n  >> {self.players[p-1]}'s Camps:")
        for i, camp in enumerate(self.camps[p]):
            if camp["destroyed"]:
                print(f"    [{i+1}] XXXX {camp['name']} (DESTROYED)")
            else:
                hp_bar = "#" * camp["hp"] + "." * (camp["max_hp"] - camp["hp"])
                print(f"    [{i+1}] [{hp_bar}] {camp['name']} "
                      f"(HP:{camp['hp']}/{camp['max_hp']}) - {camp['ability']}")

        print(f"\n  Water: {'~' * self.water[p]} ({self.water[p]})")

        # Hand
        print(f"  Hand:")
        for i, card in enumerate(self.hands[p]):
            print(f"    {i+1}. {card['name']} (Cost:{card['cost']} ATK:{card['attack']} "
                  f"HP:{card['hp']} Ability:{card['ability']})")

        print("-" * 62)
        if self.log:
            for line in self.log[-4:]:
                print(f"  {line}")
        print("=" * 62)

    def get_move(self):
        """Get a move from the current player."""
        p = self.current_player
        print(f"\n  Water remaining: {self.water[p]}")
        print("  Actions:")
        print("    [P]lay   - Play a person card (costs water)")
        print("    [A]ttack - Attack with a person")
        print("    [U]se    - Use a person's ability (costs 1 water)")
        print("    [D]raw   - Draw a card (costs 1 water)")
        print("    [E]nd    - End your turn")

        choice = input_with_quit("\n  Action: ").strip().upper()

        if choice in ("P", "PLAY"):
            return self._get_play_move()
        elif choice in ("A", "ATTACK"):
            return self._get_attack_move()
        elif choice in ("U", "USE"):
            return self._get_use_move()
        elif choice in ("D", "DRAW"):
            return "draw"
        elif choice in ("E", "END"):
            return "end"
        return None

    def _get_play_move(self):
        """Get card play details."""
        p = self.current_player
        if not self.hands[p]:
            print("  No cards in hand!")
            input_with_quit("  Press Enter...")
            return None

        playable = [(i, c) for i, c in enumerate(self.hands[p]) if c["cost"] <= self.water[p]]
        if not playable:
            print("  Not enough water to play any card!")
            input_with_quit("  Press Enter...")
            return None

        print("  Playable cards:")
        for i, card in playable:
            print(f"    {i+1}. {card['name']} (Cost:{card['cost']})")

        choice = input_with_quit("  Play card #: ").strip()
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(self.hands[p]) and self.hands[p][idx]["cost"] <= self.water[p]:
                return ("play", idx)
        except ValueError:
            pass
        print("  Invalid choice.")
        return None

    def _get_attack_move(self):
        """Get attack details."""
        p = self.current_player
        opp = 2 if p == 1 else 1

        if not self.people[p]:
            print("  No people to attack with!")
            input_with_quit("  Press Enter...")
            return None

        print("  Your people:")
        for i, person in enumerate(self.people[p]):
            print(f"    {i+1}. {person['name']} (ATK:{person['attack']})")

        attacker = input_with_quit("  Attacker #: ").strip()
        try:
            att_idx = int(attacker) - 1
            if not (0 <= att_idx < len(self.people[p])):
                print("  Invalid attacker.")
                return None
        except ValueError:
            return None

        # Choose target
        print(f"\n  Targets (opponent's):")
        targets = []
        for i, person in enumerate(self.people[opp]):
            print(f"    P{i+1}. {person['name']} (HP:{person['hp']})")
            targets.append(("person", i))
        for i, camp in enumerate(self.camps[opp]):
            if not camp["destroyed"]:
                # Can only attack camps if no people are protecting
                print(f"    C{i+1}. {camp['name']} (HP:{camp['hp']})")
                targets.append(("camp", i))

        target = input_with_quit("  Target (P1/C1/etc): ").strip().upper()
        try:
            t_type = target[0]
            t_idx = int(target[1:]) - 1
            if t_type == "P" and 0 <= t_idx < len(self.people[opp]):
                return ("attack", att_idx, "person", t_idx)
            elif t_type == "C" and 0 <= t_idx < len(self.camps[opp]):
                if not self.camps[opp][t_idx]["destroyed"]:
                    return ("attack", att_idx, "camp", t_idx)
        except (ValueError, IndexError):
            pass
        print("  Invalid target.")
        return None

    def _get_use_move(self):
        """Get ability use details."""
        p = self.current_player
        usable = [(i, person) for i, person in enumerate(self.people[p])
                  if person["ability"] != "none"]
        if not usable:
            print("  No people with usable abilities!")
            input_with_quit("  Press Enter...")
            return None
        if self.water[p] < 1:
            print("  Not enough water (costs 1)!")
            input_with_quit("  Press Enter...")
            return None

        print("  People with abilities:")
        for i, person in usable:
            print(f"    {i+1}. {person['name']}: {person['ability']}")

        choice = input_with_quit("  Use person #: ").strip()
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(self.people[p]) and self.people[p][idx]["ability"] != "none":
                return ("use", idx)
        except ValueError:
            pass
        return None

    def make_move(self, move):
        """Apply a move to the game state."""
        if move is None:
            return False

        p = self.current_player
        opp = 2 if p == 1 else 1
        self.log = []

        if move == "end":
            # Refill water and draw a card
            self.water[p] = self.water_per_turn
            if self.deck:
                self.hands[p].append(self.deck.pop())
            self.log.append(f"{self.players[p-1]} ends turn. Water refilled.")
            return True

        elif move == "draw":
            if self.water[p] < 1:
                self.log.append("Not enough water!")
                return False
            if not self.deck:
                self.log.append("Deck is empty!")
                return False
            self.water[p] -= 1
            self.hands[p].append(self.deck.pop())
            self.log.append(f"{self.players[p-1]} spends 1 water to draw a card.")
            return True

        elif isinstance(move, tuple) and move[0] == "play":
            _, idx = move
            if idx >= len(self.hands[p]):
                return False
            card = self.hands[p][idx]
            if card["cost"] > self.water[p]:
                self.log.append("Not enough water!")
                return False
            self.water[p] -= card["cost"]
            played = self.hands[p].pop(idx)
            self.people[p].append(played)
            self.log.append(f"{self.players[p-1]} deploys {played['name']} "
                          f"(cost {played['cost']} water).")
            return True

        elif isinstance(move, tuple) and move[0] == "attack":
            _, att_idx, target_type, t_idx = move
            if att_idx >= len(self.people[p]):
                return False

            attacker = self.people[p][att_idx]
            damage = attacker["attack"]

            # Check for Armory camp bonus
            for camp in self.camps[p]:
                if not camp["destroyed"] and camp["ability"] == "+1 damage to attacks":
                    damage += 1
                    break

            if target_type == "person":
                if t_idx >= len(self.people[opp]):
                    return False
                target = self.people[opp][t_idx]
                target["hp"] -= damage
                self.log.append(f"{attacker['name']} attacks {target['name']} "
                              f"for {damage} damage!")
                if target["hp"] <= 0:
                    self.log.append(f"  {target['name']} is destroyed!")
                    self.discard_pile.append(self.people[opp].pop(t_idx))
            elif target_type == "camp":
                if t_idx >= len(self.camps[opp]):
                    return False
                camp = self.camps[opp][t_idx]
                if camp["destroyed"]:
                    return False

                # Check for Bunker damage reduction
                actual_damage = damage
                if camp["ability"] == "Reduce damage by 1":
                    actual_damage = max(1, damage - 1)

                camp["hp"] -= actual_damage
                self.log.append(f"{attacker['name']} attacks {camp['name']} "
                              f"for {actual_damage} damage!")
                if camp["hp"] <= 0:
                    camp["destroyed"] = True
                    camp["hp"] = 0
                    self.log.append(f"  {camp['name']} is DESTROYED!")
            return True

        elif isinstance(move, tuple) and move[0] == "use":
            _, idx = move
            if idx >= len(self.people[p]):
                return False
            if self.water[p] < 1:
                self.log.append("Not enough water!")
                return False

            person = self.people[p][idx]
            ability = person["ability"]
            self.water[p] -= 1

            if ability == "heal":
                # Heal 2 HP to any friendly camp or person
                print("  Heal targets:")
                targets = []
                for i, camp in enumerate(self.camps[p]):
                    if not camp["destroyed"] and camp["hp"] < camp["max_hp"]:
                        print(f"    C{i+1}. {camp['name']} ({camp['hp']}/{camp['max_hp']})")
                        targets.append(("camp", i))
                for i, per in enumerate(self.people[p]):
                    if per["hp"] < per["max_hp"]:
                        print(f"    P{i+1}. {per['name']} ({per['hp']}/{per['max_hp']})")
                        targets.append(("person", i))
                if not targets:
                    self.log.append("Nothing to heal!")
                    self.water[p] += 1
                    return False
                target = input_with_quit("  Heal target (C1/P1/etc): ").strip().upper()
                try:
                    tt = target[0]
                    ti = int(target[1:]) - 1
                    if tt == "C" and 0 <= ti < len(self.camps[p]):
                        self.camps[p][ti]["hp"] = min(self.camps[p][ti]["hp"] + 2,
                                                      self.camps[p][ti]["max_hp"])
                        self.log.append(f"{person['name']} heals {self.camps[p][ti]['name']}.")
                    elif tt == "P" and 0 <= ti < len(self.people[p]):
                        self.people[p][ti]["hp"] = min(self.people[p][ti]["hp"] + 2,
                                                       self.people[p][ti]["max_hp"])
                        self.log.append(f"{person['name']} heals {self.people[p][ti]['name']}.")
                    else:
                        self.water[p] += 1
                        return False
                except (ValueError, IndexError):
                    self.water[p] += 1
                    return False

            elif ability == "damage":
                # Deal 2 damage to any enemy
                print("  Damage targets (opponent's):")
                for i, per in enumerate(self.people[opp]):
                    print(f"    P{i+1}. {per['name']} (HP:{per['hp']})")
                for i, camp in enumerate(self.camps[opp]):
                    if not camp["destroyed"]:
                        print(f"    C{i+1}. {camp['name']} (HP:{camp['hp']})")
                target = input_with_quit("  Target (P1/C1/etc): ").strip().upper()
                try:
                    tt = target[0]
                    ti = int(target[1:]) - 1
                    if tt == "P" and 0 <= ti < len(self.people[opp]):
                        self.people[opp][ti]["hp"] -= 2
                        self.log.append(f"{person['name']} deals 2 damage to "
                                      f"{self.people[opp][ti]['name']}!")
                        if self.people[opp][ti]["hp"] <= 0:
                            self.discard_pile.append(self.people[opp].pop(ti))
                            self.log.append("  Target destroyed!")
                    elif tt == "C" and 0 <= ti < len(self.camps[opp]):
                        self.camps[opp][ti]["hp"] -= 2
                        self.log.append(f"{person['name']} deals 2 damage to "
                                      f"{self.camps[opp][ti]['name']}!")
                        if self.camps[opp][ti]["hp"] <= 0:
                            self.camps[opp][ti]["destroyed"] = True
                            self.camps[opp][ti]["hp"] = 0
                            self.log.append(f"  {self.camps[opp][ti]['name']} DESTROYED!")
                    else:
                        self.water[p] += 1
                        return False
                except (ValueError, IndexError):
                    self.water[p] += 1
                    return False

            elif ability == "draw":
                if self.deck:
                    self.hands[p].append(self.deck.pop())
                    self.log.append(f"{person['name']} scavenges - draws a card!")
                else:
                    self.log.append("Deck is empty!")
                    self.water[p] += 1
                    return False

            elif ability == "protect":
                # Protect a camp - heal 1 HP
                print("  Protect which camp?")
                for i, camp in enumerate(self.camps[p]):
                    if not camp["destroyed"]:
                        print(f"    {i+1}. {camp['name']} ({camp['hp']}/{camp['max_hp']})")
                target = input_with_quit("  Camp #: ").strip()
                try:
                    ti = int(target) - 1
                    if 0 <= ti < len(self.camps[p]) and not self.camps[p][ti]["destroyed"]:
                        self.camps[p][ti]["hp"] = min(self.camps[p][ti]["hp"] + 1,
                                                      self.camps[p][ti]["max_hp"])
                        self.log.append(f"{person['name']} protects {self.camps[p][ti]['name']}.")
                    else:
                        self.water[p] += 1
                        return False
                except ValueError:
                    self.water[p] += 1
                    return False

            elif ability == "steal":
                if self.hands[opp]:
                    stolen = random.choice(self.hands[opp])
                    self.hands[opp].remove(stolen)
                    self.hands[p].append(stolen)
                    self.log.append(f"{person['name']} steals a card from {self.players[opp-1]}!")
                else:
                    self.log.append(f"{self.players[opp-1]} has no cards to steal!")
                    self.water[p] += 1
                    return False

            elif ability == "destroy":
                if self.people[opp]:
                    print("  Destroy which enemy person?")
                    for i, per in enumerate(self.people[opp]):
                        print(f"    {i+1}. {per['name']} (HP:{per['hp']})")
                    target = input_with_quit("  Target #: ").strip()
                    try:
                        ti = int(target) - 1
                        if 0 <= ti < len(self.people[opp]):
                            destroyed = self.people[opp].pop(ti)
                            self.discard_pile.append(destroyed)
                            self.log.append(f"{person['name']} sabotages {destroyed['name']}!")
                        else:
                            self.water[p] += 1
                            return False
                    except ValueError:
                        self.water[p] += 1
                        return False
                else:
                    self.log.append("No enemy people to destroy!")
                    self.water[p] += 1
                    return False

            return True

        return False

    def switch_player(self):
        """Override to only switch on 'end' turn."""
        # The base play() calls switch_player after every valid move,
        # but we only switch on "end". Intercept here.
        # We check the last move in history
        if self.move_history and self.move_history[-1] == "end":
            super().switch_player()

    def check_game_over(self):
        """Check if all camps of a player are destroyed."""
        for player in [1, 2]:
            all_destroyed = all(c["destroyed"] for c in self.camps[player])
            if all_destroyed:
                self.game_over = True
                self.winner = 2 if player == 1 else 1
                self.log.append(f"All of {self.players[player-1]}'s camps are destroyed!")
                return

    def get_state(self):
        """Return serializable game state."""
        return {
            "num_camps": self.num_camps,
            "water_per_turn": self.water_per_turn,
            "deck": self.deck,
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "camps": {"1": self.camps[1], "2": self.camps[2]},
            "people": {"1": self.people[1], "2": self.people[2]},
            "water": {"1": self.water[1], "2": self.water[2]},
            "discard_pile": self.discard_pile,
            "log": self.log,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.num_camps = state["num_camps"]
        self.water_per_turn = state["water_per_turn"]
        self.deck = state["deck"]
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.camps = {1: state["camps"]["1"], 2: state["camps"]["2"]}
        self.people = {1: state["people"]["1"], 2: state["people"]["2"]}
        self.water = {1: state["water"]["1"], 2: state["water"]["2"]}
        self.discard_pile = state["discard_pile"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        """Return tutorial text."""
        return """
============================================================
  RADLANDS - Tutorial
============================================================

  OVERVIEW:
  A post-apocalyptic duel! Each player has camps (buildings).
  Destroy all of your opponent's camps to win.

  YOUR AREA:
  - Camps: Buildings with HP. If all are destroyed, you lose!
  - People: Raiders and specialists you deploy to fight.
  - Water: Your currency (refills each turn).

  ACTIONS (can do multiple per turn):
  [P]lay   - Deploy a person card from hand (costs water)
  [A]ttack - Attack with a deployed person (free)
  [U]se    - Activate a person's special ability (costs 1 water)
  [D]raw   - Draw a card from the deck (costs 1 water)
  [E]nd    - End your turn (refills water, draws 1 card)

  PERSON ABILITIES:
  - damage:  Deal 2 damage to any enemy
  - heal:    Heal 2 HP to any friendly unit/camp
  - protect: Heal 1 HP to a camp
  - steal:   Steal a random card from opponent's hand
  - destroy: Instantly destroy an enemy person
  - draw:    Draw an extra card
  - none:    No special ability (pure fighter)

  CAMP ABILITIES:
  Each camp has a passive ability that helps while active.

  STRATEGY:
  - Balance attacking and defending
  - Use water wisely - it's your most limited resource
  - Protect your weakest camps
  - Deploy Shield Bearers to absorb hits
  - Use Saboteurs to remove dangerous enemy people

  Standard: 3 camps, 3 water/turn
  Quick: 2 camps, 4 water/turn
============================================================
"""
