"""King of Tokyo - Dice combat monster game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Power cards available for purchase
POWER_CARDS = [
    {"name": "Acid Attack", "cost": 6, "type": "keep",
     "desc": "Deal 1 extra damage when attacking", "extra_damage": 1},
    {"name": "Apartment Building", "cost": 5, "type": "discard",
     "desc": "Gain 3 victory points", "vp": 3},
    {"name": "Commuter Train", "cost": 4, "type": "discard",
     "desc": "Gain 2 victory points", "vp": 2},
    {"name": "Corner Store", "cost": 3, "type": "discard",
     "desc": "Gain 1 victory point", "vp": 1},
    {"name": "Energy Hoarder", "cost": 3, "type": "keep",
     "desc": "Gain 1 VP per 6 energy you have at end of turn", "energy_vp": True},
    {"name": "Even Bigger", "cost": 4, "type": "keep",
     "desc": "Max health increased to 12", "max_hp": 12},
    {"name": "Extra Head", "cost": 7, "type": "keep",
     "desc": "Roll 1 extra die", "extra_dice": 1},
    {"name": "Fire Blast", "cost": 3, "type": "discard",
     "desc": "Deal 2 damage to all other monsters", "blast_damage": 2},
    {"name": "Heal", "cost": 3, "type": "discard",
     "desc": "Heal 2 health", "heal": 2},
    {"name": "Nuclear Power", "cost": 6, "type": "keep",
     "desc": "Claws give 1 extra damage", "extra_damage": 1},
    {"name": "Regeneration", "cost": 4, "type": "keep",
     "desc": "Heal 1 at the start of your turn", "regen": 1},
    {"name": "Tank", "cost": 4, "type": "keep",
     "desc": "Take 1 less damage from attacks (min 1)", "armor": 1},
]

# Halloween costumes
COSTUMES = [
    {"name": "Vampire", "desc": "Heal 1 when you deal damage", "vamp": True},
    {"name": "Werewolf", "desc": "Deal 1 extra damage on claws", "extra_damage": 1},
    {"name": "Witch", "desc": "Gain 1 energy when rolling energy", "energy_bonus": 1},
    {"name": "Ghost", "desc": "Take 1 less damage (min 1)", "armor": 1},
]

DICE_FACES = ["1", "2", "3", "claws", "heart", "energy"]


class KingOfTokyoGame(BaseGame):
    """King of Tokyo - Roll dice, attack, heal, and buy powers to dominate."""

    name = "King of Tokyo"
    description = "Dice combat game - be the last monster standing or reach 20 VP"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard King of Tokyo",
        "halloween": "Halloween (includes costume cards)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Player state
        self.health = {1: 10, 2: 10}
        self.max_health = {1: 10, 2: 10}
        self.vp = {1: 0, 2: 0}
        self.energy = {1: 0, 2: 0}
        self.cards = {1: [], 2: []}  # keep cards owned
        # Who is in Tokyo (player number or None)
        self.in_tokyo = None
        # Dice state
        self.dice = [0] * 6
        self.kept = [False] * 6
        self.rolls_left = 3
        self.num_dice = 6
        # Shop: 3 face-up power cards
        self.shop = []
        self.deck = []
        # Phase: roll, resolve, buy, end_turn
        self.phase = "roll"
        self.log = []
        # Costumes (halloween)
        self.costumes = {1: None, 2: None}
        # Pending yield decision
        self.pending_yield = False

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 12:
            self.log = self.log[-12:]

    def _opponent(self, p=None):
        if p is None:
            p = self.current_player
        return 2 if p == 1 else 1

    def _get_extra_dice(self, player):
        count = 0
        for card in self.cards[player]:
            count += card.get("extra_dice", 0)
        return count

    def _get_extra_damage(self, player):
        dmg = 0
        for card in self.cards[player]:
            dmg += card.get("extra_damage", 0)
        costume = self.costumes[player]
        if costume and costume.get("extra_damage"):
            dmg += costume["extra_damage"]
        return dmg

    def _get_armor(self, player):
        armor = 0
        for card in self.cards[player]:
            armor += card.get("armor", 0)
        costume = self.costumes[player]
        if costume and costume.get("armor"):
            armor += costume["armor"]
        return armor

    def _has_vamp(self, player):
        costume = self.costumes[player]
        return costume and costume.get("vamp", False)

    def _has_energy_bonus(self, player):
        costume = self.costumes[player]
        return costume and costume.get("energy_bonus", False)

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.health = {1: 10, 2: 10}
        self.max_health = {1: 10, 2: 10}
        self.vp = {1: 0, 2: 0}
        self.energy = {1: 0, 2: 0}
        self.cards = {1: [], 2: []}
        self.in_tokyo = None
        self.num_dice = 6
        self.dice = [""] * self.num_dice
        self.kept = [False] * self.num_dice
        self.rolls_left = 3
        self.phase = "roll"
        self.log = []
        self.pending_yield = False
        self.costumes = {1: None, 2: None}

        # Build deck and shop
        self.deck = list(POWER_CARDS)
        random.shuffle(self.deck)
        self.shop = []
        for _ in range(3):
            if self.deck:
                self.shop.append(self.deck.pop())

        # Halloween costumes
        if self.variation == "halloween":
            costumes = list(COSTUMES)
            random.shuffle(costumes)
            self.costumes[1] = costumes[0]
            self.costumes[2] = costumes[1]
            self._add_log(f"P1 costume: {costumes[0]['name']}")
            self._add_log(f"P2 costume: {costumes[1]['name']}")

        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 60}")
        mode = "Halloween" if self.variation == "halloween" else "Standard"
        print(f"  KING OF TOKYO  ({mode})  -  Turn {self.turn_number + 1}")
        print(f"{'=' * 60}")

        # Tokyo status
        if self.in_tokyo:
            print(f"\n  IN TOKYO: {self.players[self.in_tokyo - 1]}")
        else:
            print(f"\n  TOKYO: Empty")

        # Both players
        for p in (1, 2):
            marker = " <<" if p == cp else ""
            tokyo = " [IN TOKYO]" if p == self.in_tokyo else ""
            print(f"\n  {self.players[p - 1]}{marker}{tokyo}:")
            print(f"    HP: {self.health[p]}/{self.max_health[p]}"
                  f"  VP: {self.vp[p]}/20  Energy: {self.energy[p]}")
            if self.cards[p]:
                card_names = [c["name"] for c in self.cards[p]]
                print(f"    Cards: {', '.join(card_names)}")
            if self.costumes[p]:
                print(f"    Costume: {self.costumes[p]['name']}"
                      f" - {self.costumes[p]['desc']}")

        # Dice
        if self.phase in ("roll", "resolve"):
            print(f"\n  Dice (rolls left: {self.rolls_left}):")
            for i in range(len(self.dice)):
                face = self.dice[i] if self.dice[i] else "?"
                kept_tag = " [KEPT]" if self.kept[i] else ""
                print(f"    {i + 1}. {face:8s}{kept_tag}")

        # Shop
        if self.shop:
            print(f"\n  Shop:")
            for i, card in enumerate(self.shop, 1):
                print(f"    {i}. {card['name']} (Cost: {card['cost']})"
                      f" - {card['desc']}")

        # Phase
        print(f"\n  Phase: {self.phase.upper()}")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-5:]:
                print(f"  {line}")

        print()

    # -------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if self.pending_yield:
            return self._get_yield_decision()

        if self.phase == "roll":
            return self._get_roll_move(cp)
        elif self.phase == "resolve":
            input_with_quit("  Press Enter to resolve dice... ")
            return "resolve"
        elif self.phase == "buy":
            return self._get_buy_move(cp)
        elif self.phase == "end_turn":
            return "end_turn"

        return None

    def _get_yield_decision(self):
        opp = self._opponent()
        print(f"  {self.players[opp - 1]}, you were attacked in Tokyo!")
        print(f"  'yield' to leave Tokyo, or 'stay' to remain.")
        while True:
            move = input_with_quit("  > ").strip().lower()
            if move in ("yield", "stay"):
                return f"yield_{move}"
            print("  Type 'yield' or 'stay'.")

    def _get_roll_move(self, cp):
        if self.rolls_left == 3:
            print(f"  {self.players[cp - 1]}, type 'roll' to roll {self.num_dice} dice.")
        else:
            print(f"  'roll' to reroll, 'keep 1 3 5' to toggle keeps, or 'done'")
        while True:
            move = input_with_quit("  > ").strip().lower()
            if move == "roll":
                return "roll"
            elif move == "done" and self.rolls_left < 3:
                return "done"
            elif move.startswith("keep") and self.rolls_left < 3:
                parts = move.split()
                try:
                    indices = [int(x) for x in parts[1:]]
                    if all(1 <= i <= len(self.dice) for i in indices):
                        return f"keep {' '.join(str(i) for i in indices)}"
                except ValueError:
                    pass
                print(f"  Usage: keep 1 3 5 (dice numbers 1-{len(self.dice)})")
            else:
                if self.rolls_left == 3:
                    print("  Type 'roll'.")
                else:
                    print("  Type 'roll', 'keep 1 3 5', or 'done'.")

    def _get_buy_move(self, cp):
        print(f"  Buy a card? Energy: {self.energy[cp]}")
        print(f"  'buy <n>' to buy card, 'sweep' to sweep shop (2 energy), or 'pass'")
        while True:
            move = input_with_quit("  > ").strip().lower()
            if move == "pass":
                return "pass_buy"
            elif move == "sweep":
                if self.energy[cp] < 2:
                    print("  Need 2 energy to sweep.")
                    continue
                return "sweep"
            elif move.startswith("buy"):
                parts = move.split()
                if len(parts) != 2 or not parts[1].isdigit():
                    print("  Usage: buy <number>")
                    continue
                idx = int(parts[1])
                if idx < 1 or idx > len(self.shop):
                    print(f"  Choose 1-{len(self.shop)}.")
                    continue
                card = self.shop[idx - 1]
                if self.energy[cp] < card["cost"]:
                    print(f"  Need {card['cost']} energy, you have {self.energy[cp]}.")
                    continue
                return f"buy {idx}"
            else:
                print("  Type 'buy <n>', 'sweep', or 'pass'.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player

        if move.startswith("yield_"):
            return self._do_yield(move)
        elif move == "roll":
            return self._do_roll(cp)
        elif move.startswith("keep"):
            return self._do_keep(move)
        elif move == "done":
            self.phase = "resolve"
            self.current_player = cp
            return True
        elif move == "resolve":
            return self._do_resolve(cp)
        elif move.startswith("buy"):
            return self._do_buy(cp, move)
        elif move == "sweep":
            return self._do_sweep(cp)
        elif move == "pass_buy":
            self.phase = "end_turn"
            return self._do_end_turn(cp)
        elif move == "end_turn":
            return self._do_end_turn(cp)

        return False

    def _do_roll(self, cp):
        total = self.num_dice + self._get_extra_dice(cp)
        # Ensure dice array matches
        while len(self.dice) < total:
            self.dice.append("")
            self.kept.append(False)

        for i in range(len(self.dice)):
            if not self.kept[i]:
                self.dice[i] = random.choice(DICE_FACES)

        self.rolls_left -= 1

        if self.rolls_left <= 0:
            self.phase = "resolve"
        else:
            self.phase = "roll"

        self.current_player = cp
        return True

    def _do_keep(self, move):
        parts = move.split()
        indices = [int(x) - 1 for x in parts[1:]]
        # Toggle
        self.kept = [False] * len(self.dice)
        for i in indices:
            if 0 <= i < len(self.dice):
                self.kept[i] = True
        self.current_player = self.current_player
        return True

    def _do_resolve(self, cp):
        """Resolve dice results."""
        opp = self._opponent(cp)

        counts = {"1": 0, "2": 0, "3": 0, "claws": 0, "heart": 0, "energy": 0}
        for face in self.dice:
            if face in counts:
                counts[face] += 1

        # Score numbers: 3+ of same number = that many VP, +1 per extra
        for num in ["1", "2", "3"]:
            c = counts[num]
            if c >= 3:
                pts = int(num) + (c - 3)
                self.vp[cp] += pts
                self._add_log(f"{self.players[cp - 1]} scores {pts} VP from {num}s")

        # Energy
        e_count = counts["energy"]
        if self._has_energy_bonus(cp) and e_count > 0:
            e_count += 1
        self.energy[cp] += e_count
        if e_count:
            self._add_log(f"{self.players[cp - 1]} gains {e_count} energy")

        # Hearts: heal (but NOT if in Tokyo)
        h_count = counts["heart"]
        if cp != self.in_tokyo and h_count > 0:
            healed = min(h_count, self.max_health[cp] - self.health[cp])
            self.health[cp] += healed
            if healed:
                self._add_log(f"{self.players[cp - 1]} heals {healed} HP")

        # Claws: attack
        claw_count = counts["claws"]
        if claw_count > 0:
            damage = claw_count + self._get_extra_damage(cp)
            if cp == self.in_tokyo:
                # Attack players outside Tokyo
                target = opp
            else:
                # Attack players in Tokyo
                target = self.in_tokyo

            if target:
                actual_dmg = max(1, damage - self._get_armor(target))
                self.health[target] -= actual_dmg
                self._add_log(f"{self.players[cp - 1]} deals {actual_dmg} damage "
                             f"to {self.players[target - 1]}")

                if self._has_vamp(cp):
                    heal = min(1, self.max_health[cp] - self.health[cp])
                    self.health[cp] += heal

                # If target in Tokyo was hit, they can yield
                if target == self.in_tokyo and self.health[target] > 0:
                    self.pending_yield = True
                    self.current_player = cp
                    self.phase = "buy"
                    return True

            # If nobody in Tokyo, attacker enters
            if not self.in_tokyo:
                self.in_tokyo = cp
                self.vp[cp] += 1
                self._add_log(f"{self.players[cp - 1]} enters Tokyo! (+1 VP)")

        # Check death
        if self.health[opp] <= 0:
            self.game_over = True
            self.winner = cp
            return True

        # Tokyo VP bonus at start of turn (already in Tokyo)
        if cp == self.in_tokyo:
            self.vp[cp] += 2
            self._add_log(f"{self.players[cp - 1]} gains 2 VP for staying in Tokyo")

        self.phase = "buy"
        self.current_player = cp

        # Reset dice for next roll phase
        self.kept = [False] * len(self.dice)
        return True

    def _do_yield(self, move):
        cp = self.current_player
        opp = self._opponent(cp)
        self.pending_yield = False

        if move == "yield_yield":
            self.in_tokyo = cp  # attacker enters
            self.vp[cp] += 1
            self._add_log(f"{self.players[opp - 1]} yields Tokyo. "
                         f"{self.players[cp - 1]} enters! (+1 VP)")
        else:
            self._add_log(f"{self.players[opp - 1]} stays in Tokyo!")

        # Continue to buy phase for the current player
        self.phase = "buy"
        self.current_player = cp
        return True

    def _do_buy(self, cp, move):
        parts = move.split()
        idx = int(parts[1]) - 1
        card = self.shop[idx]
        self.energy[cp] -= card["cost"]

        if card["type"] == "keep":
            self.cards[cp].append(card)
            self._add_log(f"{self.players[cp - 1]} buys {card['name']} (keep)")
            if card.get("max_hp"):
                self.max_health[cp] = card["max_hp"]
                self.health[cp] = min(self.health[cp], self.max_health[cp])
        else:
            # Discard: immediate effect
            if card.get("vp"):
                self.vp[cp] += card["vp"]
            if card.get("heal"):
                healed = min(card["heal"], self.max_health[cp] - self.health[cp])
                self.health[cp] += healed
            if card.get("blast_damage"):
                opp = self._opponent(cp)
                dmg = max(1, card["blast_damage"] - self._get_armor(opp))
                self.health[opp] -= dmg
                self._add_log(f"Fire Blast hits {self.players[opp - 1]} for {dmg}!")
            self._add_log(f"{self.players[cp - 1]} uses {card['name']}")

        # Replace shop card
        self.shop.pop(idx)
        if self.deck:
            self.shop.insert(idx, self.deck.pop())

        # Stay in buy phase for more purchases
        self.current_player = cp
        return True

    def _do_sweep(self, cp):
        self.energy[cp] -= 2
        self.shop = []
        for _ in range(3):
            if self.deck:
                self.shop.append(self.deck.pop())
        self._add_log(f"{self.players[cp - 1]} sweeps the shop!")
        self.current_player = cp
        return True

    def _do_end_turn(self, cp):
        # Energy hoarder check
        for card in self.cards[cp]:
            if card.get("energy_vp"):
                bonus = self.energy[cp] // 6
                if bonus:
                    self.vp[cp] += bonus
                    self._add_log(f"Energy Hoarder: +{bonus} VP")

        # Regeneration
        for card in self.cards[cp]:
            if card.get("regen"):
                heal = min(card["regen"], self.max_health[cp] - self.health[cp])
                self.health[cp] += heal

        # Reset for next player
        self.dice = [""] * self.num_dice
        self.kept = [False] * self.num_dice
        self.rolls_left = 3
        self.phase = "roll"
        return True

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        if self.phase in ("roll", "resolve", "buy"):
            pass  # Don't switch mid-turn
        else:
            super().switch_player()

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        for p in (1, 2):
            if self.health[p] <= 0:
                self.game_over = True
                self.winner = self._opponent(p)
                return
            if self.vp[p] >= 20:
                self.game_over = True
                self.winner = p
                return

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "health": {str(k): v for k, v in self.health.items()},
            "max_health": {str(k): v for k, v in self.max_health.items()},
            "vp": {str(k): v for k, v in self.vp.items()},
            "energy": {str(k): v for k, v in self.energy.items()},
            "cards": {str(k): list(v) for k, v in self.cards.items()},
            "in_tokyo": self.in_tokyo,
            "dice": list(self.dice),
            "kept": list(self.kept),
            "rolls_left": self.rolls_left,
            "num_dice": self.num_dice,
            "shop": list(self.shop),
            "deck": list(self.deck),
            "phase": self.phase,
            "log": list(self.log),
            "costumes": {str(k): v for k, v in self.costumes.items()},
            "pending_yield": self.pending_yield,
        }

    def load_state(self, state):
        self.health = {int(k): v for k, v in state["health"].items()}
        self.max_health = {int(k): v for k, v in state["max_health"].items()}
        self.vp = {int(k): v for k, v in state["vp"].items()}
        self.energy = {int(k): v for k, v in state["energy"].items()}
        self.cards = {int(k): list(v) for k, v in state["cards"].items()}
        self.in_tokyo = state["in_tokyo"]
        self.dice = list(state["dice"])
        self.kept = list(state["kept"])
        self.rolls_left = state["rolls_left"]
        self.num_dice = state["num_dice"]
        self.shop = list(state["shop"])
        self.deck = list(state["deck"])
        self.phase = state["phase"]
        self.log = list(state.get("log", []))
        self.costumes = {int(k): v for k, v in state.get("costumes", {}).items()}
        self.pending_yield = state.get("pending_yield", False)

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        extra = ""
        if self.variation == "halloween":
            extra = (
                f"\n  HALLOWEEN COSTUMES:\n"
                f"  Each player gets a random costume at game start:\n"
                f"  - Vampire: Heal 1 HP when you deal damage\n"
                f"  - Werewolf: +1 damage on claw attacks\n"
                f"  - Witch: +1 energy when rolling energy faces\n"
                f"  - Ghost: Take 1 less damage from attacks\n\n"
            )

        return (
            f"\n{'=' * 58}\n"
            f"  KING OF TOKYO - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Giant monsters fight over Tokyo! Roll dice Yahtzee-\n"
            f"  style (up to 3 rolls, keeping what you want). Last\n"
            f"  monster standing or first to 20 VP wins.\n\n"
            f"  THE DICE (6 faces):\n"
            f"    1, 2, 3  - Score VP (3+ of a kind = that number\n"
            f"               in VP, +1 VP per extra die)\n"
            f"    Claws    - Deal 1 damage per claw to opponents\n"
            f"    Hearts   - Heal 1 HP each (NOT while in Tokyo)\n"
            f"    Energy   - Gain 1 energy each (buy power cards)\n\n"
            f"  TOKYO MECHANIC:\n"
            f"  - If nobody is in Tokyo and you roll claws,\n"
            f"    you enter Tokyo (+1 VP).\n"
            f"  - In Tokyo: +2 VP per turn, your claws hit ALL\n"
            f"    outside monsters, but you CANNOT heal with hearts.\n"
            f"  - When hit in Tokyo, you can yield (leave) and the\n"
            f"    attacker enters.\n\n"
            f"  POWER CARDS:\n"
            f"  Spend energy to buy cards from the shop (3 visible).\n"
            f"  'Keep' cards give ongoing abilities.\n"
            f"  'Discard' cards have one-time effects.\n"
            f"  Spend 2 energy to sweep the shop for new cards.\n\n"
            f"{extra}"
            f"  WINNING:\n"
            f"  - Reach 20 Victory Points  OR\n"
            f"  - Be the last monster alive (reduce others to 0 HP)\n\n"
            f"  COMMANDS:\n"
            f"  'roll'       - Roll (or reroll) dice\n"
            f"  'keep 1 3 5' - Keep specific dice\n"
            f"  'done'       - Finish rolling\n"
            f"  'buy <n>'    - Buy card from shop\n"
            f"  'sweep'      - Replace shop cards (2 energy)\n"
            f"  'pass'       - Skip buying\n"
            f"  'yield/stay' - Leave or stay in Tokyo when hit\n"
            f"  'quit' - Exit    'save' - Save game\n"
            f"  'help' - Help    'tutorial' - This tutorial\n"
            f"{'=' * 58}"
        )
