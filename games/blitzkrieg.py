"""Blitzkrieg! - Token-placing theater-of-war game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Token types with strength ranges
TOKEN_TYPES = {
    "Infantry": (1, 3),
    "Armor":    (2, 4),
    "Air":      (2, 3),
    "Naval":    (1, 3),
    "Special":  (1, 4),
}

TOKEN_SYMBOLS = {
    "Infantry": "Inf",
    "Armor":    "Arm",
    "Air":      "Air",
    "Naval":    "Nav",
    "Special":  "Spc",
}

# Theater configurations: (name, victory_points)
STANDARD_THEATERS = [
    ("Western Front",  3),
    ("Eastern Front",  2),
    ("Pacific",        4),
    ("Mediterranean",  2),
    ("Atlantic",       3),
]

QUICK_THEATERS = [
    ("Western Front",  3),
    ("Pacific",        4),
    ("Atlantic",       3),
]

SLOTS_PER_PLAYER = 3


class BlitzkriegGame(BaseGame):
    """Blitzkrieg! - Token-placing theater-of-war game."""

    name = "Blitzkrieg!"
    description = "Place military tokens to control theaters of war"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (5 theaters, 15 tokens each)",
        "quick": "Quick (3 theaters, 9 tokens each)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.theaters = []       # list of {"name", "vp", "slots": {1: [...], 2: [...]}}
        self.bags = {1: [], 2: []}       # tokens remaining in bag
        self.drawn = {1: [], 2: []}      # tokens in hand (drawn)
        self.scores = {1: 0, 2: 0}
        self.theaters_won = {1: [], 2: []}
        self.log = []
        self.passed = {1: False, 2: False}

    # ---------------------------------------------------------------- helpers
    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 10:
            self.log = self.log[-10:]

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    def _generate_bag(self, total_tokens):
        """Generate a bag of tokens with mixed types."""
        bag = []
        types = list(TOKEN_TYPES.keys())
        tokens_per_type = total_tokens // len(types)
        remainder = total_tokens % len(types)

        for i, t_type in enumerate(types):
            low, high = TOKEN_TYPES[t_type]
            count = tokens_per_type + (1 if i < remainder else 0)
            for _ in range(count):
                strength = random.randint(low, high)
                bag.append({"type": t_type, "strength": strength})

        random.shuffle(bag)
        return bag

    def _draw_tokens(self, player, count):
        """Draw tokens from bag into hand, up to count."""
        drawn = 0
        while drawn < count and self.bags[player]:
            self.drawn[player].append(self.bags[player].pop())
            drawn += 1
        return drawn

    def _theater_is_full(self, theater_idx):
        """Check if a theater has all slots filled."""
        t = self.theaters[theater_idx]
        return (len(t["slots"][1]) >= SLOTS_PER_PLAYER and
                len(t["slots"][2]) >= SLOTS_PER_PLAYER)

    def _theater_slots_available(self, theater_idx, player):
        """Return number of available slots for player in theater."""
        t = self.theaters[theater_idx]
        return SLOTS_PER_PLAYER - len(t["slots"][player])

    def _theater_strength(self, theater_idx, player):
        """Total strength in a theater for a player."""
        return sum(tok["strength"] for tok in self.theaters[theater_idx]["slots"][player])

    def _resolve_theater(self, theater_idx):
        """Resolve a full theater. Returns winner player or None for tie."""
        s1 = self._theater_strength(theater_idx, 1)
        s2 = self._theater_strength(theater_idx, 2)
        t = self.theaters[theater_idx]
        if s1 > s2:
            return 1
        elif s2 > s1:
            return 2
        return None

    def _all_theaters_full(self):
        """Check if all theaters are full."""
        return all(self._theater_is_full(i) for i in range(len(self.theaters)))

    def _can_play(self, player):
        """Check if a player can still place tokens."""
        if not self.drawn[player]:
            return False
        for i in range(len(self.theaters)):
            if self._theater_slots_available(i, player) > 0:
                return True
        return False

    # ---------------------------------------------------------------- setup
    def setup(self):
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.log = []
        self.scores = {1: 0, 2: 0}
        self.theaters_won = {1: [], 2: []}
        self.passed = {1: False, 2: False}

        # Set up theaters
        if self.variation == "quick":
            theater_config = QUICK_THEATERS
            total_tokens = 9
        else:
            theater_config = STANDARD_THEATERS
            total_tokens = 15

        self.theaters = []
        for name, vp in theater_config:
            self.theaters.append({
                "name": name,
                "vp": vp,
                "slots": {1: [], 2: []},
                "resolved": False,
                "winner": None,
            })

        # Generate bags and draw initial tokens
        for p in (1, 2):
            self.bags[p] = self._generate_bag(total_tokens)
            self.drawn[p] = []
            self._draw_tokens(p, 3)

    # ---------------------------------------------------------------- display
    def display(self):
        clear_screen()
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 64}")
        print(f"  BLITZKRIEG!  |  Turn {self.turn_number + 1}  |  {self.players[cp - 1]}'s turn")
        print(f"  Variation: {self.variation.title()}")
        print(f"{'=' * 64}")

        # Score summary
        print(f"\n  Scores: {self.players[0]}: {self.scores[1]} VP  |  "
              f"{self.players[1]}: {self.scores[2]} VP")

        # Theater display
        print(f"\n  {'THEATER':<18} {'VP':>3}  "
              f"{'P1 Tokens':^20}  {'P2 Tokens':^20}  Status")
        print(f"  {'-' * 78}")

        for i, t in enumerate(self.theaters):
            name = t["name"]
            vp = t["vp"]

            # Player 1 slots
            p1_slots = []
            for tok in t["slots"][1]:
                p1_slots.append(f"{TOKEN_SYMBOLS[tok['type']]}{tok['strength']}")
            while len(p1_slots) < SLOTS_PER_PLAYER:
                p1_slots.append("___")
            p1_str = " ".join(f"{s:>5}" for s in p1_slots)

            # Player 2 slots
            p2_slots = []
            for tok in t["slots"][2]:
                p2_slots.append(f"{TOKEN_SYMBOLS[tok['type']]}{tok['strength']}")
            while len(p2_slots) < SLOTS_PER_PLAYER:
                p2_slots.append("___")
            p2_str = " ".join(f"{s:>5}" for s in p2_slots)

            # Status
            if t["resolved"]:
                if t["winner"]:
                    status = f"Won by {self.players[t['winner'] - 1]}"
                else:
                    status = "Tied"
            elif self._theater_is_full(i):
                status = "Full"
            else:
                s1 = self._theater_strength(i, 1)
                s2 = self._theater_strength(i, 2)
                status = f"{s1} vs {s2}"

            print(f"  {name:<18} {vp:>3}  {p1_str}  {p2_str}  {status}")

        # Bag info
        print(f"\n  {self.players[0]}: {len(self.bags[1])} in bag, "
              f"{len(self.drawn[1])} in hand")
        print(f"  {self.players[1]}: {len(self.bags[2])} in bag, "
              f"{len(self.drawn[2])} in hand")

        # Current player's hand
        print(f"\n  Your tokens ({self.players[cp - 1]}):")
        if self.drawn[cp]:
            for i, tok in enumerate(self.drawn[cp], 1):
                print(f"    {i}. {tok['type']} (strength {tok['strength']})")
        else:
            print(f"    (no tokens in hand)")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-5:]:
                print(f"  {line}")

        print()

    # ---------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if not self._can_play(cp):
            print("  No valid placements available. Passing.")
            input_with_quit("  Press Enter to continue...")
            return ("pass",)

        # Choose token
        print(f"  Choose a token to place (1-{len(self.drawn[cp])}):")

        while True:
            tok_input = input_with_quit("  Token: ").strip()

            if not tok_input.isdigit():
                print(f"  Enter a number 1-{len(self.drawn[cp])}.")
                continue

            tok_choice = int(tok_input)
            if tok_choice < 1 or tok_choice > len(self.drawn[cp]):
                print(f"  Invalid. Choose 1-{len(self.drawn[cp])}.")
                continue

            token = self.drawn[cp][tok_choice - 1]

            # Choose theater
            available_theaters = []
            for i, t in enumerate(self.theaters):
                if self._theater_slots_available(i, cp) > 0:
                    available_theaters.append(i)

            if not available_theaters:
                print("  No theaters have open slots for you.")
                return ("pass",)

            print(f"  Place {token['type']}({token['strength']}) in which theater?")
            for j, ti in enumerate(available_theaters, 1):
                t = self.theaters[ti]
                slots_left = self._theater_slots_available(ti, cp)
                s_cp = self._theater_strength(ti, cp)
                s_opp = self._theater_strength(ti, self._opponent())
                print(f"    {j}. {t['name']} (VP:{t['vp']}, "
                      f"slots left:{slots_left}, "
                      f"your str:{s_cp} vs opp:{s_opp})")
            print(f"    [C] Cancel and pick different token")

            while True:
                t_input = input_with_quit("  Theater: ").strip().lower()

                if t_input in ("c", "cancel"):
                    break

                if not t_input.isdigit():
                    print(f"  Enter a number 1-{len(available_theaters)} or C.")
                    continue

                t_choice = int(t_input)
                if t_choice < 1 or t_choice > len(available_theaters):
                    print(f"  Invalid. Choose 1-{len(available_theaters)}.")
                    continue

                theater_idx = available_theaters[t_choice - 1]
                return ("place", tok_choice - 1, theater_idx)

            # If cancelled, loop back to token selection
            continue

    # ---------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player
        opp = self._opponent()

        if move[0] == "pass":
            self.passed[cp] = True
            self._add_log(f"{self.players[cp - 1]} passes (no valid moves).")
            return True

        if move[0] == "place":
            tok_idx = move[1]
            theater_idx = move[2]

            # Validate
            if tok_idx >= len(self.drawn[cp]):
                return False
            if self._theater_slots_available(theater_idx, cp) <= 0:
                return False

            token = self.drawn[cp].pop(tok_idx)
            self.theaters[theater_idx]["slots"][cp].append(token)

            t = self.theaters[theater_idx]
            self._add_log(f"{self.players[cp - 1]} places {token['type']}"
                          f"({token['strength']}) in {t['name']}.")

            # Check if theater is now full and resolve it
            if self._theater_is_full(theater_idx) and not t["resolved"]:
                winner = self._resolve_theater(theater_idx)
                t["resolved"] = True
                t["winner"] = winner
                if winner:
                    self.scores[winner] += t["vp"]
                    self.theaters_won[winner].append(t["name"])
                    self._add_log(f"  {t['name']} resolved: "
                                  f"{self.players[winner - 1]} wins {t['vp']} VP!")
                else:
                    self._add_log(f"  {t['name']} resolved: Tied! No VP awarded.")

            # Draw replacement token if available
            self._draw_tokens(cp, 1)

            self.passed[cp] = False
            return True

        return False

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        # Game ends when all theaters are full or both players pass
        if self._all_theaters_full():
            self._resolve_remaining()
            self._determine_winner()
            return

        if not self._can_play(1) and not self._can_play(2):
            self._resolve_remaining()
            self._determine_winner()
            return

    def _resolve_remaining(self):
        """Resolve any unresolved theaters."""
        for i, t in enumerate(self.theaters):
            if not t["resolved"]:
                # Even if not full, resolve based on current strength
                s1 = self._theater_strength(i, 1)
                s2 = self._theater_strength(i, 2)
                if s1 > s2:
                    winner = 1
                elif s2 > s1:
                    winner = 2
                else:
                    winner = None
                t["resolved"] = True
                t["winner"] = winner
                if winner:
                    self.scores[winner] += t["vp"]
                    self.theaters_won[winner].append(t["name"])
                    self._add_log(f"  {t['name']}: {self.players[winner - 1]} wins {t['vp']} VP!")
                else:
                    self._add_log(f"  {t['name']}: Tied! No VP awarded.")

    def _determine_winner(self):
        """Determine the overall winner."""
        self.game_over = True
        if self.scores[1] > self.scores[2]:
            self.winner = 1
        elif self.scores[2] > self.scores[1]:
            self.winner = 2
        else:
            # Tiebreak: player who won more theaters
            if len(self.theaters_won[1]) > len(self.theaters_won[2]):
                self.winner = 1
            elif len(self.theaters_won[2]) > len(self.theaters_won[1]):
                self.winner = 2
            else:
                self.winner = None  # true draw

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "theaters": [
                {
                    "name": t["name"],
                    "vp": t["vp"],
                    "slots": {
                        str(p): [{"type": tok["type"], "strength": tok["strength"]}
                                 for tok in t["slots"][p]]
                        for p in (1, 2)
                    },
                    "resolved": t["resolved"],
                    "winner": t["winner"],
                }
                for t in self.theaters
            ],
            "bags": {
                str(p): [{"type": tok["type"], "strength": tok["strength"]}
                         for tok in self.bags[p]]
                for p in (1, 2)
            },
            "drawn": {
                str(p): [{"type": tok["type"], "strength": tok["strength"]}
                         for tok in self.drawn[p]]
                for p in (1, 2)
            },
            "scores": {str(k): v for k, v in self.scores.items()},
            "theaters_won": {str(k): list(v) for k, v in self.theaters_won.items()},
            "passed": {str(k): v for k, v in self.passed.items()},
            "log": list(self.log),
        }

    def load_state(self, state):
        self.theaters = []
        for t_data in state["theaters"]:
            self.theaters.append({
                "name": t_data["name"],
                "vp": t_data["vp"],
                "slots": {
                    int(p): [{"type": tok["type"], "strength": tok["strength"]}
                             for tok in tokens]
                    for p, tokens in t_data["slots"].items()
                },
                "resolved": t_data["resolved"],
                "winner": t_data["winner"],
            })
        self.bags = {
            int(p): [{"type": tok["type"], "strength": tok["strength"]}
                     for tok in tokens]
            for p, tokens in state["bags"].items()
        }
        self.drawn = {
            int(p): [{"type": tok["type"], "strength": tok["strength"]}
                     for tok in tokens]
            for p, tokens in state["drawn"].items()
        }
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.theaters_won = {int(k): list(v) for k, v in state["theaters_won"].items()}
        self.passed = {int(k): v for k, v in state.get("passed", {"1": False, "2": False}).items()}
        self.log = list(state.get("log", []))

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        if self.variation == "quick":
            theater_desc = "3 theaters, 9 tokens each"
        else:
            theater_desc = "5 theaters, 15 tokens each"

        theater_list = QUICK_THEATERS if self.variation == "quick" else STANDARD_THEATERS
        theater_info = ", ".join(f"{n} ({vp}VP)" for n, vp in theater_list)

        return (
            f"\n{'=' * 64}\n"
            f"  BLITZKRIEG! - Tutorial ({self.variation.title()})\n"
            f"{'=' * 64}\n\n"
            f"  OVERVIEW:\n"
            f"  A token-placing theater-of-war game ({theater_desc}).\n"
            f"  Place military tokens to dominate theaters and score VP.\n"
            f"  The player with the most victory points wins!\n\n"
            f"  THEATERS:\n"
            f"  {theater_info}\n"
            f"  Each theater has {SLOTS_PER_PLAYER} slots per player.\n\n"
            f"  TOKEN TYPES (type: strength range):\n"
            f"  - Infantry:  1-3 strength (versatile ground troops)\n"
            f"  - Armor:     2-4 strength (heavy hitting tanks)\n"
            f"  - Air:       2-3 strength (aerial support)\n"
            f"  - Naval:     1-3 strength (sea power)\n"
            f"  - Special:   1-4 strength (variable special forces)\n\n"
            f"  GAMEPLAY:\n"
            f"  1. Draw 3 tokens from your bag at the start\n"
            f"  2. On your turn, place 1 token into an empty slot in a theater\n"
            f"  3. After placing, draw 1 replacement token from your bag\n"
            f"  4. Alternate turns until all theaters are full\n\n"
            f"  SCORING:\n"
            f"  When a theater is full (all 6 slots filled), compare\n"
            f"  total strength per side. The higher total wins that\n"
            f"  theater's victory points. Ties award no VP.\n\n"
            f"  STRATEGY:\n"
            f"  - Focus high-strength tokens on high-VP theaters\n"
            f"  - Sometimes conceding a low-VP theater saves resources\n"
            f"  - Watch your opponent's placements to counter\n\n"
            f"  COMMANDS:\n"
            f"  Choose token number, then theater number to place it.\n"
            f"  Type 'quit' to exit, 'save' to suspend, 'help' for help.\n"
            f"{'=' * 64}"
        )
