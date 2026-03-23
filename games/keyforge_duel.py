"""KeyForge Duel - Deck-unique card combat with 3 houses."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


ALL_HOUSES = ["Brobnar", "Logos", "Mars", "Sanctum", "Shadows", "Untamed", "Dis"]

# Card templates per house
HOUSE_CARDS = {
    "Brobnar": {
        "creatures": [
            {"name": "Headhunter", "power": 5, "armor": 0, "reap_bonus": 0, "fight_bonus": 2},
            {"name": "Warchest Ogre", "power": 4, "armor": 1, "reap_bonus": 0, "fight_bonus": 1},
            {"name": "Berserker", "power": 6, "armor": 0, "reap_bonus": 0, "fight_bonus": 3},
            {"name": "Shield Maiden", "power": 3, "armor": 2, "reap_bonus": 1, "fight_bonus": 0},
        ],
        "actions": [
            {"name": "Punch", "effect": "deal_3"},
            {"name": "War Cry", "effect": "pump_all_2"},
        ],
        "artifacts": [
            {"name": "Battle Axe", "effect": "fight_bonus_1"},
        ],
    },
    "Logos": {
        "creatures": [
            {"name": "Researcher", "power": 2, "armor": 0, "reap_bonus": 1, "fight_bonus": 0},
            {"name": "Librarian", "power": 3, "armor": 0, "reap_bonus": 2, "fight_bonus": 0},
            {"name": "Archivist", "power": 2, "armor": 1, "reap_bonus": 1, "fight_bonus": 0},
            {"name": "Techno-Knight", "power": 4, "armor": 1, "reap_bonus": 0, "fight_bonus": 1},
        ],
        "actions": [
            {"name": "Phase Shift", "effect": "draw_2"},
            {"name": "Wild Wormhole", "effect": "play_top"},
        ],
        "artifacts": [
            {"name": "Data Forge", "effect": "reap_bonus_1"},
        ],
    },
    "Mars": {
        "creatures": [
            {"name": "Zorg", "power": 3, "armor": 1, "reap_bonus": 1, "fight_bonus": 1},
            {"name": "Mindwarper", "power": 4, "armor": 0, "reap_bonus": 0, "fight_bonus": 2},
            {"name": "Collector", "power": 2, "armor": 0, "reap_bonus": 2, "fight_bonus": 0},
            {"name": "War Saucer", "power": 5, "armor": 1, "reap_bonus": 1, "fight_bonus": 0},
        ],
        "actions": [
            {"name": "Ray Gun", "effect": "deal_4"},
            {"name": "Abduction", "effect": "stun_1"},
        ],
        "artifacts": [
            {"name": "Crystal Hive", "effect": "aember_start_1"},
        ],
    },
    "Sanctum": {
        "creatures": [
            {"name": "Protector", "power": 3, "armor": 3, "reap_bonus": 0, "fight_bonus": 0},
            {"name": "Champion", "power": 5, "armor": 1, "reap_bonus": 0, "fight_bonus": 1},
            {"name": "Healer", "power": 2, "armor": 1, "reap_bonus": 1, "fight_bonus": 0},
            {"name": "Paladin", "power": 4, "armor": 2, "reap_bonus": 0, "fight_bonus": 0},
        ],
        "actions": [
            {"name": "Smite", "effect": "deal_3"},
            {"name": "Blessing", "effect": "heal_all_2"},
        ],
        "artifacts": [
            {"name": "Holy Grail", "effect": "armor_all_1"},
        ],
    },
    "Shadows": {
        "creatures": [
            {"name": "Thief", "power": 2, "armor": 0, "reap_bonus": 1, "fight_bonus": 0},
            {"name": "Assassin", "power": 3, "armor": 0, "reap_bonus": 0, "fight_bonus": 3},
            {"name": "Smuggler", "power": 3, "armor": 0, "reap_bonus": 2, "fight_bonus": 0},
            {"name": "Phantom", "power": 4, "armor": 0, "reap_bonus": 1, "fight_bonus": 1},
        ],
        "actions": [
            {"name": "Steal Aember", "effect": "steal_2"},
            {"name": "Backstab", "effect": "deal_4"},
        ],
        "artifacts": [
            {"name": "Shadow Cloak", "effect": "elusive"},
        ],
    },
    "Untamed": {
        "creatures": [
            {"name": "Niffle Ape", "power": 5, "armor": 0, "reap_bonus": 0, "fight_bonus": 1},
            {"name": "Pixie", "power": 1, "armor": 0, "reap_bonus": 2, "fight_bonus": 0},
            {"name": "Bear", "power": 6, "armor": 0, "reap_bonus": 0, "fight_bonus": 2},
            {"name": "Druid", "power": 3, "armor": 0, "reap_bonus": 1, "fight_bonus": 0},
        ],
        "actions": [
            {"name": "Nature's Call", "effect": "ready_2"},
            {"name": "Regrowth", "effect": "heal_all_3"},
        ],
        "artifacts": [
            {"name": "Fertile Ground", "effect": "reap_bonus_1"},
        ],
    },
    "Dis": {
        "creatures": [
            {"name": "Ember Imp", "power": 2, "armor": 0, "reap_bonus": 0, "fight_bonus": 0},
            {"name": "Pit Fiend", "power": 5, "armor": 1, "reap_bonus": 0, "fight_bonus": 2},
            {"name": "Soul Snatcher", "power": 3, "armor": 0, "reap_bonus": 1, "fight_bonus": 1},
            {"name": "Gateway Demon", "power": 4, "armor": 0, "reap_bonus": 0, "fight_bonus": 1},
        ],
        "actions": [
            {"name": "Gateway to Dis", "effect": "destroy_all_damaged"},
            {"name": "Drain Vitality", "effect": "deal_2_all"},
        ],
        "artifacts": [
            {"name": "Lash of Broken Dreams", "effect": "steal_on_reap"},
        ],
    },
}


def generate_deck(houses):
    """Generate a unique deck from 3 houses."""
    deck = []
    for house in houses:
        house_data = HOUSE_CARDS[house]
        # Add 4 creatures
        for creature in house_data["creatures"]:
            card = dict(creature)
            card["type"] = "creature"
            card["house"] = house
            deck.append(card)
        # Add 2 actions
        for action in house_data["actions"]:
            card = dict(action)
            card["type"] = "action"
            card["house"] = house
            deck.append(card)
        # Add 1 artifact
        for artifact in house_data["artifacts"]:
            card = dict(artifact)
            card["type"] = "artifact"
            card["house"] = house
            deck.append(card)
    return deck


def make_creature_instance(card):
    """Create a battlefield creature from a card."""
    return {
        "name": card["name"],
        "house": card["house"],
        "power": card["power"],
        "max_power": card["power"],
        "armor": card["armor"],
        "reap_bonus": card["reap_bonus"],
        "fight_bonus": card["fight_bonus"],
        "ready": False,
        "stunned": False,
        "damage": 0,
    }


class KeyforgeDuelGame(BaseGame):
    """KeyForge Duel: Unique deck combat - forge 3 keys to win."""

    name = "KeyForge Duel"
    description = "Deck-unique card combat with 3 houses - forge 3 keys by reaping Aember"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Forge keys at 6 Aember each",
        "quick": "Forge keys at 4 Aember each",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.aember_to_forge = 6
        self.decks = [[], []]
        self.hands = [[], []]
        self.discard_piles = [[], []]
        self.draw_piles = [[], []]
        self.battlefields = [[], []]  # creature instances on field
        self.artifacts = [[], []]  # artifact cards in play
        self.aember = [0, 0]
        self.keys = [0, 0]
        self.houses = [[], []]
        self.active_house = [None, None]
        self.phase = "choose_house"  # "choose_house", "play_use", "end_turn"
        self.actions_this_turn = 0

    def setup(self):
        if self.variation == "quick":
            self.aember_to_forge = 4
        else:
            self.aember_to_forge = 6

        # Each player gets 3 random houses
        available = list(ALL_HOUSES)
        random.shuffle(available)
        self.houses[0] = sorted(available[:3])
        # Player 2 gets at least 1 different house
        remaining = available[3:]
        p2_houses = [available[2]]  # share one house potentially
        while len(p2_houses) < 3:
            if remaining:
                p2_houses.append(remaining.pop())
            else:
                p2_houses.append(random.choice(available[:3]))
        self.houses[1] = sorted(list(set(p2_houses))[:3])
        while len(self.houses[1]) < 3:
            extra = random.choice([h for h in ALL_HOUSES if h not in self.houses[1]])
            self.houses[1].append(extra)
        self.houses[1] = sorted(self.houses[1])

        # Generate decks
        for p in range(2):
            self.decks[p] = generate_deck(self.houses[p])
            self.draw_piles[p] = list(self.decks[p])
            random.shuffle(self.draw_piles[p])
            self.hands[p] = []
            self.discard_piles[p] = []
            self.battlefields[p] = []
            self.artifacts[p] = []
            # Draw starting hand
            for _ in range(6):
                self._draw_card(p)

        self.aember = [0, 0]
        self.keys = [0, 0]
        self.active_house = [None, None]
        self.phase = "choose_house"

    def _draw_card(self, player):
        """Draw a card for the given player."""
        if not self.draw_piles[player]:
            # Shuffle discard into draw pile
            self.draw_piles[player] = list(self.discard_piles[player])
            self.discard_piles[player] = []
            random.shuffle(self.draw_piles[player])
        if self.draw_piles[player]:
            card = self.draw_piles[player].pop()
            self.hands[player].append(card)

    def display(self):
        clear_screen()
        p = self.current_player - 1
        opp = 1 - p

        print(f"{'=' * 65}")
        print(f"  KEYFORGE DUEL - {self.aember_to_forge} Aember to forge a key")
        print(f"{'=' * 65}")

        # Both players' status
        for pi in range(2):
            marker = " <<< ACTIVE" if pi == p else ""
            key_str = "K" * self.keys[pi] + "." * (3 - self.keys[pi])
            print(f"\n  {self.players[pi]} [{key_str}] "
                  f"Aember: {self.aember[pi]}/{self.aember_to_forge} | "
                  f"Hand: {len(self.hands[pi])} | "
                  f"Deck: {len(self.draw_piles[pi])}{marker}")
            print(f"    Houses: {', '.join(self.houses[pi])}"
                  f"{' | Active: ' + self.active_house[pi] if self.active_house[pi] else ''}")

            # Battlefield
            if self.battlefields[pi]:
                print(f"    Battlefield:")
                for i, creature in enumerate(self.battlefields[pi]):
                    status = ""
                    if creature["stunned"]:
                        status = " [STUNNED]"
                    elif creature["ready"]:
                        status = " [READY]"
                    else:
                        status = " [EXHSTD]"
                    hp = creature["power"] - creature["damage"]
                    print(f"      [{i + 1}] {creature['name']} ({creature['house']}) "
                          f"Pwr:{hp}/{creature['power']} Arm:{creature['armor']}{status}")
            else:
                print(f"    Battlefield: (empty)")

            # Artifacts
            if self.artifacts[pi]:
                art_names = [a["name"] for a in self.artifacts[pi]]
                print(f"    Artifacts: {', '.join(art_names)}")

        # Current player's hand
        print(f"\n  Your Hand ({self.players[p]}):")
        if self.hands[p]:
            for i, card in enumerate(self.hands[p]):
                type_str = card["type"].upper()
                house_str = card["house"]
                if card["type"] == "creature":
                    detail = f"Pwr:{card['power']} Arm:{card['armor']}"
                    if card["reap_bonus"]:
                        detail += f" Reap+{card['reap_bonus']}"
                    if card["fight_bonus"]:
                        detail += f" Fight+{card['fight_bonus']}"
                elif card["type"] == "action":
                    detail = card["effect"]
                else:
                    detail = card["effect"]
                playable = "*" if self.active_house[p] and card["house"] == self.active_house[p] else " "
                print(f"    {playable}[{i + 1}] {card['name']} ({house_str}/{type_str}) - {detail}")
        else:
            print(f"    (empty)")

        print(f"\n  Phase: {self.phase}")
        print(f"{'=' * 65}")

    def get_move(self):
        p = self.current_player - 1

        if self.phase == "choose_house":
            # Try to forge a key first
            if self.aember[p] >= self.aember_to_forge:
                print(f"  You have {self.aember[p]} Aember! Forging a key...")
                input_with_quit("  Press Enter...")
                return ("forge", "")

            print(f"  Choose your active house for this turn:")
            for i, house in enumerate(self.houses[p]):
                count = sum(1 for c in self.hands[p] if c["house"] == house)
                field_count = sum(1 for c in self.battlefields[p] if c["house"] == house)
                print(f"    [{i + 1}] {house} ({count} in hand, {field_count} on field)")
            choice = input_with_quit("  > ").strip()
            return ("choose_house", choice)

        elif self.phase == "play_use":
            print(f"  Active house: {self.active_house[p]}")
            print(f"  Actions: (p)lay card, (u)se creature, (e)nd turn")
            action = input_with_quit("  > ").strip().lower()

            if action in ("e", "end"):
                return ("end_turn", "")
            elif action in ("p", "play"):
                print(f"  Play which card? (number):")
                idx = input_with_quit("  > ").strip()
                return ("play", idx)
            elif action in ("u", "use"):
                print(f"  Use which creature? (number on your field):")
                idx = input_with_quit("  > ").strip()
                print(f"  (r)eap for Aember or (f)ight enemy creature?")
                use_action = input_with_quit("  > ").strip().lower()
                if use_action in ("f", "fight"):
                    print(f"  Fight which enemy creature? (number):")
                    target = input_with_quit("  > ").strip()
                    return ("fight", f"{idx} {target}")
                return ("reap", idx)
            return ("invalid", "")

        return ("invalid", "")

    def make_move(self, move):
        action, data = move
        p = self.current_player - 1
        opp = 1 - p

        if action == "forge":
            self.aember[p] -= self.aember_to_forge
            self.keys[p] += 1
            print(f"\n  KEY FORGED! {self.players[p]} now has {self.keys[p]} key(s)!")
            input("  Press Enter...")
            # Still need to choose house
            return True

        if action == "choose_house":
            try:
                idx = int(data) - 1
                if idx < 0 or idx >= len(self.houses[p]):
                    return False
            except (ValueError, TypeError):
                return False
            self.active_house[p] = self.houses[p][idx]
            self.phase = "play_use"
            self.actions_this_turn = 0
            # Ready all creatures of active house
            for creature in self.battlefields[p]:
                if creature["house"] == self.active_house[p]:
                    if creature["stunned"]:
                        creature["stunned"] = False
                        creature["ready"] = False
                    else:
                        creature["ready"] = True
            return True

        if action == "play":
            try:
                idx = int(data) - 1
                if idx < 0 or idx >= len(self.hands[p]):
                    return False
            except (ValueError, TypeError):
                return False

            card = self.hands[p][idx]
            if card["house"] != self.active_house[p]:
                print(f"  Can only play {self.active_house[p]} cards this turn!")
                input("  Press Enter...")
                return False

            # Play the card
            self.hands[p].pop(idx)
            self.aember[p] += 1  # playing a card generates 1 aember

            if card["type"] == "creature":
                creature = make_creature_instance(card)
                self.battlefields[p].append(creature)
                print(f"  {card['name']} enters the battlefield!")
            elif card["type"] == "action":
                self._resolve_action(card["effect"], p, opp)
                self.discard_piles[p].append(card)
            elif card["type"] == "artifact":
                self.artifacts[p].append(card)
                print(f"  {card['name']} artifact deployed!")

            self.actions_this_turn += 1
            input("  Press Enter...")
            return True

        if action == "reap":
            try:
                idx = int(data) - 1
                if idx < 0 or idx >= len(self.battlefields[p]):
                    return False
            except (ValueError, TypeError):
                return False

            creature = self.battlefields[p][idx]
            if creature["house"] != self.active_house[p]:
                print(f"  Can only use {self.active_house[p]} creatures!")
                input("  Press Enter...")
                return False
            if not creature["ready"]:
                print(f"  {creature['name']} is not ready!")
                input("  Press Enter...")
                return False

            creature["ready"] = False
            aember_gained = 1 + creature["reap_bonus"]
            # Check for artifact bonuses
            for art in self.artifacts[p]:
                if art["effect"] == "reap_bonus_1":
                    aember_gained += 1
                elif art["effect"] == "steal_on_reap":
                    if self.aember[opp] > 0:
                        self.aember[opp] -= 1
                        aember_gained += 1
            self.aember[p] += aember_gained
            print(f"  {creature['name']} reaps for {aember_gained} Aember!")
            input("  Press Enter...")
            return True

        if action == "fight":
            try:
                parts = data.split()
                my_idx = int(parts[0]) - 1
                target_idx = int(parts[1]) - 1
                if my_idx < 0 or my_idx >= len(self.battlefields[p]):
                    return False
                if target_idx < 0 or target_idx >= len(self.battlefields[opp]):
                    return False
            except (ValueError, IndexError, TypeError):
                return False

            creature = self.battlefields[p][my_idx]
            target = self.battlefields[opp][target_idx]

            if creature["house"] != self.active_house[p]:
                print(f"  Can only use {self.active_house[p]} creatures!")
                input("  Press Enter...")
                return False
            if not creature["ready"]:
                print(f"  {creature['name']} is not ready!")
                input("  Press Enter...")
                return False

            creature["ready"] = False

            # Combat
            my_damage = creature["power"] + creature["fight_bonus"]
            # Check for artifact fight bonus
            for art in self.artifacts[p]:
                if art["effect"] == "fight_bonus_1":
                    my_damage += 1
            target_damage = target["power"]

            # Apply damage considering armor
            actual_to_target = max(0, my_damage - target["armor"])
            actual_to_me = max(0, target_damage - creature["armor"])

            target["damage"] += actual_to_target
            creature["damage"] += actual_to_me

            print(f"  {creature['name']} fights {target['name']}!")
            print(f"  Deals {actual_to_target} damage, takes {actual_to_me} damage")

            # Check for deaths
            destroyed = []
            if target["damage"] >= target["power"]:
                print(f"  {target['name']} is DESTROYED!")
                destroyed.append(("opp", target_idx))
            if creature["damage"] >= creature["power"]:
                print(f"  {creature['name']} is DESTROYED!")
                destroyed.append(("me", my_idx))

            # Remove destroyed creatures (reverse to preserve indices)
            for side, idx in sorted(destroyed, key=lambda x: -x[1]):
                if side == "opp":
                    dead = self.battlefields[opp].pop(idx)
                    self.discard_piles[opp].append({
                        "name": dead["name"], "house": dead["house"],
                        "type": "creature", "power": dead["max_power"],
                        "armor": dead["armor"], "reap_bonus": dead["reap_bonus"],
                        "fight_bonus": dead["fight_bonus"],
                    })
                else:
                    dead = self.battlefields[p].pop(idx)
                    self.discard_piles[p].append({
                        "name": dead["name"], "house": dead["house"],
                        "type": "creature", "power": dead["max_power"],
                        "armor": dead["armor"], "reap_bonus": dead["reap_bonus"],
                        "fight_bonus": dead["fight_bonus"],
                    })

            input("  Press Enter...")
            return True

        if action == "end_turn":
            # Draw up to 6 cards
            while len(self.hands[p]) < 6:
                self._draw_card(p)
            self.phase = "choose_house"
            self.active_house[p] = None
            return True

        return False

    def _resolve_action(self, effect, p, opp):
        """Resolve an action card effect."""
        if effect == "deal_3":
            if self.battlefields[opp]:
                target = self.battlefields[opp][0]  # hit first creature
                dmg = max(0, 3 - target["armor"])
                target["damage"] += dmg
                print(f"  Deals 3 damage to {target['name']}! ({dmg} after armor)")
                if target["damage"] >= target["power"]:
                    print(f"  {target['name']} is DESTROYED!")
                    dead = self.battlefields[opp].pop(0)
                    self.discard_piles[opp].append({
                        "name": dead["name"], "house": dead["house"],
                        "type": "creature", "power": dead["max_power"],
                        "armor": dead["armor"], "reap_bonus": dead["reap_bonus"],
                        "fight_bonus": dead["fight_bonus"],
                    })
            else:
                print(f"  No enemy creatures to target!")

        elif effect == "deal_4":
            if self.battlefields[opp]:
                target = self.battlefields[opp][0]
                dmg = max(0, 4 - target["armor"])
                target["damage"] += dmg
                print(f"  Deals 4 damage to {target['name']}! ({dmg} after armor)")
                if target["damage"] >= target["power"]:
                    print(f"  {target['name']} is DESTROYED!")
                    dead = self.battlefields[opp].pop(0)
                    self.discard_piles[opp].append({
                        "name": dead["name"], "house": dead["house"],
                        "type": "creature", "power": dead["max_power"],
                        "armor": dead["armor"], "reap_bonus": dead["reap_bonus"],
                        "fight_bonus": dead["fight_bonus"],
                    })
            else:
                print(f"  No enemy creatures to target!")

        elif effect == "deal_2_all":
            destroyed = []
            for i, creature in enumerate(self.battlefields[opp]):
                dmg = max(0, 2 - creature["armor"])
                creature["damage"] += dmg
                if creature["damage"] >= creature["power"]:
                    destroyed.append(i)
            for i in reversed(destroyed):
                dead = self.battlefields[opp].pop(i)
                self.discard_piles[opp].append({
                    "name": dead["name"], "house": dead["house"],
                    "type": "creature", "power": dead["max_power"],
                    "armor": dead["armor"], "reap_bonus": dead["reap_bonus"],
                    "fight_bonus": dead["fight_bonus"],
                })
                print(f"  {dead['name']} is DESTROYED!")
            print(f"  Deals 2 damage to all enemy creatures!")

        elif effect == "pump_all_2":
            for creature in self.battlefields[p]:
                if creature["house"] == self.active_house[p]:
                    creature["power"] += 2
                    creature["max_power"] += 2
            print(f"  All friendly {self.active_house[p]} creatures gain +2 power!")

        elif effect == "draw_2":
            self._draw_card(p)
            self._draw_card(p)
            print(f"  Draw 2 cards!")

        elif effect == "play_top":
            if self.draw_piles[p]:
                card = self.draw_piles[p][-1]
                if card["house"] == self.active_house[p]:
                    self.draw_piles[p].pop()
                    if card["type"] == "creature":
                        self.battlefields[p].append(make_creature_instance(card))
                    print(f"  Play top card: {card['name']}!")
                else:
                    print(f"  Top card is {card['house']} - wrong house!")
            else:
                print(f"  Deck is empty!")

        elif effect == "steal_2":
            stolen = min(2, self.aember[opp])
            self.aember[opp] -= stolen
            self.aember[p] += stolen
            print(f"  Steal {stolen} Aember!")

        elif effect == "stun_1":
            if self.battlefields[opp]:
                target = self.battlefields[opp][0]
                target["stunned"] = True
                target["ready"] = False
                print(f"  {target['name']} is STUNNED!")
            else:
                print(f"  No enemy creatures to stun!")

        elif effect == "ready_2":
            count = 0
            for creature in self.battlefields[p]:
                if creature["house"] == self.active_house[p] and not creature["ready"] and count < 2:
                    creature["ready"] = True
                    count += 1
            print(f"  Ready {count} friendly creatures!")

        elif effect == "heal_all_2" or effect == "heal_all_3":
            heal_amt = 2 if effect == "heal_all_2" else 3
            for creature in self.battlefields[p]:
                creature["damage"] = max(0, creature["damage"] - heal_amt)
            print(f"  Heal all friendly creatures for {heal_amt}!")

        elif effect == "destroy_all_damaged":
            destroyed = []
            for i, creature in enumerate(self.battlefields[opp]):
                if creature["damage"] > 0:
                    destroyed.append(i)
            for i in reversed(destroyed):
                dead = self.battlefields[opp].pop(i)
                self.discard_piles[opp].append({
                    "name": dead["name"], "house": dead["house"],
                    "type": "creature", "power": dead["max_power"],
                    "armor": dead["armor"], "reap_bonus": dead["reap_bonus"],
                    "fight_bonus": dead["fight_bonus"],
                })
                print(f"  {dead['name']} destroyed!")
            print(f"  All damaged enemy creatures destroyed!")

    def check_game_over(self):
        for pi in range(2):
            if self.keys[pi] >= 3:
                self.game_over = True
                self.winner = pi + 1
                return

    def get_state(self):
        return {
            "aember_to_forge": self.aember_to_forge,
            "hands": self.hands,
            "discard_piles": self.discard_piles,
            "draw_piles": self.draw_piles,
            "battlefields": self.battlefields,
            "artifacts": self.artifacts,
            "aember": self.aember,
            "keys": self.keys,
            "houses": self.houses,
            "active_house": self.active_house,
            "phase": self.phase,
            "actions_this_turn": self.actions_this_turn,
        }

    def load_state(self, state):
        self.aember_to_forge = state["aember_to_forge"]
        self.hands = state["hands"]
        self.discard_piles = state["discard_piles"]
        self.draw_piles = state["draw_piles"]
        self.battlefields = state["battlefields"]
        self.artifacts = state["artifacts"]
        self.aember = state["aember"]
        self.keys = state["keys"]
        self.houses = state["houses"]
        self.active_house = state["active_house"]
        self.phase = state["phase"]
        self.actions_this_turn = state["actions_this_turn"]

    def get_tutorial(self):
        return """
====================================
  KEYFORGE DUEL - Tutorial
====================================

OVERVIEW:
  Each player has a unique deck made from 3 houses.
  Forge 3 keys by collecting Aember. First to 3 keys wins!

TURN STRUCTURE:
  1. FORGE: If you have enough Aember, forge a key automatically
  2. CHOOSE HOUSE: Pick one of your 3 houses as active
  3. PLAY/USE: Play cards from hand and use creatures on the field
     - Only cards matching your active house can be played/used
  4. END TURN: Draw back up to 6 cards

CARD TYPES:
  Creatures - Deploy to your battlefield
    * REAP: Exhaust to gain 1+ Aember (+ reap bonus)
    * FIGHT: Exhaust to attack an enemy creature
  Actions   - One-time effects (damage, healing, stealing, etc.)
  Artifacts - Persistent bonuses that stay in play

COMBAT:
  Your creature's power + fight bonus vs enemy creature
  Both deal damage simultaneously
  Armor reduces incoming damage
  Creatures with damage >= power are destroyed

AEMBER & KEYS:
  Playing any card generates 1 Aember
  Reaping with creatures generates 1+ Aember
  Forge a key when you reach the Aember threshold

COMMANDS:
  (p)lay - Play a card from hand
  (u)se  - Use a creature (reap or fight)
  (e)nd  - End your turn
  Type 'help' for controls, 'quit' to exit
"""
