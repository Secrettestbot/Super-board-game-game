"""Samurai Spirit - Cooperative push-your-luck defense game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class SamuraiSpiritGame(BaseGame):
    """Cooperative defense where samurai defend a village from raider waves."""

    name = "Samurai Spirit"
    description = "Cooperative push-your-luck defense against raiders"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (3 waves, endurance 8)",
        "hard": "Hard mode (3 waves, endurance 6)",
        "heroic": "Heroic mode (4 waves, endurance 5)",
    }

    SAMURAI_NAMES = ["Hayato", "Kenji"]
    RAIDER_NAMES = [
        "Bandit", "Ronin", "Marauder", "Brigand", "Thug",
        "Raider", "Pillager", "Looter", "Invader", "Ravager",
    ]

    def __init__(self, variation=None):
        super().__init__(variation)
        self.endurance = 8
        self.max_waves = 3
        self.current_wave = 1
        self.raider_deck = []
        self.combat_lines = {1: [], 2: []}
        self.combat_totals = {1: 0, 2: 0}
        self.overwhelmed = {1: False, 2: False}
        self.barricades = 0
        self.max_barricades = 3
        self.village_damage = 0
        self.max_village_hp = 6
        self.phase = "draw"
        self.current_raider = None
        self.log = []
        self.raiders_remaining = 0
        self.passed = {1: False, 2: False}

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        if self.variation == "hard":
            self.endurance = 6
            self.max_waves = 3
        elif self.variation == "heroic":
            self.endurance = 5
            self.max_waves = 4
        else:
            self.endurance = 8
            self.max_waves = 3

        self.current_wave = 1
        self.combat_lines = {1: [], 2: []}
        self.combat_totals = {1: 0, 2: 0}
        self.overwhelmed = {1: False, 2: False}
        self.barricades = 0
        self.max_barricades = 3
        self.village_damage = 0
        self.max_village_hp = 6
        self.phase = "draw"
        self.current_raider = None
        self.log = []
        self.passed = {1: False, 2: False}
        self.game_over = False
        self.winner = None
        self._build_raider_deck()
        self._add_log(f"Wave {self.current_wave} begins! {self.raiders_remaining} raiders approach!")

    def _build_raider_deck(self):
        """Build raider deck for current wave."""
        base_count = 6 + self.current_wave * 2
        self.raider_deck = []
        for i in range(base_count):
            strength = random.randint(1, min(6, 2 + self.current_wave))
            name = random.choice(self.RAIDER_NAMES)
            self.raider_deck.append({"name": name, "strength": strength})
        random.shuffle(self.raider_deck)
        self.raiders_remaining = len(self.raider_deck)

    def _draw_raider(self):
        if self.raider_deck:
            self.current_raider = self.raider_deck.pop()
            self.raiders_remaining = len(self.raider_deck)
            return True
        return False

    def display(self):
        clear_screen()
        print(f"{'=' * 58}")
        print(f"  SAMURAI SPIRIT  |  Wave {self.current_wave}/{self.max_waves}  |  Raiders left: {self.raiders_remaining}")
        print(f"{'=' * 58}")

        # Village status
        hp_left = self.max_village_hp - self.village_damage
        hp_bar = "#" * hp_left + "." * self.village_damage
        print(f"  Village HP: [{hp_bar}] {hp_left}/{self.max_village_hp}")
        barr_bar = "=" * self.barricades + "." * (self.max_barricades - self.barricades)
        print(f"  Barricades: [{barr_bar}] {self.barricades}/{self.max_barricades}")
        print(f"{'~' * 58}")

        # Samurai status
        for p in (1, 2):
            name = self.SAMURAI_NAMES[p - 1]
            status = "OVERWHELMED!" if self.overwhelmed[p] else "Active"
            passed = " (Passed)" if self.passed[p] else ""
            total = self.combat_totals[p]
            bar_len = 20
            filled = min(int((total / self.endurance) * bar_len), bar_len)
            ebar = "|" * filled + "." * (bar_len - filled)
            over = " !!OVER!!" if total > self.endurance else ""
            print(f"\n  {self.players[p - 1]} ({name}) - {status}{passed}")
            print(f"    Combat: [{ebar}] {total}/{self.endurance}{over}")
            if self.combat_lines[p]:
                raiders_str = ", ".join([f"{r['name']}({r['strength']})" for r in self.combat_lines[p][-5:]])
                print(f"    Line: {raiders_str}")

        # Current raider
        if self.current_raider and self.phase == "action":
            print(f"\n  {'>' * 10} RAIDER APPEARS: {self.current_raider['name']} (Strength: {self.current_raider['strength']}) {'<' * 10}")

        # Current player prompt
        if self.phase == "draw":
            print(f"\n  {self.players[self.current_player - 1]}'s turn - Draw a raider card!")
        elif self.phase == "action":
            print(f"\n  {self.players[self.current_player - 1]} - Choose your action:")
            print(f"    [F] Fight  - Add to your combat line (risk overwhelm)")
            print(f"    [D] Defend - Place on barricade (raider blocked)")
            print(f"    [S] Support - Help other samurai (reduce their total by raider strength)")
            print(f"    [P] Pass  - Take no more raiders this wave")

        # Log
        if self.log:
            print(f"\n  {'~' * 40}")
            for entry in self.log[-5:]:
                print(f"  {entry}")

    def get_move(self):
        if self.phase == "draw":
            input_with_quit("\n  Press Enter to draw a raider...")
            return "draw"
        elif self.phase == "action":
            while True:
                choice = input_with_quit("  Action [F/D/S/P]: ").strip().upper()
                if choice in ("F", "D", "S", "P"):
                    return choice
                print("  Invalid. Choose F, D, S, or P.")
        elif self.phase == "wave_end":
            input_with_quit("\n  Press Enter to continue to next wave...")
            return "next_wave"
        elif self.phase == "game_end":
            input_with_quit("\n  Press Enter to see results...")
            return "end"
        return None

    def make_move(self, move):
        if move == "draw":
            if self._draw_raider():
                self._add_log(f"A {self.current_raider['name']} (str {self.current_raider['strength']}) appears!")
                self.phase = "action"
            else:
                self._end_wave()
            return True

        elif move == "F":
            raider = self.current_raider
            cp = self.current_player
            self.combat_lines[cp].append(raider)
            self.combat_totals[cp] += raider["strength"]
            self._add_log(f"{self.players[cp - 1]} fights {raider['name']}! (Total: {self.combat_totals[cp]}/{self.endurance})")

            if self.combat_totals[cp] > self.endurance:
                self.overwhelmed[cp] = True
                self.passed[cp] = True
                self._add_log(f"{self.players[cp - 1]} is OVERWHELMED! Village takes 1 damage!")
                self.village_damage += 1

            self.current_raider = None
            self._advance_turn()
            return True

        elif move == "D":
            raider = self.current_raider
            if self.barricades < self.max_barricades:
                self.barricades += 1
                self._add_log(f"{self.players[self.current_player - 1]} defends! Barricade built ({self.barricades}/{self.max_barricades}).")
            else:
                self._add_log(f"{self.players[self.current_player - 1]} defends! (Barricades full, raider blocked)")
            self.current_raider = None
            self._advance_turn()
            return True

        elif move == "S":
            raider = self.current_raider
            cp = self.current_player
            other = 2 if cp == 1 else 1
            reduction = raider["strength"]
            self.combat_totals[other] = max(0, self.combat_totals[other] - reduction)
            self._add_log(f"{self.players[cp - 1]} supports {self.players[other - 1]}! (-{reduction} combat)")
            if self.overwhelmed[other] and self.combat_totals[other] <= self.endurance:
                self.overwhelmed[other] = False
                self.passed[other] = False
                self._add_log(f"{self.players[other - 1]} recovers from overwhelm!")
            self.current_raider = None
            self._advance_turn()
            return True

        elif move == "P":
            cp = self.current_player
            self.passed[cp] = True
            self._add_log(f"{self.players[cp - 1]} passes for the rest of this wave.")
            self.current_raider = None
            self._advance_turn()
            return True

        elif move == "next_wave":
            self._start_next_wave()
            return True

        elif move == "end":
            return True

        return False

    def _advance_turn(self):
        """Move to next active player or end wave."""
        if self.passed[1] and self.passed[2]:
            self._end_wave()
            return

        # Try to find next active player
        next_p = 2 if self.current_player == 1 else 1
        if self.passed[next_p]:
            next_p = self.current_player
        if self.passed[next_p]:
            self._end_wave()
            return

        self.current_player = next_p
        if self.raider_deck:
            self.phase = "draw"
        else:
            self._end_wave()

    def _end_wave(self):
        """Score the end of a wave."""
        # Undefeated raiders damage village
        remaining_damage = len(self.raider_deck)
        if remaining_damage > 0:
            damage = max(0, remaining_damage - self.barricades)
            self.village_damage += damage
            self._add_log(f"Wave end: {remaining_damage} raiders remain, {self.barricades} barricades block.")
            if damage > 0:
                self._add_log(f"Village takes {damage} damage from remaining raiders!")
        else:
            self._add_log(f"Wave {self.current_wave} cleared!")

        if self.village_damage >= self.max_village_hp:
            self.phase = "game_end"
            self._add_log("The village has fallen!")
        elif self.current_wave >= self.max_waves:
            self.phase = "game_end"
            self._add_log("All waves survived! The village is saved!")
        else:
            self.phase = "wave_end"
            self._add_log(f"Prepare for wave {self.current_wave + 1}!")

    def _start_next_wave(self):
        self.current_wave += 1
        self.combat_lines = {1: [], 2: []}
        self.combat_totals = {1: 0, 2: 0}
        self.overwhelmed = {1: False, 2: False}
        self.passed = {1: False, 2: False}
        self.barricades = max(0, self.barricades - 1)  # Barricades degrade
        self.current_raider = None
        self.phase = "draw"
        self.current_player = 1
        self._build_raider_deck()
        self._add_log(f"Wave {self.current_wave} begins! {self.raiders_remaining} raiders approach!")

    def check_game_over(self):
        if self.phase == "game_end":
            self.game_over = True
            if self.village_damage >= self.max_village_hp:
                self.winner = None  # Both lose
                self._add_log("DEFEAT - The village has been destroyed.")
            else:
                self.winner = 1  # Co-op win indicated by player 1
                self._add_log("VICTORY - The samurai defended the village!")

    def switch_player(self):
        """Override: co-op game manages turns internally."""
        pass

    def get_state(self):
        return {
            "endurance": self.endurance,
            "max_waves": self.max_waves,
            "current_wave": self.current_wave,
            "raider_deck": self.raider_deck,
            "combat_lines": {str(k): v for k, v in self.combat_lines.items()},
            "combat_totals": {str(k): v for k, v in self.combat_totals.items()},
            "overwhelmed": {str(k): v for k, v in self.overwhelmed.items()},
            "barricades": self.barricades,
            "max_barricades": self.max_barricades,
            "village_damage": self.village_damage,
            "max_village_hp": self.max_village_hp,
            "phase": self.phase,
            "current_raider": self.current_raider,
            "log": self.log,
            "raiders_remaining": self.raiders_remaining,
            "passed": {str(k): v for k, v in self.passed.items()},
        }

    def load_state(self, state):
        self.endurance = state["endurance"]
        self.max_waves = state["max_waves"]
        self.current_wave = state["current_wave"]
        self.raider_deck = state["raider_deck"]
        self.combat_lines = {int(k): v for k, v in state["combat_lines"].items()}
        self.combat_totals = {int(k): v for k, v in state["combat_totals"].items()}
        self.overwhelmed = {int(k): v for k, v in state["overwhelmed"].items()}
        self.barricades = state["barricades"]
        self.max_barricades = state["max_barricades"]
        self.village_damage = state["village_damage"]
        self.max_village_hp = state["max_village_hp"]
        self.phase = state["phase"]
        self.current_raider = state["current_raider"]
        self.log = state["log"]
        self.raiders_remaining = state["raiders_remaining"]
        self.passed = {int(k): v for k, v in state["passed"].items()}

    def get_tutorial(self):
        return """
========================================
  SAMURAI SPIRIT - Tutorial
========================================

OVERVIEW:
  A cooperative push-your-luck game! Both players are samurai
  defending a village from waves of raiders. Win or lose together!

GAMEPLAY:
  Each turn, draw a raider card, then choose an action:

  [F] FIGHT   - Add the raider to your combat line. Its strength
                 adds to your combat total. If your total exceeds
                 your endurance, you're OVERWHELMED and the village
                 takes damage!
  [D] DEFEND  - Block the raider. Builds a barricade that protects
                 against leftover raiders at wave's end.
  [S] SUPPORT - Use the raider's strength to REDUCE another
                 samurai's combat total. Can save them from overwhelm!
  [P] PASS    - Take no more raiders this wave. Remaining raiders
                 are split among active samurai or hit the village.

WAVES:
  Survive all waves to win! Each wave has more & stronger raiders.
  At wave end, unblocked remaining raiders damage the village.
  Barricades absorb some damage.

STRATEGY:
  - Fight when you have endurance room
  - Support a teammate close to overwhelm
  - Defend to build barricades for wave-end protection
  - Pass before you get overwhelmed!

COMMANDS:
  Type 'quit' to quit, 'save' to save, 'help' for help.
========================================
"""
