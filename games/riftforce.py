"""Riftforce - Elemental combat card game at 5 locations."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# All available guilds with their powers
ALL_GUILDS = {
    "Fire": {"symbol": "Fi", "power": "deal_extra", "desc": "Deals +1 damage when activated"},
    "Water": {"symbol": "Wa", "power": "heal", "desc": "Heals 1 damage from adjacent ally"},
    "Ice": {"symbol": "Ic", "power": "freeze", "desc": "Prevents target from activating next turn"},
    "Earth": {"symbol": "Ea", "power": "shield", "desc": "Gains +1 HP when played"},
    "Crystal": {"symbol": "Cr", "power": "draw", "desc": "Draw 1 extra card when activated"},
    "Thunder": {"symbol": "Th", "power": "aoe", "desc": "Deals 1 damage to all enemies at location"},
    "Shadow": {"symbol": "Sh", "power": "move", "desc": "Can move to adjacent location after activating"},
    "Light": {"symbol": "Li", "power": "score", "desc": "Gain 1 bonus point when destroying enemy"},
    "Nature": {"symbol": "Na", "power": "grow", "desc": "Gains +1 strength each turn it survives"},
    "Acid": {"symbol": "Ac", "power": "weaken", "desc": "Reduces target's strength by 1 permanently"},
}

NUM_LOCATIONS = 5


def _create_guild_deck(guild_name, card_count=8):
    """Create a deck of cards for one guild."""
    cards = []
    for i in range(card_count):
        value = random.choice([5, 5, 6, 6, 6, 7, 7])
        cards.append({
            "guild": guild_name,
            "value": value,
            "hp": value,
            "frozen": False,
            "grow_bonus": 0,
        })
    return cards


class RiftforceGame(BaseGame):
    """Riftforce: Battle with elemental guilds across 5 locations."""

    name = "Riftforce"
    description = "Elemental combat card game at 5 locations"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (4 guilds each)",
        "advanced": "Advanced (5 guilds each)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.guilds_per_player = 4
        self.guild_choices = {1: [], 2: []}  # chosen guild names
        self.decks = {1: [], 2: []}  # draw piles
        self.hands = {1: [], 2: []}  # cards in hand
        self.hand_size = 7
        self.locations = []  # list of 5 locations, each has units for both players
        self.destroyed = {1: 0, 2: 0}  # count of enemy units destroyed
        self.scores = [0, 0]
        self.draft_phase = True
        self.draft_round = 0
        self.available_guilds = []

    def setup(self):
        if self.variation == "advanced":
            self.guilds_per_player = 5
        else:
            self.guilds_per_player = 4

        # Initialize locations
        self.locations = []
        for i in range(NUM_LOCATIONS):
            self.locations.append({
                "name": f"Loc {i + 1}",
                "units": {1: [], 2: []},
            })

        self.destroyed = {1: 0, 2: 0}
        self.scores = [0, 0]
        self.draft_phase = True
        self.draft_round = 0
        self.available_guilds = list(ALL_GUILDS.keys())
        random.shuffle(self.available_guilds)
        self.guild_choices = {1: [], 2: []}
        self.decks = {1: [], 2: []}
        self.hands = {1: [], 2: []}

    def _finish_draft(self):
        """Set up decks and hands after draft."""
        for p in [1, 2]:
            deck = []
            for guild_name in self.guild_choices[p]:
                deck.extend(_create_guild_deck(guild_name))
            random.shuffle(deck)
            self.decks[p] = deck
            self.hands[p] = []
            self._draw_cards(p, self.hand_size)
        self.draft_phase = False

    def _draw_cards(self, player, count):
        """Draw cards from deck to hand."""
        for _ in range(count):
            if self.decks[player]:
                self.hands[player].append(self.decks[player].pop())

    def _location_control(self, loc_idx):
        """Return which player controls a location (or None)."""
        loc = self.locations[loc_idx]
        has_p1 = len(loc["units"][1]) > 0
        has_p2 = len(loc["units"][2]) > 0
        if has_p1 and not has_p2:
            return 1
        if has_p2 and not has_p1:
            return 2
        return None

    def display(self):
        clear_screen()
        print(f"{'='*70}")
        print(f"  RIFTFORCE - {self.variations[self.variation]}")
        if self.draft_phase:
            print(f"  GUILD DRAFT - {self.players[self.current_player - 1]}'s pick")
        else:
            print(f"  {self.players[self.current_player - 1]}'s turn")
        print(f"  Destroyed: {self.players[0]}={self.destroyed[1]} "
              f" {self.players[1]}={self.destroyed[2]}  (12 to win)")
        print(f"{'='*70}")

        if self.draft_phase:
            print("\n  Available Guilds:")
            for i, g in enumerate(self.available_guilds):
                info = ALL_GUILDS[g]
                print(f"    [{i}] {g:10s} ({info['symbol']}) - {info['desc']}")
            print()
            for p in [1, 2]:
                picked = ", ".join(self.guild_choices[p]) if self.guild_choices[p] else "(none)"
                print(f"  {self.players[p-1]}'s guilds: {picked}")
            print()
            return

        # Display the 5 locations
        print()
        print("  " + "-" * 66)
        print(f"  {'P1 side':>10}  |", end="")
        for i in range(NUM_LOCATIONS):
            ctrl = self._location_control(i)
            ctrl_mark = f"P{ctrl}" if ctrl else "  "
            print(f"  Loc{i+1}({ctrl_mark}) |", end="")
        print(f"  {'P2 side':>10}")
        print("  " + "-" * 66)

        # Show units at each location for P1
        max_units = max(
            max(len(self.locations[i]["units"][1]) for i in range(NUM_LOCATIONS)),
            max(len(self.locations[i]["units"][2]) for i in range(NUM_LOCATIONS)),
            1,
        )

        print(f"  {'P1 units':>10}  |", end="")
        for i in range(NUM_LOCATIONS):
            units = self.locations[i]["units"][1]
            if units:
                display_parts = []
                for u in units[:3]:
                    sym = ALL_GUILDS[u["guild"]]["symbol"]
                    frozen = "x" if u["frozen"] else ""
                    display_parts.append(f"{sym}{u['hp']}{frozen}")
                print(f" {' '.join(display_parts):>9} |", end="")
            else:
                print(f" {'---':>9} |", end="")
        print()

        print(f"  {'P2 units':>10}  |", end="")
        for i in range(NUM_LOCATIONS):
            units = self.locations[i]["units"][2]
            if units:
                display_parts = []
                for u in units[:3]:
                    sym = ALL_GUILDS[u["guild"]]["symbol"]
                    frozen = "x" if u["frozen"] else ""
                    display_parts.append(f"{sym}{u['hp']}{frozen}")
                print(f" {' '.join(display_parts):>9} |", end="")
            else:
                print(f" {'---':>9} |", end="")
        print()
        print("  " + "-" * 66)

        # Show hands
        for p in [1, 2]:
            marker = " <<" if self.current_player == p else ""
            print(f"\n  {self.players[p-1]}'s hand ({len(self.hands[p])} cards, "
                  f"deck: {len(self.decks[p])}){marker}")
            if self.current_player == p:
                for i, card in enumerate(self.hands[p]):
                    sym = ALL_GUILDS[card["guild"]]["symbol"]
                    print(f"    [{i}] {card['guild']:10s} (val {card['value']})")
            else:
                print(f"    [{len(self.hands[p])} cards hidden]")
        print()

    def get_move(self):
        if self.draft_phase:
            print(f"  Choose a guild [0-{len(self.available_guilds) - 1}]: ", end="")
            choice = input_with_quit("")
            return ("draft", choice)

        print("  Actions:")
        print("    play <card#> <location 1-5>  - Play card to a location")
        print("    activate <location 1-5>      - Activate your units at location")
        print("    draw                         - Draw 1 card and end turn")
        action = input_with_quit("  > ")
        parts = action.strip().split()
        if not parts:
            return None

        cmd = parts[0].lower()
        if cmd == "play" and len(parts) >= 3:
            return ("play", parts[1], parts[2])
        elif cmd == "activate" and len(parts) >= 2:
            return ("activate", parts[1])
        elif cmd == "draw":
            return ("draw",)
        elif cmd == "play" and len(parts) == 2:
            # Maybe they combined card and loc
            return ("play", parts[1], "")
        return None

    def make_move(self, move):
        if move is None:
            return False

        player = self.current_player
        opponent = 2 if player == 1 else 1

        if move[0] == "draft":
            try:
                idx = int(move[1].strip())
            except (ValueError, IndexError):
                return False
            if idx < 0 or idx >= len(self.available_guilds):
                return False
            guild = self.available_guilds.pop(idx)
            self.guild_choices[player].append(guild)

            # Check if draft is complete
            total_picked = len(self.guild_choices[1]) + len(self.guild_choices[2])
            if len(self.guild_choices[player]) >= self.guilds_per_player:
                if len(self.guild_choices[opponent]) >= self.guilds_per_player:
                    self._finish_draft()
            return True

        if move[0] == "play":
            try:
                card_idx = int(move[1])
                loc_idx = int(move[2]) - 1
            except (ValueError, IndexError):
                return False

            if card_idx < 0 or card_idx >= len(self.hands[player]):
                return False
            if loc_idx < 0 or loc_idx >= NUM_LOCATIONS:
                return False

            card = self.hands[player].pop(card_idx)
            unit = {
                "guild": card["guild"],
                "value": card["value"],
                "hp": card["value"],
                "frozen": False,
                "grow_bonus": 0,
            }

            # Apply Earth shield bonus
            power = ALL_GUILDS[card["guild"]]["power"]
            if power == "shield":
                unit["hp"] += 1

            self.locations[loc_idx]["units"][player].append(unit)
            return True

        if move[0] == "activate":
            try:
                loc_idx = int(move[1]) - 1
            except (ValueError, IndexError):
                return False

            if loc_idx < 0 or loc_idx >= NUM_LOCATIONS:
                return False

            my_units = self.locations[loc_idx]["units"][player]
            enemy_units = self.locations[loc_idx]["units"][opponent]

            if not my_units:
                return False

            # Process each unit's activation
            units_to_remove = []
            for unit in my_units:
                if unit["frozen"]:
                    unit["frozen"] = False
                    continue

                power = ALL_GUILDS[unit["guild"]]["power"]
                damage = unit["value"] + unit.get("grow_bonus", 0)

                if power == "deal_extra":
                    damage += 1

                if power == "aoe":
                    # Thunder: 1 damage to all enemies at location
                    for eu in enemy_units:
                        eu["hp"] -= 1
                elif power == "freeze":
                    # Freeze first enemy unit
                    if enemy_units:
                        enemy_units[0]["frozen"] = True
                elif power == "heal":
                    # Heal adjacent ally
                    adj_locs = []
                    if loc_idx > 0:
                        adj_locs.append(loc_idx - 1)
                    if loc_idx < NUM_LOCATIONS - 1:
                        adj_locs.append(loc_idx + 1)
                    for al in adj_locs:
                        for ally in self.locations[al]["units"][player]:
                            if ally["hp"] < ally["value"]:
                                ally["hp"] += 1
                                break
                elif power == "grow":
                    unit["grow_bonus"] = unit.get("grow_bonus", 0) + 1
                elif power == "move":
                    # Shadow: can move after attack
                    pass  # handled below
                elif power == "draw":
                    self._draw_cards(player, 1)
                elif power == "score":
                    pass  # bonus scored when destroying
                elif power == "weaken":
                    if enemy_units:
                        enemy_units[0]["value"] = max(1, enemy_units[0]["value"] - 1)

                # Deal damage to first enemy unit (except Thunder which does AoE)
                if power != "aoe" and enemy_units:
                    target = enemy_units[0]
                    target["hp"] -= damage

            # Remove destroyed enemy units
            destroyed_count = 0
            surviving = []
            for eu in enemy_units:
                if eu["hp"] <= 0:
                    destroyed_count += 1
                else:
                    surviving.append(eu)
            self.locations[loc_idx]["units"][opponent] = surviving
            self.destroyed[player] += destroyed_count

            # Light bonus
            for unit in my_units:
                if ALL_GUILDS[unit["guild"]]["power"] == "score" and destroyed_count > 0:
                    self.scores[player - 1] += destroyed_count

            # Shadow movement
            for unit in list(my_units):
                if ALL_GUILDS[unit["guild"]]["power"] == "move" and not unit["frozen"]:
                    # Move to an adjacent location
                    if loc_idx < NUM_LOCATIONS - 1:
                        my_units.remove(unit)
                        self.locations[loc_idx + 1]["units"][player].append(unit)
                    elif loc_idx > 0:
                        my_units.remove(unit)
                        self.locations[loc_idx - 1]["units"][player].append(unit)

            return True

        if move[0] == "draw":
            self._draw_cards(player, 1)
            return True

        return False

    def check_game_over(self):
        # Win by destroying 12 enemy units
        for p in [1, 2]:
            if self.destroyed[p] >= 12:
                self.game_over = True
                self.winner = p
                self.scores[p - 1] = self.destroyed[p]
                return

        # Win by controlling all 5 locations
        for p in [1, 2]:
            controls_all = True
            for i in range(NUM_LOCATIONS):
                if self._location_control(i) != p:
                    controls_all = False
                    break
            if controls_all:
                self.game_over = True
                self.winner = p
                return

        # Game also ends if both players have empty hands and decks
        if (not self.hands[1] and not self.decks[1] and
                not self.hands[2] and not self.decks[2]):
            self.game_over = True
            # Count remaining HP as tiebreaker
            for p in [1, 2]:
                total_hp = sum(
                    u["hp"]
                    for loc in self.locations
                    for u in loc["units"][p]
                )
                self.scores[p - 1] = self.destroyed[p] * 10 + total_hp
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        locations_data = []
        for loc in self.locations:
            loc_data = {
                "name": loc["name"],
                "units": {
                    "1": [dict(u) for u in loc["units"][1]],
                    "2": [dict(u) for u in loc["units"][2]],
                },
            }
            locations_data.append(loc_data)

        return {
            "guilds_per_player": self.guilds_per_player,
            "guild_choices": {str(k): v for k, v in self.guild_choices.items()},
            "decks": {str(k): [dict(c) for c in v] for k, v in self.decks.items()},
            "hands": {str(k): [dict(c) for c in v] for k, v in self.hands.items()},
            "hand_size": self.hand_size,
            "locations": locations_data,
            "destroyed": {str(k): v for k, v in self.destroyed.items()},
            "scores": self.scores,
            "draft_phase": self.draft_phase,
            "draft_round": self.draft_round,
            "available_guilds": self.available_guilds,
        }

    def load_state(self, state):
        self.guilds_per_player = state["guilds_per_player"]
        self.guild_choices = {int(k): v for k, v in state["guild_choices"].items()}
        self.decks = {int(k): v for k, v in state["decks"].items()}
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.hand_size = state["hand_size"]
        self.locations = []
        for loc_data in state["locations"]:
            self.locations.append({
                "name": loc_data["name"],
                "units": {
                    1: loc_data["units"]["1"],
                    2: loc_data["units"]["2"],
                },
            })
        self.destroyed = {int(k): v for k, v in state["destroyed"].items()}
        self.scores = list(state["scores"])
        self.draft_phase = state["draft_phase"]
        self.draft_round = state["draft_round"]
        self.available_guilds = state["available_guilds"]

    def get_tutorial(self):
        return """
==========================================
  RIFTFORCE - Tutorial
==========================================

Battle with elemental guilds across 5 locations along the Rift!

SETUP - GUILD DRAFT:
  10 guilds available: Fire, Water, Ice, Earth, Crystal,
  Thunder, Shadow, Light, Nature, Acid
  Players alternate picking guilds (4 each in standard, 5 in advanced).
  Each guild has a unique power!

GUILD POWERS:
  Fire    - Deals +1 damage when activated
  Water   - Heals 1 HP on an adjacent ally
  Ice     - Freezes enemy (skips their next activation)
  Earth   - Gains +1 HP when played
  Crystal - Draw 1 extra card when activated
  Thunder - Deals 1 damage to ALL enemies at location
  Shadow  - Moves to adjacent location after activating
  Light   - Gain bonus point when destroying enemy
  Nature  - Grows +1 strength each activation
  Acid    - Permanently reduces target's strength by 1

TURN ACTIONS (pick one):
  play <card#> <location>  - Play a card from hand to a location
  activate <location>      - Activate all your units at a location
  draw                     - Draw 1 card and end turn

COMBAT:
  When you activate, each of your units at that location deals
  damage equal to their value (5-7) to the first enemy unit.
  Destroyed units are removed. Each counts toward your destroy total.

WINNING:
  - Destroy 12 enemy units, OR
  - Control all 5 locations (have units where opponent has none)

CONTROLS:
  play 2 3     - Play card #2 at location 3
  activate 1   - Activate units at location 1
  draw         - Draw a card
"""
