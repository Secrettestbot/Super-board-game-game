"""Hanamikoji Duel - Asymmetric card play with geisha favor."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Standard game: 7 geisha
STANDARD_GEISHA = [
    {"name": "Geisha 2a", "charm": 2, "item_count": 2},
    {"name": "Geisha 2b", "charm": 2, "item_count": 2},
    {"name": "Geisha 2c", "charm": 2, "item_count": 2},
    {"name": "Geisha 3a", "charm": 3, "item_count": 3},
    {"name": "Geisha 3b", "charm": 3, "item_count": 3},
    {"name": "Geisha 4",  "charm": 4, "item_count": 4},
    {"name": "Geisha 5",  "charm": 5, "item_count": 5},
]

# Quick game: 5 geisha
QUICK_GEISHA = [
    {"name": "Geisha 2a", "charm": 2, "item_count": 2},
    {"name": "Geisha 2b", "charm": 2, "item_count": 2},
    {"name": "Geisha 3",  "charm": 3, "item_count": 3},
    {"name": "Geisha 4",  "charm": 4, "item_count": 4},
    {"name": "Geisha 5",  "charm": 5, "item_count": 5},
]

# Standard actions
STANDARD_ACTIONS = {
    "secret": "Discard 2 cards face-down (removed from round)",
    "reserve": "Place 1 card face-down (revealed at end of round)",
    "offer": "Split cards into 2 groups; opponent picks one group",
    "display": "Play 3 cards face-up; opponent picks 1, you keep 2",
}

# Quick actions (3 of the 4)
QUICK_ACTIONS = {
    "secret": "Discard 2 cards face-down (removed from round)",
    "offer": "Split cards into 2 groups; opponent picks one group",
    "display": "Play 3 cards face-up; opponent picks 1, you keep 2",
}


class HanamikojiDuelGame(BaseGame):
    """Hanamikoji Duel: Win geisha favor through asymmetric card play."""

    name = "Hanamikoji Duel"
    description = "Asymmetric card play with geisha favor"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (7 geisha, 4 actions per round)",
        "quick": "Quick (5 geisha, 3 actions per round)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.geisha = []
        self.geisha_favor = []  # None, 1, or 2 for each geisha
        self.geisha_items = []  # {1: count, 2: count} for each geisha
        self.deck = []
        self.hands = {1: [], 2: []}
        self.actions_available = {1: [], 2: []}
        self.reserved_cards = {1: [], 2: []}  # face-down reserved cards
        self.round_number = 1
        self.action_phase = True
        self.pending_action = None  # for multi-step actions
        self.pending_data = None

    def setup(self):
        if self.variation == "quick":
            self.geisha = [dict(g) for g in QUICK_GEISHA]
            action_set = list(QUICK_ACTIONS.keys())
        else:
            self.geisha = [dict(g) for g in STANDARD_GEISHA]
            action_set = list(STANDARD_ACTIONS.keys())

        self.geisha_favor = [None] * len(self.geisha)
        self.geisha_items = [{1: 0, 2: 0} for _ in range(len(self.geisha))]

        self.actions_available = {1: list(action_set), 2: list(action_set)}
        self.reserved_cards = {1: [], 2: []}
        self.round_number = 1
        self.pending_action = None
        self.pending_data = None

        self._deal_round()

    def _deal_round(self):
        """Create deck and deal cards for a new round."""
        self.deck = []
        for i, g in enumerate(self.geisha):
            for _ in range(g["item_count"]):
                self.deck.append(i)  # card = geisha index
        random.shuffle(self.deck)

        # Remove 1 card face-down (unknown)
        if self.deck:
            self.deck.pop()

        # Deal hands
        hand_size = len(self.deck) // 2
        self.hands = {1: [], 2: []}
        for _ in range(hand_size):
            if self.deck:
                self.hands[1].append(self.deck.pop())
        for _ in range(hand_size):
            if self.deck:
                self.hands[2].append(self.deck.pop())
        # Any remaining go to deck (extra card)
        self.hands[1].sort()
        self.hands[2].sort()

    def _geisha_card_name(self, card_idx):
        """Get display name for a card (geisha index)."""
        return self.geisha[card_idx]["name"]

    def _resolve_favor(self):
        """Determine geisha favor based on item counts."""
        for i in range(len(self.geisha)):
            items = self.geisha_items[i]
            if items[1] > items[2]:
                self.geisha_favor[i] = 1
            elif items[2] > items[1]:
                self.geisha_favor[i] = 2
            # Tie: favor stays with whoever had it (or None)

    def _check_win(self):
        """Check win conditions: 4+ geisha or 11+ charm."""
        for p in [1, 2]:
            geisha_count = sum(1 for f in self.geisha_favor if f == p)
            charm_total = sum(
                self.geisha[i]["charm"]
                for i in range(len(self.geisha))
                if self.geisha_favor[i] == p
            )

            geisha_threshold = 4 if self.variation != "quick" else 3
            charm_threshold = 11 if self.variation != "quick" else 8

            if geisha_count >= geisha_threshold or charm_total >= charm_threshold:
                return p
        return None

    def display(self):
        clear_screen()
        print(f"{'='*60}")
        print(f"  HANAMIKOJI DUEL - {self.variations[self.variation]}")
        print(f"  Round {self.round_number} | {self.players[self.current_player - 1]}'s turn")
        print(f"{'='*60}")

        # Display geisha and favor
        print("\n  Geisha Cards:")
        print(f"  {'Geisha':<12} {'Charm':>5} {'P1 Items':>8} {'P2 Items':>8} {'Favor':>8}")
        print("  " + "-" * 45)
        for i, g in enumerate(self.geisha):
            favor = "---"
            if self.geisha_favor[i] == 1:
                favor = "P1"
            elif self.geisha_favor[i] == 2:
                favor = "P2"
            items = self.geisha_items[i]
            print(f"  {g['name']:<12} {g['charm']:>5} {items[1]:>8} {items[2]:>8} {favor:>8}")

        # Score summary
        for p in [1, 2]:
            geisha_count = sum(1 for f in self.geisha_favor if f == p)
            charm_total = sum(
                self.geisha[i]["charm"]
                for i in range(len(self.geisha))
                if self.geisha_favor[i] == p
            )
            print(f"\n  {self.players[p-1]}: {geisha_count} geisha, {charm_total} charm points")

        # Show hand for current player
        p = self.current_player
        print(f"\n  {self.players[p-1]}'s hand:")
        for i, card in enumerate(self.hands[p]):
            print(f"    [{i}] {self._geisha_card_name(card)} (charm {self.geisha[card]['charm']})")

        # Show available actions
        print(f"\n  Available actions: {', '.join(self.actions_available[p])}")
        print()

    def get_move(self):
        player = self.current_player

        if self.pending_action:
            return self._get_pending_input()

        if not self.actions_available[player]:
            return ("end_round",)

        if not self.hands[player]:
            return ("end_round",)

        actions_desc = {
            "secret": "Discard 2 cards face-down",
            "reserve": "Reserve 1 card face-down",
            "offer": "Offer 2 groups to opponent",
            "display": "Display 3 cards (opponent picks 1)",
        }

        print("  Choose an action:")
        for act in self.actions_available[player]:
            print(f"    {act}: {actions_desc.get(act, '')}")

        action = input_with_quit("  Action: ").strip().lower()

        if action not in self.actions_available[player]:
            return None

        if action == "secret":
            if len(self.hands[player]) < 2:
                print("  Not enough cards!")
                return None
            print("  Choose 2 cards to discard (e.g., '0 3'):")
            for i, card in enumerate(self.hands[player]):
                print(f"    [{i}] {self._geisha_card_name(card)}")
            choice = input_with_quit("  Cards: ")
            return ("secret", choice)

        elif action == "reserve":
            print("  Choose 1 card to reserve face-down:")
            for i, card in enumerate(self.hands[player]):
                print(f"    [{i}] {self._geisha_card_name(card)}")
            choice = input_with_quit("  Card: ")
            return ("reserve", choice)

        elif action == "offer":
            if len(self.hands[player]) < 4:
                # Need at least 4 cards ideally, but allow with fewer
                pass
            print("  Choose cards for Group A (opponent chooses between A and B).")
            print("  Enter card indices for Group A (remaining will be Group B):")
            for i, card in enumerate(self.hands[player]):
                print(f"    [{i}] {self._geisha_card_name(card)}")
            choice = input_with_quit("  Group A cards (e.g., '0 2'): ")
            return ("offer_split", choice)

        elif action == "display":
            if len(self.hands[player]) < 3:
                print("  Not enough cards for display!")
                return None
            print("  Choose 3 cards to display (opponent picks 1, you keep 2):")
            for i, card in enumerate(self.hands[player]):
                print(f"    [{i}] {self._geisha_card_name(card)}")
            choice = input_with_quit("  Cards (e.g., '0 1 2'): ")
            return ("display_choose", choice)

        return None

    def _get_pending_input(self):
        """Handle multi-step actions."""
        if self.pending_action == "offer_pick":
            data = self.pending_data
            print(f"  {self.players[self.current_player - 1]}, choose a group:")
            print(f"    [A] Group A: "
                  + ", ".join(self._geisha_card_name(c) for c in data["group_a"]))
            print(f"    [B] Group B: "
                  + ", ".join(self._geisha_card_name(c) for c in data["group_b"]))
            choice = input_with_quit("  Pick A or B: ").strip().upper()
            return ("offer_resolve", choice)

        elif self.pending_action == "display_pick":
            data = self.pending_data
            print(f"  {self.players[self.current_player - 1]}, pick 1 card from display:")
            for i, card in enumerate(data["cards"]):
                print(f"    [{i}] {self._geisha_card_name(card)}")
            choice = input_with_quit("  Pick card: ")
            return ("display_resolve", choice)

        return None

    def make_move(self, move):
        if move is None:
            return False

        player = self.current_player
        opponent = 2 if player == 1 else 1

        if move[0] == "end_round":
            self._end_round()
            return True

        if move[0] == "secret":
            try:
                indices = [int(x) for x in move[1].strip().split()]
            except ValueError:
                return False
            if len(indices) != 2:
                return False
            if any(i < 0 or i >= len(self.hands[player]) for i in indices):
                return False
            if indices[0] == indices[1]:
                return False

            # Remove cards (higher index first to avoid shifting)
            indices.sort(reverse=True)
            for idx in indices:
                self.hands[player].pop(idx)
            self.actions_available[player].remove("secret")
            return True

        if move[0] == "reserve":
            try:
                idx = int(move[1].strip())
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.hands[player]):
                return False

            card = self.hands[player].pop(idx)
            self.reserved_cards[player].append(card)
            self.actions_available[player].remove("reserve")
            return True

        if move[0] == "offer_split":
            try:
                a_indices = [int(x) for x in move[1].strip().split()]
            except ValueError:
                return False
            if not a_indices:
                return False
            if any(i < 0 or i >= len(self.hands[player]) for i in a_indices):
                return False
            if len(set(a_indices)) != len(a_indices):
                return False

            all_indices = list(range(len(self.hands[player])))
            b_indices = [i for i in all_indices if i not in a_indices]

            if not b_indices:
                return False  # both groups must have at least 1 card

            group_a = [self.hands[player][i] for i in a_indices]
            group_b = [self.hands[player][i] for i in b_indices]

            # Store pending action for opponent to choose
            self.pending_action = "offer_pick"
            self.pending_data = {
                "group_a": group_a,
                "group_b": group_b,
                "offerer": player,
                "a_indices": sorted(a_indices, reverse=True),
                "b_indices": sorted(b_indices, reverse=True),
            }
            self.actions_available[player].remove("offer")
            # Switch to opponent for the pick
            self.switch_player()

            # Remove all offered cards from hand
            all_offered = sorted(a_indices + b_indices, reverse=True)
            for idx in all_offered:
                self.hands[player].pop(idx)

            return True

        if move[0] == "offer_resolve":
            choice = move[1].strip().upper()
            data = self.pending_data
            offerer = data["offerer"]

            if choice == "A":
                # Opponent (current player) takes group A, offerer gets B
                for card in data["group_a"]:
                    self.geisha_items[card][self.current_player] += 1
                for card in data["group_b"]:
                    self.geisha_items[card][offerer] += 1
            elif choice == "B":
                for card in data["group_b"]:
                    self.geisha_items[card][self.current_player] += 1
                for card in data["group_a"]:
                    self.geisha_items[card][offerer] += 1
            else:
                return False

            self.pending_action = None
            self.pending_data = None
            # Switch back to offerer's opponent (next natural turn)
            self.switch_player()
            return True

        if move[0] == "display_choose":
            try:
                indices = [int(x) for x in move[1].strip().split()]
            except ValueError:
                return False
            if len(indices) != 3:
                return False
            if any(i < 0 or i >= len(self.hands[player]) for i in indices):
                return False
            if len(set(indices)) != len(indices):
                return False

            cards = [self.hands[player][i] for i in indices]

            # Remove from hand (highest index first)
            for idx in sorted(indices, reverse=True):
                self.hands[player].pop(idx)

            self.pending_action = "display_pick"
            self.pending_data = {
                "cards": cards,
                "displayer": player,
            }
            self.actions_available[player].remove("display")
            self.switch_player()
            return True

        if move[0] == "display_resolve":
            try:
                idx = int(move[1].strip())
            except ValueError:
                return False
            data = self.pending_data
            if idx < 0 or idx >= len(data["cards"]):
                return False

            displayer = data["displayer"]
            picker = self.current_player

            # Picker takes chosen card
            picked_card = data["cards"][idx]
            self.geisha_items[picked_card][picker] += 1

            # Displayer gets the other 2
            for i, card in enumerate(data["cards"]):
                if i != idx:
                    self.geisha_items[card][displayer] += 1

            self.pending_action = None
            self.pending_data = None
            self.switch_player()
            return True

        return False

    def _end_round(self):
        """End the current round: reveal reserved cards, resolve favor."""
        # Reveal reserved cards
        for p in [1, 2]:
            for card in self.reserved_cards[p]:
                self.geisha_items[card][p] += 1
            self.reserved_cards[p] = []

        # Play any remaining hand cards as items
        for p in [1, 2]:
            for card in self.hands[p]:
                self.geisha_items[card][p] += 1
            self.hands[p] = []

        self._resolve_favor()
        self.round_number += 1

        # Reset for next round
        if self.variation == "quick":
            action_set = list(QUICK_ACTIONS.keys())
        else:
            action_set = list(STANDARD_ACTIONS.keys())
        self.actions_available = {1: list(action_set), 2: list(action_set)}
        self.pending_action = None
        self.pending_data = None

        # Don't reset geisha items - they accumulate across rounds
        # But deal new cards
        self._deal_round()

    def check_game_over(self):
        winner = self._check_win()
        if winner:
            self.game_over = True
            self.winner = winner
            return

        # Game also ends after 3 rounds (standard) or 2 rounds (quick)
        max_rounds = 3 if self.variation != "quick" else 2
        if self.round_number > max_rounds:
            self._resolve_favor()
            self.game_over = True
            # Determine winner by charm points
            charm = {1: 0, 2: 0}
            geisha_count = {1: 0, 2: 0}
            for i in range(len(self.geisha)):
                if self.geisha_favor[i] is not None:
                    charm[self.geisha_favor[i]] += self.geisha[i]["charm"]
                    geisha_count[self.geisha_favor[i]] += 1

            if charm[1] > charm[2]:
                self.winner = 1
            elif charm[2] > charm[1]:
                self.winner = 2
            elif geisha_count[1] > geisha_count[2]:
                self.winner = 1
            elif geisha_count[2] > geisha_count[1]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        geisha_data = [dict(g) for g in self.geisha]
        geisha_items_data = [{str(k): v for k, v in items.items()}
                             for items in self.geisha_items]

        pending_data_safe = None
        if self.pending_data:
            pending_data_safe = {}
            for k, v in self.pending_data.items():
                if isinstance(v, list):
                    pending_data_safe[k] = list(v)
                else:
                    pending_data_safe[k] = v

        return {
            "geisha": geisha_data,
            "geisha_favor": self.geisha_favor,
            "geisha_items": geisha_items_data,
            "deck": self.deck,
            "hands": {str(k): list(v) for k, v in self.hands.items()},
            "actions_available": {str(k): list(v) for k, v in self.actions_available.items()},
            "reserved_cards": {str(k): list(v) for k, v in self.reserved_cards.items()},
            "round_number": self.round_number,
            "pending_action": self.pending_action,
            "pending_data": pending_data_safe,
        }

    def load_state(self, state):
        self.geisha = state["geisha"]
        self.geisha_favor = state["geisha_favor"]
        self.geisha_items = [{int(k): v for k, v in items.items()}
                             for items in state["geisha_items"]]
        self.deck = state["deck"]
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.actions_available = {int(k): v for k, v in state["actions_available"].items()}
        self.reserved_cards = {int(k): v for k, v in state["reserved_cards"].items()}
        self.round_number = state["round_number"]
        self.pending_action = state["pending_action"]
        self.pending_data = state["pending_data"]

    def get_tutorial(self):
        return """
==========================================
  HANAMIKOJI DUEL - Tutorial
==========================================

Win the favor of the Geisha through clever card play!

GEISHA:
  7 Geisha cards (standard) worth 2-5 charm points each.
  Each geisha has a number of item cards in the deck.
  Win a geisha's favor by having more items than your opponent.

ROUND STRUCTURE:
  Cards are dealt from a shuffled deck (1 removed secretly).
  Players alternate turns, each using one ACTION per turn.
  Each action can only be used once per round!

ACTIONS (Standard - 4 per round):
  secret   - Discard 2 cards face-down (removed from play)
  reserve  - Place 1 card face-down (revealed at round end)
  offer    - Split cards into 2 groups. Opponent picks a group;
             you get the other. Each group's cards count as items.
  display  - Show 3 cards face-up. Opponent picks 1, you keep 2.

Quick variation uses only 3 actions (no reserve) with 5 geisha.

WINNING:
  Standard: Win majority of 4+ geisha OR accumulate 11+ charm
  Quick: Win 3+ geisha OR accumulate 8+ charm

  Charm = sum of charm values of geisha in your favor.

STRATEGY:
  - The secret action lets you deny cards from both players
  - Reserve cards are safe but revealed later
  - Offer forces a tough choice on your opponent
  - Display gives your opponent only 1 of 3 cards

CONTROLS:
  Type the action name: secret, reserve, offer, display
  Then follow prompts to select cards by index number.
"""
