"""Claim - Trick-taking card game with faction majorities (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Factions and their special rules
FACTIONS_FULL = ["Goblins", "Knights", "Undead", "Doppelgangers", "Dragons"]
FACTIONS_QUICK = ["Goblins", "Knights", "Dragons"]

FACTION_RULES = {
    "Goblins": "Lowest rank wins the trick (instead of highest)",
    "Knights": "Standard: highest rank wins",
    "Undead": "Losing Undead cards go to the loser's score pile too",
    "Doppelgangers": "Copy the faction of the lead card",
    "Dragons": "Always win against non-Dragon cards",
}

FACTION_SYMBOLS = {
    "Goblins": "G",
    "Knights": "K",
    "Undead": "U",
    "Doppelgangers": "D",
    "Dragons": "R",
}


def build_deck(factions):
    """Build a deck with cards for each faction."""
    deck = []
    cards_per_faction = 10 if len(factions) == 5 else 14
    card_id = 0
    for faction in factions:
        for rank in range(cards_per_faction):
            deck.append({
                "id": card_id,
                "faction": faction,
                "rank": rank,
                "display": f"{FACTION_SYMBOLS[faction]}{rank}",
            })
            card_id += 1
    return deck


class ClaimGame(BaseGame):
    """Claim - Win tricks to claim faction majorities."""

    name = "Claim"
    description = "Trick-taking card game with faction majorities"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (5 factions, 50 cards)",
        "quick": "Quick game (3 factions, 42 cards)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.factions = FACTIONS_FULL if self.variation != "quick" else FACTIONS_QUICK
        self.hands = {1: [], 2: []}
        self.followers = {1: [], 2: []}  # Won cards from phase 1 (used as hand in phase 2)
        self.score_piles = {1: [], 2: []}  # Won cards from phase 2 (used for scoring)
        self.trick_cards = {1: None, 2: None}
        self.face_down_card = None
        self.face_up_card = None
        self.deck = []
        self.phase = 1  # 1 = claim followers, 2 = play followers
        self.trick_phase = "lead"  # lead, follow, resolve
        self.lead_player = 1
        self.log = []
        self.tricks_played = 0

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        self.factions = FACTIONS_FULL if self.variation != "quick" else FACTIONS_QUICK
        self.deck = build_deck(self.factions)
        random.shuffle(self.deck)

        # Deal 13 cards to each player
        hand_size = 13
        self.hands = {
            1: sorted(self.deck[:hand_size], key=lambda c: (c["faction"], c["rank"])),
            2: sorted(self.deck[hand_size:hand_size * 2], key=lambda c: (c["faction"], c["rank"])),
        }
        self.deck = self.deck[hand_size * 2:]

        self.followers = {1: [], 2: []}
        self.score_piles = {1: [], 2: []}
        self.trick_cards = {1: None, 2: None}
        self.face_down_card = None
        self.face_up_card = None
        self.phase = 1
        self.trick_phase = "lead"
        self.lead_player = 1
        self.current_player = 1
        self.log = []
        self.tricks_played = 0
        self.game_over = False
        self.winner = None

        # Reveal first trick stakes
        self._reveal_stakes()

    def _reveal_stakes(self):
        """Reveal the stakes for the current trick (Phase 1 only)."""
        if self.phase == 1 and len(self.deck) >= 2:
            self.face_down_card = self.deck.pop()
            self.face_up_card = self.deck.pop()
        else:
            self.face_down_card = None
            self.face_up_card = None

    def display(self):
        clear_screen()
        print("=" * 60)
        print("               C L A I M")
        print("=" * 60)
        print(f"  Phase {self.phase} of 2 | Factions: {', '.join(self.factions)}")
        print()

        if self.phase == 1 and self.face_up_card:
            print(f"  --- Trick Stakes ---")
            print(f"  Face Up:   {self._card_str(self.face_up_card)}")
            print(f"  Face Down: [???]")
            print()

        # Trick area
        if self.trick_cards[1] or self.trick_cards[2]:
            print(f"  --- Current Trick ---")
            for p in (1, 2):
                if self.trick_cards[p]:
                    print(f"  {self.players[p-1]}: {self._card_str(self.trick_cards[p])}")
                else:
                    print(f"  {self.players[p-1]}: ---")
            print()

        # Player info
        for p in (1, 2):
            marker = " <<" if self.current_player == p else ""
            hand = self.hands[p] if self.phase == 1 else self.followers[p]
            phase_label = "Hand" if self.phase == 1 else "Followers"
            print(f"  {self.players[p-1]}{marker}")
            print(f"    {phase_label} ({len(hand)}): ", end="")
            if hand:
                cards_str = ", ".join(self._card_str(c) for c in hand)
                print(cards_str)
            else:
                print("(empty)")

            if self.phase == 1:
                print(f"    Followers won: {len(self.followers[p])}")
            else:
                print(f"    Score pile: {len(self.score_piles[p])}")
            print()

        # Faction rules reminder
        print("  --- Faction Rules ---")
        for f in self.factions:
            print(f"  {FACTION_SYMBOLS[f]} = {f}: {FACTION_RULES[f]}")
        print()

        if self.log:
            print("  --- Log ---")
            for msg in self.log[-5:]:
                print(f"  {msg}")
        print()

    def _card_str(self, card):
        return f"{card['faction']}({card['rank']})"

    def _get_hand(self, player):
        if self.phase == 1:
            return self.hands[player]
        else:
            return self.followers[player]

    def _set_hand(self, player, hand):
        if self.phase == 1:
            self.hands[player] = hand
        else:
            self.followers[player] = hand

    def get_move(self):
        hand = self._get_hand(self.current_player)
        if not hand:
            return ("auto", "")

        if self.trick_phase == "lead":
            print(f"  {self.players[self.current_player - 1]}, play a card to lead the trick.")
        else:
            lead_card = self.trick_cards[self.lead_player]
            lead_faction = lead_card["faction"]
            if lead_faction == "Doppelgangers":
                print(f"  Lead: Doppelganger - play any card.")
            else:
                matching = [c for c in hand if c["faction"] == lead_faction]
                if matching:
                    print(f"  You must follow suit ({lead_faction}) if possible.")
                else:
                    print(f"  No {lead_faction} cards - play any card.")

        print(f"  Cards: ", end="")
        for i, c in enumerate(hand):
            print(f"  {i+1}:{self._card_str(c)}", end="")
        print()
        return ("play", input_with_quit(f"  Choose card (1-{len(hand)}): "))

    def make_move(self, move):
        action, value = move

        if action == "auto":
            return True

        if action == "play":
            hand = self._get_hand(self.current_player)
            try:
                idx = int(value.strip()) - 1
                if idx < 0 or idx >= len(hand):
                    return False
            except ValueError:
                return False

            card = hand[idx]

            # Check suit following rule
            if self.trick_phase == "follow":
                lead_card = self.trick_cards[self.lead_player]
                lead_faction = lead_card["faction"]
                # Doppelgangers copy lead suit - no restriction
                if lead_faction != "Doppelgangers":
                    matching = [c for c in hand if c["faction"] == lead_faction]
                    if matching and card["faction"] != lead_faction:
                        print(f"  You must follow suit ({lead_faction})!")
                        return False

            self.trick_cards[self.current_player] = card
            hand.remove(card)
            self._set_hand(self.current_player, hand)
            self._add_log(f"{self.players[self.current_player - 1]} plays {self._card_str(card)}")

            if self.trick_phase == "lead":
                self.trick_phase = "follow"
                follower = 2 if self.current_player == 1 else 1
                self.current_player = follower
            else:
                # Resolve trick
                self._resolve_trick()
            return True

        return False

    def _resolve_trick(self):
        card1 = self.trick_cards[1]
        card2 = self.trick_cards[2]

        winner = self._determine_trick_winner(card1, card2)

        loser = 2 if winner == 1 else 1

        if self.phase == 1:
            # Winner gets face-up card, loser gets face-down card
            if self.face_up_card:
                self.followers[winner].append(self.face_up_card)
                self.followers[loser].append(self.face_down_card)
                self._add_log(f"{self.players[winner - 1]} wins trick! Gets {self._card_str(self.face_up_card)}.")
            else:
                self._add_log(f"{self.players[winner - 1]} wins the trick!")

            # Undead special: losing undead cards go to loser's followers too
            if card1["faction"] == "Undead" and winner == 2:
                self.followers[1].append(card1)
            elif card2["faction"] == "Undead" and winner == 1:
                self.followers[2].append(card2)
        else:
            # Phase 2: won cards go to score pile
            self.score_piles[winner].append(card1)
            self.score_piles[winner].append(card2)
            self._add_log(f"{self.players[winner - 1]} wins the trick!")

            # Undead: losing undead go to loser
            if card1["faction"] == "Undead" and winner == 2:
                self.score_piles[1].append(card1)
            elif card2["faction"] == "Undead" and winner == 1:
                self.score_piles[2].append(card2)

        self.trick_cards = {1: None, 2: None}
        self.tricks_played += 1
        self.lead_player = winner
        self.current_player = winner
        self.trick_phase = "lead"

        # Check if phase 1 hands are empty -> move to phase 2
        if self.phase == 1 and not self.hands[1] and not self.hands[2]:
            self.phase = 2
            self.tricks_played = 0
            # Sort followers as new hands
            self.followers[1].sort(key=lambda c: (c["faction"], c["rank"]))
            self.followers[2].sort(key=lambda c: (c["faction"], c["rank"]))
            self._add_log("=== PHASE 2 BEGINS ===")
            self._add_log("Play your won followers to claim faction majorities!")
        elif self.phase == 1:
            self._reveal_stakes()

    def _determine_trick_winner(self, card1, card2):
        """Determine who wins the trick based on faction rules."""
        f1 = card1["faction"]
        f2 = card2["faction"]

        effective_f1 = f1
        effective_f2 = f2

        # Doppelgangers copy the other card's faction for comparison
        if f1 == "Doppelgangers" and f2 != "Doppelgangers":
            effective_f1 = f2
        if f2 == "Doppelgangers" and f1 != "Doppelgangers":
            effective_f2 = f1

        # Dragons beat non-dragons
        if effective_f1 == "Dragons" and effective_f2 != "Dragons":
            return 1
        if effective_f2 == "Dragons" and effective_f1 != "Dragons":
            return 2

        # Same effective faction
        if effective_f1 == effective_f2:
            # Goblins: lowest wins
            if effective_f1 == "Goblins":
                return 1 if card1["rank"] < card2["rank"] else 2
            # All others: highest wins
            return 1 if card1["rank"] >= card2["rank"] else 2

        # Different factions, lead player wins (follow suit rule - leader advantage)
        return self.lead_player

    def check_game_over(self):
        if self.phase == 2 and not self.followers[1] and not self.followers[2]:
            # Count faction majorities
            faction_counts = {1: {}, 2: {}}
            for p in (1, 2):
                for card in self.score_piles[p]:
                    f = card["faction"]
                    faction_counts[p][f] = faction_counts[p].get(f, 0) + 1

            wins = {1: 0, 2: 0}
            self._add_log("=== FACTION RESULTS ===")
            for faction in self.factions:
                c1 = faction_counts[1].get(faction, 0)
                c2 = faction_counts[2].get(faction, 0)
                if c1 > c2:
                    wins[1] += 1
                    self._add_log(f"  {faction}: {self.players[0]} ({c1} vs {c2})")
                elif c2 > c1:
                    wins[2] += 1
                    self._add_log(f"  {faction}: {self.players[1]} ({c2} vs {c1})")
                else:
                    self._add_log(f"  {faction}: TIE ({c1} vs {c2})")

            self.game_over = True
            if wins[1] > wins[2]:
                self.winner = 1
            elif wins[2] > wins[1]:
                self.winner = 2
            else:
                # Tiebreak: most total cards
                if len(self.score_piles[1]) >= len(self.score_piles[2]):
                    self.winner = 1
                else:
                    self.winner = 2

    def get_state(self):
        return {
            "factions": self.factions,
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "followers": {"1": self.followers[1], "2": self.followers[2]},
            "score_piles": {"1": self.score_piles[1], "2": self.score_piles[2]},
            "trick_cards": {"1": self.trick_cards[1], "2": self.trick_cards[2]},
            "face_down_card": self.face_down_card,
            "face_up_card": self.face_up_card,
            "deck": self.deck,
            "phase": self.phase,
            "trick_phase": self.trick_phase,
            "lead_player": self.lead_player,
            "log": self.log,
            "tricks_played": self.tricks_played,
        }

    def load_state(self, state):
        self.factions = state["factions"]
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.followers = {1: state["followers"]["1"], 2: state["followers"]["2"]}
        self.score_piles = {1: state["score_piles"]["1"], 2: state["score_piles"]["2"]}
        self.trick_cards = {1: state["trick_cards"]["1"], 2: state["trick_cards"]["2"]}
        self.face_down_card = state["face_down_card"]
        self.face_up_card = state["face_up_card"]
        self.deck = state["deck"]
        self.phase = state["phase"]
        self.trick_phase = state["trick_phase"]
        self.lead_player = state["lead_player"]
        self.log = state["log"]
        self.tricks_played = state["tricks_played"]
        self._resumed = True

    def get_tutorial(self):
        return """
=== CLAIM TUTORIAL ===

Claim is a 2-player trick-taking card game played in two phases.

PHASE 1 - CLAIM FOLLOWERS:
  - Each trick, two stake cards are revealed (one face-up, one face-down)
  - Play cards from your hand to win tricks
  - Winner gets the face-up stake card; loser gets the face-down card
  - Won cards become your "followers" for Phase 2

PHASE 2 - CLAIM FACTIONS:
  - Play your won followers in tricks
  - Won cards go to your score pile
  - At the end, count cards per faction

TRICK RULES:
  - Lead player plays any card
  - Following player must follow suit if possible
  - If you can't follow suit, play any card

FACTION SPECIAL POWERS:
  Goblins (G)      - LOWEST rank wins (reversed!)
  Knights (K)       - Standard: highest rank wins
  Undead (U)        - Losing Undead cards go to the loser's pile too
  Doppelgangers (D) - Copy the faction of the lead card
  Dragons (R)       - Always beat non-Dragon cards

WINNING:
  The player who claims the majority in the most factions wins!
  Tie: player with the most total cards wins.

STRATEGY:
  - In Phase 1, winning isn't always best (face-down card might be bad)
  - Use Goblins strategically (low cards win)
  - Doppelgangers are flexible - they match any lead faction
  - Save strong cards for Phase 2 faction battles
"""
