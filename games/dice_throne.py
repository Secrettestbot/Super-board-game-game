"""Dice Throne - Dice combat game with unique character powers (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Character definitions: name -> {abilities: {pattern_name: {check, damage, description}}, passive}
CHARACTERS = {
    "Warrior": {
        "title": "Warrior",
        "passive": "Iron Will: Take 1 less damage from all attacks (min 1)",
        "abilities": [
            {"name": "Slash", "pattern": "pair", "damage": 6, "desc": "Any pair: Deal 6 damage"},
            {"name": "Shield Bash", "pattern": "two_pair", "damage": 10, "desc": "Two pair: Deal 10 damage"},
            {"name": "Whirlwind", "pattern": "small_straight", "damage": 14, "desc": "Small straight (4 seq): Deal 14 damage"},
            {"name": "Berserker Rage", "pattern": "large_straight", "damage": 18, "desc": "Large straight (5 seq): Deal 18 damage"},
            {"name": "Executioner", "pattern": "five_kind", "damage": 25, "desc": "Five of a kind: Deal 25 damage"},
        ],
    },
    "Mage": {
        "title": "Mage",
        "passive": "Arcane Shield: 25% chance to negate an attack entirely",
        "abilities": [
            {"name": "Magic Missile", "pattern": "pair", "damage": 5, "desc": "Any pair: Deal 5 damage + heal 2"},
            {"name": "Fireball", "pattern": "three_kind", "damage": 12, "desc": "Three of a kind: Deal 12 damage"},
            {"name": "Lightning Bolt", "pattern": "full_house", "damage": 16, "desc": "Full house: Deal 16 damage"},
            {"name": "Meteor", "pattern": "four_kind", "damage": 20, "desc": "Four of a kind: Deal 20 damage"},
            {"name": "Arcane Annihilation", "pattern": "five_kind", "damage": 28, "desc": "Five of a kind: Deal 28 damage"},
        ],
    },
    "Ranger": {
        "title": "Ranger",
        "passive": "Quick Shot: Deal 2 bonus damage on straights",
        "abilities": [
            {"name": "Arrow Shot", "pattern": "pair", "damage": 5, "desc": "Any pair: Deal 5 damage"},
            {"name": "Double Shot", "pattern": "two_pair", "damage": 9, "desc": "Two pair: Deal 9 damage"},
            {"name": "Volley", "pattern": "small_straight", "damage": 16, "desc": "Small straight (4 seq): Deal 16 damage (+2 bonus)"},
            {"name": "Rain of Arrows", "pattern": "large_straight", "damage": 22, "desc": "Large straight (5 seq): Deal 22 damage (+2 bonus)"},
            {"name": "Headshot", "pattern": "five_kind", "damage": 24, "desc": "Five of a kind: Deal 24 damage"},
        ],
    },
    "Rogue": {
        "title": "Rogue",
        "passive": "Backstab: Deal +3 damage if opponent's last attack missed",
        "abilities": [
            {"name": "Dagger Slash", "pattern": "pair", "damage": 5, "desc": "Any pair: Deal 5 damage"},
            {"name": "Poison Strike", "pattern": "three_kind", "damage": 10, "desc": "Three of a kind: Deal 10 damage + 3 poison"},
            {"name": "Shadow Dance", "pattern": "small_straight", "damage": 14, "desc": "Small straight (4 seq): Deal 14 damage"},
            {"name": "Assassinate", "pattern": "four_kind", "damage": 22, "desc": "Four of a kind: Deal 22 damage"},
            {"name": "Death Mark", "pattern": "five_kind", "damage": 30, "desc": "Five of a kind: Deal 30 damage"},
        ],
    },
}


def check_pattern(dice, pattern):
    """Check if dice match a given pattern."""
    counts = {}
    for d in dice:
        counts[d] = counts.get(d, 0) + 1
    sorted_dice = sorted(dice)
    vals = sorted(counts.values(), reverse=True)

    if pattern == "pair":
        return vals[0] >= 2
    elif pattern == "two_pair":
        return len([v for v in vals if v >= 2]) >= 2
    elif pattern == "three_kind":
        return vals[0] >= 3
    elif pattern == "four_kind":
        return vals[0] >= 4
    elif pattern == "five_kind":
        return vals[0] >= 5
    elif pattern == "full_house":
        return vals[0] >= 3 and len(vals) >= 2 and vals[1] >= 2
    elif pattern == "small_straight":
        unique = sorted(set(sorted_dice))
        for start in range(len(unique) - 3):
            if unique[start + 3] - unique[start] == 3:
                seq = True
                for i in range(start, start + 3):
                    if unique[i + 1] - unique[i] != 1:
                        seq = False
                        break
                if seq:
                    return True
        return False
    elif pattern == "large_straight":
        unique = sorted(set(sorted_dice))
        if len(unique) == 5 and unique[4] - unique[0] == 4:
            for i in range(4):
                if unique[i + 1] - unique[i] != 1:
                    return False
            return True
        return False
    return False


def get_best_ability(dice, character_name):
    """Return the best matching ability for the dice roll, or None."""
    char = CHARACTERS[character_name]
    best = None
    for ability in char["abilities"]:
        if check_pattern(dice, ability["pattern"]):
            if best is None or ability["damage"] > best["damage"]:
                best = ability
    return best


class DiceThroneGame(BaseGame):
    """Dice Throne - Roll dice, activate character abilities, deal damage."""

    name = "Dice Throne"
    description = "Dice combat game with unique character powers"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (50 HP)",
        "quick": "Quick game (30 HP)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_hp = 50 if self.variation != "quick" else 30
        self.hp = {1: self.max_hp, 2: self.max_hp}
        self.characters = {1: None, 2: None}
        self.dice = [1, 1, 1, 1, 1]
        self.kept = [False, False, False, False, False]
        self.rerolls_left = 2
        self.phase = "choose_character"  # choose_character, roll, choose_keep, activate
        self.log = []
        self.poison = {1: 0, 2: 0}
        self.last_attack_missed = {1: False, 2: False}
        self.choosing_player = 1

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        self.max_hp = 50 if self.variation != "quick" else 30
        self.hp = {1: self.max_hp, 2: self.max_hp}
        self.characters = {1: None, 2: None}
        self.dice = [1, 1, 1, 1, 1]
        self.kept = [False, False, False, False, False]
        self.rerolls_left = 2
        self.phase = "choose_character"
        self.log = []
        self.poison = {1: 0, 2: 0}
        self.last_attack_missed = {1: False, 2: False}
        self.choosing_player = 1
        self.game_over = False
        self.winner = None

    def display(self):
        clear_screen()
        print("=" * 56)
        print("           D I C E   T H R O N E")
        print("=" * 56)

        for p in (1, 2):
            char_name = self.characters[p] if self.characters[p] else "???"
            bar_len = 20
            filled = int((self.hp[p] / self.max_hp) * bar_len) if self.hp[p] > 0 else 0
            bar = "#" * filled + "-" * (bar_len - filled)
            poison_str = f" [Poison: {self.poison[p]}]" if self.poison[p] > 0 else ""
            marker = " <<" if self.current_player == p and self.phase != "choose_character" else ""
            print(f"\n  {self.players[p-1]} ({char_name}){marker}")
            print(f"  HP: [{bar}] {self.hp[p]}/{self.max_hp}{poison_str}")

        if self.phase == "choose_character":
            print(f"\n  {self.players[self.choosing_player - 1]}, choose your character!")
            print()
            available = self._available_characters()
            for i, name in enumerate(available, 1):
                char = CHARACTERS[name]
                print(f"  {i}. {name}")
                print(f"     Passive: {char['passive']}")
                for ab in char["abilities"]:
                    print(f"     - {ab['desc']}")
                print()
        elif self.phase in ("roll", "choose_keep", "activate"):
            print(f"\n  --- {self.players[self.current_player - 1]}'s Turn ---")
            char = CHARACTERS[self.characters[self.current_player]]
            print(f"  Character: {char['title']}  |  Passive: {char['passive']}")
            print()
            self._display_dice()
            ability = get_best_ability(self.dice, self.characters[self.current_player])
            if ability:
                print(f"\n  Best match: {ability['name']} ({ability['damage']} dmg)")
            else:
                print(f"\n  No ability matches current dice.")
            print(f"  Rerolls remaining: {self.rerolls_left}")

        if self.log:
            print(f"\n  --- Log ---")
            for msg in self.log[-5:]:
                print(f"  {msg}")
        print()

    def _display_dice(self):
        die_top = []
        die_mid = []
        die_bot = []
        for i in range(5):
            v = self.dice[i]
            k = "*" if self.kept[i] else " "
            die_top.append(f"+-----+")
            die_mid.append(f"|{k} {v} {k}|")
            die_bot.append(f"+-----+")
        print("  " + "  ".join(die_top))
        print("  " + "  ".join(die_mid))
        print("  " + "  ".join(die_bot))
        labels = [f"  {i+1}    " for i in range(5)]
        print("  " + "".join(labels))
        kept_str = "  " + "  ".join(["  KEPT " if self.kept[i] else "       " for i in range(5)])
        print(kept_str)

    def _available_characters(self):
        taken = [self.characters[p] for p in (1, 2) if self.characters[p]]
        return [c for c in CHARACTERS if c not in taken]

    def get_move(self):
        if self.phase == "choose_character":
            available = self._available_characters()
            prompt = f"  Choose character (1-{len(available)}): "
            return ("choose_char", input_with_quit(prompt))
        elif self.phase == "roll":
            return ("roll", input_with_quit("  Press Enter to roll dice: "))
        elif self.phase == "choose_keep":
            print("  Enter dice to keep/unkeep (e.g. '1 3 5'), 'all' to keep all,")
            return ("keep", input_with_quit("  or 'done' to activate ability: "))
        elif self.phase == "activate":
            return ("activate", input_with_quit("  Press Enter to activate ability: "))
        return ("unknown", "")

    def make_move(self, move):
        action, value = move

        if action == "choose_char":
            available = self._available_characters()
            try:
                idx = int(value.strip()) - 1
                if 0 <= idx < len(available):
                    chosen = available[idx]
                    self.characters[self.choosing_player] = chosen
                    self._add_log(f"{self.players[self.choosing_player - 1]} chose {chosen}!")
                    if self.choosing_player == 1:
                        self.choosing_player = 2
                    else:
                        self.phase = "roll"
                        self._roll_all()
                    return True
            except ValueError:
                pass
            return False

        elif action == "roll":
            self._roll_all()
            self.phase = "choose_keep"
            return True

        elif action == "keep":
            val = value.strip().lower()
            if val == "done":
                self.phase = "activate"
                return True
            elif val == "all":
                self.kept = [True, True, True, True, True]
                self.phase = "activate"
                return True
            elif val == "":
                # reroll all unkept dice
                if self.rerolls_left > 0:
                    self._reroll()
                    self.rerolls_left -= 1
                    if self.rerolls_left == 0:
                        self.phase = "activate"
                    return True
                else:
                    self.phase = "activate"
                    return True
            else:
                try:
                    indices = [int(x) - 1 for x in val.split()]
                    if all(0 <= i < 5 for i in indices):
                        for i in indices:
                            self.kept[i] = not self.kept[i]
                        if self.rerolls_left > 0:
                            self._reroll()
                            self.rerolls_left -= 1
                            if self.rerolls_left == 0:
                                self.phase = "activate"
                        else:
                            self.phase = "activate"
                        return True
                except ValueError:
                    pass
                return False

        elif action == "activate":
            self._resolve_attack()
            # Apply poison
            cp = self.current_player
            if self.poison[cp] > 0:
                self.hp[cp] -= self.poison[cp]
                self._add_log(f"{self.players[cp - 1]} takes {self.poison[cp]} poison damage!")
                self.poison[cp] = max(0, self.poison[cp] - 1)
            # Reset for next turn
            self.phase = "roll"
            self.kept = [False, False, False, False, False]
            self.rerolls_left = 2
            self._roll_all()
            return True

        return False

    def _roll_all(self):
        self.dice = [random.randint(1, 6) for _ in range(5)]
        self.kept = [False, False, False, False, False]

    def _reroll(self):
        for i in range(5):
            if not self.kept[i]:
                self.dice[i] = random.randint(1, 6)

    def _resolve_attack(self):
        cp = self.current_player
        opp = 2 if cp == 1 else 1
        char_name = self.characters[cp]
        opp_char_name = self.characters[opp]

        ability = get_best_ability(self.dice, char_name)
        if ability is None:
            self._add_log(f"{self.players[cp - 1]} attacks but no ability matches! Miss!")
            self.last_attack_missed[cp] = True
            return

        damage = ability["damage"]

        # Rogue backstab passive
        if char_name == "Rogue" and self.last_attack_missed[opp]:
            damage += 3
            self._add_log(f"Backstab! +3 bonus damage!")

        # Ranger straight bonus
        if char_name == "Ranger" and ability["pattern"] in ("small_straight", "large_straight"):
            damage += 2

        # Warrior passive (opponent takes less damage)
        if opp_char_name == "Warrior":
            damage = max(1, damage - 1)

        # Mage passive (25% chance to negate)
        if opp_char_name == "Mage" and random.random() < 0.25:
            self._add_log(f"Arcane Shield! {self.players[opp - 1]} negates the attack!")
            self.last_attack_missed[cp] = True
            return

        self.hp[opp] -= damage
        self._add_log(f"{self.players[cp - 1]} uses {ability['name']}! {damage} damage to {self.players[opp - 1]}!")
        self.last_attack_missed[cp] = False

        # Mage heal on pair
        if char_name == "Mage" and ability["pattern"] == "pair":
            self.hp[cp] = min(self.max_hp, self.hp[cp] + 2)
            self._add_log(f"{self.players[cp - 1]} heals 2 HP!")

        # Rogue poison on three_kind
        if char_name == "Rogue" and ability["pattern"] == "three_kind":
            self.poison[opp] += 3
            self._add_log(f"{self.players[opp - 1]} is poisoned! (3 per turn)")

    def check_game_over(self):
        for p in (1, 2):
            if self.hp[p] <= 0:
                self.hp[p] = 0
                self.game_over = True
                self.winner = 2 if p == 1 else 1
                return
        if self.phase == "choose_character":
            return

    def get_state(self):
        return {
            "max_hp": self.max_hp,
            "hp": {"1": self.hp[1], "2": self.hp[2]},
            "characters": {"1": self.characters[1], "2": self.characters[2]},
            "dice": self.dice,
            "kept": self.kept,
            "rerolls_left": self.rerolls_left,
            "phase": self.phase,
            "log": self.log,
            "poison": {"1": self.poison[1], "2": self.poison[2]},
            "last_attack_missed": {"1": self.last_attack_missed[1], "2": self.last_attack_missed[2]},
            "choosing_player": self.choosing_player,
        }

    def load_state(self, state):
        self.max_hp = state["max_hp"]
        self.hp = {1: state["hp"]["1"], 2: state["hp"]["2"]}
        self.characters = {1: state["characters"]["1"], 2: state["characters"]["2"]}
        self.dice = state["dice"]
        self.kept = state["kept"]
        self.rerolls_left = state["rerolls_left"]
        self.phase = state["phase"]
        self.log = state["log"]
        self.poison = {1: state["poison"]["1"], 2: state["poison"]["2"]}
        self.last_attack_missed = {1: state["last_attack_missed"]["1"], 2: state["last_attack_missed"]["2"]}
        self.choosing_player = state["choosing_player"]
        self._resumed = True

    def get_tutorial(self):
        return """
=== DICE THRONE TUTORIAL ===

Dice Throne is a 2-player dice combat game where each player picks a unique
character and battles using Yahtzee-style dice rolling.

HOW TO PLAY:
1. Each player picks a character: Warrior, Mage, Ranger, or Rogue
2. On your turn, roll 5 dice
3. Choose which dice to keep, then reroll the rest (up to 2 rerolls)
4. Your best matching ability activates automatically
5. Deal damage to your opponent based on the ability

DICE PATTERNS (weakest to strongest):
  - Pair: Two dice showing the same number
  - Two Pair: Two different pairs
  - Three of a Kind: Three dice the same
  - Small Straight: Four sequential numbers (e.g. 2-3-4-5)
  - Full House: Three of a kind + a pair
  - Large Straight: Five sequential numbers (e.g. 1-2-3-4-5)
  - Four of a Kind: Four dice the same
  - Five of a Kind: All five dice the same (Yahtzee!)

CHARACTERS:
  Warrior - Balanced fighter, takes 1 less damage from all attacks
  Mage    - Spell caster, 25% chance to negate attacks, heals on pairs
  Ranger  - Sharpshooter, bonus damage on straights
  Rogue   - Assassin, bonus damage after opponent misses, poison on 3-of-a-kind

CONTROLS:
  Enter dice numbers to toggle keep (e.g. '1 3 5')
  Press Enter with no input to reroll all unkept dice
  Type 'done' to activate your ability immediately
  Type 'all' to keep all dice

The game ends when a player's HP reaches 0!
"""
