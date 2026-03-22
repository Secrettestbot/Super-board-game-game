"""Ticket to Ride Card Game - Simplified 2-player train card game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# ANSI color codes
RESET = "\033[0m"
BOLD = "\033[1m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"
CYAN = "\033[96m"
WHITE = "\033[97m"
GRAY = "\033[90m"
BG_RED = "\033[41m"
BG_BLUE = "\033[44m"

# Train card colors
COLORS = ["Red", "Blue", "Green", "Yellow", "Orange", "Purple", "White", "Black"]
COLOR_CODES = {
    "Red": RED, "Blue": BLUE, "Green": GREEN, "Yellow": YELLOW,
    "Orange": "\033[33m", "Purple": MAGENTA, "White": WHITE, "Black": GRAY,
    "Wild": CYAN,
}
COLOR_SHORT = {c: c[0] for c in COLORS}
COLOR_SHORT["Wild"] = "W"

# Standard map routes: (city_a, city_b, length, color, tunnel)
# color None = any color (grey route)
ROUTES_STANDARD = [
    ("New York",    "Boston",      2, "Purple",  False),
    ("New York",    "Boston",      2, "Red",     False),
    ("New York",    "Philadelphia",1, "Yellow",  False),
    ("New York",    "Philadelphia",1, "Red",     False),
    ("Philadelphia","Washington",  2, "Blue",    False),
    ("Philadelphia","Washington",  2, "Orange",  False),
    ("Boston",      "Montreal",    2, None,      False),
    ("Montreal",    "Toronto",     3, None,      False),
    ("Toronto",     "Pittsburgh",  2, None,      False),
    ("Pittsburgh",  "Washington",  2, None,      False),
    ("Pittsburgh",  "New York",    3, White,     False) if False else ("Pittsburgh", "New York", 3, "White", False),
    ("Pittsburgh",  "Chicago",     3, "Orange",  False),
    ("Pittsburgh",  "Raleigh",     2, None,      False),
    ("Washington",  "Raleigh",     2, None,      False),
    ("Raleigh",     "Charleston",  2, None,      False),
    ("Raleigh",     "Nashville",   3, "Black",   False),
    ("Charleston",  "Miami",       4, "Purple",  False),
    ("Miami",       "New Orleans", 6, "Red",     False),
    ("Nashville",   "Atlanta",     1, None,      False),
    ("Nashville",   "Saint Louis", 2, None,      False),
    ("Atlanta",     "Charleston",  2, None,      False),
    ("Atlanta",     "Miami",       5, "Blue",    False),
    ("Atlanta",     "New Orleans", 4, "Yellow",  False),
    ("New Orleans", "Saint Louis", 3, "Green",   False),
    ("New Orleans", "Little Rock", 3, "Green",   False),
    ("Saint Louis", "Chicago",     2, "Green",   False),
    ("Saint Louis", "Chicago",     2, "White",   False),
    ("Saint Louis", "Pittsburgh",  5, None,      False),
    ("Chicago",     "Toronto",     4, "White",   False),
    ("Chicago",     "Pittsburgh",  3, "Black",   False),
    ("Chicago",     "Omaha",       4, "Blue",    False),
    ("Omaha",       "Kansas City", 1, None,      False),
    ("Omaha",       "Duluth",      2, None,      False),
    ("Duluth",      "Toronto",     6, "Purple",  False),
    ("Duluth",      "Chicago",     3, "Red",     False),
    ("Kansas City", "Saint Louis", 2, "Blue",    False),
    ("Kansas City", "Little Rock", 2, None,      False),
    ("Little Rock", "Nashville",   3, "White",   False),
    ("Dallas",      "Little Rock", 2, None,      False),
    ("Dallas",      "Houston",     1, None,      False),
    ("Houston",     "New Orleans", 2, None,      False),
    ("Dallas",      "Kansas City", 4, "Red",     False),
    ("Kansas City", "Denver",      4, "Black",   False),
    ("Omaha",       "Denver",      4, "Purple",  False),
    ("Denver",      "Santa Fe",    2, None,      False),
    ("Denver",      "Salt Lake",   3, "Red",     False),
    ("Salt Lake",   "Las Vegas",   3, "Orange",  False),
    ("Las Vegas",   "Los Angeles", 2, None,      False),
    ("Los Angeles", "El Paso",     6, "Black",   False),
    ("El Paso",     "Santa Fe",    2, None,      False),
    ("Santa Fe",    "Oklahoma",    3, "Blue",    False),
    ("Oklahoma",    "Dallas",      2, None,      False),
    ("Oklahoma",    "Kansas City", 2, None,      False),
    ("Portland",    "Seattle",     1, None,      False),
    ("Seattle",     "Calgary",     4, None,      False),
    ("Seattle",     "Helena",      6, "Yellow",  False),
    ("Calgary",     "Winnipeg",    6, "White",   False),
    ("Helena",      "Denver",      4, "Green",   False),
    ("Helena",      "Omaha",       5, "Red",     False),
    ("Portland",    "San Francisco", 5, "Green", False),
    ("San Francisco","Los Angeles", 3, "Yellow", False),
    ("Los Angeles", "Phoenix",     3, None,      False),
    ("Phoenix",     "El Paso",     3, None,      False),
    ("Phoenix",     "Denver",      5, "White",   False),
]

# Express (smaller) map
ROUTES_EXPRESS = [
    ("New York",    "Boston",      2, "Red",    False),
    ("New York",    "Philadelphia",1, "Yellow", False),
    ("Philadelphia","Washington",  2, "Blue",   False),
    ("Washington",  "Raleigh",     2, None,     False),
    ("Raleigh",     "Atlanta",     2, None,     False),
    ("Atlanta",     "Nashville",   1, None,     False),
    ("Atlanta",     "New Orleans", 4, "Yellow", False),
    ("Nashville",   "Saint Louis", 2, None,     False),
    ("New Orleans", "Saint Louis", 3, "Green",  False),
    ("Saint Louis", "Chicago",     2, "White",  False),
    ("Chicago",     "Pittsburgh",  3, "Black",  False),
    ("Pittsburgh",  "New York",    3, "White",  False),
    ("Pittsburgh",  "Washington",  2, None,     False),
    ("Boston",      "Montreal",    2, None,     False),
    ("Montreal",    "Toronto",     3, None,     False),
    ("Toronto",     "Chicago",     4, "White",  False),
    ("Toronto",     "Pittsburgh",  2, None,     False),
    ("Chicago",     "Omaha",       4, "Blue",   False),
    ("Omaha",       "Denver",      4, "Purple", False),
    ("Denver",      "Kansas City", 4, "Black",  False),
    ("Kansas City", "Saint Louis", 2, "Blue",   False),
    ("Kansas City", "Dallas",      4, "Red",    False),
    ("Dallas",      "Houston",     1, None,     False),
    ("Houston",     "New Orleans", 2, None,     False),
    ("Denver",      "Salt Lake",   3, "Red",    False),
    ("Salt Lake",   "Seattle",     5, "Purple", False),
    ("Seattle",     "Portland",    1, None,     False),
    ("Portland",    "San Francisco", 5, "Green",False),
    ("San Francisco","Los Angeles", 3, "Yellow",False),
    ("Los Angeles", "Phoenix",     3, None,     False),
    ("Phoenix",     "El Paso",     3, None,     False),
    ("El Paso",     "Dallas",      4, "Red",    False),
]

# Destination tickets: (city_a, city_b, points)
TICKETS_STANDARD = [
    ("Los Angeles", "New York",    21),
    ("Duluth",      "Houston",     8),
    ("New York",    "Atlanta",     6),
    ("Chicago",     "New Orleans", 7),
    ("Denver",      "Pittsburgh",  11),
    ("Seattle",     "Miami",       22),
    ("Calgary",     "Phoenix",     13),
    ("Kansas City", "Houston",     5),
    ("Montreal",    "Atlanta",     9),
    ("Boston",      "Miami",       12),
    ("Portland",    "Nashville",   17),
    ("Winnipeg",    "New Orleans", 11),
    ("Dallas",      "New York",    11),
    ("Denver",      "El Paso",     4),
    ("Helena",      "Los Angeles", 8),
    ("Omaha",       "Chicago",     4),
    ("Saint Louis", "Miami",       12),
    ("Toronto",     "Miami",       10),
    ("Washington",  "Atlanta",     6),
    ("Philadelphia","Chicago",     9),
]

TICKETS_EXPRESS = [
    ("Seattle",     "New York",    22),
    ("Los Angeles", "Chicago",     16),
    ("New York",    "Atlanta",     6),
    ("Chicago",     "New Orleans", 7),
    ("Denver",      "Pittsburgh",  11),
    ("Portland",    "Houston",     17),
    ("Boston",      "Miami",       12),
    ("Kansas City", "Houston",     5),
    ("Montreal",    "Atlanta",     9),
    ("Toronto",     "Miami",       10),
    ("Dallas",      "New York",    11),
    ("Denver",      "El Paso",     4),
    ("Omaha",       "Chicago",     4),
    ("Saint Louis", "Miami",       12),
    ("Washington",  "Atlanta",     6),
    ("Philadelphia","Chicago",     9),
]

ROUTE_POINTS = {1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15}


class TicketToRideCardGame(BaseGame):
    """Ticket to Ride Card Game: simplified 2-player train route game."""

    name = "Ticket to Ride (Card)"
    description = "Collect train cards to claim routes and complete destination tickets"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard map (many cities)",
        "express": "Express map (smaller, faster game)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.routes = []
        self.tickets_deck = []
        self.train_deck = []
        self.face_up = []           # 5 face-up cards
        self.discard = []
        self.hands = {1: [], 2: []}        # train cards in hand
        self.tickets = {1: [], 2: []}      # destination tickets held
        self.claimed = {}           # route_idx -> player
        self.trains_left = {1: 45, 2: 45}
        self.last_round = False
        self.last_round_trigger = None
        self.passes_after_trigger = 0
        self._setup_done = False

    # ------------------------------------------------------------------ setup

    def setup(self):
        if self.variation == "express":
            self.routes = list(ROUTES_EXPRESS)
            self.tickets_deck = list(TICKETS_EXPRESS)
        else:
            self.routes = list(ROUTES_STANDARD)
            self.tickets_deck = list(TICKETS_STANDARD)

        # Build train card deck: 12 of each color + 14 wilds
        self.train_deck = []
        for color in COLORS:
            self.train_deck.extend([color] * 12)
        self.train_deck.extend(["Wild"] * 14)
        random.shuffle(self.train_deck)
        random.shuffle(self.tickets_deck)

        self.face_up = []
        self.discard = []
        self.hands = {1: [], 2: []}
        self.tickets = {1: [], 2: []}
        self.claimed = {}
        self.trains_left = {1: 45, 2: 45}
        self.last_round = False
        self.last_round_trigger = None
        self.passes_after_trigger = 0

        # Deal initial cards: 4 train cards each
        for p in (1, 2):
            self.hands[p] = [self._draw_train() for _ in range(4)]

        # Reveal 5 face-up cards
        self._refill_face_up()

        # Each player draws 3 tickets, must keep at least 2
        for p in (1, 2):
            self._deal_tickets(p, initial=True)

    def _draw_train(self):
        if not self.train_deck:
            if self.discard:
                self.train_deck = list(self.discard)
                self.discard = []
                random.shuffle(self.train_deck)
            else:
                return None
        return self.train_deck.pop() if self.train_deck else None

    def _refill_face_up(self):
        while len(self.face_up) < 5:
            card = self._draw_train()
            if card is None:
                break
            self.face_up.append(card)
        # If 3+ wilds face-up, discard all and redraw
        if self.face_up.count("Wild") >= 3:
            self.discard.extend(self.face_up)
            self.face_up = []
            self._refill_face_up()

    def _deal_tickets(self, player, initial=False, count=3):
        """Deal destination tickets. Player must keep at least 2 (initial) or 1."""
        available = []
        for _ in range(min(count, len(self.tickets_deck))):
            available.append(self.tickets_deck.pop())

        if not available:
            return

        print(f"\n  {self.players[player - 1]}, choose destination tickets to keep:")
        for i, (a, b, pts) in enumerate(available, 1):
            print(f"    {i}. {a} -> {b}  ({pts} pts)")

        min_keep = 2 if initial else 1
        print(f"  You must keep at least {min_keep}. Enter numbers to DISCARD (e.g. '3' or '1 3'), or press Enter to keep all:")

        while True:
            raw = input_with_quit("  > ").strip()
            discard_idx = []
            if raw:
                try:
                    discard_idx = [int(x) - 1 for x in raw.split()]
                except ValueError:
                    print("  Enter numbers separated by spaces.")
                    continue
            keep_count = len(available) - len(discard_idx)
            if keep_count < min_keep:
                print(f"  Must keep at least {min_keep} ticket(s).")
                continue
            # Validate indices
            if any(i < 0 or i >= len(available) for i in discard_idx):
                print("  Invalid number(s).")
                continue
            break

        for i, ticket in enumerate(available):
            if i in discard_idx:
                self.tickets_deck.insert(0, ticket)  # return to bottom
            else:
                self.tickets[player].append(ticket)

        kept = [available[i] for i in range(len(available)) if i not in discard_idx]
        print(f"  Kept {len(kept)} ticket(s).")

    # ---------------------------------------------------------------- display

    def _color(self, c):
        return COLOR_CODES.get(c, "") + c + RESET

    def display(self):
        cp = self.current_player
        opp = 3 - cp

        print(f"\n{BOLD}  === Ticket to Ride Card Game ({self.variations[self.variation]}) ==={RESET}")
        print(f"  Turn {self.turn_number + 1}  |  {'Last Round!' if self.last_round else ''}")

        # Scores
        s1, s2 = self._score(1), self._score(2)
        print(f"  {self.players[0]}: {s1} pts | {self.players[1]}: {s2} pts")

        # Trains left
        print(f"  Trains: {self.players[0]}={self.trains_left[1]}  {self.players[1]}={self.trains_left[2]}")
        print()

        # Face-up cards
        print(f"  Face-up cards:")
        for i, c in enumerate(self.face_up):
            cc = COLOR_CODES.get(c, "")
            print(f"    [{i+1}] {cc}{c}{RESET}")
        print(f"  Deck: {len(self.train_deck)} cards  |  Discard: {len(self.discard)}")
        print()

        # Current player's hand
        hand_counts = {}
        for c in self.hands[cp]:
            hand_counts[c] = hand_counts.get(c, 0) + 1
        hand_str = "  ".join(
            f"{COLOR_CODES.get(c,'')}{c}x{n}{RESET}"
            for c, n in sorted(hand_counts.items())
        )
        print(f"  {self.players[cp-1]}'s hand: {hand_str or '(empty)'}")

        # Opponent hand size only
        print(f"  {self.players[opp-1]}'s hand: {len(self.hands[opp])} cards (hidden)")
        print()

        # Current player's tickets
        print(f"  {self.players[cp-1]}'s destination tickets:")
        for a, b, pts in self.tickets[cp]:
            done = self._ticket_complete(cp, a, b)
            status = f"{GREEN}✓{RESET}" if done else f"{RED}✗{RESET}"
            print(f"    {status} {a} -> {b}  ({pts} pts)")
        print()

        # Routes display (compact)
        self._display_routes()

        # Actions
        print(f"  Actions: draw, claim, tickets")
        print(f"  {GRAY}(Type action name to choose){RESET}")

    def _display_routes(self):
        print(f"  Routes:")
        for i, (a, b, length, color, _) in enumerate(self.routes):
            owner = self.claimed.get(i)
            if owner:
                oc = BG_RED if owner == 1 else BG_BLUE
                label = f"{oc} P{owner} {RESET}"
            else:
                label = "    "
            col_str = color if color else "Any"
            cc = COLOR_CODES.get(col_str, "")
            print(f"  {i+1:>2}. {label} {a:<20} -> {b:<20} [{cc}{col_str}{RESET}] Len={length}")
        print()

    # -------------------------------------------------------------- actions

    def get_move(self):
        cp = self.current_player
        while True:
            raw = input_with_quit(f"  {self.players[cp-1]}, action (draw/claim/tickets): ").strip().lower()
            if raw in ("draw", "d"):
                return ("draw",)
            elif raw in ("claim", "c"):
                return ("claim",)
            elif raw in ("tickets", "t", "ticket"):
                return ("tickets",)
            else:
                print("  Enter: draw, claim, or tickets")

    def make_move(self, move):
        action = move[0]
        cp = self.current_player

        if action == "draw":
            return self._do_draw(cp)
        elif action == "claim":
            return self._do_claim(cp)
        elif action == "tickets":
            return self._do_tickets(cp)
        return False

    def _do_draw(self, cp):
        """Draw 2 train cards (from face-up or deck)."""
        drawn = 0
        while drawn < 2:
            # Show options
            print(f"\n  Draw card {drawn+1}/2:")
            print(f"  Face-up: ", end="")
            for i, c in enumerate(self.face_up):
                cc = COLOR_CODES.get(c, "")
                print(f"[{i+1}]{cc}{c}{RESET} ", end="")
            print()
            print(f"  Or [D] draw from deck (hidden)")
            if drawn == 0:
                print(f"  Or [skip] to skip drawing entirely this turn")

            while True:
                raw = input_with_quit("  Your choice: ").strip().lower()
                if raw in ("skip",) and drawn == 0:
                    return True  # skip draw action (waste turn)
                if raw == "d":
                    card = self._draw_train()
                    if card:
                        self.hands[cp].append(card)
                        print(f"  Drew: {COLOR_CODES.get(card,'')}{card}{RESET}")
                        drawn += 1
                    else:
                        print("  Deck is empty!")
                    break
                elif raw.isdigit() and 1 <= int(raw) <= len(self.face_up):
                    idx = int(raw) - 1
                    card = self.face_up[idx]
                    # Wild face-up can only be taken as first draw
                    if card == "Wild" and drawn > 0:
                        print("  Cannot take Wild card as second draw.")
                        continue
                    self.face_up.pop(idx)
                    self.hands[cp].append(card)
                    print(f"  Took: {COLOR_CODES.get(card,'')}{card}{RESET}")
                    self._refill_face_up()
                    drawn += 1
                    if card == "Wild":
                        # Wild from face-up counts as both draws
                        print("  Wild card taken - counts as both draws.")
                        drawn = 2
                    break
                else:
                    print("  Enter a face-up slot number or 'D' for deck.")
        return True

    def _do_claim(self, cp):
        """Claim a route."""
        self._display_routes()
        print(f"  Enter route number to claim, or 0 to cancel:")

        while True:
            raw = input_with_quit("  Route #: ").strip()
            if raw == "0":
                return False
            if not raw.isdigit() or not (1 <= int(raw) <= len(self.routes)):
                print(f"  Enter a number 1-{len(self.routes)}.")
                continue
            route_idx = int(raw) - 1
            break

        a, b, length, color, _ = self.routes[route_idx]
        if route_idx in self.claimed:
            print(f"  That route is already claimed by Player {self.claimed[route_idx]}!")
            return False

        if self.trains_left[cp] < length:
            print(f"  Not enough trains (need {length}, have {self.trains_left[cp]}).")
            return False

        # Determine which color to use
        if color:
            needed_color = color
        else:
            # Grey route: player chooses color
            print(f"  Grey route - choose a color from your hand:")
            hand_counts = {}
            for c in self.hands[cp]:
                hand_counts[c] = hand_counts.get(c, 0) + 1
            for c, n in sorted(hand_counts.items()):
                print(f"    {COLOR_CODES.get(c,'')}{c}{RESET}: {n}")
            while True:
                choice = input_with_quit("  Color: ").strip().capitalize()
                if choice not in COLORS:
                    print(f"  Valid colors: {', '.join(COLORS)}")
                    continue
                needed_color = choice
                break

        # Count available cards of needed color + wilds
        color_count = self.hands[cp].count(needed_color)
        wild_count = self.hands[cp].count("Wild")

        if color_count + wild_count < length:
            print(f"  Not enough cards (need {length} {needed_color} or Wild, have {color_count}+{wild_count} wild).")
            return False

        # Ask how many wilds to use
        wilds_needed = max(0, length - color_count)
        print(f"  Using {color_count} {needed_color} card(s) and {wilds_needed} Wild(s). Confirm? (y/n)")
        raw = input_with_quit("  > ").strip().lower()
        if raw != "y":
            return False

        # Remove cards from hand
        for _ in range(length - wilds_needed):
            self.hands[cp].remove(needed_color)
        for _ in range(wilds_needed):
            self.hands[cp].remove("Wild")
        self.discard.extend([needed_color] * (length - wilds_needed))
        self.discard.extend(["Wild"] * wilds_needed)

        self.claimed[route_idx] = cp
        self.trains_left[cp] -= length

        pts = ROUTE_POINTS.get(length, 0)
        print(f"  Route {a} -> {b} claimed for {pts} points!")

        # Check if last round should trigger
        if self.trains_left[cp] <= 2 and not self.last_round:
            self.last_round = True
            self.last_round_trigger = cp
            print(f"\n  {self.players[cp-1]} has 2 or fewer trains left -- LAST ROUND begins!")

        return True

    def _do_tickets(self, cp):
        """Draw new destination tickets."""
        if len(self.tickets_deck) == 0:
            print("  No tickets left in deck.")
            return False
        self._deal_tickets(cp, initial=False)
        return True

    # -------------------------------------------------------------- game over

    def check_game_over(self):
        if self.last_round:
            self.passes_after_trigger += 1
            if self.passes_after_trigger >= 2:
                self.game_over = True
                self._determine_winner()

    def _score(self, player):
        """Calculate current score for player."""
        score = 0
        # Route points
        for i, (a, b, length, _, _) in enumerate(self.routes):
            if self.claimed.get(i) == player:
                score += ROUTE_POINTS.get(length, 0)
        # Ticket bonuses/penalties
        for a, b, pts in self.tickets[player]:
            if self._ticket_complete(player, a, b):
                score += pts
            else:
                score -= pts
        return score

    def _ticket_complete(self, player, city_a, city_b):
        """Check if player has a connected path between city_a and city_b."""
        # Build adjacency from claimed routes
        adj = {}
        for i, (a, b, _, _, _) in enumerate(self.routes):
            if self.claimed.get(i) == player:
                adj.setdefault(a, set()).add(b)
                adj.setdefault(b, set()).add(a)

        # BFS from city_a to city_b
        if city_a not in adj:
            return False
        visited = set()
        queue = [city_a]
        visited.add(city_a)
        while queue:
            cur = queue.pop()
            if cur == city_b:
                return True
            for nb in adj.get(cur, []):
                if nb not in visited:
                    visited.add(nb)
                    queue.append(nb)
        return False

    def _determine_winner(self):
        s1, s2 = self._score(1), self._score(2)
        # Tiebreaker: more completed tickets
        if s1 > s2:
            self.winner = 1
        elif s2 > s1:
            self.winner = 2
        else:
            t1 = sum(1 for a, b, _ in self.tickets[1] if self._ticket_complete(1, a, b))
            t2 = sum(1 for a, b, _ in self.tickets[2] if self._ticket_complete(2, a, b))
            self.winner = 1 if t1 >= t2 else 2

    # -------------------------------------------------------------- state

    def get_state(self):
        return {
            "routes": self.routes,
            "tickets_deck": self.tickets_deck,
            "train_deck": self.train_deck,
            "face_up": self.face_up,
            "discard": self.discard,
            "hands": {str(k): list(v) for k, v in self.hands.items()},
            "tickets": {str(k): [list(t) for t in v] for k, v in self.tickets.items()},
            "claimed": {str(k): v for k, v in self.claimed.items()},
            "trains_left": {str(k): v for k, v in self.trains_left.items()},
            "last_round": self.last_round,
            "last_round_trigger": self.last_round_trigger,
            "passes_after_trigger": self.passes_after_trigger,
        }

    def load_state(self, state):
        self.routes = [tuple(r) for r in state["routes"]]
        self.tickets_deck = [tuple(t) for t in state["tickets_deck"]]
        self.train_deck = list(state["train_deck"])
        self.face_up = list(state["face_up"])
        self.discard = list(state["discard"])
        self.hands = {int(k): list(v) for k, v in state["hands"].items()}
        self.tickets = {int(k): [tuple(t) for t in v] for k, v in state["tickets"].items()}
        self.claimed = {int(k): v for k, v in state["claimed"].items()}
        self.trains_left = {int(k): v for k, v in state["trains_left"].items()}
        self.last_round = state["last_round"]
        self.last_round_trigger = state["last_round_trigger"]
        self.passes_after_trigger = state["passes_after_trigger"]

    # ------------------------------------------------------------- tutorial

    def get_tutorial(self):
        return f"""
{'='*62}
  TICKET TO RIDE (CARD GAME) - Tutorial ({self.variation.title()})
{'='*62}

OVERVIEW
  Ticket to Ride Card Game is a 2-player train route game.
  Collect colored train cards to claim routes between cities,
  and score points by claiming routes and completing secret
  destination tickets.

--------------------------------------------------------------
SETUP
--------------------------------------------------------------
  - Each player starts with 4 train cards (hidden from opponent).
  - 5 train cards are placed face-up in the center.
  - Each player draws 3 destination tickets and keeps at least 2.
  - Each player has 45 train pieces.

--------------------------------------------------------------
TRAIN CARDS
--------------------------------------------------------------
  Colors: Red, Blue, Green, Yellow, Orange, Purple, White, Black
  Wild:   Locomotive (Wild) -- can substitute for any color.

  Face-up cards can be taken; Wild face-ups count as BOTH draws.

--------------------------------------------------------------
ON YOUR TURN (choose one action)
--------------------------------------------------------------
  DRAW   - Draw 2 train cards total.
           Take from face-up (numbered slots) or hidden deck.
           If you take a face-up Wild, it counts as both draws.

  CLAIM  - Spend matching train cards to claim a route.
           Colored routes require that color (+ Wilds).
           Grey (Any) routes accept any single color.
           Score points by route length:
             1 -> 1pt  2 -> 2pt  3 -> 4pt
             4 -> 7pt  5 -> 10pt  6 -> 15pt

  TICKETS - Draw 3 new destination tickets, keep at least 1.

--------------------------------------------------------------
DESTINATION TICKETS
--------------------------------------------------------------
  Tickets list two cities and a point value.
  If you connect those cities with a continuous route at game
  end: you GAIN those points.
  If you FAIL to connect them: you LOSE those points.

--------------------------------------------------------------
END GAME
--------------------------------------------------------------
  When any player has 2 or fewer trains left, each player
  (including the trigger player) gets one more turn, then
  the game ends.

  Final scores:
    + Points for claimed routes
    + Points for each completed ticket
    - Points for each incomplete ticket

  Most points wins. Tiebreaker: most completed tickets.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  draw     - Draw train cards
  claim    - Claim a route
  tickets  - Draw destination tickets
  'quit'   - Quit the game
  'save'   - Save and suspend
  'help'   - Show quick help
  'tutorial' - Show this tutorial
{'='*62}
"""
