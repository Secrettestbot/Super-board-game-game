"""Liar's Dice (Perudo) - A bluffing dice game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class LiarsDiceGame(BaseGame):
    """Liar's Dice (Perudo) - bid, bluff, and call liars."""

    name = "Liar's Dice"
    description = "Bluffing dice game -- bid or call liar"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (ones are wild)",
        "exact": "Exact (ones not wild, can call exact)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Number of dice each player currently has
        self.dice_count = {1: 5, 2: 5}
        # Current dice rolls (hidden from opponent)
        self.dice = {1: [], 2: []}
        # Current bid: (quantity, face_value) or None
        self.current_bid = None
        # Who placed the current bid
        self.bidder = None
        # Phase: "bidding", "round_over"
        self.phase = "bidding"
        # Log of recent events
        self.log = []
        # Round number
        self.round_number = 0
        # Who starts the next round
        self.round_starter = 1

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 12:
            self.log = self.log[-12:]

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.dice_count = {1: 5, 2: 5}
        self.dice = {1: [], 2: []}
        self.current_bid = None
        self.bidder = None
        self.phase = "bidding"
        self.log = []
        self.round_number = 0
        self.round_starter = 1
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1
        self._roll_dice()

    def _roll_dice(self):
        """Roll all dice for both players."""
        for p in (1, 2):
            self.dice[p] = sorted([random.randint(1, 6) for _ in range(self.dice_count[p])])
        self.round_number += 1

    def _total_dice(self):
        """Total dice in play across both players."""
        return self.dice_count[1] + self.dice_count[2]

    def _count_face(self, face_value):
        """Count how many dice show face_value across all players.

        In standard mode, ones are wild and count toward any face value.
        """
        count = 0
        for p in (1, 2):
            for d in self.dice[p]:
                if d == face_value:
                    count += 1
                elif d == 1 and self.variation == "standard" and face_value != 1:
                    count += 1
        return count

    def _is_valid_bid(self, quantity, face_value):
        """Check if a bid is valid (must be higher than current bid)."""
        if face_value < 1 or face_value > 6:
            return False
        if quantity < 1:
            return False
        if quantity > self._total_dice():
            return False
        if self.current_bid is None:
            return True
        cur_qty, cur_face = self.current_bid

        if self.variation == "standard":
            # Special rules for ones (wild): bidding on ones requires
            # half the quantity (rounded up), and raising from ones
            # requires doubling + 1.
            if cur_face == 1 and face_value == 1:
                # Raising ones: must increase quantity
                return quantity > cur_qty
            elif cur_face == 1 and face_value != 1:
                # Moving from ones to non-ones: quantity must be
                # at least 2*cur_qty + 1
                return quantity >= 2 * cur_qty + 1
            elif cur_face != 1 and face_value == 1:
                # Moving from non-ones to ones: quantity must be
                # at least ceil(cur_qty / 2)
                min_qty = (cur_qty + 1) // 2
                return quantity >= min_qty
            else:
                # Both non-ones: increase quantity, or same quantity
                # with higher face
                if quantity > cur_qty:
                    return True
                if quantity == cur_qty and face_value > cur_face:
                    return True
                return False
        else:
            # Exact variation: no wild ones, simple increasing bids
            if quantity > cur_qty:
                return True
            if quantity == cur_qty and face_value > cur_face:
                return True
            return False

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 54}")
        print(f"  LIAR'S DICE  (Round {self.round_number})")
        print(f"{'=' * 54}")

        wild_note = "  (Ones are WILD)" if self.variation == "standard" else "  (No wild dice)"
        print(wild_note)

        # Opponent info
        print(f"\n  {self.players[opp - 1]}:")
        print(f"    Dice remaining : {self.dice_count[opp]}")
        print(f"    Dice           : {self._hidden_dice_str(self.dice_count[opp])}")

        # Divider
        print(f"\n  {'- ' * 25}")

        # Current player info
        print(f"\n  {self.players[cp - 1]} (you):")
        print(f"    Dice remaining : {self.dice_count[cp]}")
        print(f"    Your dice      : {self._dice_str(self.dice[cp])}")

        # Bid info
        if self.current_bid:
            qty, face = self.current_bid
            bidder_name = self.players[self.bidder - 1]
            print(f"\n  Current bid: {qty}x {self._face_str(face)} (by {bidder_name})")
        else:
            print(f"\n  No bid yet -- you open the round.")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-6:]:
                print(f"  {line}")

        print()

    def _dice_str(self, dice_list):
        """Display dice as bracketed numbers."""
        if not dice_list:
            return "none"
        return " ".join(f"[{d}]" for d in dice_list)

    def _hidden_dice_str(self, count):
        """Display hidden dice as question marks."""
        if count == 0:
            return "none"
        return " ".join("[?]" for _ in range(count))

    def _face_str(self, face_value):
        """Return a readable face value string."""
        faces = {1: "1s (ones)", 2: "2s (twos)", 3: "3s (threes)",
                 4: "4s (fours)", 5: "5s (fives)", 6: "6s (sixes)"}
        return faces.get(face_value, str(face_value))

    # -------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if self.phase == "round_over":
            input_with_quit("  Press Enter to start next round... ")
            return "next_round"

        if self.phase == "bidding":
            return self._get_bidding_move(cp)

        return None

    def _get_bidding_move(self, cp):
        options = []
        if self.current_bid is None:
            print(f"  You open the bidding. Enter: bid <quantity> <face>")
            print(f"  Example: 'bid 3 4' means \"there are at least three 4s\"")
        else:
            options.append("'liar' (challenge the bid)")
            if self.variation == "exact":
                options.append("'exact' (claim bid is exactly right)")
            options.append("'bid <quantity> <face>' (raise the bid)")
            print(f"  Options: {', '.join(options)}")

        while True:
            move = input_with_quit("  > ").strip().lower()

            if move == "liar" or move == "liar!":
                if self.current_bid is None:
                    print("  No bid to challenge yet. You must bid first.")
                    continue
                return "liar"

            if move == "exact":
                if self.variation != "exact":
                    print("  Exact calls are only available in the 'exact' variation.")
                    continue
                if self.current_bid is None:
                    print("  No bid to call exact on. You must bid first.")
                    continue
                return "exact"

            if move.startswith("bid"):
                parts = move.split()
                if len(parts) != 3:
                    print("  Usage: bid <quantity> <face>  (e.g., 'bid 3 4')")
                    continue
                if not parts[1].isdigit() or not parts[2].isdigit():
                    print("  Quantity and face must be numbers.")
                    continue
                quantity = int(parts[1])
                face_value = int(parts[2])
                if face_value < 1 or face_value > 6:
                    print("  Face value must be 1-6.")
                    continue
                if quantity < 1:
                    print("  Quantity must be at least 1.")
                    continue
                if quantity > self._total_dice():
                    print(f"  Quantity cannot exceed total dice in play ({self._total_dice()}).")
                    continue
                if not self._is_valid_bid(quantity, face_value):
                    if self.current_bid:
                        cur_qty, cur_face = self.current_bid
                        print(f"  Bid must be higher than {cur_qty}x {self._face_str(cur_face)}.")
                        if self.variation == "standard":
                            print("  (Increase quantity, or keep quantity and raise face value.)")
                            print("  (To bid ones: need at least ceil(current_qty/2). "
                                  "From ones: need 2*qty+1.)")
                    else:
                        print("  Invalid bid.")
                    continue
                return f"bid {quantity} {face_value}"

            if self.current_bid is None:
                print("  You must place the opening bid. Usage: bid <quantity> <face>")
            else:
                print("  Enter 'bid <qty> <face>', 'liar'"
                      + (", or 'exact'" if self.variation == "exact" else "")
                      + ".")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player

        if move == "next_round":
            return self._do_next_round()
        elif move == "liar":
            return self._do_liar_call(cp)
        elif move == "exact":
            return self._do_exact_call(cp)
        elif move.startswith("bid"):
            parts = move.split()
            quantity = int(parts[1])
            face_value = int(parts[2])
            return self._do_bid(cp, quantity, face_value)
        return False

    def _do_bid(self, cp, quantity, face_value):
        self.current_bid = (quantity, face_value)
        self.bidder = cp
        self._add_log(f"{self.players[cp - 1]} bids {quantity}x {self._face_str(face_value)}.")
        return True

    def _do_liar_call(self, cp):
        """Current player challenges the bid as a lie."""
        challenger = cp
        bidder = self.bidder
        qty, face = self.current_bid
        actual = self._count_face(face)

        clear_screen()
        self.display()
        print(f"  {self.players[challenger - 1]} calls LIAR!")
        print(f"  Bid was: {qty}x {self._face_str(face)}")
        print()
        print(f"  {self.players[1 - 1]}'s dice: {self._dice_str(self.dice[1])}")
        print(f"  {self.players[2 - 1]}'s dice: {self._dice_str(self.dice[2])}")
        print()
        wild_note = " (ones are wild)" if self.variation == "standard" and face != 1 else ""
        print(f"  Actual count of {self._face_str(face)}: {actual}{wild_note}")
        print()

        if actual >= qty:
            # Bid was valid -- challenger loses a die
            loser = challenger
            print(f"  The bid was correct! {self.players[loser - 1]} loses a die.")
        else:
            # Bid was a lie -- bidder loses a die
            loser = bidder
            print(f"  The bid was a LIE! {self.players[loser - 1]} loses a die.")

        self._add_log(f"{self.players[challenger - 1]} called LIAR! "
                      f"Actual {self._face_str(face)}: {actual}. "
                      f"{self.players[loser - 1]} loses a die.")

        self.dice_count[loser] -= 1
        print(f"  {self.players[loser - 1]} now has {self.dice_count[loser]} dice.")
        self.round_starter = loser
        self.phase = "round_over"
        input_with_quit("\n  Press Enter to continue... ")
        return True

    def _do_exact_call(self, cp):
        """Current player claims the bid is exactly right (exact variation only)."""
        caller = cp
        qty, face = self.current_bid
        actual = self._count_face(face)

        clear_screen()
        self.display()
        print(f"  {self.players[caller - 1]} calls EXACT!")
        print(f"  Bid was: {qty}x {self._face_str(face)}")
        print()
        print(f"  {self.players[1 - 1]}'s dice: {self._dice_str(self.dice[1])}")
        print(f"  {self.players[2 - 1]}'s dice: {self._dice_str(self.dice[2])}")
        print()
        print(f"  Actual count of {self._face_str(face)}: {actual}")
        print()

        if actual == qty:
            # Exact call is correct -- caller gains a die (up to 5)
            if self.dice_count[caller] < 5:
                self.dice_count[caller] += 1
                print(f"  EXACT! {self.players[caller - 1]} gains a die! "
                      f"Now has {self.dice_count[caller]}.")
            else:
                print(f"  EXACT! But {self.players[caller - 1]} already has 5 dice (max).")
            self._add_log(f"{self.players[caller - 1]} called EXACT and was correct! "
                          f"({actual} = {qty})")
            self.round_starter = caller
        else:
            # Exact call is wrong -- caller loses a die
            self.dice_count[caller] -= 1
            print(f"  Wrong! Actual was {actual}, not {qty}. "
                  f"{self.players[caller - 1]} loses a die.")
            print(f"  {self.players[caller - 1]} now has {self.dice_count[caller]} dice.")
            self._add_log(f"{self.players[caller - 1]} called EXACT but was wrong! "
                          f"({actual} != {qty}). Lost a die.")
            self.round_starter = caller

        self.phase = "round_over"
        input_with_quit("\n  Press Enter to continue... ")
        return True

    def _do_next_round(self):
        """Start a new round."""
        # Check for elimination
        for p in (1, 2):
            if self.dice_count[p] <= 0:
                self.game_over = True
                self.winner = self._opponent(p)
                return True

        self.current_bid = None
        self.bidder = None
        self.phase = "bidding"
        self.current_player = self.round_starter
        self._roll_dice()
        return True

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        """Override to handle phase-specific switching."""
        if self.phase == "round_over":
            # Don't switch during round_over
            pass
        else:
            super().switch_player()

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        for p in (1, 2):
            if self.dice_count[p] <= 0:
                self.game_over = True
                self.winner = self._opponent(p)
                return

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "dice_count": {str(k): v for k, v in self.dice_count.items()},
            "dice": {str(k): list(v) for k, v in self.dice.items()},
            "current_bid": list(self.current_bid) if self.current_bid else None,
            "bidder": self.bidder,
            "phase": self.phase,
            "log": list(self.log),
            "round_number": self.round_number,
            "round_starter": self.round_starter,
        }

    def load_state(self, state):
        self.dice_count = {int(k): v for k, v in state["dice_count"].items()}
        self.dice = {int(k): list(v) for k, v in state["dice"].items()}
        bid = state.get("current_bid")
        self.current_bid = tuple(bid) if bid else None
        self.bidder = state.get("bidder")
        self.phase = state.get("phase", "bidding")
        self.log = list(state.get("log", []))
        self.round_number = state.get("round_number", 1)
        self.round_starter = state.get("round_starter", 1)

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        if self.variation == "exact":
            wild_info = "Ones are NOT wild -- they count only as ones."
            exact_info = (
                "  EXACT CALL:\n"
                "  You can call 'exact' to claim the bid is exactly right.\n"
                "  If correct: you gain a die (up to 5 max).\n"
                "  If wrong: you lose a die.\n\n"
            )
            bid_rules = (
                "  Raise quantity, or keep quantity and raise face value.\n"
            )
        else:
            wild_info = "Ones are WILD -- they count as any face value."
            exact_info = ""
            bid_rules = (
                "  Raise quantity, or keep quantity and raise face value.\n"
                "  Special rules for ones (since they are wild):\n"
                "    - To bid ones from non-ones: need ceil(current_qty / 2).\n"
                "    - To bid non-ones from ones: need 2 * current_qty + 1.\n"
            )

        return (
            f"\n{'=' * 58}\n"
            f"  LIAR'S DICE (Perudo) - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Each player starts with 5 dice. {wild_info}\n"
            f"  Roll your dice secretly. Bid on the total count of a face\n"
            f"  value across ALL dice in play. Bluff or call your opponent!\n"
            f"  Last player with dice wins.\n\n"
            f"  BIDDING:\n"
            f"  A bid is a quantity and a face value, e.g., 'bid 3 4'\n"
            f"  means \"there are at least three 4s among all dice\".\n"
            f"  {bid_rules}\n"
            f"  CHALLENGING:\n"
            f"  Type 'liar' to challenge the current bid.\n"
            f"  All dice are revealed and the face value is counted.\n"
            f"  If the bid was correct (actual >= bid): challenger loses a die.\n"
            f"  If the bid was wrong (actual < bid): bidder loses a die.\n\n"
            f"{exact_info}"
            f"  LOSING DICE:\n"
            f"  When you lose all your dice, you are eliminated.\n"
            f"  The last player with dice wins the game.\n\n"
            f"  COMMANDS:\n"
            f"  'bid <qty> <face>'  - Place a bid (e.g., 'bid 3 4')\n"
            f"  'liar'              - Challenge the current bid\n"
            + ("  'exact'             - Call exact (exact variation only)\n"
               if self.variation == "exact" else "") +
            f"  'quit'              - Exit game\n"
            f"  'save'              - Save game\n"
            f"  'help'              - Show help\n"
            f"  'tutorial'          - Show this tutorial\n"
            f"{'=' * 58}"
        )
