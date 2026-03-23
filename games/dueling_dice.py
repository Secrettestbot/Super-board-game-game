"""Dueling Dice - Dice-drafting combat game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class DuelingDiceGame(BaseGame):
    """Dueling Dice - Draft dice for attack and defense in tactical combat."""

    name = "Dueling Dice"
    description = "Dice-drafting combat - draft dice, assign to attack or defense, battle!"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (20 HP, 9 dice)",
        "quick": "Quick (12 HP, 7 dice)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_hp = 20
        self.num_dice = 9
        self.hp = {1: 20, 2: 20}
        self.dice_pool = []  # rolled dice available for drafting
        self.attack_slots = {1: [], 2: []}  # dice assigned to attack
        self.defense_slots = {1: [], 2: []}  # dice assigned to defense
        self.max_attack = 3
        self.max_defense = 2
        self.phase = "rolling"  # "rolling", "drafting", "combat", "round_over"
        self.draft_turn = 1  # who drafts next
        self.round_number = 0
        self.combat_log = []
        self.log = []

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 10:
            self.log = self.log[-10:]

    def setup(self):
        if self.variation == "quick":
            self.max_hp = 12
            self.num_dice = 7
            self.max_attack = 2
            self.max_defense = 2
        else:
            self.max_hp = 20
            self.num_dice = 9
            self.max_attack = 3
            self.max_defense = 2

        self.hp = {1: self.max_hp, 2: self.max_hp}
        self.dice_pool = []
        self.attack_slots = {1: [], 2: []}
        self.defense_slots = {1: [], 2: []}
        self.phase = "rolling"
        self.draft_turn = 1
        self.round_number = 0
        self.combat_log = []
        self.log = []
        self.game_over = False
        self.winner = None
        self.current_player = 1

    def _roll_dice(self):
        """Roll the shared dice pool."""
        self.dice_pool = sorted([random.randint(1, 6) for _ in range(self.num_dice)],
                                reverse=True)
        self.attack_slots = {1: [], 2: []}
        self.defense_slots = {1: [], 2: []}
        self.phase = "drafting"
        self.draft_turn = 1
        self.round_number += 1

    def _total_drafted(self, player):
        return len(self.attack_slots[player]) + len(self.defense_slots[player])

    def _max_draft(self):
        return self.max_attack + self.max_defense

    def _all_drafted(self):
        """Check if both players have drafted their maximum dice."""
        for p in [1, 2]:
            if self._total_drafted(p) < self._max_draft() and self.dice_pool:
                return False
        return True

    def _resolve_combat(self):
        """Resolve combat between players."""
        self.combat_log = []

        for attacker in [1, 2]:
            defender = 2 if attacker == 1 else 1
            atk_dice = sorted(self.attack_slots[attacker], reverse=True)
            def_dice = sorted(self.defense_slots[defender], reverse=True)

            total_atk = sum(atk_dice)
            total_def = sum(def_dice)

            damage = max(0, total_atk - total_def)
            self.hp[defender] -= damage

            atk_str = "+".join(str(d) for d in atk_dice) if atk_dice else "0"
            def_str = "+".join(str(d) for d in def_dice) if def_dice else "0"
            self.combat_log.append(
                f"{self.players[attacker-1]} attacks: [{atk_str}]={total_atk} "
                f"vs defense [{def_str}]={total_def} -> {damage} damage!"
            )
            self._add_log(
                f"R{self.round_number}: {self.players[attacker-1]} deals {damage} dmg "
                f"to {self.players[defender-1]}"
            )

        self.phase = "combat"

    def _hp_bar(self, current, maximum):
        """Create an ASCII HP bar."""
        bar_width = 20
        filled = max(0, int(bar_width * current / maximum))
        empty = bar_width - filled
        return f"[{'#' * filled}{'.' * empty}] {current}/{maximum}"

    def display(self):
        clear_screen()
        print("=" * 60)
        print(f"  DUELING DICE - Round {self.round_number}")
        print("=" * 60)

        # HP bars
        for p in [1, 2]:
            hp_bar = self._hp_bar(self.hp[p], self.max_hp)
            print(f"  {self.players[p-1]:12s} HP: {hp_bar}")

        print()

        if self.phase == "rolling":
            print("  Press Enter to roll the dice!")

        elif self.phase == "drafting":
            # Show dice pool
            pool_str = " ".join(f"[{d}]" for d in self.dice_pool)
            print(f"  Dice Pool: {pool_str}")
            print()

            # Show each player's slots
            for p in [1, 2]:
                atk = " ".join(f"[{d}]" for d in self.attack_slots[p])
                if not atk:
                    atk = "_  " * self.max_attack
                else:
                    remaining = self.max_attack - len(self.attack_slots[p])
                    if remaining > 0:
                        atk += " " + "_  " * remaining

                dfn = " ".join(f"[{d}]" for d in self.defense_slots[p])
                if not dfn:
                    dfn = "_  " * self.max_defense
                else:
                    remaining = self.max_defense - len(self.defense_slots[p])
                    if remaining > 0:
                        dfn += " " + "_  " * remaining

                marker = " <--" if self.current_player == p else ""
                print(f"  {self.players[p-1]:12s}  ATK: {atk}  DEF: {dfn}{marker}")

            print()

        elif self.phase == "combat":
            print("  === COMBAT RESULTS ===")
            for line in self.combat_log:
                print(f"  {line}")
            print()

            # Show final slot assignments
            for p in [1, 2]:
                atk = " ".join(f"[{d}]" for d in self.attack_slots[p])
                dfn = " ".join(f"[{d}]" for d in self.defense_slots[p])
                print(f"  {self.players[p-1]:12s}  ATK: {atk or '(none)'}  DEF: {dfn or '(none)'}")
            print()

        if self.log:
            print("  History:")
            for msg in self.log[-6:]:
                print(f"    {msg}")
        print()

    def get_move(self):
        p = self.current_player

        if self.phase == "rolling":
            input_with_quit("  Press Enter to roll dice...")
            return "roll"

        if self.phase == "combat":
            input_with_quit("  Press Enter to continue to next round...")
            return "next_round"

        if self.phase == "drafting":
            if not self.dice_pool or self._total_drafted(p) >= self._max_draft():
                # This player is done drafting
                input_with_quit(f"  {self.players[p-1]} is done drafting. Press Enter...")
                return "done_drafting"

            print(f"  {self.players[p-1]}'s draft turn:")
            pool_str = " ".join(f"{i}:{self.dice_pool[i]}" for i in range(len(self.dice_pool)))
            print(f"  Available dice: {pool_str}")
            print(f"  Attack slots: {len(self.attack_slots[p])}/{self.max_attack} | "
                  f"Defense slots: {len(self.defense_slots[p])}/{self.max_defense}")

            while True:
                # Choose a die
                choice = input_with_quit("  Pick a die (index number): ").strip()
                try:
                    idx = int(choice)
                    if 0 <= idx < len(self.dice_pool):
                        die_val = self.dice_pool[idx]
                    else:
                        print(f"  Enter 0-{len(self.dice_pool)-1}")
                        continue
                except ValueError:
                    print("  Enter a number.")
                    continue

                # Choose slot
                can_atk = len(self.attack_slots[p]) < self.max_attack
                can_def = len(self.defense_slots[p]) < self.max_defense

                if can_atk and can_def:
                    while True:
                        slot = input_with_quit(f"  Assign [{die_val}] to (a)ttack or (d)efense? ").strip().lower()
                        if slot in ("a", "attack"):
                            return {"die_index": idx, "slot": "attack"}
                        elif slot in ("d", "defense"):
                            return {"die_index": idx, "slot": "defense"}
                        else:
                            print("  Enter 'a' for attack or 'd' for defense.")
                elif can_atk:
                    print(f"  Defense full. [{die_val}] goes to attack.")
                    return {"die_index": idx, "slot": "attack"}
                elif can_def:
                    print(f"  Attack full. [{die_val}] goes to defense.")
                    return {"die_index": idx, "slot": "defense"}
                else:
                    return "done_drafting"

        return "roll"

    def make_move(self, move):
        p = self.current_player

        if move == "roll":
            self._roll_dice()
            self._add_log(f"Round {self.round_number}: Dice rolled!")
            return True

        if move == "next_round":
            self.phase = "rolling"
            return True

        if move == "done_drafting":
            # Check if both players are done
            other = 2 if p == 1 else 1
            if (self._total_drafted(other) >= self._max_draft() or
                    not self.dice_pool):
                # Both done, resolve combat
                self._resolve_combat()
            # else: other player continues (switch will happen)
            return True

        if isinstance(move, dict) and "die_index" in move:
            idx = move["die_index"]
            slot = move["slot"]

            if idx < 0 or idx >= len(self.dice_pool):
                return False

            die_val = self.dice_pool.pop(idx)

            if slot == "attack":
                if len(self.attack_slots[p]) >= self.max_attack:
                    return False
                self.attack_slots[p].append(die_val)
                self._add_log(f"{self.players[p-1]} drafted [{die_val}] -> Attack")
            elif slot == "defense":
                if len(self.defense_slots[p]) >= self.max_defense:
                    return False
                self.defense_slots[p].append(die_val)
                self._add_log(f"{self.players[p-1]} drafted [{die_val}] -> Defense")

            # Check if both players are fully drafted or pool is empty
            if self._all_drafted():
                self._resolve_combat()

            return True

        return False

    def check_game_over(self):
        for p in [1, 2]:
            if self.hp[p] <= 0:
                self.hp[p] = 0
                self.game_over = True
                opponent = 2 if p == 1 else 1
                # If both hit 0 same round, higher remaining HP wins
                if self.hp[opponent] <= 0:
                    self.winner = None  # draw
                else:
                    self.winner = opponent
                return

    def get_state(self):
        return {
            "max_hp": self.max_hp,
            "num_dice": self.num_dice,
            "hp_1": self.hp[1],
            "hp_2": self.hp[2],
            "dice_pool": self.dice_pool,
            "attack_1": self.attack_slots[1],
            "attack_2": self.attack_slots[2],
            "defense_1": self.defense_slots[1],
            "defense_2": self.defense_slots[2],
            "max_attack": self.max_attack,
            "max_defense": self.max_defense,
            "phase": self.phase,
            "round_number": self.round_number,
            "combat_log": self.combat_log,
            "log": self.log,
        }

    def load_state(self, state):
        self.max_hp = state["max_hp"]
        self.num_dice = state["num_dice"]
        self.hp = {1: state["hp_1"], 2: state["hp_2"]}
        self.dice_pool = state["dice_pool"]
        self.attack_slots = {1: state["attack_1"], 2: state["attack_2"]}
        self.defense_slots = {1: state["defense_1"], 2: state["defense_2"]}
        self.max_attack = state["max_attack"]
        self.max_defense = state["max_defense"]
        self.phase = state["phase"]
        self.round_number = state["round_number"]
        self.combat_log = state.get("combat_log", [])
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  DUELING DICE - Tutorial
==================================================

OVERVIEW:
  Dueling Dice is a dice-drafting combat game. Each round, a shared
  pool of dice is rolled and players take turns drafting dice, assigning
  them to attack or defense slots. Then combat resolves!

ROUND STRUCTURE:
  1. ROLL: A shared pool of dice is rolled (9 standard, 7 quick).
  2. DRAFT: Players alternate picking dice from the pool.
     - Assign each die to an ATTACK slot or DEFENSE slot.
     - Standard: 3 attack slots, 2 defense slots per player.
     - Quick: 2 attack slots, 2 defense slots per player.
  3. COMBAT: Both players attack simultaneously.
     - Your total Attack = sum of your attack dice.
     - Opponent's total Defense = sum of their defense dice.
     - Damage = Attack - Defense (minimum 0).
     - Damage is subtracted from opponent's HP.

HP:
  - Standard: 20 HP each
  - Quick: 12 HP each
  - First to reduce opponent to 0 HP wins!

STRATEGY:
  - High dice are great for attack, but don't neglect defense!
  - Draft strategically: deny your opponent the dice they need.
  - Balance is key: all-attack leaves you vulnerable.
  - Watch opponent's assignments to adjust your strategy.

DICE VALUES:
  Each die shows 1-6 (standard six-sided dice).
"""
