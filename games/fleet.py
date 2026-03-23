"""Fleet - Fishing license auction and boat management game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen


LICENSE_TYPES = {
    "Cod": {"base_value": 2, "catch_range": (1, 3), "points": 3},
    "Shrimp": {"base_value": 3, "catch_range": (1, 4), "points": 4},
    "Lobster": {"base_value": 5, "catch_range": (2, 4), "points": 6},
    "Tuna": {"base_value": 7, "catch_range": (2, 5), "points": 8},
    "Swordfish": {"base_value": 9, "catch_range": (3, 6), "points": 10},
}

QUICK_LICENSES = ["Cod", "Shrimp", "Lobster"]


def _make_fish_card(fish_type, value):
    return {"type": fish_type, "value": value}


def _make_license(license_type):
    info = LICENSE_TYPES[license_type]
    return {
        "type": license_type,
        "base_value": info["base_value"],
        "points": info["points"],
    }


def _make_boat(license_type):
    return {
        "type": license_type,
        "captain": False,
        "fish": [],
    }


class FleetGame(BaseGame):
    """Fleet: Auction licenses, launch boats, go fishing."""

    name = "Fleet"
    description = "Fishing license auction and boat management game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full fleet (5 license types, ~10 rounds)",
        "quick": "Quick fleet (3 license types, ~6 rounds)",
        "tournament": "Tournament (5 types, bonus scoring)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.available_license_types = []
        self.auction_pool = []
        self.player_money = [12, 12]
        self.player_licenses = [[], []]
        self.player_boats = [[], []]
        self.player_fish = [[], []]
        self.player_points = [0, 0]
        self.round_number = 0
        self.max_rounds = 10
        self.phase = "auction"
        self.auction_current = None
        self.auction_bid = [0, 0]
        self.auction_passed = [False, False]
        self.auction_bidder = 0
        self.fish_deck = []

    def setup(self):
        if self.variation == "quick":
            self.available_license_types = QUICK_LICENSES[:]
            self.max_rounds = 6
        else:
            self.available_license_types = list(LICENSE_TYPES.keys())
            self.max_rounds = 10

        # Generate auction pool
        self._generate_auction_pool()
        # Generate fish deck
        self._generate_fish_deck()
        self.round_number = 1
        self.phase = "auction"
        self._start_auction_round()

    def _generate_auction_pool(self):
        self.auction_pool = []
        for lt in self.available_license_types:
            for _ in range(3):
                self.auction_pool.append(_make_license(lt))
        random.shuffle(self.auction_pool)

    def _generate_fish_deck(self):
        self.fish_deck = []
        for lt in self.available_license_types:
            info = LICENSE_TYPES[lt]
            for _ in range(8):
                val = random.randint(info["catch_range"][0], info["catch_range"][1])
                self.fish_deck.append(_make_fish_card(lt, val))
        random.shuffle(self.fish_deck)

    def _start_auction_round(self):
        """Set up a new auction round with a license from the pool."""
        if self.auction_pool:
            self.auction_current = self.auction_pool.pop()
            self.auction_bid = [0, 0]
            self.auction_passed = [False, False]
            self.auction_bidder = self.current_player - 1
            self.phase = "auction"
        else:
            self.phase = "launch"

    def _player_fish_value(self, player_idx):
        """Total value of fish cards (usable as money)."""
        return sum(f["value"] for f in self.player_fish[player_idx])

    def _total_funds(self, player_idx):
        return self.player_money[player_idx]

    def display(self):
        clear_screen()
        p = self.current_player - 1
        opp = 1 - p

        print(f"{'='*60}")
        print(f"  FLEET - Round {self.round_number}/{self.max_rounds} | Phase: {self.phase.upper()}")
        print(f"{'='*60}")
        print()

        # Both players info
        for i in [opp, p]:
            tag = " (YOU)" if i == p else ""
            name = self.players[i]
            print(f"  {name}{tag}: ${self.player_money[i]} | Fish cards worth: ${self._player_fish_value(i)}")
            # Licenses
            lic_types = {}
            for lic in self.player_licenses[i]:
                lic_types[lic["type"]] = lic_types.get(lic["type"], 0) + 1
            lic_str = ", ".join(f"{v}x {k}" for k, v in lic_types.items()) if lic_types else "None"
            print(f"    Licenses: {lic_str}")

            # Boats
            if self.player_boats[i]:
                for bi, boat in enumerate(self.player_boats[i]):
                    capt = " [CAPTAIN]" if boat["captain"] else ""
                    fish_str = f" Fish: {len(boat['fish'])}" if boat["fish"] else ""
                    print(f"    Boat {bi+1}: {boat['type']}{capt}{fish_str}")
            else:
                print(f"    Boats: None")
            print()

        # Auction info
        if self.phase == "auction" and self.auction_current:
            lic = self.auction_current
            print(f"  --- AUCTION: {lic['type']} License ---")
            print(f"  Base value: ${lic['base_value']} | Points: {lic['points']}")
            print(f"  Current bids: {self.players[0]}: ${self.auction_bid[0]} | "
                  f"{self.players[1]}: ${self.auction_bid[1]}")
            print(f"  Licenses remaining in pool: {len(self.auction_pool)}")
            print()

        # Points
        print(f"  SCORES: {self.players[0]}: {self._calc_points(0)} pts | "
              f"{self.players[1]}: {self._calc_points(1)} pts")
        print()

    def get_move(self):
        p = self.current_player - 1

        if self.phase == "auction":
            if self.auction_current is None:
                return "skip"
            min_bid = max(self.auction_bid) + 1
            if min_bid <= self.auction_current["base_value"]:
                min_bid = self.auction_current["base_value"]
            print(f"  AUCTION for {self.auction_current['type']} License")
            print(f"    bid <amount>  - Place a bid (min: ${min_bid})")
            print(f"    pass          - Pass on this auction")
            print()
            move = input_with_quit(f"  {self.players[p]}> ")
            return move.strip()

        elif self.phase == "launch":
            print("  LAUNCH PHASE:")
            print("    launch <license_type>  - Launch a new boat (need matching license)")
            print("    captain <boat#>        - Assign captain to a boat (use fish card)")
            print("    next                   - Move to Fishing phase")
            print()
            move = input_with_quit(f"  {self.players[p]}> ")
            return move.strip()

        elif self.phase == "fish":
            print("  FISHING PHASE:")
            print("    fish <boat#>   - Go fishing with a boat")
            print("    done           - End fishing, move to next round")
            print()
            move = input_with_quit(f"  {self.players[p]}> ")
            return move.strip()

        elif self.phase == "trade":
            print("  TRADE PHASE:")
            print("    sell <fish#>   - Sell a fish card for money")
            print("    done           - End round")
            print()
            move = input_with_quit(f"  {self.players[p]}> ")
            return move.strip()

        return input_with_quit(f"  {self.players[p]}> ").strip()

    def make_move(self, move):
        p = self.current_player - 1
        parts = move.lower().split()
        if not parts:
            return False

        action = parts[0]

        if self.phase == "auction":
            return self._do_auction(p, action, parts)
        elif self.phase == "launch":
            return self._do_launch(p, action, parts)
        elif self.phase == "fish":
            return self._do_fish(p, action, parts)
        elif self.phase == "trade":
            return self._do_trade(p, action, parts)

        return False

    def _do_auction(self, p, action, parts):
        if action == "skip":
            self.phase = "launch"
            return True

        if action == "pass":
            self.auction_passed[p] = True
            opp = 1 - p
            if self.auction_passed[opp]:
                # Both passed, no one gets it
                self._start_auction_round()
            else:
                # Opponent wins the auction
                bid = self.auction_bid[opp]
                if bid >= self.auction_current["base_value"]:
                    self.player_money[opp] -= bid
                    self.player_licenses[opp].append(self.auction_current)
                self.phase = "launch"
            return True

        if action == "bid":
            if len(parts) < 2:
                print("  Usage: bid <amount>")
                input("  Press Enter...")
                return False
            try:
                amount = int(parts[1])
            except ValueError:
                return False

            min_bid = max(self.auction_bid) + 1
            base = self.auction_current["base_value"]
            if min_bid < base:
                min_bid = base

            if amount < min_bid:
                print(f"  Minimum bid is ${min_bid}.")
                input("  Press Enter...")
                return False

            total_available = self._total_funds(p)
            if amount > total_available:
                print(f"  Can't afford! You have ${total_available}.")
                input("  Press Enter...")
                return False

            self.auction_bid[p] = amount

            opp = 1 - p
            if self.auction_passed[opp]:
                # Opponent already passed, we win
                self.player_money[p] -= amount
                self.player_licenses[p].append(self.auction_current)
                self.phase = "launch"
            # Otherwise opponent gets to respond (handled by switch_player in game loop)
            return True

        return False

    def _do_launch(self, p, action, parts):
        if action == "launch":
            if len(parts) < 2:
                print("  Usage: launch <license_type>")
                input("  Press Enter...")
                return False
            ltype = parts[1].title()
            # Check player has an unused license of this type
            available = [lic for lic in self.player_licenses[p] if lic["type"] == ltype]
            boats_of_type = sum(1 for b in self.player_boats[p] if b["type"] == ltype)
            if boats_of_type >= len(available):
                print(f"  No unused {ltype} license! (Have {len(available)} licenses, {boats_of_type} boats)")
                input("  Press Enter...")
                return False

            boat_cost = 2
            if self.player_money[p] < boat_cost:
                print(f"  Launching a boat costs ${boat_cost}.")
                input("  Press Enter...")
                return False

            self.player_money[p] -= boat_cost
            self.player_boats[p].append(_make_boat(ltype))
            return True

        elif action == "captain":
            if len(parts) < 2:
                print("  Usage: captain <boat#>")
                input("  Press Enter...")
                return False
            try:
                bi = int(parts[1]) - 1
            except ValueError:
                return False

            if bi < 0 or bi >= len(self.player_boats[p]):
                print("  Invalid boat.")
                input("  Press Enter...")
                return False

            boat = self.player_boats[p][bi]
            if boat["captain"]:
                print("  Boat already has a captain!")
                input("  Press Enter...")
                return False

            # Need to spend a fish card to assign captain
            if not self.player_fish[p]:
                print("  Need a fish card to assign as captain!")
                input("  Press Enter...")
                return False

            self.player_fish[p].pop()
            boat["captain"] = True
            return True

        elif action == "next":
            self.phase = "fish"
            return True

        return False

    def _do_fish(self, p, action, parts):
        if action == "fish":
            if len(parts) < 2:
                print("  Usage: fish <boat#>")
                input("  Press Enter...")
                return False
            try:
                bi = int(parts[1]) - 1
            except ValueError:
                return False

            if bi < 0 or bi >= len(self.player_boats[p]):
                print("  Invalid boat.")
                input("  Press Enter...")
                return False

            boat = self.player_boats[p][bi]
            if not self.fish_deck:
                print("  No more fish in the sea!")
                input("  Press Enter...")
                return False

            # Draw fish card - captain boats catch better
            catch_count = 2 if boat["captain"] else 1
            caught = []
            for _ in range(catch_count):
                if self.fish_deck:
                    fish = self.fish_deck.pop()
                    boat["fish"].append(fish)
                    self.player_fish[p].append(fish)
                    caught.append(fish)

            catch_str = ", ".join(f"{f['type']}(${f['value']})" for f in caught)
            print(f"  Caught: {catch_str}")
            input("  Press Enter...")
            return True

        elif action == "done":
            self.phase = "trade"
            return True

        return False

    def _do_trade(self, p, action, parts):
        if action == "sell":
            if len(parts) < 2:
                print("  Usage: sell <fish#> (fish index in your collection)")
                input("  Press Enter...")
                return False
            try:
                fi = int(parts[1]) - 1
            except ValueError:
                return False

            if fi < 0 or fi >= len(self.player_fish[p]):
                print("  Invalid fish index.")
                input("  Press Enter...")
                return False

            fish = self.player_fish[p].pop(fi)
            self.player_money[p] += fish["value"]
            print(f"  Sold {fish['type']} for ${fish['value']}!")
            input("  Press Enter...")
            return True

        elif action == "done":
            self.round_number += 1
            if self.round_number > self.max_rounds or not self.auction_pool:
                self.phase = "end"
            else:
                self._start_auction_round()
            return True

        return False

    def _calc_points(self, player_idx):
        points = 0
        # Points from licenses
        for lic in self.player_licenses[player_idx]:
            points += lic["points"]
        # Points from boats (2 each)
        points += len(self.player_boats[player_idx]) * 2
        # Points from captains (1 bonus each)
        points += sum(1 for b in self.player_boats[player_idx] if b["captain"])
        # Points from fish
        points += sum(f["value"] for f in self.player_fish[player_idx])
        # Tournament bonus
        if self.variation == "tournament":
            # Bonus for most license types
            types = set(lic["type"] for lic in self.player_licenses[player_idx])
            if len(types) >= 3:
                points += 5
            if len(types) >= 5:
                points += 10
        return points

    def check_game_over(self):
        if self.phase == "end" or self.round_number > self.max_rounds:
            self.game_over = True
            p0 = self._calc_points(0)
            p1 = self._calc_points(1)
            self.player_points = [p0, p1]
            if p0 > p1:
                self.winner = 1
            elif p1 > p0:
                self.winner = 2
            else:
                # Tiebreak by money
                if self.player_money[0] > self.player_money[1]:
                    self.winner = 1
                elif self.player_money[1] > self.player_money[0]:
                    self.winner = 2
                else:
                    self.winner = None

    def get_state(self):
        return {
            "available_license_types": self.available_license_types[:],
            "auction_pool": copy.deepcopy(self.auction_pool),
            "player_money": self.player_money[:],
            "player_licenses": copy.deepcopy(self.player_licenses),
            "player_boats": copy.deepcopy(self.player_boats),
            "player_fish": copy.deepcopy(self.player_fish),
            "player_points": self.player_points[:],
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "phase": self.phase,
            "auction_current": copy.deepcopy(self.auction_current),
            "auction_bid": self.auction_bid[:],
            "auction_passed": self.auction_passed[:],
            "auction_bidder": self.auction_bidder,
            "fish_deck": copy.deepcopy(self.fish_deck),
        }

    def load_state(self, state):
        self.available_license_types = state["available_license_types"]
        self.auction_pool = state["auction_pool"]
        self.player_money = state["player_money"]
        self.player_licenses = state["player_licenses"]
        self.player_boats = state["player_boats"]
        self.player_fish = state["player_fish"]
        self.player_points = state["player_points"]
        self.round_number = state["round_number"]
        self.max_rounds = state["max_rounds"]
        self.phase = state["phase"]
        self.auction_current = state["auction_current"]
        self.auction_bid = state["auction_bid"]
        self.auction_passed = state["auction_passed"]
        self.auction_bidder = state["auction_bidder"]
        self.fish_deck = state["fish_deck"]

    def get_tutorial(self):
        return """
====================================================
  FLEET - Tutorial
====================================================

OVERVIEW:
  You are a fleet captain competing to build the
  most profitable fishing fleet. Bid on licenses,
  launch boats, and haul in the catch!

EACH ROUND HAS 4 PHASES:

1. AUCTION
   - A fishing license is put up for auction
   - Players bid with money; highest bidder wins
   - bid <amount> to bid, pass to skip
   - Licenses: Cod($2), Shrimp($3), Lobster($5),
     Tuna($7), Swordfish($9)

2. LAUNCH
   - launch <type> - Launch a boat (costs $2, needs license)
   - captain <boat#> - Assign captain (costs a fish card)
   - Captained boats catch double fish

3. FISHING
   - fish <boat#> - Send a boat fishing
   - Each boat draws fish cards of random types/values
   - Fish cards serve as money and score points

4. TRADE
   - sell <fish#> - Sell fish cards for cash
   - Cash is needed for auctions and boats

SCORING:
  - License points (3-10 per license)
  - Boats (2 pts each)
  - Captains (1 bonus pt each)
  - Fish card values
  - Tournament: bonus for license variety

STRATEGY:
  - Don't overbid; you need cash for boats
  - Captained boats are much more efficient
  - Balance fishing vs. selling
====================================================
"""
