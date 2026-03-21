"""Coup - A bluffing card game of deduction and deception (2-player variant)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Card / role definitions per variation
ROLES_STANDARD = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]
ROLES_REFORMATION = ["Duke", "Assassin", "Captain", "Inquisitor", "Contessa"]

# Which role is required to perform each action
ACTION_ROLE = {
    "tax": "Duke",
    "assassinate": "Assassin",
    "steal": "Captain",
    "exchange": None,  # filled per variation
}

# Which roles can block which actions
BLOCK_RULES = {
    "foreign_aid": ["Duke"],
    "assassinate": ["Contessa"],
    "steal": ["Captain"],  # extended per variation
}


class CoupGame(BaseGame):
    """Coup - a bluffing card game of deduction and deception."""

    name = "Coup"
    description = "Bluff, deceive, and outmanoeuvre your opponent"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Coup",
        "reformation": "Reformation (with Inquisitor)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        # Per-player state: cards (list of str), coins (int), revealed (list of str)
        self.cards = {1: [], 2: []}
        self.coins = {1: 0, 2: 0}
        self.revealed = {1: [], 2: []}
        self.log = []  # recent action log lines
        self._pending_move = None  # used for multi-step resolution

        # Variation-specific role list
        if self.variation == "reformation":
            self.roles = list(ROLES_REFORMATION)
        else:
            self.roles = list(ROLES_STANDARD)

        # Build action->role mapping for this variation
        self.action_role = dict(ACTION_ROLE)
        self.exchange_role = "Ambassador" if self.variation != "reformation" else "Inquisitor"
        self.action_role["exchange"] = self.exchange_role
        if self.variation == "reformation":
            self.action_role["inquisite"] = "Inquisitor"

        # Build block rules for this variation
        self.block_rules = {
            "foreign_aid": ["Duke"],
            "assassinate": ["Contessa"],
            "steal": ["Captain", self.exchange_role],
        }

    # ------------------------------------------------------------------ helpers
    def _build_deck(self):
        """Create a 15-card deck (3 of each role)."""
        self.deck = []
        for role in self.roles:
            self.deck.extend([role] * 3)
        random.shuffle(self.deck)

    def _draw(self, n=1):
        """Draw n cards from the deck."""
        drawn = []
        for _ in range(n):
            if self.deck:
                drawn.append(self.deck.pop())
        return drawn

    def _return_to_deck(self, cards):
        """Return cards to the deck and shuffle."""
        self.deck.extend(cards)
        random.shuffle(self.deck)

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    def _alive(self, player):
        return len(self.cards[player]) > 0

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def _card_display(self, player, viewer):
        """Return display string for a player's cards from viewer's perspective."""
        if player == viewer:
            return ", ".join(self.cards[player]) if self.cards[player] else "(none)"
        else:
            return f"{len(self.cards[player])} face-down card(s)"

    # ------------------------------------------------- lose a card (interactive)
    def _force_lose_card(self, player):
        """Force a player to reveal and discard one card. Handles single-card auto."""
        if len(self.cards[player]) == 0:
            return
        if len(self.cards[player]) == 1:
            lost = self.cards[player].pop(0)
            self.revealed[player].append(lost)
            self._add_log(f"  {self.players[player - 1]} lost their {lost}.")
            return
        # Player chooses which card to lose
        print(f"\n  {self.players[player - 1]}, you must lose a card.")
        for i, c in enumerate(self.cards[player], 1):
            print(f"    {i}. {c}")
        while True:
            choice = input_with_quit("  Choose card number to discard: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(self.cards[player]):
                idx = int(choice) - 1
                lost = self.cards[player].pop(idx)
                self.revealed[player].append(lost)
                self._add_log(f"  {self.players[player - 1]} lost their {lost}.")
                return
            print("  Invalid choice.")

    # ----------------------------------------- challenge resolution (interactive)
    def _ask_challenge(self, acting_player, claimed_role, action_desc):
        """Ask opponent if they want to challenge a claimed role.

        Returns True if the action should proceed, False if it was successfully
        challenged (actor lost a card and action is cancelled).
        """
        opp = self._opponent(acting_player)
        print(f"\n  {self.players[acting_player - 1]} claims {claimed_role} to {action_desc}.")
        print(f"  {self.players[opp - 1]}, do you challenge? (challenge / allow): ", end="")
        while True:
            resp = input_with_quit("").strip().lower()
            if resp in ("challenge", "c"):
                return self._resolve_challenge(acting_player, claimed_role, opp)
            elif resp in ("allow", "a"):
                self._add_log(f"  {self.players[opp - 1]} allowed the {action_desc}.")
                return True
            print("  Enter 'challenge' or 'allow': ", end="")

    def _resolve_challenge(self, claimer, claimed_role, challenger):
        """Resolve a challenge. Returns True if claimer actually had the role."""
        if claimed_role in self.cards[claimer]:
            # Claimer had the role -- challenger loses a card
            self._add_log(f"  Challenge failed! {self.players[claimer - 1]} revealed {claimed_role}.")
            print(f"\n  {self.players[claimer - 1]} reveals {claimed_role} -- challenge fails!")
            # Shuffle the revealed card back and draw a new one
            self.cards[claimer].remove(claimed_role)
            self._return_to_deck([claimed_role])
            new_card = self._draw(1)
            self.cards[claimer].extend(new_card)
            self._force_lose_card(challenger)
            return True
        else:
            # Claimer was bluffing -- claimer loses a card
            self._add_log(f"  Challenge succeeded! {self.players[claimer - 1]} was bluffing.")
            print(f"\n  {self.players[claimer - 1]} does NOT have {claimed_role} -- challenge succeeds!")
            self._force_lose_card(claimer)
            return False

    # ------------------------------------------------ block resolution (interactive)
    def _ask_block(self, acting_player, action_name):
        """Give opponent a chance to block (and acting player a chance to challenge the block).

        Returns True if the action should proceed, False if blocked successfully.
        """
        blockers = self.block_rules.get(action_name)
        if not blockers:
            return True  # action cannot be blocked
        opp = self._opponent(acting_player)
        if not self._alive(opp):
            return True

        blocker_str = " or ".join(blockers)
        print(f"\n  {self.players[opp - 1]}, do you want to block? (block <role> / allow)")
        print(f"  Blockable with: {blocker_str}")
        while True:
            resp = input_with_quit("  > ").strip().lower()
            if resp in ("allow", "a"):
                return True
            parts = resp.split()
            if parts and parts[0] in ("block", "b"):
                # Determine claimed blocking role
                if len(parts) >= 2:
                    claimed = parts[1].capitalize()
                else:
                    if len(blockers) == 1:
                        claimed = blockers[0]
                    else:
                        print(f"  Specify role to block with: {blocker_str}")
                        continue
                if claimed not in blockers:
                    print(f"  {claimed} cannot block {action_name}. Use: {blocker_str}")
                    continue
                self._add_log(f"  {self.players[opp - 1]} blocks with {claimed}.")
                print(f"\n  {self.players[opp - 1]} claims {claimed} to block.")
                # Acting player may challenge the block
                print(f"  {self.players[acting_player - 1]}, challenge the block? (challenge / allow): ", end="")
                while True:
                    r2 = input_with_quit("").strip().lower()
                    if r2 in ("challenge", "c"):
                        if self._resolve_challenge(opp, claimed, acting_player):
                            # Blocker really had the role -- block stands
                            print("  Block stands. Action is cancelled.")
                            return False
                        else:
                            # Blocker was bluffing -- action proceeds
                            print("  Block fails. Action proceeds.")
                            return True
                    elif r2 in ("allow", "a"):
                        print("  Block accepted. Action is cancelled.")
                        return False
                    print("  Enter 'challenge' or 'allow': ", end="")
            else:
                print("  Enter 'block <role>' or 'allow'.")

    # ------------------------------------------------------------------ setup
    def setup(self):
        self._build_deck()
        for p in (1, 2):
            self.cards[p] = self._draw(2)
            self.coins[p] = 2
            self.revealed[p] = []
        self.log = []
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1

    # ---------------------------------------------------------------- display
    def display(self):
        opp = self._opponent()
        cp = self.current_player

        print(f"\n{'=' * 54}")
        print(f"  COUP  (Turn {self.turn_number + 1})")
        print(f"{'=' * 54}")

        # Opponent info (top)
        print(f"\n  {self.players[opp - 1]}:")
        print(f"    Cards : {self._card_display(opp, cp)}")
        if self.revealed[opp]:
            print(f"    Revealed: {', '.join(self.revealed[opp])}")
        print(f"    Coins : {self.coins[opp]}")

        print(f"\n  Deck: {len(self.deck)} card(s)")

        # Current player info (bottom)
        print(f"\n  {self.players[cp - 1]} (you):")
        print(f"    Cards : {self._card_display(cp, cp)}")
        if self.revealed[cp]:
            print(f"    Revealed: {', '.join(self.revealed[cp])}")
        print(f"    Coins : {self.coins[cp]}")

        # Action log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-6:]:
                print(f"  {line}")

        print()

    # -------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player
        must_coup = self.coins[cp] >= 10

        if must_coup:
            print("  You have 10+ coins -- you MUST coup.")
            input_with_quit("  Press Enter to coup... ")
            return "coup"

        actions = ["income", "foreign_aid", "coup", "tax", "assassinate", "steal", "exchange"]
        if self.variation == "reformation":
            actions.append("inquisite")
        print("  Actions: " + ", ".join(actions))

        while True:
            move = input_with_quit("  Your action: ").strip().lower()
            if move not in actions:
                print(f"  Unknown action. Choose from: {', '.join(actions)}")
                continue
            # Validate basic requirements
            if move == "coup" and self.coins[cp] < 7:
                print("  You need at least 7 coins to coup.")
                continue
            if move == "assassinate" and self.coins[cp] < 3:
                print("  You need at least 3 coins to assassinate.")
                continue
            if move == "steal" and self.coins[self._opponent()] == 0:
                print("  Opponent has no coins to steal.")
                continue
            return move

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player
        opp = self._opponent()

        if move == "income":
            self._do_income(cp)
        elif move == "foreign_aid":
            self._do_foreign_aid(cp)
        elif move == "coup":
            self._do_coup(cp, opp)
        elif move == "tax":
            self._do_tax(cp)
        elif move == "assassinate":
            self._do_assassinate(cp, opp)
        elif move == "steal":
            self._do_steal(cp, opp)
        elif move == "exchange":
            self._do_exchange(cp)
        elif move == "inquisite":
            self._do_inquisite(cp, opp)
        else:
            return False
        return True

    # --------------------------------------------------------- action methods
    def _do_income(self, cp):
        self.coins[cp] += 1
        self._add_log(f"{self.players[cp - 1]} takes Income (+1 coin).")

    def _do_foreign_aid(self, cp):
        self._add_log(f"{self.players[cp - 1]} attempts Foreign Aid (+2 coins).")
        # Can be blocked by Duke (no challenge on the action itself -- no role claimed)
        if not self._ask_block(cp, "foreign_aid"):
            return
        self.coins[cp] += 2
        self._add_log(f"{self.players[cp - 1]} receives 2 coins from Foreign Aid.")

    def _do_coup(self, cp, opp):
        self.coins[cp] -= 7
        self._add_log(f"{self.players[cp - 1]} pays 7 coins to Coup {self.players[opp - 1]}.")
        print(f"\n  {self.players[cp - 1]} coups {self.players[opp - 1]}!")
        self._force_lose_card(opp)

    def _do_tax(self, cp):
        # Claims Duke
        if not self._ask_challenge(cp, "Duke", "Tax (take 3 coins)"):
            return  # challenged successfully -- action cancelled
        self.coins[cp] += 3
        self._add_log(f"{self.players[cp - 1]} taxes +3 coins (Duke).")

    def _do_assassinate(self, cp, opp):
        self.coins[cp] -= 3  # pay upfront
        self._add_log(f"{self.players[cp - 1]} attempts to Assassinate {self.players[opp - 1]}.")
        # Challenge the Assassin claim
        if not self._ask_challenge(cp, "Assassin", "Assassinate"):
            return  # bluff caught, action cancelled (coins still spent)
        # Block with Contessa
        if not self._ask_block(cp, "assassinate"):
            return  # blocked
        # Success
        if self._alive(opp):
            print(f"\n  Assassination succeeds!")
            self._force_lose_card(opp)
            self._add_log(f"  Assassination of {self.players[opp - 1]} succeeds.")

    def _do_steal(self, cp, opp):
        self._add_log(f"{self.players[cp - 1]} attempts to Steal from {self.players[opp - 1]}.")
        if not self._ask_challenge(cp, "Captain", "Steal (take 2 coins)"):
            return
        if not self._ask_block(cp, "steal"):
            return
        stolen = min(2, self.coins[opp])
        self.coins[opp] -= stolen
        self.coins[cp] += stolen
        self._add_log(f"{self.players[cp - 1]} steals {stolen} coin(s) from {self.players[opp - 1]}.")

    def _do_exchange(self, cp):
        role = self.exchange_role
        self._add_log(f"{self.players[cp - 1]} attempts Exchange ({role}).")
        if not self._ask_challenge(cp, role, "Exchange (draw 2, keep 2)"):
            return
        # Draw 2 cards
        drawn = self._draw(2)
        hand = self.cards[cp] + drawn
        print(f"\n  You drew: {', '.join(drawn)}")
        print(f"  Your combined hand: {', '.join(hand)}")
        # Choose cards to keep (same number as currently held)
        keep_count = len(self.cards[cp])  # usually 1 or 2
        kept = []
        remaining = list(hand)
        for i in range(keep_count):
            print(f"  Choose card {i + 1} to KEEP:")
            for j, c in enumerate(remaining, 1):
                print(f"    {j}. {c}")
            while True:
                choice = input_with_quit("  Card number: ").strip()
                if choice.isdigit() and 1 <= int(choice) <= len(remaining):
                    idx = int(choice) - 1
                    kept.append(remaining.pop(idx))
                    break
                print("  Invalid choice.")
        self.cards[cp] = kept
        self._return_to_deck(remaining)
        self._add_log(f"{self.players[cp - 1]} exchanged cards ({role}).")

    def _do_inquisite(self, cp, opp):
        """Inquisitor action (reformation variant): look at one of opponent's cards
        and optionally force them to exchange it."""
        self._add_log(f"{self.players[cp - 1]} attempts Inquisition (Inquisitor).")
        if not self._ask_challenge(cp, "Inquisitor", "Inquisite (examine opponent's card)"):
            return
        if not self._alive(opp):
            return
        # Choose which card to look at if opponent has >1
        if len(self.cards[opp]) == 1:
            idx = 0
        else:
            print(f"\n  {self.players[opp - 1]} has {len(self.cards[opp])} cards. Choose one to examine:")
            for i in range(1, len(self.cards[opp]) + 1):
                print(f"    {i}. Card {i}")
            while True:
                choice = input_with_quit("  Card number: ").strip()
                if choice.isdigit() and 1 <= int(choice) <= len(self.cards[opp]):
                    idx = int(choice) - 1
                    break
                print("  Invalid choice.")
        seen = self.cards[opp][idx]
        print(f"\n  You see: {seen}")
        print("  Force opponent to exchange this card? (yes / no): ", end="")
        while True:
            resp = input_with_quit("").strip().lower()
            if resp in ("yes", "y"):
                self._return_to_deck([self.cards[opp].pop(idx)])
                new = self._draw(1)
                self.cards[opp].extend(new)
                self._add_log(f"  {self.players[opp - 1]}'s card was forcibly exchanged.")
                print("  Card exchanged.")
                break
            elif resp in ("no", "n"):
                self._add_log(f"  {self.players[cp - 1]} examined a card but did not force exchange.")
                print("  Card left as is.")
                break
            print("  Enter 'yes' or 'no': ", end="")

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        for p in (1, 2):
            if not self._alive(p):
                self.game_over = True
                self.winner = self._opponent(p)
                return

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "deck": list(self.deck),
            "cards": {str(k): list(v) for k, v in self.cards.items()},
            "coins": {str(k): v for k, v in self.coins.items()},
            "revealed": {str(k): list(v) for k, v in self.revealed.items()},
            "log": list(self.log),
        }

    def load_state(self, state):
        self.deck = list(state["deck"])
        self.cards = {int(k): list(v) for k, v in state["cards"].items()}
        self.coins = {int(k): v for k, v in state["coins"].items()}
        self.revealed = {int(k): list(v) for k, v in state["revealed"].items()}
        self.log = list(state.get("log", []))

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        role_list = ", ".join(self.roles)
        exchange_name = self.exchange_role
        extra = ""
        if self.variation == "reformation":
            extra = (
                "\n\n  INQUISITOR (replaces Ambassador):\n"
                "  - Can Exchange (draw 2, choose 2 to keep)\n"
                "  - Can Inquisite: look at one of opponent's face-down cards\n"
                "    and optionally force them to draw a new one from the deck.\n"
                "  - Blocks stealing (like Ambassador)"
            )

        return (
            f"\n{'=' * 58}\n"
            f"  COUP - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Each player starts with 2 face-down influence cards and 2 coins.\n"
            f"  The deck contains 15 cards: 3 each of {role_list}.\n"
            f"  Last player with influence wins.\n\n"
            f"  ACTIONS (one per turn):\n"
            f"  income        - Take 1 coin (cannot be blocked or challenged)\n"
            f"  foreign_aid   - Take 2 coins (can be blocked by Duke)\n"
            f"  coup          - Pay 7 coins, opponent loses a card (mandatory at 10+)\n"
            f"  tax           - (Duke) Take 3 coins\n"
            f"  assassinate   - (Assassin) Pay 3 coins, target loses a card\n"
            f"                  Can be blocked by Contessa\n"
            f"  steal         - (Captain) Take 2 coins from opponent\n"
            f"                  Can be blocked by Captain or {exchange_name}\n"
            f"  exchange      - ({exchange_name}) Draw 2, choose 2 to keep\n"
            f"{extra}\n\n"
            f"  CHALLENGING:\n"
            f"  Any action that claims a role can be challenged.\n"
            f"  - If the player HAS the role: challenger loses a card.\n"
            f"    The role card is shuffled back and a new card is drawn.\n"
            f"  - If the player DOESN'T: the player loses a card,\n"
            f"    and the action is cancelled.\n\n"
            f"  BLOCKING:\n"
            f"  Some actions can be blocked by claiming a counter-role.\n"
            f"  The original actor may then challenge the block.\n\n"
            f"  ELIMINATION:\n"
            f"  Lose both cards and you are out. Last player standing wins!\n\n"
            f"  COMMANDS:\n"
            f"  Type action names to act. When prompted, type 'challenge',\n"
            f"  'allow', or 'block <role>'. Type 'quit' to exit,\n"
            f"  'save' to suspend, 'help' for help.\n"
            f"{'=' * 58}"
        )
