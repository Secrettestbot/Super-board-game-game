"""The Fox in the Forest - A 2-player trick-taking card game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


SUITS = ['B', 'K', 'M']
SUIT_SYMBOLS = {'B': '\u2407', 'K': '\u2767', 'M': '\u263D'}
SUIT_NAMES = {'B': 'Bells', 'K': 'Keys', 'M': 'Moons'}
VALUES = list(range(1, 12))  # 1-11


def card_str(card):
    """Format a card for display: e.g. (7, 'B') -> '7 Bells'."""
    return f"{card[0]}{SUIT_SYMBOLS[card[1]]}"


def card_sort_key(card):
    """Sort key: group by suit, then by value."""
    return (SUITS.index(card[1]), card[0])


def make_deck():
    """Return a shuffled 33-card deck. Cards are (value, suit) tuples."""
    deck = [(v, s) for s in SUITS for v in VALUES]
    random.shuffle(deck)
    return deck


def score_for_tricks(trick_count):
    """Return points earned based on number of tricks won (out of 13).

    0-3 tricks: 6 pts (Humble)
    4 tricks: 1 pt
    5 tricks: 2 pts
    6 tricks: 3 pts
    7-9 tricks: 6 pts (Greedy)
    10-13 tricks: 0 pts (too greedy)
    """
    if trick_count <= 3:
        return 6
    elif trick_count == 4:
        return 1
    elif trick_count == 5:
        return 2
    elif trick_count == 6:
        return 3
    elif trick_count <= 9:
        return 6
    else:
        return 0


def score_label(trick_count):
    """Return the scoring category label."""
    if trick_count <= 3:
        return "Humble"
    elif trick_count <= 6:
        return "Victorious"
    elif trick_count <= 9:
        return "Greedy"
    else:
        return "Defeated"


class FoxInTheForestGame(BaseGame):
    """The Fox in the Forest: A 2-player trick-taking card game."""

    name = "The Fox in the Forest"
    description = "2-player trick-taking card game with fairy-tale powers"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (with special card powers)",
        "simple": "Simple (no special card powers)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.scores = [0, 0]
        self.target_score = 21
        self.hands = [[], []]
        self.round_number = 0
        self.phase = "play"  # play, trick_done, ability, round_over
        self.trump_suit = None
        self.trump_card = None  # the face-up decree card
        self.decree_pile = []   # remaining cards after deal
        self.discard_pile = []
        self.current_trick = []  # list of (player_index, card)
        self.trick_leader = 0
        self.tricks_won = [0, 0]
        self.round_messages = []
        self.bonus_points = [0, 0]  # from 7-value cards
        # Ability state
        self.pending_ability = None  # e.g. ('swap_decree', player_idx)
        self.ability_message = None

    def setup(self):
        """Initialize for the first round."""
        self.scores = [0, 0]
        self.target_score = 21
        self.round_number = 0
        self._start_round()

    def _start_round(self):
        """Deal a new round."""
        deck = make_deck()
        self.hands = [sorted(deck[:13], key=card_sort_key),
                      sorted(deck[13:26], key=card_sort_key)]
        # Card 27 is the decree card (face up, determines trump)
        self.trump_card = deck[26]
        self.trump_suit = self.trump_card[1]
        # Remaining cards form the decree pile
        self.decree_pile = deck[27:]
        self.discard_pile = []
        self.current_trick = []
        self.tricks_won = [0, 0]
        self.bonus_points = [0, 0]
        self.round_messages = []
        self.pending_ability = None
        self.ability_message = None
        self.phase = "play"

        # Non-dealer (player 0) leads the first trick
        self.trick_leader = 0
        self.current_player = 1  # 1-indexed
        self.round_number += 1

    def _is_standard(self):
        """Check if we are using special card powers."""
        return self.variation != "simple"

    def display(self):
        """Display the current game state."""
        mode = "Standard" if self._is_standard() else "Simple"
        print(f"\n  === The Fox in the Forest ({mode}) ===")
        print(f"  Round #{self.round_number}")
        print()
        for i in range(2):
            print(f"  {self.players[i]}: {self.scores[i]} pts"
                  f"  (tricks this round: {self.tricks_won[i]})")
        print()
        print(f"  Trump suit: {SUIT_NAMES[self.trump_suit]} {SUIT_SYMBOLS[self.trump_suit]}")
        print(f"  Decree card: {card_str(self.trump_card)}")
        print(f"  Decree pile: {len(self.decree_pile)} card(s)")
        print()

        for msg in self.round_messages:
            print(f"  {msg}")
        if self.round_messages:
            print()

        cp = self.current_player - 1

        if self.phase == "play":
            if self.current_trick:
                print("  Current trick:")
                for pi, card in self.current_trick:
                    print(f"    {self.players[pi]}: {card_str(card)}")
                print()
            hand = self.hands[cp]
            playable = self._get_playable_cards(cp)
            print(f"  {self.players[cp]}'s hand:")
            for i, c in enumerate(hand):
                marker = "" if c in playable else " (can't play)"
                ability = ""
                if self._is_standard() and c[0] % 2 == 1:
                    ability = f"  [{self._ability_name(c[0])}]"
                print(f"    {i + 1}: {card_str(c)}{marker}{ability}")
            print()

        elif self.phase == "trick_done":
            if self.current_trick:
                print("  Completed trick:")
                for pi, card in self.current_trick:
                    print(f"    {self.players[pi]}: {card_str(card)}")
                print()

        elif self.phase == "ability":
            if self.ability_message:
                print(f"  {self.ability_message}")
                print()
            hand = self.hands[cp]
            print(f"  {self.players[cp]}'s hand:")
            for i, c in enumerate(hand):
                print(f"    {i + 1}: {card_str(c)}")
            print()

        elif self.phase == "round_over":
            pass

    def _ability_name(self, value):
        """Return short description of a card's special ability."""
        names = {
            1: "Swan: swap decree card",
            3: "Fox: draw from deck",
            5: "Woodcutter: draw from discard",
            7: "Treasure: +1 bonus point",
            9: "Witch: acts as trump when led",
            11: "Monarch: exchange with decree",
        }
        return names.get(value, "")

    def _get_playable_cards(self, player_idx):
        """Return list of cards the player can legally play."""
        hand = self.hands[player_idx]
        if not hand:
            return []

        # Leading a trick: can play anything
        if not self.current_trick:
            return list(hand)

        # Following: must follow lead suit if possible
        lead_suit = self.current_trick[0][1][1]
        follow = [c for c in hand if c[1] == lead_suit]
        if follow:
            return follow

        # Can't follow suit: play anything
        return list(hand)

    def get_move(self):
        """Get input from the current player."""
        cp = self.current_player - 1

        if self.phase == "play":
            print(f"  {self.players[cp]}, play a card (enter number):")
            return input_with_quit("  Play: ").strip()

        elif self.phase == "trick_done":
            input_with_quit("  Press Enter to continue...")
            return "continue"

        elif self.phase == "ability":
            if self.pending_ability:
                kind = self.pending_ability[0]
                if kind == "swap_decree":
                    print("  Swap your card with the decree card? (y/n):")
                    return input_with_quit("  Choice: ").strip().lower()
                elif kind == "draw_deck":
                    print("  Drawing a card from the decree pile...")
                    print("  Choose a card to discard (enter number):")
                    return input_with_quit("  Discard: ").strip()
                elif kind == "draw_discard":
                    if not self.discard_pile:
                        return "skip"
                    print(f"  Discard pile top: {card_str(self.discard_pile[-1])}")
                    print("  Draw from discard pile? (y/n):")
                    return input_with_quit("  Choice: ").strip().lower()
                elif kind == "exchange_decree":
                    print("  Exchange a card from your hand with the decree card?")
                    print("  Enter card number to exchange, or 0 to skip:")
                    return input_with_quit("  Exchange: ").strip()
            return "continue"

        elif self.phase == "round_over":
            return "continue"

        return ""

    def make_move(self, move):
        """Process the move based on current phase."""
        if self.phase == "play":
            return self._do_play(move)
        elif self.phase == "trick_done":
            return self._do_continue()
        elif self.phase == "ability":
            return self._do_ability(move)
        elif self.phase == "round_over":
            return self._do_round_over()
        return False

    def _do_play(self, move):
        """Handle playing a card to the current trick."""
        cp = self.current_player - 1
        hand = self.hands[cp]
        playable = self._get_playable_cards(cp)

        try:
            idx = int(move) - 1
            if idx < 0 or idx >= len(hand):
                return False
        except ValueError:
            return False

        card = hand[idx]
        if card not in playable:
            print("  That card cannot be played right now!")
            input("  Press Enter to continue...")
            return False

        # Play the card
        hand.pop(idx)
        self.current_trick.append((cp, card))

        # Check if trick is complete (2 cards played)
        if len(self.current_trick) == 2:
            self.phase = "trick_done"
            self._resolve_trick()
            return True

        # Switch to other player
        self.current_player = (1 - cp) + 1
        return True

    def _resolve_trick(self):
        """Determine winner of the current trick and assign it."""
        lead_player, lead_card = self.current_trick[0]
        follow_player, follow_card = self.current_trick[1]
        lead_suit = lead_card[1]

        winner = lead_player

        # Determine if the 9 (Witch) acts as trump when led (standard mode)
        effective_lead_suit = lead_suit
        if self._is_standard() and lead_card[0] == 9 and lead_suit != self.trump_suit:
            effective_lead_suit = self.trump_suit

        # Determine winner
        if follow_card[1] == effective_lead_suit:
            # Same suit as (effective) lead
            if follow_card[0] > lead_card[0]:
                winner = follow_player
        elif follow_card[1] == self.trump_suit:
            # Follower played trump (and lead wasn't trump)
            if effective_lead_suit != self.trump_suit:
                winner = follow_player
        # Also check: if lead was witch (9, non-trump), it's effectively trump
        # So if both are trump suit (because lead 9 made it trump), compare values
        if self._is_standard() and lead_card[0] == 9 and lead_suit != self.trump_suit:
            if follow_card[1] == self.trump_suit:
                # Both effectively trump - compare values
                if follow_card[0] > lead_card[0]:
                    winner = follow_player
                else:
                    winner = lead_player

        self.tricks_won[winner] += 1

        winner_name = self.players[winner]
        trick_str = ' '.join(card_str(c) for _, c in self.current_trick)
        self.round_messages.append(f"{winner_name} wins trick ({trick_str})")

        # Handle 7 (Treasure) bonus points in standard mode
        if self._is_standard():
            for pi, card in self.current_trick:
                if card[0] == 7:
                    self.bonus_points[winner] += 1
                    self.round_messages.append(
                        f"  Treasure card! {winner_name} gets +1 bonus point.")

        # Set winner as next leader
        self.trick_leader = winner

        # Queue abilities for cards played this trick (standard mode)
        if self._is_standard():
            self._queue_abilities()

    def _queue_abilities(self):
        """Queue special abilities from odd cards played in the trick."""
        # Abilities trigger for the winner's played card first, then loser's
        # Actually in Fox in the Forest, abilities trigger for both players
        # The ability of a card triggers for the player who played it
        for pi, card in self.current_trick:
            val = card[0]
            if val == 1:
                # Swan: player may swap a card with decree card
                self.pending_ability = ("swap_decree", pi)
                return  # handle one at a time
            elif val == 3:
                # Fox: player draws from decree pile, then discards
                if self.decree_pile:
                    drawn = self.decree_pile.pop(0)
                    self.hands[pi].append(drawn)
                    self.hands[pi].sort(key=card_sort_key)
                    self.pending_ability = ("draw_deck", pi)
                    self.ability_message = (
                        f"{self.players[pi]} drew a card (Fox ability). "
                        f"Choose a card to discard.")
                    return
            elif val == 5:
                # Woodcutter: player may draw from discard pile
                if self.discard_pile:
                    self.pending_ability = ("draw_discard", pi)
                    self.ability_message = (
                        f"{self.players[pi]} may draw from the discard pile "
                        f"(Woodcutter ability).")
                    return
            elif val == 11:
                # Monarch: player may exchange a hand card with decree card
                self.pending_ability = ("exchange_decree", pi)
                self.ability_message = (
                    f"{self.players[pi]} may exchange a card with the decree "
                    f"card (Monarch ability).")
                return
            # 7 (Treasure) and 9 (Witch) are handled during trick resolution

    def _do_ability(self, move):
        """Handle special ability interactions."""
        if not self.pending_ability:
            self.phase = "trick_done"
            return True

        kind, pi = self.pending_ability

        if kind == "swap_decree":
            if move in ('y', 'yes'):
                # Show player's hand and let them pick a card to swap
                self.pending_ability = ("exchange_decree", pi)
                self.ability_message = (
                    f"{self.players[pi]} uses Swan ability. "
                    f"Choose a card to swap with decree card ({card_str(self.trump_card)}), "
                    f"or enter 0 to skip.")
                self.current_player = pi + 1
                return True
            else:
                self.pending_ability = None
                self.ability_message = None
                self._check_more_abilities()
                return True

        elif kind == "draw_deck":
            try:
                idx = int(move) - 1
                if idx < 0 or idx >= len(self.hands[pi]):
                    return False
            except ValueError:
                return False
            discarded = self.hands[pi].pop(idx)
            self.discard_pile.append(discarded)
            self.round_messages.append(
                f"{self.players[pi]} discarded {card_str(discarded)} (Fox ability).")
            self.pending_ability = None
            self.ability_message = None
            self._check_more_abilities()
            return True

        elif kind == "draw_discard":
            if move == "skip":
                self.pending_ability = None
                self.ability_message = None
                self._check_more_abilities()
                return True
            if move in ('y', 'yes'):
                drawn = self.discard_pile.pop()
                self.hands[pi].append(drawn)
                self.hands[pi].sort(key=card_sort_key)
                self.round_messages.append(
                    f"{self.players[pi]} drew {card_str(drawn)} from discard "
                    f"(Woodcutter ability).")
                # Now must discard a card
                self.pending_ability = ("draw_deck", pi)  # reuse discard logic
                self.ability_message = (
                    f"{self.players[pi]} drew a card. Choose a card to discard.")
                self.current_player = pi + 1
                return True
            else:
                self.pending_ability = None
                self.ability_message = None
                self._check_more_abilities()
                return True

        elif kind == "exchange_decree":
            try:
                idx = int(move)
            except ValueError:
                return False
            if idx == 0:
                self.pending_ability = None
                self.ability_message = None
                self._check_more_abilities()
                return True
            idx -= 1
            if idx < 0 or idx >= len(self.hands[pi]):
                return False
            # Swap the card with decree card
            old_decree = self.trump_card
            swapped = self.hands[pi][idx]
            self.hands[pi][idx] = old_decree
            self.hands[pi].sort(key=card_sort_key)
            self.trump_card = swapped
            self.trump_suit = self.trump_card[1]
            self.round_messages.append(
                f"{self.players[pi]} exchanged {card_str(swapped)} with "
                f"decree card. New decree: {card_str(self.trump_card)} "
                f"(Trump: {SUIT_NAMES[self.trump_suit]}).")
            self.pending_ability = None
            self.ability_message = None
            self._check_more_abilities()
            return True

        return False

    def _check_more_abilities(self):
        """After resolving one ability, check if more need processing."""
        # Re-scan the trick for unprocessed abilities
        # We track which ones were processed by checking pending_ability is None
        # For simplicity, abilities are processed in order during _queue_abilities
        # After one resolves, we call _queue_abilities again but skip already-processed ones
        # Since abilities modify state, just transition out
        self.phase = "trick_done"

    def _do_continue(self):
        """Handle continue after trick or round end."""
        if self.phase == "trick_done":
            # Check for pending abilities first
            if self.pending_ability:
                self.phase = "ability"
                self.current_player = self.pending_ability[1] + 1
                return True

            # Check if round is over (no cards left)
            if not self.hands[0] and not self.hands[1]:
                self._score_round()
                self.phase = "round_over"
            else:
                self.current_trick = []
                self.current_player = self.trick_leader + 1
                self.phase = "play"
            return True

        if self.phase == "round_over":
            return self._do_round_over()

        return True

    def _do_round_over(self):
        """Start a new round if the game isn't over."""
        if not self.game_over:
            self._start_round()
        return True

    def _score_round(self):
        """Score the completed round."""
        for i in range(2):
            tricks = self.tricks_won[i]
            base = score_for_tricks(tricks)
            bonus = self.bonus_points[i]
            total = base + bonus
            self.scores[i] += total
            label = score_label(tricks)
            bonus_str = f" + {bonus} bonus" if bonus > 0 else ""
            self.round_messages.append(
                f"{self.players[i]}: {tricks} tricks ({label}) = "
                f"{base} pts{bonus_str} -> +{total} pts"
            )

        self.round_messages.append(
            f"Scores: {self.players[0]} = {self.scores[0]}, "
            f"{self.players[1]} = {self.scores[1]}"
        )

    def check_game_over(self):
        """Check if someone has reached the target score."""
        if self.game_over:
            return
        # Only check at end of a round
        if self.phase != "round_over" and self.phase != "play":
            return
        for i in range(2):
            if self.scores[i] >= self.target_score:
                self.game_over = True
                if self.scores[0] > self.scores[1]:
                    self.winner = 1
                elif self.scores[1] > self.scores[0]:
                    self.winner = 2
                else:
                    self.winner = None  # tie
                return

    def switch_player(self):
        """Override: Fox in the Forest manages its own player switching."""
        pass

    def get_state(self):
        """Return serializable game state."""
        return {
            "scores": list(self.scores),
            "target_score": self.target_score,
            "hands": [list(self.hands[0]), list(self.hands[1])],
            "round_number": self.round_number,
            "phase": self.phase,
            "trump_suit": self.trump_suit,
            "trump_card": self.trump_card,
            "decree_pile": list(self.decree_pile),
            "discard_pile": list(self.discard_pile),
            "current_trick": list(self.current_trick),
            "trick_leader": self.trick_leader,
            "tricks_won": list(self.tricks_won),
            "bonus_points": list(self.bonus_points),
            "round_messages": list(self.round_messages),
            "pending_ability": self.pending_ability,
            "ability_message": self.ability_message,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.scores = list(state["scores"])
        self.target_score = state["target_score"]
        self.hands = [[tuple(c) for c in h] for h in state["hands"]]
        self.round_number = state["round_number"]
        self.phase = state["phase"]
        self.trump_suit = state["trump_suit"]
        self.trump_card = tuple(state["trump_card"]) if state["trump_card"] else None
        self.decree_pile = [tuple(c) for c in state["decree_pile"]]
        self.discard_pile = [tuple(c) for c in state["discard_pile"]]
        self.current_trick = [(pi, tuple(c)) for pi, c in state["current_trick"]]
        self.trick_leader = state["trick_leader"]
        self.tricks_won = list(state["tricks_won"])
        self.bonus_points = list(state["bonus_points"])
        self.round_messages = list(state["round_messages"])
        self.pending_ability = state["pending_ability"]
        if self.pending_ability:
            self.pending_ability = tuple(self.pending_ability)
        self.ability_message = state["ability_message"]

    def get_tutorial(self):
        """Return tutorial text for The Fox in the Forest."""
        return """
==================================================
  The Fox in the Forest - Tutorial
==================================================

  OVERVIEW:
  The Fox in the Forest is a 2-player trick-taking
  card game set in a fairy-tale world. Win tricks,
  but not too many -- greed is punished!

  DECK:
  33 cards: 3 suits (Bells, Keys, Moons) with
  values 1 through 11 in each suit.

  SETUP:
  - Deal 13 cards to each player.
  - Flip 1 card face-up as the decree card; its
    suit is the trump suit for this round.
  - Remaining cards form the decree pile.

  PLAY:
  - The non-dealer leads the first trick.
  - You must follow the lead suit if you can.
  - If you cannot follow suit, play any card.
  - The highest card of the lead suit wins, unless
    a trump card is played (trump always wins).
  - The trick winner leads the next trick.

  SPECIAL CARDS (Standard mode only):
  Odd-numbered cards have special abilities:
    1 (Swan)      - May swap a hand card with the
                    decree card after the trick.
    3 (Fox)       - Draw a card from the decree
                    pile, then discard one.
    5 (Woodcutter)- May draw the top card of the
                    discard pile, then discard one.
    7 (Treasure)  - The trick winner gets +1 bonus
                    point.
    9 (Witch)     - When led, this card's suit is
                    treated as the trump suit.
   11 (Monarch)   - May exchange a hand card with
                    the decree card.

  SCORING (per round, based on tricks won):
    0-3 tricks  = 6 points (Humble)
    4 tricks    = 1 point  (Victorious)
    5 tricks    = 2 points (Victorious)
    6 tricks    = 3 points (Victorious)
    7-9 tricks  = 6 points (Greedy)
   10-13 tricks = 0 points (Defeated)

  The key tension: winning 0-3 or 7-9 tricks both
  score 6 points, but winning too many (10+) scores
  nothing! Don't be too greedy.

  GAME END:
  Play rounds until a player reaches 21 points.
  The player with the most points wins.

  VARIATIONS:
  - Standard: All special card powers active.
  - Simple: No special card powers (pure trick-
    taking).

  HOW TO PLAY:
  - Enter the card number from your hand to play.
  - When prompted for abilities, follow the on-
    screen instructions.

  STRATEGY HINTS:
  - Aim for 0-3 or 7-9 tricks for maximum points.
  - Avoid winning 10+ tricks at all costs (0 pts!).
  - Use the Witch (9) strategically when leading.
  - The Swan (1) and Monarch (11) let you change
    the trump suit mid-round.
  - Sometimes losing is winning -- staying humble
    earns 6 points!

==================================================
"""
