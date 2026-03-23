"""Perudo (Dudo) - Classic liar's dice bluffing game for 2-4 players."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class PerudoGame(BaseGame):
    """Perudo/Dudo - bid on hidden dice, challenge or call exact."""

    name = "Perudo"
    description = "Liar's dice bluffing game - bid, bluff, and call Dudo"
    min_players = 2
    max_players = 4
    variations = {
        "standard": "Standard Perudo with ones wild (Aces/Palifico rules)",
        "calza": "Calza variant - call exact match to gain a die",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_players = 2
        self.dice_per_player = {}
        self.dice = {}
        self.current_bid = None
        self.bidder = None
        self.phase = "bidding"
        self.log = []
        self.round_number = 0
        self.round_starter = 1
        self.eliminated = set()
        self.palifico_round = False

    def setup(self):
        self.num_players = len(self.players)
        self.dice_per_player = {p: 5 for p in range(1, self.num_players + 1)}
        self.dice = {p: [] for p in range(1, self.num_players + 1)}
        self.current_bid = None
        self.bidder = None
        self.phase = "bidding"
        self.log = []
        self.round_number = 0
        self.round_starter = 1
        self.eliminated = set()
        self.palifico_round = False
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1
        self._roll_all_dice()

    def _roll_all_dice(self):
        """Roll dice for all active players."""
        for p in range(1, self.num_players + 1):
            if p not in self.eliminated:
                self.dice[p] = sorted(
                    [random.randint(1, 6) for _ in range(self.dice_per_player[p])]
                )
        self.round_number += 1
        # Check if this is a palifico round (a player just went to 1 die)
        self.palifico_round = any(
            self.dice_per_player[p] == 1
            for p in range(1, self.num_players + 1)
            if p not in self.eliminated
        )

    def _total_dice(self):
        """Total dice in play across all players."""
        return sum(
            self.dice_per_player[p]
            for p in range(1, self.num_players + 1)
            if p not in self.eliminated
        )

    def _active_players(self):
        """Return list of active player numbers."""
        return [
            p for p in range(1, self.num_players + 1) if p not in self.eliminated
        ]

    def _next_active_player(self, player):
        """Get next active player after given player."""
        active = self._active_players()
        if not active:
            return None
        idx = active.index(player) if player in active else 0
        return active[(idx + 1) % len(active)]

    def _count_face(self, face_value):
        """Count dice showing face_value. In standard, ones are wild (unless palifico)."""
        count = 0
        for p in self._active_players():
            for d in self.dice[p]:
                if d == face_value:
                    count += 1
                elif (
                    d == 1
                    and face_value != 1
                    and not self.palifico_round
                ):
                    count += 1
        return count

    def _is_valid_bid(self, quantity, face_value):
        """Check if a bid is valid (must be higher than current bid)."""
        if face_value < 1 or face_value > 6:
            return False
        if quantity < 1 or quantity > self._total_dice():
            return False
        if self.current_bid is None:
            return True
        cur_qty, cur_face = self.current_bid

        if self.palifico_round:
            # Palifico: same face, must increase quantity only
            if face_value != cur_face:
                return False
            return quantity > cur_qty

        # Standard/Calza bidding rules with wild ones
        if cur_face == 1 and face_value == 1:
            return quantity > cur_qty
        elif cur_face == 1 and face_value != 1:
            return quantity >= 2 * cur_qty + 1
        elif cur_face != 1 and face_value == 1:
            min_qty = (cur_qty + 1) // 2
            return quantity >= min_qty
        else:
            if quantity > cur_qty:
                return True
            if quantity == cur_qty and face_value > cur_face:
                return True
            return False

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 15:
            self.log = self.log[-15:]

    def _face_str(self, face_value):
        faces = {1: "Aces", 2: "2s", 3: "3s", 4: "4s", 5: "5s", 6: "6s"}
        return faces.get(face_value, str(face_value))

    def _dice_str(self, dice_list):
        if not dice_list:
            return "none"
        return " ".join(f"[{d}]" for d in dice_list)

    def _hidden_dice_str(self, count):
        if count == 0:
            return "none"
        return " ".join("[?]" for _ in range(count))

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 56}")
        print(f"  PERUDO  (Round {self.round_number})")
        print(f"{'=' * 56}")

        if self.palifico_round:
            print("  *** PALIFICO ROUND *** (Ones NOT wild, same face only)")
        elif not self.palifico_round:
            print("  (Ones are WILD)")

        print(f"  Total dice in play: {self._total_dice()}")
        print()

        # Show all players
        for p in range(1, self.num_players + 1):
            if p in self.eliminated:
                print(f"  {self.players[p - 1]}: ELIMINATED")
                continue
            marker = " (you)" if p == cp else ""
            if p == cp:
                print(
                    f"  {self.players[p - 1]}{marker}: "
                    f"{self.dice_per_player[p]} dice -> {self._dice_str(self.dice[p])}"
                )
            else:
                print(
                    f"  {self.players[p - 1]}{marker}: "
                    f"{self.dice_per_player[p]} dice -> {self._hidden_dice_str(self.dice_per_player[p])}"
                )

        print()
        if self.current_bid:
            qty, face = self.current_bid
            bidder_name = self.players[self.bidder - 1]
            print(f"  Current bid: {qty}x {self._face_str(face)} (by {bidder_name})")
        else:
            print("  No bid yet -- you open the round.")

        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-6:]:
                print(f"  {line}")
        print()

    # ---------------------------------------------------------------- get_move
    def get_move(self):
        if self.phase == "round_over":
            input_with_quit("  Press Enter to start next round... ")
            return "next_round"

        cp = self.current_player
        options = []
        if self.current_bid is None:
            print(f"  Open the bidding: bid <quantity> <face>")
            print(f"  Example: 'bid 3 4' = at least three 4s among all dice")
        else:
            options.append("'dudo' - challenge the bid")
            if self.variation == "calza":
                options.append("'calza' - claim bid is exactly right")
            options.append("'bid <qty> <face>' - raise the bid")
            print(f"  Options: {', '.join(options)}")

        while True:
            move = input_with_quit("  > ").strip().lower()

            if move in ("dudo", "liar", "liar!"):
                if self.current_bid is None:
                    print("  No bid to challenge. You must bid first.")
                    continue
                return "dudo"

            if move == "calza":
                if self.variation != "calza":
                    print("  Calza is only available in the 'calza' variation.")
                    continue
                if self.current_bid is None:
                    print("  No bid to call calza on.")
                    continue
                if self.bidder == cp:
                    print("  You cannot calza your own bid.")
                    continue
                return "calza"

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
                if not self._is_valid_bid(quantity, face_value):
                    if self.current_bid:
                        cur_qty, cur_face = self.current_bid
                        print(f"  Bid must be higher than {cur_qty}x {self._face_str(cur_face)}.")
                        if self.palifico_round:
                            print("  (Palifico: must keep same face, increase quantity)")
                    else:
                        print("  Invalid bid.")
                    continue
                return f"bid {quantity} {face_value}"

            print("  Enter 'bid <qty> <face>', 'dudo'"
                  + (", or 'calza'" if self.variation == "calza" else "")
                  + ".")

    # ---------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player
        if move == "next_round":
            return self._do_next_round()
        elif move == "dudo":
            return self._do_dudo(cp)
        elif move == "calza":
            return self._do_calza(cp)
        elif move.startswith("bid"):
            parts = move.split()
            return self._do_bid(cp, int(parts[1]), int(parts[2]))
        return False

    def _do_bid(self, cp, quantity, face_value):
        self.current_bid = (quantity, face_value)
        self.bidder = cp
        self._add_log(f"{self.players[cp - 1]} bids {quantity}x {self._face_str(face_value)}")
        return True

    def _do_dudo(self, cp):
        """Challenge the current bid."""
        qty, face = self.current_bid
        actual = self._count_face(face)

        clear_screen()
        self.display()
        print(f"  {self.players[cp - 1]} calls DUDO!")
        print(f"  Bid was: {qty}x {self._face_str(face)}")
        print()
        for p in self._active_players():
            print(f"  {self.players[p - 1]}'s dice: {self._dice_str(self.dice[p])}")
        wild = " (ones wild)" if not self.palifico_round and face != 1 else ""
        print(f"\n  Actual count of {self._face_str(face)}: {actual}{wild}")
        print()

        if actual >= qty:
            loser = cp
            print(f"  Bid was correct! {self.players[loser - 1]} loses a die.")
        else:
            loser = self.bidder
            print(f"  Bid was a LIE! {self.players[loser - 1]} loses a die.")

        self.dice_per_player[loser] -= 1
        self._add_log(
            f"DUDO! Actual {self._face_str(face)}: {actual}. "
            f"{self.players[loser - 1]} loses a die ({self.dice_per_player[loser]} left)."
        )

        if self.dice_per_player[loser] <= 0:
            self.eliminated.add(loser)
            print(f"  {self.players[loser - 1]} is ELIMINATED!")
            self.round_starter = self._next_active_player(loser)
        else:
            self.round_starter = loser

        self.phase = "round_over"
        input_with_quit("\n  Press Enter to continue... ")
        return True

    def _do_calza(self, cp):
        """Claim the bid is exactly right (calza variant)."""
        qty, face = self.current_bid
        actual = self._count_face(face)

        clear_screen()
        self.display()
        print(f"  {self.players[cp - 1]} calls CALZA!")
        print(f"  Bid was: {qty}x {self._face_str(face)}")
        print()
        for p in self._active_players():
            print(f"  {self.players[p - 1]}'s dice: {self._dice_str(self.dice[p])}")
        print(f"\n  Actual count of {self._face_str(face)}: {actual}")
        print()

        if actual == qty:
            if self.dice_per_player[cp] < 5:
                self.dice_per_player[cp] += 1
                print(f"  CALZA correct! {self.players[cp - 1]} gains a die! "
                      f"({self.dice_per_player[cp]} dice)")
            else:
                print(f"  CALZA correct! But already at 5 dice (max).")
            self._add_log(f"CALZA! {self.players[cp - 1]} was right ({actual} = {qty})")
            self.round_starter = cp
        else:
            self.dice_per_player[cp] -= 1
            print(f"  Wrong! Actual was {actual}, not {qty}. "
                  f"{self.players[cp - 1]} loses a die.")
            self._add_log(
                f"CALZA wrong! {self.players[cp - 1]} loses a die "
                f"({actual} != {qty})"
            )
            if self.dice_per_player[cp] <= 0:
                self.eliminated.add(cp)
                print(f"  {self.players[cp - 1]} is ELIMINATED!")
                self.round_starter = self._next_active_player(cp)
            else:
                self.round_starter = cp

        self.phase = "round_over"
        input_with_quit("\n  Press Enter to continue... ")
        return True

    def _do_next_round(self):
        active = self._active_players()
        if len(active) <= 1:
            self.game_over = True
            if active:
                self.winner = active[0]
            return True

        self.current_bid = None
        self.bidder = None
        self.phase = "bidding"
        if self.round_starter and self.round_starter not in self.eliminated:
            self.current_player = self.round_starter
        else:
            self.current_player = active[0]
        self._roll_all_dice()
        return True

    def switch_player(self):
        if self.phase == "round_over":
            return
        active = self._active_players()
        if len(active) <= 1:
            return
        idx = active.index(self.current_player)
        self.current_player = active[(idx + 1) % len(active)]

    def check_game_over(self):
        active = self._active_players()
        if len(active) <= 1:
            self.game_over = True
            self.winner = active[0] if active else None

    def get_state(self):
        return {
            "num_players": self.num_players,
            "dice_per_player": {str(k): v for k, v in self.dice_per_player.items()},
            "dice": {str(k): v for k, v in self.dice.items()},
            "current_bid": list(self.current_bid) if self.current_bid else None,
            "bidder": self.bidder,
            "phase": self.phase,
            "log": list(self.log),
            "round_number": self.round_number,
            "round_starter": self.round_starter,
            "eliminated": list(self.eliminated),
            "palifico_round": self.palifico_round,
        }

    def load_state(self, state):
        self.num_players = state["num_players"]
        self.dice_per_player = {int(k): v for k, v in state["dice_per_player"].items()}
        self.dice = {int(k): v for k, v in state["dice"].items()}
        bid = state.get("current_bid")
        self.current_bid = tuple(bid) if bid else None
        self.bidder = state.get("bidder")
        self.phase = state.get("phase", "bidding")
        self.log = list(state.get("log", []))
        self.round_number = state.get("round_number", 1)
        self.round_starter = state.get("round_starter", 1)
        self.eliminated = set(state.get("eliminated", []))
        self.palifico_round = state.get("palifico_round", False)

    def get_tutorial(self):
        calza_info = ""
        if self.variation == "calza":
            calza_info = (
                "  CALZA:\n"
                "  Any player (except the bidder) can call 'calza' to claim\n"
                "  the bid is exactly right. If correct, gain a die (max 5).\n"
                "  If wrong, lose a die.\n\n"
            )

        return (
            f"\n{'=' * 58}\n"
            f"  PERUDO (Dudo) - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Each player starts with 5 dice hidden under a cup.\n"
            f"  Players bid on the total count of a face value across\n"
            f"  ALL players' dice. Ones (aces) are wild in normal rounds.\n"
            f"  Last player with dice wins!\n\n"
            f"  BIDDING:\n"
            f"  A bid is quantity + face: 'bid 3 4' = at least three 4s.\n"
            f"  Each bid must be higher than the previous.\n"
            f"  Raise quantity, or keep quantity and raise face value.\n"
            f"  Special rules for aces (since they are wild):\n"
            f"    - Bid aces from non-aces: need ceil(current_qty/2)\n"
            f"    - Bid non-aces from aces: need 2*qty+1\n\n"
            f"  DUDO (CHALLENGE):\n"
            f"  Call 'dudo' to challenge the current bid.\n"
            f"  All dice revealed. If bid correct: challenger loses a die.\n"
            f"  If bid wrong: bidder loses a die.\n\n"
            f"{calza_info}"
            f"  PALIFICO:\n"
            f"  When a player is reduced to 1 die, the next round is a\n"
            f"  Palifico round: ones are NOT wild and you must bid the\n"
            f"  same face value (only increase quantity).\n\n"
            f"  COMMANDS:\n"
            f"  'bid <qty> <face>'  - Place a bid\n"
            f"  'dudo'              - Challenge the current bid\n"
            + ("  'calza'             - Claim bid is exactly right\n"
               if self.variation == "calza" else "") +
            f"  'quit'              - Exit game\n"
            f"  'save'              - Save and suspend\n"
            f"  'help'              - Show help\n"
            f"  'tutorial'          - Show this tutorial\n"
            f"{'=' * 58}"
        )
