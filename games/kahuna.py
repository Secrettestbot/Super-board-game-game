"""Kahuna - Island bridge-building area control game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class KahunaGame(BaseGame):
    """Kahuna - Build bridges between islands to gain area control."""

    name = "Kahuna"
    description = "Island bridge-building area control game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (12 islands)",
        "small": "Small (8 islands)",
    }

    # Standard 12-island layout with bridge connections
    ISLANDS_12 = [
        "Aloa", "Bari", "Coco", "Duda", "Elai", "Faro",
        "Gola", "Huna", "Iffi", "Jojo", "Kali", "Lamu"
    ]
    BRIDGES_12 = [
        ("Aloa", "Bari"), ("Aloa", "Coco"), ("Aloa", "Duda"),
        ("Bari", "Coco"), ("Bari", "Elai"), ("Bari", "Faro"),
        ("Coco", "Duda"), ("Coco", "Faro"), ("Coco", "Gola"),
        ("Duda", "Gola"), ("Duda", "Huna"),
        ("Elai", "Faro"), ("Elai", "Iffi"),
        ("Faro", "Gola"), ("Faro", "Iffi"), ("Faro", "Jojo"),
        ("Gola", "Huna"), ("Gola", "Jojo"), ("Gola", "Kali"),
        ("Huna", "Kali"),
        ("Iffi", "Jojo"), ("Iffi", "Lamu"),
        ("Jojo", "Kali"), ("Jojo", "Lamu"),
        ("Kali", "Lamu"),
    ]

    ISLANDS_8 = ["Aloa", "Bari", "Coco", "Duda", "Elai", "Faro", "Gola", "Huna"]
    BRIDGES_8 = [
        ("Aloa", "Bari"), ("Aloa", "Coco"), ("Aloa", "Duda"),
        ("Bari", "Coco"), ("Bari", "Elai"),
        ("Coco", "Duda"), ("Coco", "Faro"),
        ("Duda", "Faro"), ("Duda", "Gola"),
        ("Elai", "Faro"), ("Elai", "Huna"),
        ("Faro", "Gola"), ("Faro", "Huna"),
        ("Gola", "Huna"),
    ]

    def __init__(self, variation=None):
        super().__init__(variation)
        self.islands = []
        self.possible_bridges = []
        # bridge_owner: key = "Island1-Island2" (sorted), value = player number or 0
        self.bridge_owner = {}
        # island_control: key = island name, value = player number or 0
        self.island_control = {}
        # Cards
        self.deck = []
        self.hands = {1: [], 2: []}
        self.discard = []
        # Scoring
        self.scores = {1: 0, 2: 0}
        self.scoring_round = 0
        self.max_scoring_rounds = 3
        self.cards_played_this_turn = 0
        self.log = []

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def _bridge_key(self, island_a, island_b):
        pair = sorted([island_a, island_b])
        return "{}-{}".format(pair[0], pair[1])

    def _get_island_bridges(self, island):
        """Get all possible bridges connected to an island."""
        bridges = []
        for a, b in self.possible_bridges:
            if a == island or b == island:
                bridges.append(self._bridge_key(a, b))
        return bridges

    def _count_player_bridges(self, island, player):
        """Count how many bridges a player has around an island."""
        count = 0
        for bkey in self._get_island_bridges(island):
            if self.bridge_owner.get(bkey, 0) == player:
                count += 1
        return count

    def _total_bridges(self, island):
        """Count total possible bridges for an island."""
        return len(self._get_island_bridges(island))

    def _check_majority(self, island, player):
        """Check if player has majority (more than half) of bridges around island."""
        total = self._total_bridges(island)
        player_count = self._count_player_bridges(island, player)
        return player_count > total / 2

    def _claim_island(self, island, player):
        """Player claims an island, removing opponent bridges."""
        opponent = 2 if player == 1 else 1
        self.island_control[island] = player
        # Remove all opponent bridges connected to this island
        removed = []
        for bkey in self._get_island_bridges(island):
            if self.bridge_owner.get(bkey, 0) == opponent:
                self.bridge_owner[bkey] = 0
                removed.append(bkey)
        # Check if opponent loses control of adjacent islands due to removed bridges
        for bkey in removed:
            parts = bkey.split("-")
            for adj_island in parts:
                if adj_island != island and self.island_control.get(adj_island) == opponent:
                    if not self._check_majority(adj_island, opponent):
                        self.island_control[adj_island] = 0
                        self._add_log(f"{adj_island} is now unclaimed!")
        return removed

    def _make_deck(self):
        """Create deck of island cards."""
        deck = []
        for island in self.islands:
            # Each island appears 2-3 times in the deck
            count = 3 if len(self.islands) <= 8 else 2
            for _ in range(count):
                deck.append(island)
        random.shuffle(deck)
        return deck

    def _draw_card(self, player):
        """Draw a card for a player."""
        if not self.deck:
            return False
        card = self.deck.pop()
        self.hands[player].append(card)
        return True

    def _refill_hands(self):
        """Draw cards up to hand limit."""
        for p in [1, 2]:
            while len(self.hands[p]) < 3 and self.deck:
                self._draw_card(p)

    def setup(self):
        if self.variation == "small":
            self.islands = list(self.ISLANDS_8)
            self.possible_bridges = list(self.BRIDGES_8)
        else:
            self.islands = list(self.ISLANDS_12)
            self.possible_bridges = list(self.BRIDGES_12)

        self.bridge_owner = {}
        for a, b in self.possible_bridges:
            self.bridge_owner[self._bridge_key(a, b)] = 0

        self.island_control = {}
        for island in self.islands:
            self.island_control[island] = 0

        self.scores = {1: 0, 2: 0}
        self.scoring_round = 0
        self.max_scoring_rounds = 3
        self.log = []
        self.game_over = False
        self.winner = None
        self.current_player = 1

        self.deck = self._make_deck()
        self.hands = {1: [], 2: []}
        self.discard = []
        self._refill_hands()
        for p in [1, 2]:
            while len(self.hands[p]) < 5 and self.deck:
                self._draw_card(p)

    def display(self):
        clear_screen()
        print("=" * 60)
        print(f"  KAHUNA - Scoring Round {self.scoring_round + 1}/{self.max_scoring_rounds}")
        print(f"  {self.players[0]}: {self.scores[1]} pts | "
              f"{self.players[1]}: {self.scores[2]} pts")
        print(f"  Deck: {len(self.deck)} cards remaining")
        print("=" * 60)

        # Display islands and their control
        print("\n  Islands:")
        for island in self.islands:
            controller = self.island_control[island]
            total_b = self._total_bridges(island)
            p1_b = self._count_player_bridges(island, 1)
            p2_b = self._count_player_bridges(island, 2)
            ctrl_str = "  --  "
            if controller == 1:
                ctrl_str = f" [{self.players[0][:6]}]"
            elif controller == 2:
                ctrl_str = f" [{self.players[1][:6]}]"
            print(f"    {island:6s}{ctrl_str}  bridges: P1={p1_b} P2={p2_b} / {total_b} possible")

        # Display bridges
        print("\n  Built bridges:")
        any_built = False
        for a, b in self.possible_bridges:
            bkey = self._bridge_key(a, b)
            owner = self.bridge_owner[bkey]
            if owner != 0:
                owner_name = self.players[owner - 1]
                print(f"    {a} <---> {b}  ({owner_name})")
                any_built = True
        if not any_built:
            print("    (none)")

        # Current player hand
        p = self.current_player
        hand = sorted(self.hands[p])
        print(f"\n  {self.players[p-1]}'s hand: {', '.join(hand) if hand else '(empty)'}")

        if self.log:
            print("\n  Recent:")
            for msg in self.log[-4:]:
                print(f"    {msg}")
        print()

    def get_move(self):
        p = self.current_player
        hand = self.hands[p]

        if not hand:
            print(f"  {self.players[p-1]} has no cards. Drawing and ending turn.")
            input_with_quit("  Press Enter...")
            return "end_turn"

        print(f"  {self.players[p-1]}'s turn:")
        print("  Actions:")
        print("    1) Play a card to build a bridge")
        print("    2) Play 2 cards to remove an opponent's bridge")
        print("    3) End turn (draw a card)")

        while True:
            choice = input_with_quit("  Choose action (1/2/3): ").strip()
            if choice == "1":
                return self._get_build_move(p)
            elif choice == "2":
                if len(hand) < 2:
                    print("  Not enough cards to remove a bridge.")
                    continue
                return self._get_remove_move(p)
            elif choice == "3":
                return "end_turn"
            else:
                print("  Enter 1, 2, or 3.")

    def _get_build_move(self, player):
        hand = self.hands[player]
        print(f"\n  Your cards: {', '.join(sorted(hand))}")

        while True:
            card = input_with_quit("  Play which card? ").strip().title()
            if card not in hand:
                print(f"  You don't have '{card}'. Cards: {', '.join(sorted(hand))}")
                continue

            # Find valid bridges for this card
            valid = []
            for a, b in self.possible_bridges:
                if a == card or b == card:
                    bkey = self._bridge_key(a, b)
                    if self.bridge_owner[bkey] == 0:
                        valid.append((a, b))

            if not valid:
                print(f"  No available bridges for {card}.")
                continue

            print(f"  Available bridges from {card}:")
            for i, (a, b) in enumerate(valid):
                other = b if a == card else a
                print(f"    {i}) {card} <-> {other}")

            while True:
                idx = input_with_quit(f"  Choose bridge (0-{len(valid)-1}): ").strip()
                try:
                    idx = int(idx)
                    if 0 <= idx < len(valid):
                        a, b = valid[idx]
                        return {"action": "build", "card": card, "bridge": [a, b]}
                    print(f"  Enter 0-{len(valid)-1}")
                except ValueError:
                    print("  Enter a number.")

    def _get_remove_move(self, player):
        opponent = 2 if player == 1 else 1
        hand = self.hands[player]

        # Find opponent bridges
        opp_bridges = []
        for a, b in self.possible_bridges:
            bkey = self._bridge_key(a, b)
            if self.bridge_owner[bkey] == opponent:
                opp_bridges.append((a, b))

        if not opp_bridges:
            print("  Opponent has no bridges to remove.")
            return self.get_move()

        print(f"\n  Opponent's bridges:")
        for i, (a, b) in enumerate(opp_bridges):
            print(f"    {i}) {a} <-> {b}")

        while True:
            idx = input_with_quit(f"  Remove which bridge (0-{len(opp_bridges)-1})? ").strip()
            try:
                idx = int(idx)
                if 0 <= idx < len(opp_bridges):
                    break
                print(f"  Enter 0-{len(opp_bridges)-1}")
            except ValueError:
                print("  Enter a number.")

        target_a, target_b = opp_bridges[idx]

        # Need 2 cards matching either island of the bridge
        print(f"  Play 2 cards matching {target_a} or {target_b}.")
        print(f"  Your cards: {', '.join(sorted(hand))}")

        cards_to_play = []
        for _ in range(2):
            while True:
                card = input_with_quit(f"  Card {len(cards_to_play)+1} of 2: ").strip().title()
                if card not in hand:
                    print(f"  You don't have '{card}'.")
                    continue
                if card != target_a and card != target_b:
                    print(f"  Card must match {target_a} or {target_b}.")
                    continue
                # Check we haven't already selected this exact card instance
                temp_hand = list(hand)
                for c in cards_to_play:
                    temp_hand.remove(c)
                if card not in temp_hand:
                    print(f"  No more copies of {card} available.")
                    continue
                cards_to_play.append(card)
                break

        return {"action": "remove", "cards": cards_to_play, "bridge": [target_a, target_b]}

    def make_move(self, move):
        p = self.current_player
        opponent = 2 if p == 1 else 1

        if move == "end_turn":
            self._draw_card(p)
            self._add_log(f"{self.players[p-1]} drew a card.")
            # Check if deck is empty -> scoring
            if not self.deck:
                self._do_scoring()
            return True

        if move["action"] == "build":
            card = move["card"]
            a, b = move["bridge"]
            bkey = self._bridge_key(a, b)

            if self.bridge_owner[bkey] != 0:
                return False
            if card not in self.hands[p]:
                return False

            self.hands[p].remove(card)
            self.discard.append(card)
            self.bridge_owner[bkey] = p
            self._add_log(f"{self.players[p-1]} built bridge {a}<->{b}")

            # Check majority for both islands
            for island in [a, b]:
                if self._check_majority(island, p):
                    if self.island_control[island] != p:
                        removed = self._claim_island(island, p)
                        self._add_log(f"{self.players[p-1]} claims {island}!")
                        if removed:
                            self._add_log(f"  Removed {len(removed)} opponent bridge(s)")

            # Check if deck empty
            if not self.deck:
                self._do_scoring()
            return True

        if move["action"] == "remove":
            cards = move["cards"]
            a, b = move["bridge"]
            bkey = self._bridge_key(a, b)

            if self.bridge_owner[bkey] != opponent:
                return False

            for card in cards:
                if card not in self.hands[p]:
                    return False

            for card in cards:
                self.hands[p].remove(card)
                self.discard.append(card)

            self.bridge_owner[bkey] = 0
            self._add_log(f"{self.players[p-1]} removed bridge {a}<->{b}")

            # Check if opponent loses island control
            for island in [a, b]:
                if self.island_control[island] == opponent:
                    if not self._check_majority(island, opponent):
                        self.island_control[island] = 0
                        self._add_log(f"{island} is now unclaimed!")

            if not self.deck:
                self._do_scoring()
            return True

        return False

    def _do_scoring(self):
        self.scoring_round += 1
        p1_islands = sum(1 for v in self.island_control.values() if v == 1)
        p2_islands = sum(1 for v in self.island_control.values() if v == 2)

        if self.scoring_round == 1:
            # Round 1: player with more islands gets 1 point
            if p1_islands > p2_islands:
                self.scores[1] += 1
            elif p2_islands > p1_islands:
                self.scores[2] += 1
        elif self.scoring_round == 2:
            # Round 2: difference in islands
            diff = abs(p1_islands - p2_islands)
            if p1_islands > p2_islands:
                self.scores[1] += diff
            elif p2_islands > p1_islands:
                self.scores[2] += diff
        else:
            # Round 3: difference in islands
            diff = abs(p1_islands - p2_islands)
            if p1_islands > p2_islands:
                self.scores[1] += diff
            elif p2_islands > p1_islands:
                self.scores[2] += diff

        self._add_log(f"=== Scoring Round {self.scoring_round} ===")
        self._add_log(f"Islands: {self.players[0]}={p1_islands}, {self.players[1]}={p2_islands}")
        self._add_log(f"Scores: {self.players[0]}={self.scores[1]}, {self.players[1]}={self.scores[2]}")

        if self.scoring_round >= self.max_scoring_rounds:
            return  # game will end via check_game_over

        # Reshuffle and redeal
        self.deck = self._make_deck()
        self._refill_hands()

    def check_game_over(self):
        if self.scoring_round >= self.max_scoring_rounds:
            self.game_over = True
            if self.scores[1] > self.scores[2]:
                self.winner = 1
            elif self.scores[2] > self.scores[1]:
                self.winner = 2
            else:
                # Tiebreak: most islands
                p1_islands = sum(1 for v in self.island_control.values() if v == 1)
                p2_islands = sum(1 for v in self.island_control.values() if v == 2)
                if p1_islands > p2_islands:
                    self.winner = 1
                elif p2_islands > p1_islands:
                    self.winner = 2
                else:
                    self.winner = None

    def get_state(self):
        return {
            "islands": self.islands,
            "possible_bridges": [[a, b] for a, b in self.possible_bridges],
            "bridge_owner": self.bridge_owner,
            "island_control": self.island_control,
            "deck": self.deck,
            "hand_1": self.hands[1],
            "hand_2": self.hands[2],
            "discard": self.discard,
            "scores_1": self.scores[1],
            "scores_2": self.scores[2],
            "scoring_round": self.scoring_round,
            "log": self.log,
        }

    def load_state(self, state):
        self.islands = state["islands"]
        self.possible_bridges = [tuple(b) for b in state["possible_bridges"]]
        self.bridge_owner = state["bridge_owner"]
        self.island_control = state["island_control"]
        self.deck = state["deck"]
        self.hands = {1: state["hand_1"], 2: state["hand_2"]}
        self.discard = state["discard"]
        self.scores = {1: state["scores_1"], 2: state["scores_2"]}
        self.scoring_round = state["scoring_round"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  KAHUNA - Tutorial
==================================================

OVERVIEW:
  Kahuna is an island bridge-building game. Players compete to control
  islands by building bridges between them using cards.

GAMEPLAY:
  On your turn, you may:
  1. Play a card matching an island to build a bridge from that island
  2. Play 2 cards to remove one of your opponent's bridges
  3. End your turn and draw a card

BRIDGE BUILDING:
  - Play a card matching an island name to build a bridge from it.
  - The bridge connects two adjacent islands.

ISLAND CONTROL:
  - If you have a MAJORITY of bridges around an island (more than half),
    you claim that island!
  - When you claim an island, ALL opponent bridges connected to it
    are removed. This can cascade and cause them to lose other islands.

SCORING:
  The game has 3 scoring rounds (each time the deck runs out):
  - Round 1: Player with more islands gets 1 point
  - Round 2: Difference in islands controlled
  - Round 3: Difference in islands controlled
  Highest total score wins!

STRATEGY:
  - Build bridges strategically to claim key islands.
  - Removing opponent bridges at the right time can cascade!
  - Save cards for critical moments.
"""
