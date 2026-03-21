"""Skull - A bluffing game of roses and skulls (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class SkullGame(BaseGame):
    """Skull - place discs, bid, and bluff your way to victory."""

    name = "Skull"
    description = "A bluffing game of roses and skulls"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Skull",
        "extended": "Extended (5 discs)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Disc pools: list of disc types each player still owns
        self.discs = {1: [], 2: []}
        # Stacks: list of discs placed face-down this round (bottom to top)
        self.stacks = {1: [], 2: []}
        # Scores: successful flips
        self.scores = {1: 0, 2: 0}
        # Phase: "placing", "bidding", "flipping", "round_over"
        self.phase = "placing"
        # Track who has placed at least one disc this round
        self.has_placed = {1: False, 2: False}
        # Bidding state
        self.current_bid = 0
        self.bidder = None  # player who holds the highest bid
        self.last_passer = None  # player who passed
        # Log of recent events
        self.log = []
        # Points needed to win
        self.points_to_win = 2

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 10:
            self.log = self.log[-10:]

    def _total_discs_on_stacks(self):
        return len(self.stacks[1]) + len(self.stacks[2])

    def _max_possible_bid(self):
        return self._total_discs_on_stacks()

    # ------------------------------------------------------------------ setup
    def setup(self):
        if self.variation == "extended":
            for p in (1, 2):
                self.discs[p] = ["rose"] * 4 + ["skull"]
            self.points_to_win = 3
        else:
            for p in (1, 2):
                self.discs[p] = ["rose"] * 3 + ["skull"]
            self.points_to_win = 2

        self.stacks = {1: [], 2: []}
        self.scores = {1: 0, 2: 0}
        self.phase = "placing"
        self.has_placed = {1: False, 2: False}
        self.current_bid = 0
        self.bidder = None
        self.last_passer = None
        self.log = []
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1

    def _start_new_round(self):
        """Reset stacks and phase for a new round."""
        self.stacks = {1: [], 2: []}
        self.phase = "placing"
        self.has_placed = {1: False, 2: False}
        self.current_bid = 0
        self.bidder = None
        self.last_passer = None

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 54}")
        print(f"  SKULL  (Turn {self.turn_number + 1})")
        print(f"{'=' * 54}")

        # Opponent info
        print(f"\n  {self.players[opp - 1]}:")
        print(f"    Discs remaining : {len(self.discs[opp])}")
        print(f"    Stack           : {len(self.stacks[opp])} disc(s) face-down")
        print(f"    Score           : {self.scores[opp]} / {self.points_to_win}")

        # Divider
        print(f"\n  {'- ' * 25}")

        # Current player info
        print(f"\n  {self.players[cp - 1]} (you):")
        hand = [d for d in self.discs[cp] if d not in self._discs_on_stack(cp)]
        print(f"    Discs remaining : {len(self.discs[cp])} total"
              f" ({self._disc_summary(self.discs[cp])})")
        print(f"    In hand         : {self._disc_summary(hand)}")
        print(f"    Your stack      : {self._show_own_stack(cp)}")
        print(f"    Score           : {self.scores[cp]} / {self.points_to_win}")

        # Phase / bid info
        print(f"\n  Phase: {self.phase.upper()}")
        if self.phase == "bidding" or self.phase == "flipping":
            bid_holder = self.players[self.bidder - 1] if self.bidder else "none"
            print(f"  Current bid: {self.current_bid} (by {bid_holder})")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-6:]:
                print(f"  {line}")

        print()

    def _discs_on_stack(self, player):
        """Return a copy of discs currently placed on the stack."""
        return list(self.stacks[player])

    def _disc_summary(self, disc_list):
        roses = disc_list.count("rose")
        skulls = disc_list.count("skull")
        parts = []
        if roses:
            parts.append(f"{roses} rose(s)")
        if skulls:
            parts.append(f"{skulls} skull(s)")
        return ", ".join(parts) if parts else "none"

    def _show_own_stack(self, player):
        """Show the player their own stack (they can see their own discs)."""
        if not self.stacks[player]:
            return "empty"
        return " -> ".join(self.stacks[player]) + " (bottom to top)"

    # -------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if self.phase == "placing":
            return self._get_placing_move(cp)
        elif self.phase == "bidding":
            return self._get_bidding_move(cp)
        elif self.phase == "flipping":
            # Flipping is automatic for the bidder
            return "flip"
        elif self.phase == "round_over":
            return "next_round"
        return None

    def _get_placing_move(self, cp):
        hand = self._hand(cp)
        if not hand:
            # Player has no discs left in hand, must start bidding or pass turn
            print("  You have no discs in hand. Starting bid phase.")
            input_with_quit("  Press Enter to start bidding... ")
            return "start_bid"

        can_bid = self.has_placed[cp]
        options = []
        if "rose" in hand:
            options.append("'place rose'")
        if "skull" in hand:
            options.append("'place skull'")
        if can_bid:
            options.append("'bid <number>'")

        print(f"  Options: {', '.join(options)}")
        while True:
            move = input_with_quit("  > ").strip().lower()
            if move == "place rose":
                if "rose" not in hand:
                    print("  You have no roses left to place.")
                    continue
                return "place rose"
            elif move == "place skull":
                if "skull" not in hand:
                    print("  You have no skulls left to place.")
                    continue
                return "place skull"
            elif move.startswith("bid"):
                if not can_bid:
                    print("  You must place at least one disc before bidding.")
                    continue
                parts = move.split()
                if len(parts) != 2 or not parts[1].isdigit():
                    print("  Usage: bid <number>  (e.g., 'bid 2')")
                    continue
                bid_val = int(parts[1])
                if bid_val < 1:
                    print("  Bid must be at least 1.")
                    continue
                max_bid = self._total_placed()
                if bid_val > max_bid:
                    print(f"  Maximum possible bid is {max_bid} (total discs placed).")
                    continue
                return f"bid {bid_val}"
            else:
                print(f"  Invalid input. Options: {', '.join(options)}")

    def _get_bidding_move(self, cp):
        max_bid = self._total_placed()
        print(f"  Current bid: {self.current_bid} by {self.players[self.bidder - 1]}")
        print(f"  Options: 'bid <number>' (>{self.current_bid}) or 'pass'")
        while True:
            move = input_with_quit("  > ").strip().lower()
            if move == "pass":
                return "pass"
            elif move.startswith("bid"):
                parts = move.split()
                if len(parts) != 2 or not parts[1].isdigit():
                    print("  Usage: bid <number>")
                    continue
                bid_val = int(parts[1])
                if bid_val <= self.current_bid:
                    print(f"  Must bid higher than {self.current_bid}.")
                    continue
                if bid_val > max_bid:
                    print(f"  Maximum possible bid is {max_bid}.")
                    continue
                return f"bid {bid_val}"
            else:
                print("  Enter 'bid <number>' or 'pass'.")

    def _hand(self, player):
        """Return discs in player's hand (owned but not on stack)."""
        hand = list(self.discs[player])
        for d in self.stacks[player]:
            hand.remove(d)
        return hand

    def _total_placed(self):
        return len(self.stacks[1]) + len(self.stacks[2])

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player

        if move == "place rose":
            return self._do_place(cp, "rose")
        elif move == "place skull":
            return self._do_place(cp, "skull")
        elif move.startswith("bid"):
            parts = move.split()
            bid_val = int(parts[1])
            return self._do_bid(cp, bid_val)
        elif move == "start_bid":
            # Force transition to bidding when player has no hand
            return self._do_start_bid_phase(cp)
        elif move == "pass":
            return self._do_pass(cp)
        elif move == "flip":
            return self._do_flip()
        elif move == "next_round":
            return self._do_next_round()
        return False

    def _do_place(self, cp, disc_type):
        self.stacks[cp].append(disc_type)
        self.has_placed[cp] = True
        self._add_log(f"{self.players[cp - 1]} placed a disc.")

        # Check if opponent needs to place first disc
        opp = self._opponent(cp)
        if not self.has_placed[opp] and self._hand(opp):
            # Switch to opponent so they place at least one
            return True

        # If current player placed, switch to opponent for their turn
        return True

    def _do_start_bid_phase(self, cp):
        """Transition to bidding when a player can't place."""
        # Ensure the opponent has placed at least once
        opp = self._opponent(cp)
        if not self.has_placed[opp]:
            # Opponent still needs to place
            self._add_log(f"{self.players[cp - 1]} has no discs in hand.")
            return True

        self.phase = "bidding"
        self.current_bid = 1
        self.bidder = cp
        self._add_log(f"{self.players[cp - 1]} starts bidding at 1.")
        # Switch to opponent to respond
        return True

    def _do_bid(self, cp, bid_val):
        if self.phase == "placing":
            # First bid transitions to bidding phase
            # Make sure opponent has placed at least one disc
            opp = self._opponent(cp)
            if not self.has_placed[opp] and self._hand(opp):
                print("  Opponent must place at least one disc first.")
                return False
            self.phase = "bidding"

        self.current_bid = bid_val
        self.bidder = cp
        self._add_log(f"{self.players[cp - 1]} bids {bid_val}.")

        # Check if bid equals total discs - auto win the bid
        if bid_val == self._total_placed():
            self._add_log(f"Maximum bid reached! {self.players[cp - 1]} must flip.")
            self.phase = "flipping"
            # Don't switch player - bidder flips
            self.current_player = cp
            return True

        return True

    def _do_pass(self, cp):
        if self.phase != "bidding":
            return False
        self._add_log(f"{self.players[cp - 1]} passes.")
        # The other player wins the bid
        self.phase = "flipping"
        self.current_player = self.bidder
        return True

    def _do_flip(self):
        """Execute the flipping phase. The bidder must flip current_bid discs."""
        bidder = self.bidder
        opp = self._opponent(bidder)
        to_flip = self.current_bid
        flipped = 0
        hit_skull = False

        clear_screen()
        self.display()
        print(f"  {self.players[bidder - 1]} must flip {to_flip} disc(s).\n")

        # MUST flip all own discs first (from top of stack)
        own_stack = list(self.stacks[bidder])
        while own_stack and flipped < to_flip:
            disc = own_stack.pop()  # top of stack
            flipped += 1
            print(f"  Flipping your disc #{flipped}: {disc.upper()}")
            if disc == "skull":
                hit_skull = True
                self._add_log(f"{self.players[bidder - 1]} hit their OWN skull!")
                print(f"\n  You hit your own skull!")
                self._handle_skull_penalty(bidder, own_skull=True)
                self.phase = "round_over"
                input_with_quit("\n  Press Enter to continue... ")
                return True

        # Then flip opponent's discs from top of their stack
        opp_stack = list(self.stacks[opp])
        while flipped < to_flip and opp_stack:
            disc = opp_stack.pop()  # top of stack
            flipped += 1
            print(f"  Flipping {self.players[opp - 1]}'s disc #{flipped}: {disc.upper()}")
            if disc == "skull":
                hit_skull = True
                self._add_log(f"{self.players[bidder - 1]} hit {self.players[opp - 1]}'s skull!")
                print(f"\n  You hit {self.players[opp - 1]}'s skull!")
                self._handle_skull_penalty(bidder, own_skull=False)
                self.phase = "round_over"
                input_with_quit("\n  Press Enter to continue... ")
                return True

        # Success! All flipped without hitting a skull
        self.scores[bidder] += 1
        self._add_log(
            f"{self.players[bidder - 1]} flipped {to_flip} disc(s) successfully! "
            f"Score: {self.scores[bidder]}/{self.points_to_win}"
        )
        print(f"\n  Success! You flipped {to_flip} disc(s) without hitting a skull!")
        print(f"  Score: {self.scores[bidder]}/{self.points_to_win}")
        self.phase = "round_over"
        input_with_quit("\n  Press Enter to continue... ")
        return True

    def _handle_skull_penalty(self, loser, own_skull):
        """Handle losing a disc after hitting a skull."""
        if own_skull:
            # Hit own skull: loser chooses which disc to lose
            print(f"\n  {self.players[loser - 1]}, you must lose a disc (you choose).")
            self._choose_and_remove_disc(loser)
        else:
            # Hit opponent's skull: opponent chooses which of loser's discs to remove
            # But the choice is random/face-down so loser doesn't know
            opp = self._opponent(loser)
            print(f"  {self.players[opp - 1]} chooses which of your discs to remove (face-down).")
            self._random_remove_disc(loser)

    def _choose_and_remove_disc(self, player):
        """Player chooses which of their own discs to permanently lose."""
        if len(self.discs[player]) <= 1:
            if self.discs[player]:
                lost = self.discs[player].pop(0)
                self._add_log(f"{self.players[player - 1]} lost their last disc ({lost}).")
                print(f"  You lost your last disc ({lost}).")
            return

        print(f"  Your discs: ")
        for i, d in enumerate(self.discs[player], 1):
            print(f"    {i}. {d}")
        while True:
            choice = input_with_quit("  Choose disc number to lose: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(self.discs[player]):
                idx = int(choice) - 1
                lost = self.discs[player].pop(idx)
                self._add_log(f"{self.players[player - 1]} chose to lose a {lost}.")
                print(f"  You lost a {lost}.")
                return
            print("  Invalid choice.")

    def _random_remove_disc(self, player):
        """Remove a random disc from player (opponent's choice, face-down)."""
        if not self.discs[player]:
            return
        idx = random.randint(0, len(self.discs[player]) - 1)
        lost = self.discs[player].pop(idx)
        self._add_log(f"{self.players[player - 1]} lost a disc (chosen by opponent, face-down).")
        print(f"  A disc was removed from your collection (face-down, you don't know which).")

    def _do_next_round(self):
        """Start the next round."""
        self._start_new_round()
        # Check if any player has no discs
        for p in (1, 2):
            if not self.discs[p]:
                self.game_over = True
                self.winner = self._opponent(p)
                return True
        return True

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        """Override to handle phase-specific switching."""
        if self.phase == "flipping":
            # During flipping, the bidder stays current
            self.current_player = self.bidder
        elif self.phase == "round_over":
            # Don't switch during round_over
            pass
        else:
            super().switch_player()

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        # Win by score
        for p in (1, 2):
            if self.scores[p] >= self.points_to_win:
                self.game_over = True
                self.winner = p
                return
        # Win by opponent losing all discs
        for p in (1, 2):
            if not self.discs[p]:
                self.game_over = True
                self.winner = self._opponent(p)
                return

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "discs": {str(k): list(v) for k, v in self.discs.items()},
            "stacks": {str(k): list(v) for k, v in self.stacks.items()},
            "scores": {str(k): v for k, v in self.scores.items()},
            "phase": self.phase,
            "has_placed": {str(k): v for k, v in self.has_placed.items()},
            "current_bid": self.current_bid,
            "bidder": self.bidder,
            "last_passer": self.last_passer,
            "log": list(self.log),
            "points_to_win": self.points_to_win,
        }

    def load_state(self, state):
        self.discs = {int(k): list(v) for k, v in state["discs"].items()}
        self.stacks = {int(k): list(v) for k, v in state["stacks"].items()}
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.phase = state["phase"]
        self.has_placed = {int(k): v for k, v in state["has_placed"].items()}
        self.current_bid = state["current_bid"]
        self.bidder = state["bidder"]
        self.last_passer = state["last_passer"]
        self.log = list(state.get("log", []))
        self.points_to_win = state.get("points_to_win", 2)

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        if self.variation == "extended":
            disc_info = "5 discs (4 Roses, 1 Skull)"
            win_info = "3 successful flips"
        else:
            disc_info = "4 discs (3 Roses, 1 Skull)"
            win_info = "2 successful flips"

        return (
            f"\n{'=' * 58}\n"
            f"  SKULL - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Each player starts with {disc_info}.\n"
            f"  Win by being the first to score {win_info},\n"
            f"  or by your opponent losing all their discs.\n\n"
            f"  PHASE 1 - PLACING:\n"
            f"  Players alternate placing discs face-down on their stack.\n"
            f"  Each player must place at least 1 disc.\n"
            f"  After placing, you can continue placing or start bidding.\n"
            f"  Commands: 'place rose', 'place skull'\n\n"
            f"  PHASE 2 - BIDDING:\n"
            f"  Bid how many total discs you can flip without hitting a skull.\n"
            f"  The other player can raise the bid or pass.\n"
            f"  Commands: 'bid <number>', 'pass'\n\n"
            f"  PHASE 3 - FLIPPING:\n"
            f"  The highest bidder must flip that many discs.\n"
            f"  You MUST flip all your own discs first (top to bottom),\n"
            f"  then flip your opponent's discs from the top of their stack.\n\n"
            f"  HITTING A SKULL:\n"
            f"  - If you hit YOUR OWN skull: you choose which disc to lose.\n"
            f"  - If you hit OPPONENT'S skull: opponent chooses which of\n"
            f"    YOUR discs to remove (random, face-down).\n"
            f"  Lost discs are gone permanently!\n\n"
            f"  WINNING:\n"
            f"  - Score {win_info}  OR\n"
            f"  - Your opponent loses all their discs.\n\n"
            f"  OTHER COMMANDS:\n"
            f"  'quit' - Exit game    'save' - Save game\n"
            f"  'help' - Show help    'tutorial' - Show this tutorial\n"
            f"{'=' * 58}"
        )
