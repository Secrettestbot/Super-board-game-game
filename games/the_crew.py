"""The Crew - A cooperative trick-taking card game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Suits: Blue, Green, Pink, Yellow (regular) + Rocket (trump)
SUITS = ["Blue", "Green", "Pink", "Yellow"]
TRUMP = "Rocket"
ALL_SUITS = SUITS + [TRUMP]

SUIT_SYMBOLS = {
    "Blue": "B",
    "Green": "G",
    "Pink": "P",
    "Yellow": "Y",
    "Rocket": "R",
}

SUIT_DISPLAY = {
    "Blue": "\u2666B",
    "Green": "\u2663G",
    "Pink": "\u2665P",
    "Yellow": "\u2660Y",
    "Rocket": "\u2605R",
}


def _make_card(suit, value):
    return {"suit": suit, "value": value}


def _card_str(card):
    sym = SUIT_DISPLAY.get(card["suit"], "?")
    return f"{sym}{card['value']}"


def _card_short(card):
    s = SUIT_SYMBOLS[card["suit"]]
    return f"{s}{card['value']}"


def _generate_deck():
    """Generate the full deck: 4 suits x 9 cards + 4 rocket cards."""
    deck = []
    for suit in SUITS:
        for val in range(1, 10):
            deck.append(_make_card(suit, val))
    for val in range(1, 5):
        deck.append(_make_card(TRUMP, val))
    return deck


def _card_beats(card_a, card_b, lead_suit):
    """Return True if card_a beats card_b, given lead_suit."""
    # Trump beats non-trump
    if card_a["suit"] == TRUMP and card_b["suit"] != TRUMP:
        return True
    if card_b["suit"] == TRUMP and card_a["suit"] != TRUMP:
        return False
    # Both trump: higher wins
    if card_a["suit"] == TRUMP and card_b["suit"] == TRUMP:
        return card_a["value"] > card_b["value"]
    # Same suit: higher wins
    if card_a["suit"] == card_b["suit"]:
        return card_a["value"] > card_b["value"]
    # Off-suit never beats lead
    if card_a["suit"] == lead_suit:
        return True
    if card_b["suit"] == lead_suit:
        return False
    # Neither follows suit - first played wins
    return True


def _generate_missions(count, deck_cards):
    """Generate mission objectives: specific cards that must be won by a player."""
    # Pick random non-trump cards as mission targets
    candidates = [c for c in deck_cards if c["suit"] != TRUMP]
    random.shuffle(candidates)
    missions = []
    for i in range(min(count, len(candidates))):
        missions.append({
            "card": {"suit": candidates[i]["suit"], "value": candidates[i]["value"]},
            "assigned_to": None,
            "completed": False,
            "failed": False,
        })
    return missions


class TheCrew(BaseGame):
    """The Crew - A cooperative trick-taking card game."""

    name = "The Crew"
    description = (
        "A cooperative trick-taking card game where players work together "
        "to complete mission objectives by winning specific cards in tricks."
    )
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard difficulty - 4 mission objectives to complete",
        "easy": "Easy mode - 2 mission objectives, more communication allowed",
    }

    def setup(self):
        self.deck = _generate_deck()
        random.shuffle(self.deck)

        # Deal cards - split evenly; with 40 cards and 2 players, 20 each
        self.hands = [None, [], []]
        half = len(self.deck) // 2
        self.hands[1] = sorted(self.deck[:half],
                               key=lambda c: (ALL_SUITS.index(c["suit"]), c["value"]))
        self.hands[2] = sorted(self.deck[half:],
                               key=lambda c: (ALL_SUITS.index(c["suit"]), c["value"]))

        # Mission objectives
        mission_count = 4 if self.variation == "standard" else 2
        self.missions = _generate_missions(mission_count, self.deck)

        # Assign missions alternately; player with highest rocket leads
        p1_max_rocket = max(
            (c["value"] for c in self.hands[1] if c["suit"] == TRUMP), default=0
        )
        p2_max_rocket = max(
            (c["value"] for c in self.hands[2] if c["suit"] == TRUMP), default=0
        )
        self.commander = 1 if p1_max_rocket >= p2_max_rocket else 2

        # Commander picks missions first (auto-assign alternating)
        picker = self.commander
        for m in self.missions:
            m["assigned_to"] = picker
            picker = 2 if picker == 1 else 1

        # Trick state
        self.lead_player = self.commander
        self.current_player = self.commander
        self.current_trick = []  # list of (player, card)
        self.tricks_won = [None, [], []]  # cards won per player
        self.tricks_played = 0
        self.total_tricks = len(self.hands[1])  # 20 tricks total

        # Communication tokens (each player can share one card once)
        self.comm_used = [None, False, False]
        self.comm_cards = [None, None, None]  # shared card info
        self.comm_position = [None, None, None]  # "highest", "lowest", "only"

        self.mission_result = None  # "success" or "fail"
        self.phase = "play"  # "play" or "communicate"

    def _sort_hand(self, player):
        self.hands[player].sort(
            key=lambda c: (ALL_SUITS.index(c["suit"]), c["value"])
        )

    def _can_follow_suit(self, player, lead_suit):
        return any(c["suit"] == lead_suit for c in self.hands[player])

    def _check_missions_after_trick(self, winner, trick_cards):
        """Check if any missions are completed or failed by this trick."""
        won_cards = [card for _, card in trick_cards]
        for m in self.missions:
            if m["completed"] or m["failed"]:
                continue
            target = m["card"]
            for card in won_cards:
                if card["suit"] == target["suit"] and card["value"] == target["value"]:
                    if winner == m["assigned_to"]:
                        m["completed"] = True
                    else:
                        m["failed"] = True

    def _all_missions_resolved(self):
        return all(m["completed"] or m["failed"] for m in self.missions)

    def _any_mission_failed(self):
        return any(m["failed"] for m in self.missions)

    def _all_missions_completed(self):
        return all(m["completed"] for m in self.missions)

    def display(self):
        p = self.current_player
        opp = 2 if p == 1 else 1

        print("=" * 60)
        print(f"  THE CREW  -  Trick {self.tricks_played + 1} of {self.total_tricks}")
        print("=" * 60)

        # Missions
        print("\n  MISSIONS:")
        for i, m in enumerate(self.missions):
            target = _card_str(m["card"])
            assigned = self.players[m["assigned_to"] - 1]
            if m["completed"]:
                status = "[DONE]"
            elif m["failed"]:
                status = "[FAIL]"
            else:
                status = "[    ]"
            print(f"    {status} {assigned} must win {target}")

        # Communication info
        for player in [1, 2]:
            if self.comm_cards[player] is not None:
                ccard = _card_str(self.comm_cards[player])
                pos = self.comm_position[player]
                print(f"  {self.players[player - 1]} shared: {ccard} ({pos} in suit)")

        # Opponent info
        print(f"\n  {self.players[opp - 1]}: {len(self.hands[opp])} cards in hand")
        print(f"  Tricks won: {len(self.tricks_won[opp])}")

        # Current trick
        print(f"\n  {'─' * 50}")
        if self.current_trick:
            print("  Current Trick:")
            for pl, card in self.current_trick:
                lead_mark = " (lead)" if pl == self.lead_player else ""
                print(f"    {self.players[pl - 1]}: {_card_str(card)}{lead_mark}")
        else:
            lead_name = self.players[self.lead_player - 1]
            print(f"  New trick - {lead_name} leads")

        # Current player info
        print(f"\n  {'─' * 50}")
        print(f"  {self.players[p - 1]} - Your Hand:")
        for i, card in enumerate(self.hands[p]):
            marker = ""
            # Mark cards that are mission targets for this player
            for m in self.missions:
                if (not m["completed"] and not m["failed"]
                        and m["assigned_to"] == p
                        and m["card"]["suit"] == card["suit"]
                        and m["card"]["value"] == card["value"]):
                    marker = " [MISSION]"
            print(f"    [{i + 1}] {_card_str(card)}{marker}")
        print(f"  Tricks won: {len(self.tricks_won[p])}")
        print(f"  {'─' * 50}")

    def get_move(self):
        p = self.current_player
        print("\n  Actions:")
        print("    <#>        - Play card from hand (e.g., '1')")
        if not self.comm_used[p] and not self.current_trick:
            print("    comm <#>   - Communicate a card (before playing)")

        move = input_with_quit("\n  Your action: ").strip().lower()
        return move

    def make_move(self, move):
        p = self.current_player
        opp = 2 if p == 1 else 1
        parts = move.split()
        if not parts:
            return False

        # Communication action
        if parts[0] == "comm":
            if self.comm_used[p]:
                print("  You already used your communication token!")
                return False
            if self.current_trick:
                print("  Can only communicate before a trick starts!")
                return False
            if len(parts) < 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.hands[p]):
                return False
            card = self.hands[p][idx]
            if card["suit"] == TRUMP:
                print("  Cannot communicate trump (Rocket) cards!")
                return False

            # Determine position
            suit_cards = [c for c in self.hands[p] if c["suit"] == card["suit"]]
            suit_values = sorted(c["value"] for c in suit_cards)
            if len(suit_values) == 1:
                pos = "only"
            elif card["value"] == suit_values[-1]:
                pos = "highest"
            elif card["value"] == suit_values[0]:
                pos = "lowest"
            else:
                print("  Can only share highest, lowest, or only card of a suit!")
                return False

            self.comm_used[p] = True
            self.comm_cards[p] = {"suit": card["suit"], "value": card["value"]}
            self.comm_position[p] = pos
            print(f"  Shared: {_card_str(card)} ({pos} in {card['suit']})")
            input("  Press Enter to continue...")
            return True

        # Play a card
        try:
            idx = int(parts[0]) - 1
        except ValueError:
            return False
        if idx < 0 or idx >= len(self.hands[p]):
            return False

        card = self.hands[p][idx]

        # Check suit-following rules
        if self.current_trick:
            lead_suit = self.current_trick[0][1]["suit"]
            if self._can_follow_suit(p, lead_suit) and card["suit"] != lead_suit:
                print(f"  Must follow suit ({lead_suit})!")
                return False

        # Play the card
        played = self.hands[p].pop(idx)
        self.current_trick.append((p, played))

        # If both players have played, resolve trick
        if len(self.current_trick) == 2:
            lead_suit = self.current_trick[0][1]["suit"]
            card1 = self.current_trick[0][1]
            card2 = self.current_trick[1][1]
            p1 = self.current_trick[0][0]
            p2 = self.current_trick[1][0]

            if _card_beats(card1, card2, lead_suit):
                winner = p1
            else:
                winner = p2

            # Store won cards
            for _, c in self.current_trick:
                self.tricks_won[winner].append(c)

            self._check_missions_after_trick(winner, self.current_trick)
            self.tricks_played += 1

            winner_name = self.players[winner - 1]
            c1_str = _card_str(self.current_trick[0][1])
            c2_str = _card_str(self.current_trick[1][1])
            print(f"\n  {self.players[p1-1]}: {c1_str}  vs  {self.players[p2-1]}: {c2_str}")
            print(f"  {winner_name} wins the trick!")

            # Check for mission status changes
            for m in self.missions:
                if m["completed"]:
                    target = _card_str(m["card"])
                    aname = self.players[m["assigned_to"] - 1]
                if m["failed"]:
                    target = _card_str(m["card"])
                    aname = self.players[m["assigned_to"] - 1]

            input("  Press Enter to continue...")

            self.current_trick = []
            self.lead_player = winner
            # Override current_player so switch_player in the game loop
            # ends up at the correct player. Since switch_player toggles,
            # we need current_player to be the opposite of who we want next.
            self.current_player = 2 if winner == 1 else 1
            return True
        else:
            # Waiting for second player - switch happens via game loop
            return True

    def check_game_over(self):
        if self._any_mission_failed():
            self.game_over = True
            self.mission_result = "fail"
            self.winner = None  # cooperative loss
            return

        if self._all_missions_completed():
            self.game_over = True
            self.mission_result = "success"
            # In cooperative game, both win (use player 1 as winner indicator)
            self.winner = None  # No single winner; cooperative success
            return

        # All cards played but missions not all resolved
        if self.tricks_played >= self.total_tricks:
            self.game_over = True
            if self._all_missions_completed():
                self.mission_result = "success"
            else:
                self.mission_result = "fail"
            self.winner = None
            return

    def get_state(self):
        return {
            "hands": self.hands,
            "missions": self.missions,
            "commander": self.commander,
            "lead_player": self.lead_player,
            "current_trick": self.current_trick,
            "tricks_won": self.tricks_won,
            "tricks_played": self.tricks_played,
            "total_tricks": self.total_tricks,
            "comm_used": self.comm_used,
            "comm_cards": self.comm_cards,
            "comm_position": self.comm_position,
            "mission_result": self.mission_result,
            "phase": self.phase,
        }

    def load_state(self, state):
        self.hands = state["hands"]
        self.missions = state["missions"]
        self.commander = state["commander"]
        self.lead_player = state["lead_player"]
        self.current_trick = state["current_trick"]
        self.tricks_won = state["tricks_won"]
        self.tricks_played = state["tricks_played"]
        self.total_tricks = state["total_tricks"]
        self.comm_used = state["comm_used"]
        self.comm_cards = state["comm_cards"]
        self.comm_position = state["comm_position"]
        self.mission_result = state["mission_result"]
        self.phase = state["phase"]

    def get_tutorial(self):
        return """
============================================================
  THE CREW - Tutorial
============================================================

  The Crew is a COOPERATIVE trick-taking card game.
  Both players work together to complete mission objectives!

  OBJECTIVE:
    Win specific cards in tricks as assigned by missions.
    ALL missions must be completed to win together.

  CARDS:
    4 suits (Blue, Green, Pink, Yellow): values 1-9 each
    1 trump suit (Rocket): values 1-4
    Total: 40 cards, 20 per player

  TRICK-TAKING RULES:
    - Lead player plays any card
    - Other player MUST follow suit if possible
    - Highest card of led suit wins (unless trumped)
    - Rocket (trump) cards beat all other suits
    - Winner of trick leads next

  MISSIONS:
    Each mission requires a specific player to win a
    specific card. If the wrong player wins that card,
    the mission FAILS and everyone loses!

  COMMUNICATION:
    Once per game, each player can share ONE card from
    their hand (not Rocket). You can only share your
    highest, lowest, or only card of a suit.

  COMMANDS:
    <#>        - Play a card from your hand
    comm <#>   - Share card info (before a trick starts)

  TIPS:
    - Plan ahead! Think about which cards you need to win
    - Use communication wisely to coordinate
    - Sometimes you need to LOSE a trick on purpose
============================================================
"""
