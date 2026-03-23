"""Skull & Roses - A bluffing game with skull and rose coasters (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class SkullRosesGame(BaseGame):
    """Skull & Roses - Play coasters face-down, bid to flip, bluff to win."""

    name = "Skull & Roses"
    description = "Bluffing game with skull and rose coasters - bid and flip to win"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Skull & Roses (4 coasters each)",
        "team": "Team variant (shared coaster pool, 6 each)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Each player's coaster pool: list of 'rose' or 'skull'
        self.coasters = {1: [], 2: []}
        # Face-down stacks for each player (bottom to top)
        self.stacks = {1: [], 2: []}
        # Successful flip count per player
        self.wins = {1: 0, 2: 0}
        # Phase: placing, bidding, flipping, round_over
        self.phase = "placing"
        self.has_placed = {1: False, 2: False}
        self.current_bid = 0
        self.bidder = None
        self.passed = {1: False, 2: False}
        self.log = []
        self.wins_needed = 2
        # Team mode: shared pool tracking
        self.team_pool = []

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 12:
            self.log = self.log[-12:]

    def _total_on_stacks(self):
        return len(self.stacks[1]) + len(self.stacks[2])

    def _hand(self, player):
        """Coasters in hand (not yet placed on stack)."""
        hand = list(self.coasters[player])
        for c in self.stacks[player]:
            hand.remove(c)
        return hand

    # ------------------------------------------------------------------ setup
    def setup(self):
        if self.variation == "team":
            for p in (1, 2):
                self.coasters[p] = ["rose"] * 4 + ["skull"] * 2
            self.wins_needed = 2
        else:
            for p in (1, 2):
                self.coasters[p] = ["rose"] * 3 + ["skull"]
            self.wins_needed = 2

        self.stacks = {1: [], 2: []}
        self.wins = {1: 0, 2: 0}
        self.phase = "placing"
        self.has_placed = {1: False, 2: False}
        self.current_bid = 0
        self.bidder = None
        self.passed = {1: False, 2: False}
        self.log = []
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1

    def _start_new_round(self):
        """Reset for a new round."""
        self.stacks = {1: [], 2: []}
        self.phase = "placing"
        self.has_placed = {1: False, 2: False}
        self.current_bid = 0
        self.bidder = None
        self.passed = {1: False, 2: False}

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = self._opponent()

        v_label = "Team" if self.variation == "team" else "Standard"
        print(f"\n{'=' * 56}")
        print(f"  SKULL & ROSES  ({v_label})  -  Turn {self.turn_number + 1}")
        print(f"{'=' * 56}")

        # Opponent info
        print(f"\n  {self.players[opp - 1]}:")
        print(f"    Coasters owned : {len(self.coasters[opp])}"
              f" ({self._coaster_summary(self.coasters[opp])})")
        print(f"    Stack          : {len(self.stacks[opp])} coaster(s) face-down")
        print(f"    Wins           : {self.wins[opp]} / {self.wins_needed}")

        print(f"\n  {'- ' * 26}")

        # Current player
        hand = self._hand(cp)
        print(f"\n  {self.players[cp - 1]} (you):")
        print(f"    Coasters owned : {len(self.coasters[cp])}"
              f" ({self._coaster_summary(self.coasters[cp])})")
        print(f"    In hand        : {self._coaster_summary(hand)}")
        print(f"    Your stack     : {self._show_stack(cp)}")
        print(f"    Wins           : {self.wins[cp]} / {self.wins_needed}")

        # Phase info
        print(f"\n  Phase: {self.phase.upper()}")
        if self.phase in ("bidding", "flipping"):
            holder = self.players[self.bidder - 1] if self.bidder else "none"
            print(f"  Current bid: {self.current_bid} (by {holder})")

        # Log
        if self.log:
            print(f"\n  --- Recent Events ---")
            for line in self.log[-6:]:
                print(f"  {line}")

        print()

    def _coaster_summary(self, coaster_list):
        roses = coaster_list.count("rose")
        skulls = coaster_list.count("skull")
        parts = []
        if roses:
            parts.append(f"{roses} rose(s)")
        if skulls:
            parts.append(f"{skulls} skull(s)")
        return ", ".join(parts) if parts else "none"

    def _show_stack(self, player):
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
            return "flip"
        elif self.phase == "round_over":
            input_with_quit("  Press Enter to start next round... ")
            return "next_round"
        return None

    def _get_placing_move(self, cp):
        hand = self._hand(cp)
        if not hand:
            print("  You have no coasters left to place. Initiating bidding.")
            input_with_quit("  Press Enter... ")
            return "start_bid"

        can_bid = self.has_placed[cp]
        options = []
        if "rose" in hand:
            options.append("'rose'")
        if "skull" in hand:
            options.append("'skull'")
        if can_bid:
            options.append("'bid <n>'")

        print(f"  Place a coaster or start bidding: {', '.join(options)}")
        while True:
            move = input_with_quit("  > ").strip().lower()
            if move == "rose":
                if "rose" not in hand:
                    print("  No roses in hand.")
                    continue
                return "place rose"
            elif move == "skull":
                if "skull" not in hand:
                    print("  No skulls in hand.")
                    continue
                return "place skull"
            elif move.startswith("bid"):
                if not can_bid:
                    print("  Must place at least one coaster first.")
                    continue
                parts = move.split()
                if len(parts) != 2 or not parts[1].isdigit():
                    print("  Usage: bid <number>")
                    continue
                val = int(parts[1])
                total = self._total_on_stacks()
                if val < 1 or val > total:
                    print(f"  Bid must be 1-{total}.")
                    continue
                return f"bid {val}"
            else:
                print(f"  Options: {', '.join(options)}")

    def _get_bidding_move(self, cp):
        total = self._total_on_stacks()
        print(f"  Current bid: {self.current_bid} by {self.players[self.bidder - 1]}")
        print(f"  Options: 'bid <n>' (>{self.current_bid}, max {total}) or 'pass'")
        while True:
            move = input_with_quit("  > ").strip().lower()
            if move == "pass":
                return "pass"
            elif move.startswith("bid"):
                parts = move.split()
                if len(parts) != 2 or not parts[1].isdigit():
                    print("  Usage: bid <number>")
                    continue
                val = int(parts[1])
                if val <= self.current_bid:
                    print(f"  Must bid higher than {self.current_bid}.")
                    continue
                if val > total:
                    print(f"  Max bid is {total}.")
                    continue
                return f"bid {val}"
            else:
                print("  Enter 'bid <n>' or 'pass'.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player

        if move == "place rose":
            return self._do_place(cp, "rose")
        elif move == "place skull":
            return self._do_place(cp, "skull")
        elif move.startswith("bid"):
            val = int(move.split()[1])
            return self._do_bid(cp, val)
        elif move == "start_bid":
            return self._do_start_bid(cp)
        elif move == "pass":
            return self._do_pass(cp)
        elif move == "flip":
            return self._do_flip()
        elif move == "next_round":
            return self._do_next_round()
        return False

    def _do_place(self, cp, coaster_type):
        self.stacks[cp].append(coaster_type)
        self.has_placed[cp] = True
        self._add_log(f"{self.players[cp - 1]} placed a coaster face-down.")
        return True

    def _do_start_bid(self, cp):
        opp = self._opponent(cp)
        if not self.has_placed[opp] and self._hand(opp):
            self._add_log(f"{self.players[cp - 1]} has no coasters. Waiting for opponent.")
            return True
        self.phase = "bidding"
        self.current_bid = 1
        self.bidder = cp
        self._add_log(f"{self.players[cp - 1]} starts bidding at 1.")
        return True

    def _do_bid(self, cp, val):
        if self.phase == "placing":
            opp = self._opponent(cp)
            if not self.has_placed[opp] and self._hand(opp):
                print("  Opponent must place at least one coaster first.")
                return False
            self.phase = "bidding"

        self.current_bid = val
        self.bidder = cp
        self._add_log(f"{self.players[cp - 1]} bids {val}.")

        if val == self._total_on_stacks():
            self._add_log(f"Max bid! {self.players[cp - 1]} must flip.")
            self.phase = "flipping"
            self.current_player = cp
            return True

        return True

    def _do_pass(self, cp):
        if self.phase != "bidding":
            return False
        self._add_log(f"{self.players[cp - 1]} passes.")
        self.phase = "flipping"
        self.current_player = self.bidder
        return True

    def _do_flip(self):
        """Execute the flipping phase."""
        bidder = self.bidder
        opp = self._opponent(bidder)
        to_flip = self.current_bid
        flipped = 0

        clear_screen()
        self.display()
        print(f"  {self.players[bidder - 1]} must flip {to_flip} coaster(s).\n")

        # Must flip own stack first (top to bottom)
        own = list(self.stacks[bidder])
        while own and flipped < to_flip:
            coaster = own.pop()
            flipped += 1
            print(f"  Flip your coaster #{flipped}: {coaster.upper()}")
            if coaster == "skull":
                self._add_log(f"{self.players[bidder - 1]} hit their OWN skull!")
                print(f"\n  You hit your own skull!")
                self._penalty(bidder, own_skull=True)
                self.phase = "round_over"
                input_with_quit("\n  Press Enter to continue... ")
                return True

        # Then flip opponent's stack (top to bottom)
        opp_stack = list(self.stacks[opp])
        while flipped < to_flip and opp_stack:
            coaster = opp_stack.pop()
            flipped += 1
            print(f"  Flip {self.players[opp - 1]}'s coaster #{flipped}: {coaster.upper()}")
            if coaster == "skull":
                self._add_log(f"{self.players[bidder - 1]} hit {self.players[opp - 1]}'s skull!")
                print(f"\n  You hit a skull!")
                self._penalty(bidder, own_skull=False)
                self.phase = "round_over"
                input_with_quit("\n  Press Enter to continue... ")
                return True

        # All flipped successfully
        self.wins[bidder] += 1
        self._add_log(
            f"{self.players[bidder - 1]} flipped {to_flip} coaster(s) successfully! "
            f"Wins: {self.wins[bidder]}/{self.wins_needed}"
        )
        print(f"\n  Success! Flipped {to_flip} coaster(s) without a skull!")
        print(f"  Wins: {self.wins[bidder]}/{self.wins_needed}")
        self.phase = "round_over"
        input_with_quit("\n  Press Enter to continue... ")
        return True

    def _penalty(self, loser, own_skull):
        """Lose a coaster after hitting a skull."""
        if own_skull:
            print(f"\n  {self.players[loser - 1]}, choose a coaster to lose.")
            self._choose_remove(loser)
        else:
            opp = self._opponent(loser)
            print(f"  {self.players[opp - 1]} removes one of your coasters (face-down).")
            self._random_remove(loser)

    def _choose_remove(self, player):
        if len(self.coasters[player]) <= 1:
            if self.coasters[player]:
                lost = self.coasters[player].pop(0)
                self._add_log(f"{self.players[player - 1]} lost their last coaster ({lost}).")
                print(f"  Lost your last coaster ({lost}).")
            return
        print(f"  Your coasters:")
        for i, c in enumerate(self.coasters[player], 1):
            print(f"    {i}. {c}")
        while True:
            choice = input_with_quit("  Choose number to lose: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(self.coasters[player]):
                lost = self.coasters[player].pop(int(choice) - 1)
                self._add_log(f"{self.players[player - 1]} lost a {lost}.")
                print(f"  You lost a {lost}.")
                return
            print("  Invalid choice.")

    def _random_remove(self, player):
        if not self.coasters[player]:
            return
        idx = random.randint(0, len(self.coasters[player]) - 1)
        lost = self.coasters[player].pop(idx)
        self._add_log(f"{self.players[player - 1]} lost a coaster (removed face-down).")
        print(f"  A coaster was removed from your collection.")

    def _do_next_round(self):
        for p in (1, 2):
            if not self.coasters[p]:
                self.game_over = True
                self.winner = self._opponent(p)
                return True
        self._start_new_round()
        return True

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        if self.phase == "flipping":
            self.current_player = self.bidder
        elif self.phase == "round_over":
            pass
        else:
            super().switch_player()

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        for p in (1, 2):
            if self.wins[p] >= self.wins_needed:
                self.game_over = True
                self.winner = p
                return
        for p in (1, 2):
            if not self.coasters[p]:
                self.game_over = True
                self.winner = self._opponent(p)
                return

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "coasters": {str(k): list(v) for k, v in self.coasters.items()},
            "stacks": {str(k): list(v) for k, v in self.stacks.items()},
            "wins": {str(k): v for k, v in self.wins.items()},
            "phase": self.phase,
            "has_placed": {str(k): v for k, v in self.has_placed.items()},
            "current_bid": self.current_bid,
            "bidder": self.bidder,
            "passed": {str(k): v for k, v in self.passed.items()},
            "log": list(self.log),
            "wins_needed": self.wins_needed,
        }

    def load_state(self, state):
        self.coasters = {int(k): list(v) for k, v in state["coasters"].items()}
        self.stacks = {int(k): list(v) for k, v in state["stacks"].items()}
        self.wins = {int(k): v for k, v in state["wins"].items()}
        self.phase = state["phase"]
        self.has_placed = {int(k): v for k, v in state["has_placed"].items()}
        self.current_bid = state["current_bid"]
        self.bidder = state["bidder"]
        self.passed = {int(k): v for k, v in state["passed"].items()}
        self.log = list(state.get("log", []))
        self.wins_needed = state.get("wins_needed", 2)

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        if self.variation == "team":
            coaster_info = "6 coasters (4 roses, 2 skulls)"
        else:
            coaster_info = "4 coasters (3 roses, 1 skull)"

        return (
            f"\n{'=' * 58}\n"
            f"  SKULL & ROSES - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Each player starts with {coaster_info}.\n"
            f"  Win by successfully flipping coasters twice\n"
            f"  without hitting a skull, or when your opponent\n"
            f"  loses all their coasters.\n\n"
            f"  PHASE 1 - PLACING:\n"
            f"  Take turns placing coasters face-down on your stack.\n"
            f"  Each player must place at least one coaster.\n"
            f"  You can bluff by placing your skull early or late.\n"
            f"  Commands: 'rose', 'skull'\n\n"
            f"  PHASE 2 - BIDDING:\n"
            f"  After placing, bid how many coasters you can flip\n"
            f"  across both stacks without hitting a skull.\n"
            f"  Opponents can raise or pass.\n"
            f"  Commands: 'bid <number>', 'pass'\n\n"
            f"  PHASE 3 - FLIPPING:\n"
            f"  The highest bidder flips that many coasters.\n"
            f"  You MUST flip all your own coasters first (top\n"
            f"  to bottom), then flip opponent's from the top.\n\n"
            f"  HITTING A SKULL:\n"
            f"  - Hit YOUR skull: you choose which coaster to lose.\n"
            f"  - Hit OPPONENT'S skull: they choose which of YOUR\n"
            f"    coasters to remove (face-down, random).\n"
            f"  Lost coasters are gone forever!\n\n"
            f"  WINNING:\n"
            f"  - Successfully flip {self.wins_needed} times  OR\n"
            f"  - Opponent loses all their coasters.\n\n"
            f"  STRATEGY:\n"
            f"  - Place your skull, then bid high to force your\n"
            f"    opponent to flip it.\n"
            f"  - Or place all roses and bid confidently.\n"
            f"  - Watch your opponent's bidding patterns!\n\n"
            f"  COMMANDS:\n"
            f"  'quit' - Exit    'save' - Save game\n"
            f"  'help' - Help    'tutorial' - This tutorial\n"
            f"{'=' * 58}"
        )
