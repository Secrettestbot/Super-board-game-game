"""Sail - Cooperative trick-taking navigation game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class SailGame(BaseGame):
    """Cooperative trick-taking where players navigate a ship through ocean dangers."""

    name = "Sail"
    description = "Cooperative trick-taking with ocean navigation"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard voyage (6 challenges)",
        "easy": "Calm seas (4 challenges)",
        "storm": "Storm voyage (6 challenges, harder hazards)",
    }

    SUITS = ["Anchor", "Compass", "Star"]
    SUIT_SYMBOLS = ["A", "C", "S"]

    HAZARD_TYPES = [
        {"name": "Reef", "symbol": "~", "desc": "Avoid: winner must play Anchor suit"},
        {"name": "Storm", "symbol": "*", "desc": "Avoid: winner must play highest card"},
        {"name": "Kraken", "symbol": "K", "desc": "Avoid: loser must play card < 4"},
        {"name": "Whirlpool", "symbol": "@", "desc": "Avoid: total of trick must be odd"},
        {"name": "Fog", "symbol": "?", "desc": "Avoid: players must play different suits"},
        {"name": "Pirates", "symbol": "!", "desc": "Avoid: winner must play card >= 5"},
    ]

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_challenges = 6
        self.challenges = []
        self.current_challenge = 0
        self.player_hands = {1: [], 2: []}
        self.tricks_played = 0
        self.tricks_per_challenge = 3
        self.lead_player = 1
        self.phase = "play_lead"  # play_lead, play_follow, resolve, challenge_end, voyage_end
        self.lead_card = None
        self.follow_card = None
        self.ship_hp = 6
        self.max_ship_hp = 6
        self.hazards_avoided = 0
        self.log = []
        self.challenge_damage = 0

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        if self.variation == "easy":
            self.num_challenges = 4
            self.ship_hp = 8
            self.max_ship_hp = 8
        elif self.variation == "storm":
            self.num_challenges = 6
            self.ship_hp = 5
            self.max_ship_hp = 5
        else:
            self.num_challenges = 6
            self.ship_hp = 6
            self.max_ship_hp = 6

        # Build challenges
        hazards = list(self.HAZARD_TYPES)
        random.shuffle(hazards)
        self.challenges = []
        for i in range(self.num_challenges):
            h = hazards[i % len(hazards)]
            self.challenges.append(dict(h))

        self.current_challenge = 0
        self.tricks_played = 0
        self.lead_player = 1
        self.phase = "play_lead"
        self.lead_card = None
        self.follow_card = None
        self.hazards_avoided = 0
        self.log = []
        self.challenge_damage = 0
        self.game_over = False
        self.winner = None
        self._deal_hands()
        self._add_log(f"Voyage begins! {self.num_challenges} challenges ahead.")
        self._add_log(f"Challenge 1: {self.challenges[0]['name']} - {self.challenges[0]['desc']}")

    def _deal_hands(self):
        """Deal cards to both players for a challenge."""
        deck = []
        for suit_idx in range(3):
            for val in range(1, 8):
                deck.append({"suit": suit_idx, "value": val})
        random.shuffle(deck)
        hand_size = self.tricks_per_challenge + 2
        self.player_hands[1] = deck[:hand_size]
        self.player_hands[2] = deck[hand_size:hand_size * 2]

    def _card_str(self, card):
        return f"{self.SUIT_SYMBOLS[card['suit']]}{card['value']}"

    def _card_display(self, card):
        return f"{self.SUITS[card['suit']]} {card['value']}"

    def display(self):
        clear_screen()
        ch = self.challenges[self.current_challenge] if self.current_challenge < len(self.challenges) else None
        print(f"{'=' * 58}")
        print(f"  SAIL  |  Challenge {self.current_challenge + 1}/{self.num_challenges}  |  Trick {self.tricks_played + 1}/{self.tricks_per_challenge}")
        print(f"{'=' * 58}")

        # Ship status
        hp_bar = "#" * self.ship_hp + "." * (self.max_ship_hp - self.ship_hp)
        print(f"  Ship: [{hp_bar}] {self.ship_hp}/{self.max_ship_hp}  |  Hazards avoided: {self.hazards_avoided}")

        # Voyage map
        print(f"\n  VOYAGE MAP:")
        map_line = "  "
        for i in range(self.num_challenges):
            if i < self.current_challenge:
                map_line += "[OK]--"
            elif i == self.current_challenge:
                ch_sym = ch["symbol"] if ch else "?"
                map_line += f"[{ch_sym} ]--"
            else:
                future_ch = self.challenges[i]
                map_line += f"[{future_ch['symbol']} ]--"
        map_line += "[HOME]"
        print(map_line)

        # Current hazard
        if ch:
            print(f"\n  HAZARD: {ch['name']} ({ch['symbol']})")
            print(f"  {ch['desc']}")

        # Trick area
        print(f"\n  TRICK TABLE:")
        if self.lead_card:
            leader_name = self.players[self.lead_player - 1]
            print(f"    Lead ({leader_name}): [{self._card_display(self.lead_card)}]")
        else:
            print(f"    Lead: (waiting...)")

        if self.follow_card:
            follower = 2 if self.lead_player == 1 else 1
            follower_name = self.players[follower - 1]
            print(f"    Follow ({follower_name}): [{self._card_display(self.follow_card)}]")

        # Player hands
        for p in (1, 2):
            print(f"\n  {self.players[p - 1]}'s hand:")
            hand = self.player_hands[p]
            if hand:
                cards = "  ".join(f"[{i + 1}]{self._card_str(c)}" for i, c in enumerate(hand))
                print(f"    {cards}")
            else:
                print(f"    (empty)")

        # Phase prompt
        if self.phase == "play_lead":
            print(f"\n  >> {self.players[self.lead_player - 1]} leads the trick!")
        elif self.phase == "play_follow":
            follower = 2 if self.lead_player == 1 else 1
            print(f"\n  >> {self.players[follower - 1]} follows!")

        # Log
        if self.log:
            print(f"\n  {'~' * 40}")
            for entry in self.log[-5:]:
                print(f"  {entry}")

    def get_move(self):
        if self.phase == "play_lead":
            self.current_player = self.lead_player
            return self._get_card_move(self.lead_player)
        elif self.phase == "play_follow":
            follower = 2 if self.lead_player == 1 else 1
            self.current_player = follower
            return self._get_card_move(follower)
        elif self.phase == "resolve":
            input_with_quit("\n  Press Enter to resolve trick...")
            return "resolve"
        elif self.phase == "challenge_end":
            input_with_quit("\n  Press Enter to continue voyage...")
            return "next_challenge"
        elif self.phase == "voyage_end":
            input_with_quit("\n  Press Enter to see results...")
            return "end"
        return None

    def _get_card_move(self, player):
        hand = self.player_hands[player]
        if not hand:
            return ["auto", player]
        while True:
            choice = input_with_quit(f"  Play card (1-{len(hand)}): ")
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(hand):
                    return ["play", player, idx]
            except ValueError:
                pass
            print(f"  Invalid. Enter 1-{len(hand)}.")

    def make_move(self, move):
        if isinstance(move, list) and move[0] == "play":
            _, player, idx = move
            card = self.player_hands[player].pop(idx)

            if self.phase == "play_lead":
                self.lead_card = card
                self._add_log(f"{self.players[player - 1]} leads with {self._card_display(card)}")
                self.phase = "play_follow"
            elif self.phase == "play_follow":
                self.follow_card = card
                self._add_log(f"{self.players[player - 1]} follows with {self._card_display(card)}")
                self.phase = "resolve"
            return True

        elif isinstance(move, list) and move[0] == "auto":
            if self.phase == "play_lead":
                self.lead_card = {"suit": 0, "value": 1}
                self.phase = "play_follow"
            elif self.phase == "play_follow":
                self.follow_card = {"suit": 0, "value": 1}
                self.phase = "resolve"
            return True

        elif move == "resolve":
            self._resolve_trick()
            return True

        elif move == "next_challenge":
            self._next_challenge()
            return True

        elif move == "end":
            return True

        return False

    def _resolve_trick(self):
        """Resolve the current trick and check hazard condition."""
        lead = self.lead_card
        follow = self.follow_card
        follower = 2 if self.lead_player == 1 else 1

        # Determine trick winner (higher value wins, lead suit advantage)
        if lead["suit"] == follow["suit"]:
            winner = self.lead_player if lead["value"] >= follow["value"] else follower
        else:
            winner = self.lead_player  # lead suit wins by default

        winner_card = lead if winner == self.lead_player else follow
        loser_card = follow if winner == self.lead_player else lead
        loser = follower if winner == self.lead_player else self.lead_player

        self._add_log(f"{self.players[winner - 1]} wins the trick!")

        # Check hazard condition
        ch = self.challenges[self.current_challenge]
        hazard_avoided = self._check_hazard(ch, winner, winner_card, loser, loser_card, lead, follow)

        if hazard_avoided:
            self.hazards_avoided += 1
            self._add_log(f"Hazard navigated! ({ch['name']} avoided)")
        else:
            self.challenge_damage += 1
            self._add_log(f"Hazard HIT! Ship takes damage! ({ch['name']})")

        self.tricks_played += 1
        self.lead_card = None
        self.follow_card = None
        self.lead_player = winner  # Winner leads next trick

        if self.tricks_played >= self.tricks_per_challenge:
            # End of challenge
            damage = max(0, self.challenge_damage)
            self.ship_hp -= damage
            if damage > 0:
                self._add_log(f"Challenge end: ship took {damage} damage total!")
            else:
                self._add_log(f"Challenge cleared perfectly!")

            if self.ship_hp <= 0:
                self.phase = "voyage_end"
                self._add_log("The ship has sunk!")
            elif self.current_challenge + 1 >= self.num_challenges:
                self.phase = "voyage_end"
                self._add_log("You've reached home port!")
            else:
                self.phase = "challenge_end"
        else:
            self.phase = "play_lead"

    def _check_hazard(self, hazard, winner, winner_card, loser, loser_card, lead, follow):
        """Check if the hazard condition was met (avoided)."""
        htype = hazard["name"]
        if htype == "Reef":
            return winner_card["suit"] == 0  # Anchor suit
        elif htype == "Storm":
            # Winner must play highest card (value >= 5)
            return winner_card["value"] >= 5
        elif htype == "Kraken":
            return loser_card["value"] < 4
        elif htype == "Whirlpool":
            return (lead["value"] + follow["value"]) % 2 == 1  # odd total
        elif htype == "Fog":
            return lead["suit"] != follow["suit"]  # different suits
        elif htype == "Pirates":
            return winner_card["value"] >= 5
        return False

    def _next_challenge(self):
        self.current_challenge += 1
        self.tricks_played = 0
        self.challenge_damage = 0
        self.lead_card = None
        self.follow_card = None
        self.phase = "play_lead"
        self._deal_hands()
        ch = self.challenges[self.current_challenge]
        self._add_log(f"Challenge {self.current_challenge + 1}: {ch['name']} - {ch['desc']}")

    def check_game_over(self):
        if self.phase == "voyage_end":
            self.game_over = True
            if self.ship_hp > 0 and self.current_challenge + 1 >= self.num_challenges:
                self.winner = 1  # Co-op win
                self._add_log("VICTORY! Safe harbor reached!")
            else:
                self.winner = None  # Both lose
                self._add_log("DEFEAT! The ship was lost at sea.")

    def switch_player(self):
        """Override: cooperative game manages turns internally."""
        pass

    def get_state(self):
        return {
            "num_challenges": self.num_challenges,
            "challenges": self.challenges,
            "current_challenge": self.current_challenge,
            "player_hands": {str(k): [dict(c) for c in v] for k, v in self.player_hands.items()},
            "tricks_played": self.tricks_played,
            "tricks_per_challenge": self.tricks_per_challenge,
            "lead_player": self.lead_player,
            "phase": self.phase,
            "lead_card": self.lead_card,
            "follow_card": self.follow_card,
            "ship_hp": self.ship_hp,
            "max_ship_hp": self.max_ship_hp,
            "hazards_avoided": self.hazards_avoided,
            "log": self.log,
            "challenge_damage": self.challenge_damage,
        }

    def load_state(self, state):
        self.num_challenges = state["num_challenges"]
        self.challenges = state["challenges"]
        self.current_challenge = state["current_challenge"]
        self.player_hands = {int(k): v for k, v in state["player_hands"].items()}
        self.tricks_played = state["tricks_played"]
        self.tricks_per_challenge = state["tricks_per_challenge"]
        self.lead_player = state["lead_player"]
        self.phase = state["phase"]
        self.lead_card = state["lead_card"]
        self.follow_card = state["follow_card"]
        self.ship_hp = state["ship_hp"]
        self.max_ship_hp = state["max_ship_hp"]
        self.hazards_avoided = state["hazards_avoided"]
        self.log = state["log"]
        self.challenge_damage = state["challenge_damage"]

    def get_tutorial(self):
        return """
========================================
  SAIL - Tutorial
========================================

OVERVIEW:
  A cooperative trick-taking game! Work together to sail
  your ship through ocean dangers and reach home port.

TRICK-TAKING:
  One player leads a card, the other follows. Higher value
  in the lead suit wins the trick. The winner leads next.

  BUT - the goal isn't just winning tricks! Each challenge
  has a hazard condition. You must coordinate WHO wins each
  trick and WHAT cards are played to avoid hazards.

HAZARDS:
  Reef     - Winner must play Anchor suit
  Storm    - Winner must play card >= 5
  Kraken   - Loser must play card < 4
  Whirlpool - Total of both cards must be odd
  Fog      - Players must play different suits
  Pirates  - Winner must play card >= 5

CARDS:
  3 suits (Anchor/Compass/Star), values 1-7
  Lead suit wins ties. Different suit = lead wins.

CHALLENGES:
  Each challenge = 3 tricks. Failed hazard checks damage
  the ship. If HP reaches 0, you lose! Pass all challenges
  to win.

STRATEGY:
  - Communicate through your card plays
  - Sometimes losing a trick on purpose is the right move
  - Plan which cards to save for critical hazards

COMMANDS:
  Type 'quit' to quit, 'save' to save, 'help' for help.
========================================
"""
