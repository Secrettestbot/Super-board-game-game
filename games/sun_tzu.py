"""Sun Tzu - A 2-player area majority game with simultaneous card play."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

PROVINCE_NAMES = ["Mountain", "Forest", "River", "Plains", "Desert"]


class SunTzuGame(BaseGame):
    """Sun Tzu area majority game implementation."""

    name = "Sun Tzu"
    description = "Area majority with simultaneous card play across 5 provinces"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - 9 rounds",
        "extended": "Extended game - 12 rounds",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.total_rounds = 12 if self.variation == "extended" else 9
        self.round_number = 0
        # Control markers: 0 = neutral, positive = toward P1, negative = toward P2
        # Range: -3 to +3. Start at 0.
        self.control = [0, 0, 0, 0, 0]
        # Each player has cards 1-6, replenished each round
        self.hands = {1: [], 2: []}
        # Current round assignments: {player: {province_idx: card_value}}
        self.assignments = {1: {}, 2: {}}
        # Phase: "assign_p1", "assign_p2", "resolve"
        self.phase = "assign_p1"
        self.log = []
        # Track cards used this "cycle" - each player uses each card 1-6 once per cycle
        self.available_cards = {1: [], 2: []}
        self.round_results = []

    def setup(self):
        self.round_number = 0
        self.control = [0, 0, 0, 0, 0]
        self.available_cards = {1: list(range(1, 7)), 2: list(range(1, 7))}
        random.shuffle(self.available_cards[1])
        random.shuffle(self.available_cards[2])
        self._deal_round()
        self.log = []
        self.round_results = []

    def _deal_round(self):
        """Start a new round - give each player cards to assign."""
        self.round_number += 1
        # Each round, player picks cards from available pool
        # If pool empty, replenish
        for p in (1, 2):
            if not self.available_cards[p]:
                self.available_cards[p] = list(range(1, 7))
                random.shuffle(self.available_cards[p])
            # Give player their available cards as hand
            self.hands[p] = list(self.available_cards[p])
        self.assignments = {1: {}, 2: {}}
        self.phase = "assign_p1"

    def display(self):
        clear_screen()
        print(f"{'=' * 60}")
        print(f"  SUN TZU - {self.players[0]} vs {self.players[1]}")
        print(f"  Round {self.round_number}/{self.total_rounds}")
        print(f"{'=' * 60}")
        print()

        # Province display
        print("  Province Control:")
        print(f"  {'P1 <':>8}  {'':^11}  {'> P2':<8}")
        print(f"  {'-' * 36}")

        for i, name in enumerate(PROVINCE_NAMES):
            ctrl = self.control[i]
            bar = self._control_bar(ctrl)
            owner = ""
            if ctrl >= 3:
                owner = " [P1]"
            elif ctrl <= -3:
                owner = " [P2]"
            print(f"  {name:>10}: {bar}{owner}")

        print(f"  {'-' * 36}")
        print()

        # Score summary
        p1_ctrl = sum(1 for c in self.control if c > 0)
        p2_ctrl = sum(1 for c in self.control if c < 0)
        neutral = sum(1 for c in self.control if c == 0)
        print(f"  Controlled: {self.players[0]}={p1_ctrl}  Neutral={neutral}  {self.players[1]}={p2_ctrl}")
        print()

        if self.phase == "assign_p1":
            print(f"  >>> {self.players[0]}'s turn to assign cards <<<")
            print(f"  Available cards: {self.hands[1]}")
        elif self.phase == "assign_p2":
            print(f"  >>> {self.players[1]}'s turn to assign cards <<<")
            print(f"  (P1 has assigned cards - no peeking!)")
            print(f"  Available cards: {self.hands[2]}")
        elif self.phase == "resolve":
            print("  Resolving round...")

        if self.round_results:
            print(f"\n  Last round results:")
            for r in self.round_results[-5:]:
                print(f"    {r}")
        print()

    def _control_bar(self, ctrl):
        """Create a visual control bar."""
        # ctrl ranges -3 to +3
        bar = ""
        for i in range(-3, 4):
            if i == ctrl:
                bar += "O"
            elif i == 0:
                bar += "|"
            else:
                bar += "-"
        return f"[{bar}]"

    def get_move(self):
        if self.phase == "resolve":
            return "resolve"

        if self.phase == "assign_p1":
            player = 1
        else:
            player = 2

        hand = self.hands[player]
        assignments = {}

        print(f"  Assign cards to provinces. You must assign at least 1 card.")
        print(f"  You may save remaining cards for future rounds.")
        print(f"  Format: province# card_value (e.g., '1 4' assigns 4 to {PROVINCE_NAMES[0]})")
        print(f"  Type 'done' when finished assigning.")
        print()

        remaining = list(hand)
        while True:
            print(f"  Cards remaining: {sorted(remaining)}")
            if assignments:
                print(f"  Assigned so far: ", end="")
                for pi, cv in sorted(assignments.items()):
                    total = sum(cv)
                    print(f"{PROVINCE_NAMES[pi]}={total} ", end="")
                print()

            raw = input_with_quit(f"  Assign (province# card_value) or 'done': ")
            if raw.strip().lower() == 'done':
                if not assignments:
                    print("  You must assign at least 1 card!")
                    continue
                break

            parts = raw.strip().split()
            if len(parts) != 2:
                print("  Format: province# card_value")
                continue
            try:
                pi = int(parts[0]) - 1
                cv = int(parts[1])
            except ValueError:
                print("  Enter numbers.")
                continue
            if pi < 0 or pi >= 5:
                print("  Province must be 1-5.")
                continue
            if cv not in remaining:
                print(f"  Card {cv} not available. You have: {sorted(remaining)}")
                continue

            remaining.remove(cv)
            if pi not in assignments:
                assignments[pi] = []
            assignments[pi].append(cv)
            print(f"  Assigned {cv} to {PROVINCE_NAMES[pi]}")

        return {"player": player, "assignments": assignments, "used_cards": [c for cards in assignments.values() for c in cards]}

    def make_move(self, move):
        if move == "resolve":
            self._resolve_round()
            return True

        player = move["player"]
        assignments = move["assignments"]
        used_cards = move["used_cards"]

        # Store assignments (as total strength per province)
        for pi, cards in assignments.items():
            self.assignments[player][pi] = sum(cards)

        # Remove used cards from available pool
        for c in used_cards:
            if c in self.available_cards[player]:
                self.available_cards[player].remove(c)

        if self.phase == "assign_p1":
            self.phase = "assign_p2"
            self.current_player = 2
        elif self.phase == "assign_p2":
            self.phase = "resolve"
            # Don't switch player, resolve immediately
        return True

    def _resolve_round(self):
        """Compare assignments and update control markers."""
        self.round_results = []
        for i in range(5):
            p1_str = self.assignments[1].get(i, 0)
            p2_str = self.assignments[2].get(i, 0)
            if p1_str > p2_str:
                old = self.control[i]
                self.control[i] = min(3, self.control[i] + 1)
                self.round_results.append(
                    f"{PROVINCE_NAMES[i]}: P1({p1_str}) vs P2({p2_str}) -> P1 wins, control {old}->{self.control[i]}")
            elif p2_str > p1_str:
                old = self.control[i]
                self.control[i] = max(-3, self.control[i] - 1)
                self.round_results.append(
                    f"{PROVINCE_NAMES[i]}: P1({p1_str}) vs P2({p2_str}) -> P2 wins, control {old}->{self.control[i]}")
            elif p1_str > 0:
                self.round_results.append(
                    f"{PROVINCE_NAMES[i]}: P1({p1_str}) vs P2({p2_str}) -> Tie, no change")

        # Start next round or end game
        if self.round_number < self.total_rounds:
            self._deal_round()
            self.current_player = 1
        else:
            self.phase = "done"

    def check_game_over(self):
        if self.phase == "done" or self.round_number > self.total_rounds:
            self.game_over = True
            p1_ctrl = sum(1 for c in self.control if c > 0)
            p2_ctrl = sum(1 for c in self.control if c < 0)
            if p1_ctrl > p2_ctrl:
                self.winner = 1
            elif p2_ctrl > p1_ctrl:
                self.winner = 2
            else:
                # Tiebreak: sum of control values
                total = sum(self.control)
                if total > 0:
                    self.winner = 1
                elif total < 0:
                    self.winner = 2
                else:
                    self.winner = None

    def switch_player(self):
        """Override - player switching is handled internally by phases."""
        pass

    def get_state(self):
        return {
            "total_rounds": self.total_rounds,
            "round_number": self.round_number,
            "control": self.control,
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "assignments": {"1": {str(k): v for k, v in self.assignments[1].items()},
                           "2": {str(k): v for k, v in self.assignments[2].items()}},
            "phase": self.phase,
            "available_cards": {"1": self.available_cards[1], "2": self.available_cards[2]},
            "round_results": self.round_results,
            "log": self.log[-10:],
        }

    def load_state(self, state):
        self.total_rounds = state["total_rounds"]
        self.round_number = state["round_number"]
        self.control = state["control"]
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.assignments = {
            1: {int(k): v for k, v in state["assignments"]["1"].items()},
            2: {int(k): v for k, v in state["assignments"]["2"].items()},
        }
        self.phase = state["phase"]
        self.available_cards = {1: state["available_cards"]["1"], 2: state["available_cards"]["2"]}
        self.round_results = state.get("round_results", [])
        self.log = state.get("log", [])

    def get_tutorial(self):
        return f"""
{'=' * 60}
  SUN TZU - Tutorial
{'=' * 60}

  OBJECTIVE:
  Control the most provinces after {self.total_rounds} rounds.

  THE MAP:
  5 provinces in a line, each with a control marker.
  Markers range from -3 (Player 2) to +3 (Player 1).
  Start at 0 (neutral).

  EACH ROUND:
  1. Both players secretly assign cards to provinces.
  2. Cards are revealed simultaneously.
  3. Whoever has the higher total at each province moves
     the control marker one step toward them.

  CARDS:
  Each player has cards valued 1-6. Once used, a card is
  gone until all 6 are used, then you get a fresh set.
  You may assign multiple cards to one province or spread out.

  WINNING:
  After {self.total_rounds} rounds, the player controlling more
  provinces wins. A province is controlled if its marker
  is on your side (positive for P1, negative for P2).

  INPUT FORMAT: province# card_value (e.g., '2 5')
  Type 'done' when finished assigning cards for the round.
{'=' * 60}
"""
