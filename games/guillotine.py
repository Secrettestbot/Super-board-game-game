"""Guillotine - Card game where players collect nobles from a line.

Play action cards to rearrange the line of nobles before collecting the first
noble in line. Game plays over 3 rounds (or 2 in quick mode). Highest total
noble value wins.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

NOBLES = [
    {"name": "King Louis XVI", "value": 5, "type": "Royal"},
    {"name": "Marie Antoinette", "value": 5, "type": "Royal"},
    {"name": "Regent", "value": 4, "type": "Royal"},
    {"name": "Duke", "value": 3, "type": "Royal"},
    {"name": "Baron", "value": 3, "type": "Noble"},
    {"name": "Count", "value": 2, "type": "Noble"},
    {"name": "Countess", "value": 2, "type": "Noble"},
    {"name": "Lord", "value": 2, "type": "Noble"},
    {"name": "Lady", "value": 2, "type": "Noble"},
    {"name": "Bishop", "value": 1, "type": "Church"},
    {"name": "Archbishop", "value": 2, "type": "Church"},
    {"name": "Cardinal", "value": 3, "type": "Church"},
    {"name": "Nun", "value": 1, "type": "Church"},
    {"name": "Tax Collector", "value": -2, "type": "Civic"},
    {"name": "Sheriff", "value": 1, "type": "Civic"},
    {"name": "Palace Guard", "value": 1, "type": "Military"},
    {"name": "Colonel", "value": 2, "type": "Military"},
    {"name": "General", "value": 3, "type": "Military"},
    {"name": "Lieutenant", "value": 1, "type": "Military"},
    {"name": "Spy", "value": -1, "type": "Civic"},
    {"name": "Tragic Figure", "value": 0, "type": "Commoner"},
    {"name": "Hero of People", "value": -3, "type": "Commoner"},
    {"name": "Innocent Victim", "value": -1, "type": "Commoner"},
    {"name": "Martyr", "value": -1, "type": "Commoner"},
]

ACTION_CARDS = [
    {"name": "Push", "effect": "move_back_1", "desc": "Move front noble back 1 spot"},
    {"name": "Long March", "effect": "move_back_3", "desc": "Move front noble back 3 spots"},
    {"name": "Rush", "effect": "move_front_1", "desc": "Move last noble forward 1 spot"},
    {"name": "Reversal", "effect": "reverse", "desc": "Reverse the entire line"},
    {"name": "Shuffle", "effect": "shuffle", "desc": "Shuffle the noble line"},
    {"name": "Bribe", "effect": "swap_1_2", "desc": "Swap first and second nobles"},
    {"name": "Double Feature", "effect": "take_two", "desc": "Take 2 nobles this turn"},
    {"name": "Clothing Swap", "effect": "move_last_front", "desc": "Move last noble to front"},
    {"name": "Escape", "effect": "remove_first", "desc": "Remove the first noble (no one gets it)"},
    {"name": "Charity", "effect": "give_negative", "desc": "Give a negative noble to opponent"},
    {"name": "Bodyguard", "effect": "protect", "desc": "Your negative nobles are worth 0 this round"},
    {"name": "Tough Crowd", "effect": "move_front_3", "desc": "Move 3rd noble to front"},
    {"name": "Public Demand", "effect": "move_highest_front", "desc": "Move highest value noble to front"},
    {"name": "Fainting Spell", "effect": "move_back_2", "desc": "Move front noble back 2 spots"},
    {"name": "Mass Confusion", "effect": "shuffle", "desc": "Shuffle the noble line"},
    {"name": "Friend in Court", "effect": "draw_extra", "desc": "Draw 2 extra action cards"},
]


class GuillotineGame(BaseGame):
    """Guillotine - Collect nobles from the line using action cards."""

    name = "Guillotine"
    description = "Play action cards to rearrange nobles, then collect the first in line"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "quick": "Quick Game (2 Rounds)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.total_rounds = 2 if self.variation == "quick" else 3
        self.current_round = 1
        self.noble_line = []
        self.noble_deck = []
        self.action_deck = []
        self.hands = {}  # player -> list of action cards
        self.collected = {}  # player -> list of nobles collected
        self.phase = "action"  # action or collect
        self.protected = {}  # player -> bool (bodyguard effect)
        self.take_extra = False  # double feature effect
        self.log = []

    def setup(self):
        self.noble_deck = list(NOBLES)
        random.shuffle(self.noble_deck)
        self.action_deck = list(ACTION_CARDS) * 2  # double the action cards
        random.shuffle(self.action_deck)
        for p in [1, 2]:
            sp = str(p)
            self.hands[sp] = []
            self.collected[sp] = []
            self.protected[sp] = False
            for _ in range(5):
                if self.action_deck:
                    self.hands[sp].append(self.action_deck.pop())
        self._setup_round()
        self.log = ["Round 1 begins! Play an action card or skip to collect."]

    def _setup_round(self):
        """Set up a new round with 12 nobles in line."""
        self.noble_line = []
        for _ in range(12):
            if self.noble_deck:
                self.noble_line.append(self.noble_deck.pop())
        if not self.noble_line and self.noble_deck:
            self.noble_line.append(self.noble_deck.pop())
        self.phase = "action"
        for sp in ["1", "2"]:
            self.protected[sp] = False

    def _apply_action(self, card, player):
        """Apply an action card effect."""
        sp = str(player)
        opp = "2" if sp == "1" else "1"
        effect = card["effect"]
        line = self.noble_line

        if effect == "move_back_1" and len(line) > 1:
            noble = line.pop(0)
            line.insert(min(1, len(line)), noble)
        elif effect == "move_back_2" and len(line) > 1:
            noble = line.pop(0)
            line.insert(min(2, len(line)), noble)
        elif effect == "move_back_3" and len(line) > 1:
            noble = line.pop(0)
            line.insert(min(3, len(line)), noble)
        elif effect == "move_front_1" and len(line) > 1:
            noble = line.pop(-1)
            line.insert(max(0, len(line) - 1), noble)
        elif effect == "move_front_3" and len(line) >= 3:
            noble = line.pop(2)
            line.insert(0, noble)
        elif effect == "reverse":
            line.reverse()
        elif effect == "shuffle":
            random.shuffle(line)
        elif effect == "swap_1_2" and len(line) >= 2:
            line[0], line[1] = line[1], line[0]
        elif effect == "take_two":
            self.take_extra = True
        elif effect == "move_last_front" and len(line) > 1:
            noble = line.pop(-1)
            line.insert(0, noble)
        elif effect == "remove_first" and line:
            line.pop(0)
        elif effect == "give_negative":
            # Give a negative-value noble from collected to opponent
            negatives = [n for n in self.collected[sp] if n["value"] < 0]
            if negatives:
                worst = min(negatives, key=lambda n: n["value"])
                self.collected[sp].remove(worst)
                self.collected[opp].append(worst)
        elif effect == "protect":
            self.protected[sp] = True
        elif effect == "move_highest_front" and line:
            best = max(line, key=lambda n: n["value"])
            line.remove(best)
            line.insert(0, best)
        elif effect == "draw_extra":
            for _ in range(2):
                if self.action_deck:
                    self.hands[sp].append(self.action_deck.pop())

        self.noble_line = line

    def _ai_choose_action(self):
        """AI selects which action card to play (or skip)."""
        sp = "2"
        hand = self.hands[sp]
        if not hand or not self.noble_line:
            return None

        front_val = self.noble_line[0]["value"]
        # If front noble is already high value, skip
        if front_val >= 3:
            return None

        # Try to find a card that would put a high value noble at front
        best_card = None
        best_score = front_val
        for i, card in enumerate(hand):
            # Simulate
            saved_line = list(self.noble_line)
            self._apply_action(card, 2)
            new_front_val = self.noble_line[0]["value"] if self.noble_line else 0
            self.noble_line = saved_line
            if new_front_val > best_score:
                best_score = new_front_val
                best_card = i
        return best_card

    def display(self):
        clear_screen()
        print(f"{'=' * 60}")
        mode = "Standard" if self.total_rounds == 3 else "Quick"
        print(f"  GUILLOTINE - {mode} | Round {self.current_round}/{self.total_rounds}")
        print(f"{'=' * 60}")

        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            total = sum(n["value"] for n in self.collected[sp])
            if self.protected[sp]:
                total = sum(max(0, n["value"]) for n in self.collected[sp])
            ncol = len(self.collected[sp])
            print(f"  {self.players[p-1]}: {ncol} nobles collected, {total} points{marker}")

        print(f"\n  Noble Line ({len(self.noble_line)} remaining):")
        print(f"  {'GUILLOTINE':>12} -->", end="")
        if self.noble_line:
            for i, noble in enumerate(self.noble_line):
                vstr = f"({noble['value']:+d})" if noble["value"] != 0 else "(0)"
                if i == 0:
                    print(f" [{noble['name']} {vstr}]", end="")
                else:
                    print(f"  {noble['name']} {vstr}", end="")
                if i < len(self.noble_line) - 1:
                    print(" |", end="")
            print()
        else:
            print(" [empty]")

        print()
        cp = self.current_player
        sp = str(cp)
        if cp == 1:
            print(f"  Your Action Cards:")
            if self.hands[sp]:
                for i, card in enumerate(self.hands[sp]):
                    print(f"    [{i+1}] {card['name']}: {card['desc']}")
            else:
                print(f"    (no cards)")

        print(f"\n  Your Collected Nobles:")
        if self.collected[sp]:
            by_type = {}
            for n in self.collected[sp]:
                by_type.setdefault(n["type"], []).append(n)
            for ntype, nobles in by_type.items():
                names = ", ".join(f"{n['name']}({n['value']:+d})" for n in nobles)
                print(f"    {ntype}: {names}")
        else:
            print(f"    (none)")
        print()
        print(f"  Phase: {'Play Action Card' if self.phase == 'action' else 'Collect Noble'}")
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if cp == 2:
            # AI turn
            if self.phase == "action":
                choice = self._ai_choose_action()
                if choice is not None:
                    print(f"  {self.players[1]} plays: {self.hands[sp][choice]['name']}")
                    input_with_quit("  Press Enter to continue...")
                    return {"action": "play_card", "index": choice}
                else:
                    return {"action": "skip"}
            else:
                return {"action": "collect"}

        if self.phase == "action":
            print(f"  {self.players[0]}, play an action card or skip.")
            choice = input_with_quit("  Card number (or 'skip'): ").strip()
            if choice.lower() in ('skip', 's', ''):
                return {"action": "skip"}
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(self.hands[sp]):
                    return {"action": "play_card", "index": idx}
            except ValueError:
                pass
            return None
        else:
            print(f"  {self.players[0]}, collect the first noble in line.")
            input_with_quit("  Press Enter to collect...")
            return {"action": "collect"}

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move.get("action")

        if action == "play_card":
            idx = move["index"]
            if idx < 0 or idx >= len(self.hands[sp]):
                return False
            card = self.hands[sp].pop(idx)
            self._apply_action(card, cp)
            self.log.append(f"{self.players[cp-1]} played {card['name']}: {card['desc']}")
            self.phase = "collect"
            return True

        if action == "skip":
            self.log.append(f"{self.players[cp-1]} skipped action phase.")
            self.phase = "collect"
            return True

        if action == "collect":
            if not self.noble_line:
                self.log.append(f"No nobles left to collect.")
                self._end_turn()
                return True
            noble = self.noble_line.pop(0)
            self.collected[sp].append(noble)
            self.log.append(f"{self.players[cp-1]} collected {noble['name']} ({noble['value']:+d} pts)")

            # Double feature: take another
            if self.take_extra and self.noble_line:
                noble2 = self.noble_line.pop(0)
                self.collected[sp].append(noble2)
                self.log[-1] += f" and {noble2['name']} ({noble2['value']:+d} pts)"
                self.take_extra = False

            # Draw an action card
            if self.action_deck:
                self.hands[sp].append(self.action_deck.pop())

            self._end_turn()
            return True

        return False

    def _end_turn(self):
        """Handle end of turn - check for round end."""
        self.phase = "action"
        self.take_extra = False
        if not self.noble_line:
            if self.current_round >= self.total_rounds:
                return  # game over check handles this
            self.current_round += 1
            self._setup_round()
            self.log.append(f"Round {self.current_round} begins!")

    def check_game_over(self):
        if not self.noble_line and self.current_round >= self.total_rounds:
            self.game_over = True
            s1 = sum(n["value"] for n in self.collected["1"])
            s2 = sum(n["value"] for n in self.collected["2"])
            if self.protected["1"]:
                s1 = sum(max(0, n["value"]) for n in self.collected["1"])
            if self.protected["2"]:
                s2 = sum(max(0, n["value"]) for n in self.collected["2"])
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "current_round": self.current_round,
            "total_rounds": self.total_rounds,
            "noble_line": self.noble_line,
            "noble_deck": self.noble_deck,
            "action_deck": self.action_deck,
            "hands": self.hands,
            "collected": self.collected,
            "phase": self.phase,
            "protected": self.protected,
            "take_extra": self.take_extra,
            "log": self.log,
        }

    def load_state(self, state):
        self.current_round = state["current_round"]
        self.total_rounds = state["total_rounds"]
        self.noble_line = state["noble_line"]
        self.noble_deck = state["noble_deck"]
        self.action_deck = state["action_deck"]
        self.hands = state["hands"]
        self.collected = state["collected"]
        self.phase = state["phase"]
        self.protected = state.get("protected", {"1": False, "2": False})
        self.take_extra = state.get("take_extra", False)
        self.log = state.get("log", [])

    def get_tutorial(self):
        return f"""
============================================================
  GUILLOTINE - Tutorial
============================================================

  OVERVIEW:
  It's the French Revolution! Nobles line up for the
  guillotine. Collect the most valuable nobles over
  {self.total_rounds} rounds.

  GAMEPLAY:
  1. 12 nobles line up each round
  2. On your turn: optionally play an action card,
     then collect the first noble in line
  3. Action cards rearrange the line to your advantage

  NOBLE VALUES:
  - Royals (3-5 pts): Most valuable
  - Military/Church (1-3 pts): Moderate value
  - Commoners (-3 to 0 pts): Negative! Avoid them

  ACTION CARDS:
  - Push/Rush: Move nobles forward or back
  - Reversal: Flip the entire line
  - Double Feature: Take 2 nobles
  - Escape: Remove front noble entirely

  WINNING:
  - After {self.total_rounds} rounds, highest total points wins
============================================================
"""
