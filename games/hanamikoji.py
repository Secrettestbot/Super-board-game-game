"""Hanamikoji - A two-player card game about winning the favor of seven geishas."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Standard game: 7 geishas with charm values, item cards matching each geisha
GEISHAS_STANDARD = [
    {"name": "Violet", "charm": 2},
    {"name": "Indigo", "charm": 2},
    {"name": "Blue", "charm": 2},
    {"name": "Green", "charm": 3},
    {"name": "Yellow", "charm": 3},
    {"name": "Orange", "charm": 4},
    {"name": "Red", "charm": 5},
]

# Simple variant: 5 geishas with smaller charm values
GEISHAS_SIMPLE = [
    {"name": "Blue", "charm": 2},
    {"name": "Green", "charm": 2},
    {"name": "Yellow", "charm": 3},
    {"name": "Orange", "charm": 3},
    {"name": "Red", "charm": 4},
]

ACTION_NAMES = {
    "secret": "Secret",
    "trade_off": "Trade-Off",
    "gift": "Gift",
    "competition": "Competition",
}


class HanamikojiGame(BaseGame):
    """Hanamikoji - a two-player card game about winning the favor of seven geishas."""

    name = "Hanamikoji"
    description = "Win the favor of geishas with careful card play"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Hanamikoji",
        "simple": "Simple (5 geishas, smaller deck)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "simple":
            self.geishas = [dict(g) for g in GEISHAS_SIMPLE]
        else:
            self.geishas = [dict(g) for g in GEISHAS_STANDARD]
        self.num_geishas = len(self.geishas)
        # Favor markers: 0 = neutral, 1 = player 1, 2 = player 2
        self.favor = [0] * self.num_geishas
        # Cards placed on each geisha's side: {1: [...], 2: [...]} per geisha
        self.geisha_cards = [{1: 0, 2: 0} for _ in range(self.num_geishas)]
        self.deck = []
        self.hands = {1: [], 2: []}
        self.actions_remaining = {1: ["secret", "trade_off", "gift", "competition"],
                                  2: ["secret", "trade_off", "gift", "competition"]}
        self.secret_cards = {1: None, 2: None}
        self.trade_off_cards = {1: None, 2: None}
        self.round_number = 1
        self.log = []
        # Track whose turn within a round
        self._round_phase = "actions"  # "actions" or "resolve"
        self._pending_action = None  # for gift/competition opponent choice
        self._game_winner = None

    # ------------------------------------------------------------------ helpers
    def _build_deck(self):
        """Build deck: each geisha type gets cards equal to its charm value."""
        self.deck = []
        for i, g in enumerate(self.geishas):
            self.deck.extend([i] * g["charm"])
        random.shuffle(self.deck)

    def _deal(self):
        """Deal cards for a round: remove 1 face-down, deal 6 each (or 5 for simple)."""
        hand_size = 6 if self.variation != "simple" else 5
        # Remove 1 card face-down (unknown to both players)
        if self.deck:
            self.deck.pop()
        for p in (1, 2):
            self.hands[p] = []
            for _ in range(hand_size):
                if self.deck:
                    self.hands[p].append(self.deck.pop())

    def _geisha_name(self, idx):
        return f"{self.geishas[idx]['name']}({self.geishas[idx]['charm']})"

    def _card_name(self, card_idx):
        return self._geisha_name(card_idx)

    def _hand_summary(self, hand):
        """Return a readable summary of a hand of cards."""
        if not hand:
            return "(empty)"
        names = [self._card_name(c) for c in sorted(hand)]
        return ", ".join(names)

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 10:
            self.log = self.log[-10:]

    def _place_card(self, geisha_idx, player):
        """Place one item card on a geisha for a player."""
        self.geisha_cards[geisha_idx][player] += 1

    def _resolve_favors(self):
        """At end of round, resolve favor for each geisha based on card majorities."""
        for i in range(self.num_geishas):
            p1 = self.geisha_cards[i][1]
            p2 = self.geisha_cards[i][2]
            if p1 > p2:
                self.favor[i] = 1
            elif p2 > p1:
                self.favor[i] = 2
            # Tie: favor stays with current holder (or neutral)

    def _check_win(self):
        """Check win conditions: 11+ charm or 4+ geishas.
        Returns winner (1 or 2) or None."""
        charm_threshold = 11 if self.variation != "simple" else 8
        geisha_threshold = 4 if self.variation != "simple" else 3

        charm = {1: 0, 2: 0}
        count = {1: 0, 2: 0}
        for i in range(self.num_geishas):
            if self.favor[i] in (1, 2):
                charm[self.favor[i]] += self.geishas[i]["charm"]
                count[self.favor[i]] += 1

        for p in (1, 2):
            if charm[p] >= charm_threshold or count[p] >= geisha_threshold:
                return p
        return None

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    def _start_new_round(self):
        """Set up a new round: rebuild deck, deal, reset round state."""
        self._build_deck()
        self._deal()
        self.actions_remaining = {1: ["secret", "trade_off", "gift", "competition"],
                                  2: ["secret", "trade_off", "gift", "competition"]}
        self.secret_cards = {1: None, 2: None}
        self.trade_off_cards = {1: None, 2: None}
        # Reset geisha card counts for this round
        self.geisha_cards = [{1: 0, 2: 0} for _ in range(self.num_geishas)]
        self._round_phase = "actions"
        self._pending_action = None
        self._add_log(f"--- Round {self.round_number} begins ---")

    def _resolve_round_end(self):
        """Reveal secret cards and resolve favors."""
        for p in (1, 2):
            if self.secret_cards[p] is not None:
                card = self.secret_cards[p]
                self._place_card(card, p)
                self._add_log(f"{self.players[p - 1]}'s secret card: {self._card_name(card)}")
        self._resolve_favors()

    def _both_done(self):
        """Check if both players have used all 4 actions."""
        return (len(self.actions_remaining[1]) == 0 and
                len(self.actions_remaining[2]) == 0)

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.favor = [0] * self.num_geishas
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.round_number = 1
        self.log = []
        self.current_player = 1
        self._start_new_round()

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 58}")
        print(f"  HANAMIKOJI  (Round {self.round_number}, Turn {self.turn_number + 1})")
        print(f"{'=' * 58}")

        # Geisha favor display
        print(f"\n  Geishas:")
        for i, g in enumerate(self.geishas):
            favor_str = "---"
            if self.favor[i] == 1:
                favor_str = f"<{self.players[0][:8]}>"
            elif self.favor[i] == 2:
                favor_str = f"<{self.players[1][:8]}>"
            cards_str = f"[P1:{self.geisha_cards[i][1]} | P2:{self.geisha_cards[i][2]}]"
            print(f"    {i + 1}. {g['name']:8s} (charm {g['charm']})  "
                  f"Favor: {favor_str:14s}  Cards: {cards_str}")

        # Score summary
        charm = {1: 0, 2: 0}
        count = {1: 0, 2: 0}
        for i in range(self.num_geishas):
            if self.favor[i] in (1, 2):
                charm[self.favor[i]] += self.geishas[i]["charm"]
                count[self.favor[i]] += 1
        print(f"\n  Score: {self.players[0]} - {count[1]} geishas, {charm[1]} charm"
              f"  |  {self.players[1]} - {count[2]} geishas, {charm[2]} charm")

        # Opponent info
        print(f"\n  {self.players[opp - 1]}: {len(self.hands[opp])} cards in hand")
        opp_actions = ", ".join(ACTION_NAMES[a] for a in self.actions_remaining[opp])
        print(f"    Actions left: {opp_actions if opp_actions else '(none)'}")

        # Current player info
        print(f"\n  {self.players[cp - 1]} (you): {self._hand_summary(self.hands[cp])}")
        my_actions = ", ".join(ACTION_NAMES[a] for a in self.actions_remaining[cp])
        print(f"    Actions left: {my_actions if my_actions else '(none)'}")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-6:]:
                print(f"  {line}")

        print()

    # -------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        # If there is a pending action (opponent must respond to gift/competition)
        if self._pending_action:
            return self._get_response_move()

        if not self.actions_remaining[cp]:
            # This player is done; should not happen as we handle round end
            return None

        available = self.actions_remaining[cp]
        print(f"  Available actions: {', '.join(available)}")
        print(f"  (secret, trade_off, gift, competition)")

        while True:
            move = input_with_quit("  Choose action: ").strip().lower().replace("-", "_").replace(" ", "_")
            if move not in available:
                print(f"  Invalid. Choose from: {', '.join(available)}")
                continue
            # Validate hand size requirements
            hand_size = len(self.hands[cp])
            if move == "secret" and hand_size < 1:
                print("  Not enough cards for Secret.")
                continue
            if move == "trade_off" and hand_size < 2:
                print("  Not enough cards for Trade-Off.")
                continue
            if move == "gift" and hand_size < 3:
                print("  Not enough cards for Gift.")
                continue
            if move == "competition" and hand_size < 4:
                print("  Not enough cards for Competition.")
                continue
            return self._get_action_details(move)

    def _get_action_details(self, action):
        """Get the specific cards for an action from the current player."""
        cp = self.current_player
        hand = self.hands[cp]

        if action == "secret":
            return self._choose_secret(hand)
        elif action == "trade_off":
            return self._choose_trade_off(hand)
        elif action == "gift":
            return self._choose_gift(hand)
        elif action == "competition":
            return self._choose_competition(hand)

    def _show_hand_choices(self, hand):
        """Display numbered hand for selection."""
        for i, c in enumerate(hand, 1):
            print(f"    {i}. {self._card_name(c)}")

    def _pick_cards(self, hand, count, prompt):
        """Let player pick 'count' cards from hand. Returns list of card values."""
        selected = []
        remaining = list(hand)
        for n in range(count):
            print(f"  {prompt} ({n + 1}/{count}):")
            self._show_hand_choices(remaining)
            while True:
                choice = input_with_quit("  Card number: ").strip()
                if choice.isdigit() and 1 <= int(choice) <= len(remaining):
                    idx = int(choice) - 1
                    selected.append(remaining.pop(idx))
                    break
                print("  Invalid choice.")
        return selected

    def _choose_secret(self, hand):
        """Choose 1 card to place face-down (revealed at round end)."""
        print("\n  SECRET: Choose 1 card to set aside face-down.")
        cards = self._pick_cards(hand, 1, "Select card")
        return ("secret", cards[0])

    def _choose_trade_off(self, hand):
        """Choose 2 cards to discard face-down (removed from round)."""
        print("\n  TRADE-OFF: Choose 2 cards to discard face-down (out of the round).")
        cards = self._pick_cards(hand, 2, "Select card to discard")
        return ("trade_off", cards)

    def _choose_gift(self, hand):
        """Choose 3 cards to offer; opponent picks 1, you get 2."""
        print("\n  GIFT: Choose 3 cards to offer. Opponent picks 1, you keep 2.")
        cards = self._pick_cards(hand, 3, "Select card to offer")
        return ("gift", cards)

    def _choose_competition(self, hand):
        """Choose 4 cards and split into 2 pairs; opponent picks a pair."""
        print("\n  COMPETITION: Choose 4 cards, then split into 2 pairs.")
        cards = self._pick_cards(hand, 4, "Select card")
        print("\n  Now split into two pairs. Choose 2 cards for Pair A (the other 2 become Pair B).")
        pair_a = []
        remaining = list(cards)
        for n in range(2):
            print(f"  Select card for Pair A ({n + 1}/2):")
            self._show_hand_choices(remaining)
            while True:
                choice = input_with_quit("  Card number: ").strip()
                if choice.isdigit() and 1 <= int(choice) <= len(remaining):
                    idx = int(choice) - 1
                    pair_a.append(remaining.pop(idx))
                    break
                print("  Invalid choice.")
        pair_b = remaining
        print(f"  Pair A: {self._hand_summary(pair_a)}")
        print(f"  Pair B: {self._hand_summary(pair_b)}")
        return ("competition", pair_a, pair_b)

    def _get_response_move(self):
        """Get opponent's response to a gift or competition."""
        action_type = self._pending_action["type"]
        if action_type == "gift":
            return self._respond_gift()
        elif action_type == "competition":
            return self._respond_competition()

    def _respond_gift(self):
        """Opponent picks 1 card from the 3 offered."""
        offered = self._pending_action["cards"]
        acting = self._pending_action["acting_player"]
        print(f"\n  {self.players[acting - 1]} offers you 3 cards (GIFT). Pick 1 to keep:")
        for i, c in enumerate(offered, 1):
            print(f"    {i}. {self._card_name(c)}")
        while True:
            choice = input_with_quit("  Your choice: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(offered):
                return ("gift_response", int(choice) - 1)
            print("  Invalid choice.")

    def _respond_competition(self):
        """Opponent picks one of two pairs."""
        pair_a = self._pending_action["pair_a"]
        pair_b = self._pending_action["pair_b"]
        acting = self._pending_action["acting_player"]
        print(f"\n  {self.players[acting - 1]} offers two pairs (COMPETITION). Pick one:")
        print(f"    1. Pair A: {self._hand_summary(pair_a)}")
        print(f"    2. Pair B: {self._hand_summary(pair_b)}")
        while True:
            choice = input_with_quit("  Your choice (1 or 2): ").strip()
            if choice in ("1", "2"):
                return ("competition_response", int(choice))
            print("  Invalid choice. Enter 1 or 2.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        if move is None:
            return True

        cp = self.current_player

        # Handle responses to pending actions
        if self._pending_action:
            return self._apply_response(move)

        action = move[0]

        if action == "secret":
            card = move[1]
            self.hands[cp].remove(card)
            self.secret_cards[cp] = card
            self.actions_remaining[cp].remove("secret")
            self._add_log(f"{self.players[cp - 1]} played Secret (1 card set aside).")
            self._check_round_end_or_continue()
            return True

        elif action == "trade_off":
            cards = move[1]
            for c in cards:
                self.hands[cp].remove(c)
            self.trade_off_cards[cp] = cards
            self.actions_remaining[cp].remove("trade_off")
            self._add_log(f"{self.players[cp - 1]} played Trade-Off (2 cards discarded).")
            self._check_round_end_or_continue()
            return True

        elif action == "gift":
            cards = move[1]
            for c in cards:
                self.hands[cp].remove(c)
            self.actions_remaining[cp].remove("gift")
            self._add_log(f"{self.players[cp - 1]} played Gift (3 cards offered).")
            # Set pending action for opponent to respond
            self._pending_action = {
                "type": "gift",
                "acting_player": cp,
                "cards": cards,
            }
            # Switch to opponent to respond -- but don't count as a normal turn
            return True

        elif action == "competition":
            pair_a = move[1]
            pair_b = move[2]
            all_cards = pair_a + pair_b
            for c in all_cards:
                self.hands[cp].remove(c)
            self.actions_remaining[cp].remove("competition")
            self._add_log(f"{self.players[cp - 1]} played Competition (4 cards in 2 pairs).")
            self._pending_action = {
                "type": "competition",
                "acting_player": cp,
                "pair_a": pair_a,
                "pair_b": pair_b,
            }
            return True

        return False

    def _apply_response(self, move):
        """Apply opponent's response to gift or competition."""
        action_type = self._pending_action["type"]
        acting = self._pending_action["acting_player"]
        responding = self._opponent(acting)

        if action_type == "gift" and move[0] == "gift_response":
            chosen_idx = move[1]
            cards = self._pending_action["cards"]
            chosen_card = cards[chosen_idx]
            remaining = [c for i, c in enumerate(cards) if i != chosen_idx]
            # Responder gets chosen card, acting player gets remaining 2
            self._place_card(chosen_card, responding)
            for c in remaining:
                self._place_card(c, acting)
            self._add_log(f"{self.players[responding - 1]} took {self._card_name(chosen_card)} from Gift.")
            self._add_log(f"{self.players[acting - 1]} kept {self._hand_summary(remaining)}.")
            self._pending_action = None
            self._check_round_end_or_continue()
            return True

        elif action_type == "competition" and move[0] == "competition_response":
            pair_choice = move[1]
            pair_a = self._pending_action["pair_a"]
            pair_b = self._pending_action["pair_b"]
            if pair_choice == 1:
                resp_cards, act_cards = pair_a, pair_b
            else:
                resp_cards, act_cards = pair_b, pair_a
            for c in resp_cards:
                self._place_card(c, responding)
            for c in act_cards:
                self._place_card(c, acting)
            self._add_log(f"{self.players[responding - 1]} took "
                          f"{self._hand_summary(resp_cards)} from Competition.")
            self._add_log(f"{self.players[acting - 1]} got "
                          f"{self._hand_summary(act_cards)}.")
            self._pending_action = None
            self._check_round_end_or_continue()
            return True

        return False

    def _check_round_end_or_continue(self):
        """After an action resolves, check if round is over or continue."""
        if self._both_done():
            self._resolve_round_end()
            winner = self._check_win()
            if winner:
                self.game_over = True
                self.winner = winner
            else:
                self.round_number += 1
                self._start_new_round()

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        # Already handled in _check_round_end_or_continue
        pass

    # ---------------------------------------------------------- switch player
    def switch_player(self):
        """Override to handle gift/competition response turns correctly."""
        if self._pending_action:
            # Switch to opponent to respond
            acting = self._pending_action["acting_player"]
            self.current_player = self._opponent(acting)
        else:
            # Normal alternation, but if opponent has no actions left, stay or skip
            opp = self._opponent()
            if self.actions_remaining[opp]:
                self.current_player = opp
            elif self.actions_remaining[self.current_player]:
                pass  # Current player still has actions
            # else both done -- handled by round end

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "favor": list(self.favor),
            "geisha_cards": [dict(gc) for gc in self.geisha_cards],
            "deck": list(self.deck),
            "hands": {str(k): list(v) for k, v in self.hands.items()},
            "actions_remaining": {str(k): list(v) for k, v in self.actions_remaining.items()},
            "secret_cards": {str(k): v for k, v in self.secret_cards.items()},
            "trade_off_cards": {str(k): (list(v) if v else None)
                                for k, v in self.trade_off_cards.items()},
            "round_number": self.round_number,
            "log": list(self.log),
        }

    def load_state(self, state):
        self.favor = list(state["favor"])
        self.geisha_cards = [{int(k2): v2 for k2, v2 in gc.items()}
                             for gc in state["geisha_cards"]]
        self.deck = list(state["deck"])
        self.hands = {int(k): list(v) for k, v in state["hands"].items()}
        self.actions_remaining = {int(k): list(v)
                                  for k, v in state["actions_remaining"].items()}
        self.secret_cards = {int(k): v for k, v in state["secret_cards"].items()}
        self.trade_off_cards = {int(k): (list(v) if v else None)
                                for k, v in state["trade_off_cards"].items()}
        self.round_number = state.get("round_number", 1)
        self.log = list(state.get("log", []))

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        if self.variation == "simple":
            geisha_desc = "5 geishas with charm values 2, 2, 3, 3, 4 (total 14 charm)"
            deck_desc = "14 item cards total"
            win_desc = "Win with 8+ charm or 3+ geishas with majority"
        else:
            geisha_desc = "7 geishas with charm values 2, 2, 2, 3, 3, 4, 5 (total 21 charm)"
            deck_desc = "21 item cards total (matching each geisha's charm value)"
            win_desc = "Win with 11+ charm or 4+ geishas with majority"

        return (
            f"\n{'=' * 58}\n"
            f"  HANAMIKOJI - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Two players compete to win the favor of geishas by\n"
            f"  playing item cards. {geisha_desc}.\n"
            f"  {deck_desc}.\n\n"
            f"  ROUND STRUCTURE:\n"
            f"  Each round: 1 card removed face-down, then 6 cards dealt\n"
            f"  to each player. Players alternate taking 1 of 4 actions.\n"
            f"  Each action must be used exactly once per round.\n\n"
            f"  ACTIONS:\n"
            f"  1. Secret      - Place 1 card face-down (revealed at round end)\n"
            f"  2. Trade-Off   - Discard 2 cards face-down (removed from round)\n"
            f"  3. Gift        - Offer 3 cards to opponent; they pick 1, you get 2\n"
            f"  4. Competition - Offer 4 cards split into 2 pairs; opponent picks\n"
            f"                   one pair, you get the other\n\n"
            f"  FAVOR:\n"
            f"  At the end of a round, the player with more cards on a\n"
            f"  geisha wins that geisha's favor. Ties keep current favor.\n"
            f"  Favor carries over between rounds.\n\n"
            f"  WINNING:\n"
            f"  {win_desc}.\n"
            f"  The game continues across rounds until someone wins.\n\n"
            f"  COMMANDS:\n"
            f"  Type action names when prompted. Type 'quit' to exit,\n"
            f"  'save' to suspend, 'help' for help.\n"
            f"{'=' * 58}"
        )
