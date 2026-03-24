"""Blackjack - Casino card game, player vs dealer."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


SUITS = ['H', 'D', 'C', 'S']
SUIT_SYMBOLS = {'H': '\u2665', 'D': '\u2666', 'C': '\u2663', 'S': '\u2660'}
RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']


def card_str(card):
    """Format a card for display: e.g. ('10','H') -> '10\u2665'."""
    return f"{card[0]}{SUIT_SYMBOLS[card[1]]}"


def card_value(card):
    """Return the numeric value of a card. Aces return 11 (handled separately)."""
    rank = card[0]
    if rank == 'A':
        return 11
    if rank in ('J', 'Q', 'K'):
        return 10
    return int(rank)


def hand_value(hand):
    """Calculate the best value for a hand, adjusting aces as needed."""
    total = sum(card_value(c) for c in hand)
    aces = sum(1 for c in hand if c[0] == 'A')
    while total > 21 and aces > 0:
        total -= 10
        aces -= 1
    return total


def is_blackjack(hand):
    """Check if a hand is a natural blackjack (2 cards, value 21)."""
    return len(hand) == 2 and hand_value(hand) == 21


def make_shoe(num_decks=6):
    """Create a shuffled shoe of multiple decks."""
    deck = [(r, s) for s in SUITS for r in RANKS]
    shoe = deck * num_decks
    random.shuffle(shoe)
    return shoe


class BlackjackGame(BaseGame):
    """Blackjack card game - player vs dealer."""

    name = "Blackjack"
    description = "Classic casino card game - get as close to 21 without going over."
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Blackjack",
        "pontoon": "Pontoon (British variant)",
    }

    def setup(self):
        """Initialize the game state."""
        self.players = ["Player", "Dealer"]
        self.shoe = make_shoe(6)
        self.chips = [100, 100]  # Player chips, Dealer chips
        self.current_bet = 10
        self.round_number = 0
        self.max_rounds = 10 if self.variation == "standard" else 5
        self.player_hands = [[]]  # List of hands (for splits)
        self.dealer_hand = []
        self.active_hand_index = 0
        self.bets = [self.current_bet]
        self.phase = "betting"  # betting, playing, dealer_turn, round_over
        self.round_result = ""
        self.dealer_reveal = False

    def _deal_card(self):
        """Deal a card from the shoe, reshuffling if needed."""
        if len(self.shoe) < 20:
            self.shoe = make_shoe(6)
        return self.shoe.pop()

    def _start_round(self):
        """Deal initial cards for a new round."""
        self.round_number += 1
        self.player_hands = [[]]
        self.dealer_hand = []
        self.active_hand_index = 0
        self.bets = [self.current_bet]
        self.dealer_reveal = False
        self.round_result = ""

        # Deal 2 cards each: player, dealer, player, dealer
        self.player_hands[0].append(self._deal_card())
        self.dealer_hand.append(self._deal_card())
        self.player_hands[0].append(self._deal_card())
        self.dealer_hand.append(self._deal_card())

        # Check for naturals
        player_bj = is_blackjack(self.player_hands[0])
        dealer_bj = is_blackjack(self.dealer_hand)

        if player_bj or dealer_bj:
            self.dealer_reveal = True
            if player_bj and dealer_bj:
                self.round_result = "Push! Both have Blackjack."
            elif player_bj:
                winnings = int(self.current_bet * 1.5)
                self.chips[0] += winnings
                self.chips[1] -= winnings
                self.round_result = f"Blackjack! You win {winnings} chips!"
            else:
                self.chips[0] -= self.current_bet
                self.chips[1] += self.current_bet
                self.round_result = "Dealer has Blackjack. You lose."
            self.phase = "round_over"
        else:
            self.phase = "playing"

    def _format_hand(self, hand, hide_second=False):
        """Format a hand for display. If hide_second, show second card as hidden."""
        if not hand:
            return "empty"
        if hide_second and len(hand) >= 2:
            if self.variation == "pontoon":
                return "[??] [??]"
            return f"{card_str(hand[0])} [??]"
        return " ".join(card_str(c) for c in hand)

    def _hand_value_str(self, hand):
        """Return a string showing the hand value."""
        val = hand_value(hand)
        # Check if there's a soft ace
        total_hard = sum(card_value(c) for c in hand)
        aces = sum(1 for c in hand if c[0] == 'A')
        reduced = 0
        temp = total_hard
        while temp > 21 and reduced < aces:
            temp -= 10
            reduced += 1
        if reduced < aces and val <= 21 and val != temp + 10 * (aces - reduced - 1):
            pass
        # Simple: show value, note "soft" if an ace is counted as 11
        soft_total = sum(card_value(c) for c in hand)
        aces_count = sum(1 for c in hand if c[0] == 'A')
        hard = soft_total
        a = aces_count
        while hard > 21 and a > 0:
            hard -= 10
            a -= 1
        if a > 0 and aces_count > 0 and hard <= 21 and hard != soft_total:
            # There's still at least one ace counted as 11
            return f"{hard} (soft)"
        return str(hard)

    def display(self):
        """Display the current game state."""
        print(f"\n{'=' * 50}")
        title = "PONTOON" if self.variation == "pontoon" else "BLACKJACK"
        print(f"  {title}  -  Round {self.round_number}/{self.max_rounds}")
        print(f"{'=' * 50}")
        print(f"  Your chips: {self.chips[0]}    Dealer chips: {self.chips[1]}")
        print(f"  Current bet: {self.current_bet}")
        print(f"{'-' * 50}")

        if self.phase == "betting":
            print("\n  Place your bet to begin the round.")
            print(f"  (Type 'bet <amount>' or press Enter for {self.current_bet})")
        else:
            # Show dealer hand
            hide = not self.dealer_reveal
            dealer_display = self._format_hand(self.dealer_hand, hide_second=hide)
            print(f"\n  Dealer's hand: {dealer_display}", end="")
            if self.dealer_reveal:
                print(f"  (value: {hand_value(self.dealer_hand)})")
            else:
                if self.variation == "pontoon":
                    print("  (hidden)")
                else:
                    print(f"  (showing: {card_value(self.dealer_hand[0])})")

            # Show player hands
            for i, hand in enumerate(self.player_hands):
                label = f"  Your hand" if len(self.player_hands) == 1 else f"  Hand {i + 1}"
                marker = " <<" if (self.phase == "playing" and i == self.active_hand_index
                                   and len(self.player_hands) > 1) else ""
                val = hand_value(hand)
                val_str = self._hand_value_str(hand)
                status = ""
                if val > 21:
                    status = " BUST!"
                elif is_blackjack(hand):
                    status = " BLACKJACK!"
                elif self.variation == "pontoon" and len(hand) >= 5 and val <= 21:
                    status = " 5-CARD TRICK!"
                print(f"{label}: {self._format_hand(hand)}  (value: {val_str}){status}{marker}")
                if len(self.player_hands) > 1:
                    print(f"    Bet: {self.bets[i]}")

        if self.round_result:
            print(f"\n  >> {self.round_result}")

        print(f"{'=' * 50}")

    def get_move(self):
        """Get player input based on current phase."""
        if self.phase == "betting":
            prompt = "\n  Enter bet (or press Enter for current): "
            move = input_with_quit(prompt).strip().lower()
            if move == "":
                return ("bet", self.current_bet)
            if move.startswith("bet"):
                parts = move.split()
                if len(parts) >= 2:
                    try:
                        amount = int(parts[1])
                        return ("bet", amount)
                    except ValueError:
                        pass
            # Try just a number
            try:
                amount = int(move)
                return ("bet", amount)
            except ValueError:
                return ("bet", self.current_bet)

        elif self.phase == "playing":
            hand = self.player_hands[self.active_hand_index]
            actions = ["hit", "stand"]
            can_double = len(hand) == 2 and self.chips[0] >= self.bets[self.active_hand_index]
            can_split = (len(hand) == 2
                         and card_value(hand[0]) == card_value(hand[1])
                         and len(self.player_hands) < 4
                         and self.chips[0] >= self.bets[self.active_hand_index])
            if can_double:
                actions.append("double")
            if can_split:
                actions.append("split")

            if self.variation == "pontoon":
                action_display = "/".join(actions).replace("hit", "twist").replace("stand", "stick").replace("double", "buy")
            else:
                action_display = "/".join(actions)

            prompt = f"\n  Action ({action_display}): "
            move = input_with_quit(prompt).strip().lower()

            # Map pontoon terminology
            if self.variation == "pontoon":
                move = move.replace("twist", "hit").replace("stick", "stand").replace("buy", "double")

            return ("action", move)

        elif self.phase == "round_over":
            prompt = "\n  Press Enter to continue (or 'stop' to end game): "
            move = input_with_quit(prompt).strip().lower()
            return ("continue", move)

        elif self.phase == "dealer_turn":
            return ("dealer", None)

        return ("unknown", None)

    def make_move(self, move):
        """Process the move. Returns True if valid."""
        move_type, move_data = move

        if move_type == "bet":
            amount = move_data
            if amount < 1:
                print("  Minimum bet is 1.")
                return False
            if amount > self.chips[0]:
                print(f"  You only have {self.chips[0]} chips.")
                return False
            self.current_bet = amount
            self._start_round()
            return True

        elif move_type == "action":
            action = move_data
            hand = self.player_hands[self.active_hand_index]

            if action == "hit":
                hand.append(self._deal_card())
                val = hand_value(hand)
                if val > 21:
                    # Bust
                    self._advance_hand()
                elif self.variation == "pontoon" and len(hand) >= 5 and val <= 21:
                    # 5-card trick auto-win for this hand
                    self._advance_hand()
                return True

            elif action == "stand":
                self._advance_hand()
                return True

            elif action == "double":
                if len(hand) != 2:
                    print("  Can only double on first two cards.")
                    return False
                bet = self.bets[self.active_hand_index]
                if self.chips[0] < bet:
                    print("  Not enough chips to double.")
                    return False
                self.bets[self.active_hand_index] = bet * 2
                hand.append(self._deal_card())
                self._advance_hand()
                return True

            elif action == "split":
                if len(hand) != 2 or card_value(hand[0]) != card_value(hand[1]):
                    print("  Can only split a pair.")
                    return False
                bet = self.bets[self.active_hand_index]
                if self.chips[0] < bet:
                    print("  Not enough chips to split.")
                    return False
                # Split into two hands
                card1 = hand[0]
                card2 = hand[1]
                self.player_hands[self.active_hand_index] = [card1, self._deal_card()]
                new_hand = [card2, self._deal_card()]
                self.player_hands.insert(self.active_hand_index + 1, new_hand)
                self.bets.insert(self.active_hand_index + 1, bet)
                return True

            else:
                print(f"  Unknown action: {action}")
                return False

        elif move_type == "continue":
            if move_data == "stop":
                self.game_over = True
                if self.chips[0] > self.chips[1]:
                    self.winner = 1
                elif self.chips[1] > self.chips[0]:
                    self.winner = 2
                else:
                    self.winner = None
                return True
            # Start new betting phase
            self.phase = "betting"
            return True

        elif move_type == "dealer":
            self._play_dealer()
            self._resolve_round()
            self.phase = "round_over"
            return True

        return False

    def _advance_hand(self):
        """Move to the next hand or to dealer's turn."""
        self.active_hand_index += 1
        if self.active_hand_index >= len(self.player_hands):
            # All hands done - check if all busted
            all_busted = all(hand_value(h) > 21 for h in self.player_hands)
            if all_busted:
                self.dealer_reveal = True
                self._resolve_round()
                self.phase = "round_over"
            else:
                self.phase = "dealer_turn"

    def _play_dealer(self):
        """Dealer plays their hand according to rules."""
        self.dealer_reveal = True
        while hand_value(self.dealer_hand) < 17:
            self.dealer_hand.append(self._deal_card())

    def _resolve_round(self):
        """Resolve all player hands against the dealer."""
        self.dealer_reveal = True
        dealer_val = hand_value(self.dealer_hand)
        dealer_bust = dealer_val > 21
        results = []

        for i, hand in enumerate(self.player_hands):
            player_val = hand_value(hand)
            bet = self.bets[i]

            if player_val > 21:
                # Player bust
                self.chips[0] -= bet
                self.chips[1] += bet
                results.append(f"Hand {i + 1}: Bust! Lost {bet} chips." if len(self.player_hands) > 1
                               else f"Bust! Lost {bet} chips.")
            elif self.variation == "pontoon" and len(hand) >= 5 and player_val <= 21:
                # 5-card trick wins double
                winnings = bet * 2
                self.chips[0] += winnings
                self.chips[1] -= winnings
                results.append(f"Hand {i + 1}: 5-Card Trick! Won {winnings} chips!" if len(self.player_hands) > 1
                               else f"5-Card Trick! Won {winnings} chips!")
            elif dealer_bust:
                self.chips[0] += bet
                self.chips[1] -= bet
                results.append(f"Hand {i + 1}: Dealer bust! Won {bet} chips." if len(self.player_hands) > 1
                               else f"Dealer bust! Won {bet} chips.")
            elif player_val > dealer_val:
                self.chips[0] += bet
                self.chips[1] -= bet
                results.append(f"Hand {i + 1}: Won {bet} chips!" if len(self.player_hands) > 1
                               else f"Won {bet} chips! ({player_val} vs {dealer_val})")
            elif player_val < dealer_val:
                self.chips[0] -= bet
                self.chips[1] += bet
                results.append(f"Hand {i + 1}: Lost {bet} chips." if len(self.player_hands) > 1
                               else f"Lost {bet} chips. ({player_val} vs {dealer_val})")
            else:
                results.append(f"Hand {i + 1}: Push!" if len(self.player_hands) > 1
                               else f"Push! ({player_val} vs {dealer_val})")

        self.round_result = " | ".join(results)

    def check_game_over(self):
        """Check if the game should end."""
        if self.chips[0] <= 0:
            self.game_over = True
            self.winner = 2
            self.round_result += " You're bankrupt!"
        elif self.chips[1] <= 0:
            self.game_over = True
            self.winner = 1
            self.round_result += " Dealer is bankrupt!"
        elif self.round_number >= self.max_rounds and self.phase == "round_over":
            self.game_over = True
            if self.chips[0] > self.chips[1]:
                self.winner = 1
            elif self.chips[1] > self.chips[0]:
                self.winner = 2
            else:
                self.winner = None

    def switch_player(self):
        """Override: Blackjack doesn't switch players in the normal sense."""
        pass

    def get_state(self):
        """Return serializable game state."""
        return {
            "shoe": self.shoe,
            "chips": self.chips,
            "current_bet": self.current_bet,
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "player_hands": self.player_hands,
            "dealer_hand": self.dealer_hand,
            "active_hand_index": self.active_hand_index,
            "bets": self.bets,
            "phase": self.phase,
            "round_result": self.round_result,
            "dealer_reveal": self.dealer_reveal,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.shoe = [tuple(c) for c in state["shoe"]]
        self.chips = state["chips"]
        self.current_bet = state["current_bet"]
        self.round_number = state["round_number"]
        self.max_rounds = state["max_rounds"]
        self.player_hands = [[tuple(c) for c in h] for h in state["player_hands"]]
        self.dealer_hand = [tuple(c) for c in state["dealer_hand"]]
        self.active_hand_index = state["active_hand_index"]
        self.bets = state["bets"]
        self.phase = state["phase"]
        self.round_result = state["round_result"]
        self.dealer_reveal = state["dealer_reveal"]

    def get_tutorial(self):
        """Return tutorial text for Blackjack."""
        if self.variation == "pontoon":
            return """
==================================================
  PONTOON (British Blackjack Variant) - Tutorial
==================================================

  Pontoon is a British variant of Blackjack with
  different terminology and special rules.

  OBJECTIVE:
  Get as close to 21 as possible without going over.
  Beat the dealer's hand.

  CARD VALUES:
  - 2-10: Face value
  - J, Q, K: 10
  - A: 1 or 11 (whichever is better)

  TERMINOLOGY:
  - Twist: Take another card (same as Hit)
  - Stick: Keep your hand (same as Stand)
  - Buy: Double your bet, take one card (same as Double)

  SPECIAL RULES:
  - Dealer's cards are BOTH face-down
  - 5-Card Trick: If you get 5 cards without busting
    (total <= 21), you automatically win double!
  - A Pontoon (A + 10-value) beats everything

  BETTING:
  - Type 'bet <amount>' to set your bet
  - Each player starts with 100 chips
  - Game ends after 5 rounds or bankruptcy

  COMMANDS: twist, stick, buy, split
==================================================
"""
        return """
==================================================
  BLACKJACK - Tutorial
==================================================

  OBJECTIVE:
  Get as close to 21 as possible without going over.
  Beat the dealer's hand to win your bet.

  CARD VALUES:
  - 2-10: Face value
  - J, Q, K: 10
  - A: 1 or 11 (whichever benefits your hand)

  GAMEPLAY:
  1. Place your bet (default 10 chips)
  2. You and the dealer each get 2 cards
     - You see both your cards and the dealer's
       face-up card
  3. Choose your action:
     - HIT: Take another card
     - STAND: Keep your current hand
     - DOUBLE: Double your bet, take exactly one card
     - SPLIT: If you have a pair, split into two hands

  WINNING:
  - Blackjack (A + 10-value card) pays 3:2
  - Beat the dealer's total without going over 21
  - Dealer must hit on 16 or below, stand on 17+
  - Bust (over 21) = automatic loss

  BETTING:
  - Type 'bet <amount>' to set your bet
  - Each player starts with 100 chips
  - Default bet: 10 chips
  - Game plays 10 rounds (or until bankrupt)

  COMMANDS: hit, stand, double, split
  Type 'stop' between rounds to end the game.
==================================================
"""

    def play(self):
        """Custom game loop for Blackjack (handles dealer automation)."""
        if not self._resumed:
            self.setup()
        while not self.game_over:
            # Auto-process dealer turn
            if self.phase == "dealer_turn":
                self._play_dealer()
                self._resolve_round()
                self.phase = "round_over"
                self.check_game_over()

            clear_screen()
            self.display()

            if self.game_over:
                break

            try:
                move = self.get_move()
            except Exception as e:
                from engine.base import QuitGame, SuspendGame, ShowHelp, ShowTutorial
                if isinstance(e, QuitGame):
                    print("\nGame ended.")
                    input_with_quit("Press Enter to return to menu...")
                    return None
                elif isinstance(e, SuspendGame):
                    slot = self.save_game()
                    print(f"\nGame saved as '{slot}'")
                    input_with_quit("Press Enter to return to menu...")
                    return 'suspended'
                elif isinstance(e, ShowHelp):
                    self.show_help()
                    continue
                elif isinstance(e, ShowTutorial):
                    clear_screen()
                    print(self.get_tutorial())
                    input_with_quit("\nPress Enter to continue...")
                    continue
                elif isinstance(e, KeyboardInterrupt):
                    print("\n\nInterrupted! Save before quitting? (y/n): ", end="")
                    try:
                        ans = input_with_quit().strip().lower()
                        if ans == 'y':
                            slot = self.save_game()
                            print(f"Game saved as '{slot}'")
                        print("Returning to menu...")
                        input_with_quit("Press Enter to continue...")
                    except KeyboardInterrupt:
                        pass
                    return None
                raise

            if self.make_move(move):
                self.move_history.append(str(move))
                self.turn_number += 1
                self.check_game_over()
            else:
                input_with_quit("  Press Enter to continue...")

        clear_screen()
        self.display()
        if self.winner:
            print(f"\n*** {self.players[self.winner - 1]} wins! ***")
            print(f"  Final chips - You: {self.chips[0]}, Dealer: {self.chips[1]}")
        else:
            print("\n*** It's a draw! ***")
            print(f"  Final chips - You: {self.chips[0]}, Dealer: {self.chips[1]}")
        input_with_quit("\nPress Enter to return to menu...")
        return self.winner
