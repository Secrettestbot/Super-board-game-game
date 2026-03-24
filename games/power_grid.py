"""Power Grid - Auction power plants, buy resources, expand your network."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Resource types and starting supply
RESOURCE_TYPES = ["coal", "oil", "garbage", "uranium"]
RESOURCE_SHORT = {"coal": "C", "oil": "O", "garbage": "G", "uranium": "U"}

# Supply track: price per unit based on quantity available
# Index = units remaining at that price level, value = price
SUPPLY_PRICES = {
    "coal":    {1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4, 11: 4, 12: 4,
                13: 5, 14: 5, 15: 5, 16: 6, 17: 6, 18: 6, 19: 7, 20: 7, 21: 7, 22: 8, 23: 8, 24: 8},
    "oil":     {1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4, 11: 4, 12: 4,
                13: 5, 14: 5, 15: 5, 16: 6, 17: 6, 18: 6, 19: 7, 20: 7, 21: 7, 22: 8, 23: 8, 24: 8},
    "garbage": {1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4, 11: 4, 12: 4,
                13: 5, 14: 5, 15: 5, 16: 6, 17: 6, 18: 6, 19: 7, 20: 7, 21: 7, 22: 8, 23: 8, 24: 8},
    "uranium": {1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 6, 11: 7, 12: 8},
}

# Replenish rates per step
REPLENISH = {
    1: {"coal": 4, "oil": 3, "garbage": 2, "uranium": 1},
    2: {"coal": 5, "oil": 4, "garbage": 3, "uranium": 1},
    3: {"coal": 3, "oil": 2, "garbage": 2, "uranium": 1},
}

# Power plant definitions: (min_bid, resource_type, resource_cost, cities_powered)
POWER_PLANTS = [
    {"id": 3,  "fuel": "oil",     "cost": 2, "powers": 1, "min_bid": 3},
    {"id": 4,  "fuel": "coal",    "cost": 2, "powers": 1, "min_bid": 4},
    {"id": 5,  "fuel": "coal/oil","cost": 2, "powers": 1, "min_bid": 5},
    {"id": 6,  "fuel": "garbage", "cost": 1, "powers": 1, "min_bid": 6},
    {"id": 7,  "fuel": "oil",     "cost": 3, "powers": 2, "min_bid": 7},
    {"id": 8,  "fuel": "coal",    "cost": 3, "powers": 2, "min_bid": 8},
    {"id": 9,  "fuel": "oil",     "cost": 1, "powers": 1, "min_bid": 9},
    {"id": 10, "fuel": "coal",    "cost": 2, "powers": 2, "min_bid": 10},
    {"id": 11, "fuel": "uranium", "cost": 1, "powers": 2, "min_bid": 11},
    {"id": 12, "fuel": "coal/oil","cost": 2, "powers": 2, "min_bid": 12},
    {"id": 13, "fuel": "wind",    "cost": 0, "powers": 1, "min_bid": 13},
    {"id": 14, "fuel": "garbage", "cost": 2, "powers": 2, "min_bid": 14},
    {"id": 15, "fuel": "coal",    "cost": 2, "powers": 3, "min_bid": 15},
    {"id": 16, "fuel": "oil",     "cost": 2, "powers": 3, "min_bid": 16},
    {"id": 17, "fuel": "uranium", "cost": 1, "powers": 2, "min_bid": 17},
    {"id": 18, "fuel": "wind",    "cost": 0, "powers": 2, "min_bid": 18},
    {"id": 19, "fuel": "garbage", "cost": 2, "powers": 3, "min_bid": 19},
    {"id": 20, "fuel": "coal",    "cost": 3, "powers": 5, "min_bid": 20},
    {"id": 21, "fuel": "coal/oil","cost": 2, "powers": 4, "min_bid": 21},
    {"id": 22, "fuel": "wind",    "cost": 0, "powers": 3, "min_bid": 22},
    {"id": 23, "fuel": "uranium", "cost": 1, "powers": 3, "min_bid": 23},
    {"id": 24, "fuel": "garbage", "cost": 2, "powers": 4, "min_bid": 24},
]

DELUXE_PLANTS = [
    {"id": 25, "fuel": "coal",    "cost": 2, "powers": 5, "min_bid": 25},
    {"id": 26, "fuel": "oil",     "cost": 2, "powers": 5, "min_bid": 26},
    {"id": 27, "fuel": "wind",    "cost": 0, "powers": 4, "min_bid": 27},
    {"id": 28, "fuel": "uranium", "cost": 1, "powers": 4, "min_bid": 28},
]

# City network: adjacency list with connection costs
CITIES = {
    "Alpha":   {"connections": {"Beta": 5, "Gamma": 8, "Delta": 12}},
    "Beta":    {"connections": {"Alpha": 5, "Gamma": 6, "Epsilon": 10}},
    "Gamma":   {"connections": {"Alpha": 8, "Beta": 6, "Delta": 7, "Zeta": 9}},
    "Delta":   {"connections": {"Alpha": 12, "Gamma": 7, "Zeta": 5, "Eta": 8}},
    "Epsilon": {"connections": {"Beta": 10, "Zeta": 11, "Theta": 6}},
    "Zeta":    {"connections": {"Gamma": 9, "Delta": 5, "Epsilon": 11, "Eta": 4, "Theta": 7}},
    "Eta":     {"connections": {"Delta": 8, "Zeta": 4, "Iota": 6}},
    "Theta":   {"connections": {"Epsilon": 6, "Zeta": 7, "Iota": 9, "Kappa": 5}},
    "Iota":    {"connections": {"Eta": 6, "Theta": 9, "Kappa": 8}},
    "Kappa":   {"connections": {"Theta": 5, "Iota": 8}},
}

# Payment table: cities powered -> income
INCOME_TABLE = [10, 22, 33, 44, 54, 64, 73, 82, 90, 98, 105]


class PowerGridGame(BaseGame):
    """Power Grid: Auction plants, buy resources, expand your electrical network."""

    name = "Power Grid"
    description = "Auction power plants, buy resources, and power the most cities"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Classic Power Grid with 10-city network",
        "deluxe": "Extra high-value power plants and bonus scoring",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.money = [50, 50]
        self.plants = [[], []]  # power plants owned (max 3)
        self.plant_resources = [{}, {}]  # plant_id -> {resource: count}
        self.cities = [[], []]  # cities connected
        self.supply = {"coal": 24, "oil": 18, "garbage": 12, "uranium": 8}
        self.market_current = []  # 4 plants in current market
        self.market_future = []  # 4 plants in future market
        self.plant_deck = []
        self.step = 1
        self.phase = "auction"  # auction, resource, build, power
        self.auction_plant = None
        self.auction_bid = 0
        self.auction_bidder = 0
        self.auction_passed = [False, False]
        self.cities_to_win = 7
        self.round_number = 0

    def setup(self):
        """Initialize power plant market, resources, and network."""
        plants = [dict(p) for p in POWER_PLANTS]
        if self.variation == "deluxe":
            plants.extend([dict(p) for p in DELUXE_PLANTS])
        random.shuffle(plants)
        # Sort by min_bid for initial market
        plants.sort(key=lambda p: p["min_bid"])
        self.market_current = plants[:4]
        self.market_future = plants[4:8]
        self.plant_deck = plants[8:]
        random.shuffle(self.plant_deck)
        self.phase = "auction"
        self.round_number = 1

    def _get_resource_price(self, resource, amount):
        """Calculate cost to buy 'amount' of a resource."""
        available = self.supply.get(resource, 0)
        if available < amount:
            return -1  # not enough
        prices = SUPPLY_PRICES.get(resource, {})
        total_cost = 0
        remaining = available
        for _ in range(amount):
            price = prices.get(remaining, 8)
            total_cost += price
            remaining -= 1
        return total_cost

    def _connection_cost(self, pi, target_city):
        """Calculate cheapest cost to connect to target city."""
        owned = set(self.cities[pi])
        if not owned:
            return 10  # first city base cost
        if target_city in owned:
            return -1
        # BFS for cheapest path from owned network to target
        import heapq
        dist = {city: float('inf') for city in CITIES}
        for city in owned:
            dist[city] = 0
        pq = [(0, city) for city in owned]
        heapq.heapify(pq)
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue
            for neighbor, cost in CITIES[u]["connections"].items():
                new_dist = d + cost
                if new_dist < dist[neighbor]:
                    dist[neighbor] = new_dist
                    heapq.heappush(pq, (new_dist, neighbor))
        conn_cost = dist.get(target_city, float('inf'))
        if conn_cost == float('inf'):
            return -1
        return conn_cost + 10  # connection cost + city cost

    def _refill_market(self):
        """Refill power plant market from deck."""
        while len(self.market_current) < 4 and self.market_future:
            self.market_current.append(self.market_future.pop(0))
        while len(self.market_future) < 4 and self.plant_deck:
            self.market_future.append(self.plant_deck.pop(0))
        self.market_current.sort(key=lambda p: p["min_bid"])
        self.market_future.sort(key=lambda p: p["min_bid"])

    def _replenish_resources(self):
        """Add resources to supply based on current step."""
        rates = REPLENISH.get(self.step, REPLENISH[1])
        max_supply = {"coal": 24, "oil": 18, "garbage": 12, "uranium": 8}
        if self.variation == "deluxe":
            max_supply = {"coal": 28, "oil": 22, "garbage": 16, "uranium": 10}
        for res, amount in rates.items():
            self.supply[res] = min(self.supply[res] + amount, max_supply[res])

    def display(self):
        """Display game state."""
        print(f"\n{'='*60}")
        print(f"  POWER GRID  (Round {self.round_number}, Step {self.step}, "
              f"Phase: {self.phase.upper()})")
        print(f"{'='*60}")

        # Power plant markets
        print(f"\n  --- CURRENT MARKET ---")
        for j, plant in enumerate(self.market_current):
            fuel_str = plant["fuel"]
            cost_str = f"{plant['cost']} {fuel_str}" if plant["cost"] > 0 else "free (wind)"
            print(f"    {j+1}. Plant #{plant['id']} - Powers {plant['powers']} cities "
                  f"({cost_str}) [Min bid: {plant['min_bid']}]")
        print(f"\n  --- FUTURE MARKET ---")
        for j, plant in enumerate(self.market_future):
            print(f"    {j+1}. Plant #{plant['id']} - Powers {plant['powers']} ({plant['fuel']})")

        # Resource supply
        print(f"\n  --- RESOURCE SUPPLY ---")
        for res in RESOURCE_TYPES:
            available = self.supply[res]
            price = self._get_resource_price(res, 1) if available > 0 else "N/A"
            print(f"    {res.capitalize():10s}: {available} available (next unit: {price})")

        # City network
        print(f"\n  --- CITY NETWORK ---")
        for city_name in sorted(CITIES.keys()):
            occupants = []
            for pi in range(2):
                if city_name in self.cities[pi]:
                    occupants.append(f"P{pi+1}")
            occ_str = f" [{'/'.join(occupants)}]" if occupants else ""
            neighbors = ", ".join(f"{n}({c})" for n, c in CITIES[city_name]["connections"].items())
            print(f"    {city_name}{occ_str} -> {neighbors}")

        # Player info
        print(f"\n  --- PLAYERS ---")
        for pi in range(2):
            plant_str = ", ".join(f"#{p['id']}({p['fuel']}:{p['powers']})" for p in self.plants[pi])
            if not plant_str:
                plant_str = "none"
            res_str = ""
            for pid, res in self.plant_resources[pi].items():
                if res:
                    res_str += f" #{pid}:"
                    res_str += "+".join(f"{v}{RESOURCE_SHORT[k]}" for k, v in res.items() if v > 0)
            print(f"  P{pi+1}: Money:{self.money[pi]} Cities:{len(self.cities[pi])} "
                  f"Plants:[{plant_str}]")
            if res_str:
                print(f"       Stored resources:{res_str}")
            if self.cities[pi]:
                print(f"       Network: {', '.join(sorted(self.cities[pi]))}")

        # Auction state
        if self.phase == "auction" and self.auction_plant:
            print(f"\n  AUCTION: Plant #{self.auction_plant['id']} - "
                  f"Current bid: {self.auction_bid} by P{self.auction_bidder+1}")
        print(f"\n  Cities to win: {self.cities_to_win}")
        print(f"{'='*60}")

    def get_move(self):
        """Get player action."""
        pi = self.current_player - 1
        print(f"\n  {self.players[self.current_player-1]}'s turn ({self.phase} phase):")
        if self.phase == "auction":
            if self.auction_plant is None:
                print("  Commands: bid <market#> <amount> | pass")
            else:
                print(f"  Auction for Plant #{self.auction_plant['id']} (current: {self.auction_bid})")
                print("  Commands: raise <amount> | pass")
        elif self.phase == "resource":
            print("  Commands: buy <resource> <amount> <plant_id> | done")
        elif self.phase == "build":
            print("  Commands: connect <city_name> | done")
        elif self.phase == "power":
            print("  Commands: power <plant_id> [<plant_id>...] | done")
        return input_with_quit("  > ").strip().lower()

    def make_move(self, move):
        """Process player action."""
        pi = self.current_player - 1
        parts = move.split()
        if not parts:
            return False
        cmd = parts[0]

        if self.phase == "auction":
            if self.auction_plant is None:
                if cmd == "bid" and len(parts) == 3:
                    try:
                        idx = int(parts[1]) - 1
                        amount = int(parts[2])
                    except ValueError:
                        return False
                    if idx < 0 or idx >= len(self.market_current):
                        return False
                    plant = self.market_current[idx]
                    if amount < plant["min_bid"]:
                        print(f"  Minimum bid is {plant['min_bid']}!")
                        return False
                    if amount > self.money[pi]:
                        print(f"  Not enough money! Have {self.money[pi]}.")
                        return False
                    if len(self.plants[pi]) >= 3:
                        print("  Max 3 plants! Sell one first (auto-replace cheapest).")
                    self.auction_plant = plant
                    self.auction_bid = amount
                    self.auction_bidder = pi
                    self.auction_passed = [False, False]
                    return True
                elif cmd == "pass":
                    self.auction_passed[pi] = True
                    if all(self.auction_passed):
                        self.phase = "resource"
                        self.auction_passed = [False, False]
                    return True
            else:
                if cmd == "raise" and len(parts) == 2:
                    try:
                        amount = int(parts[1])
                    except ValueError:
                        return False
                    if amount <= self.auction_bid:
                        print(f"  Must bid higher than {self.auction_bid}!")
                        return False
                    if amount > self.money[pi]:
                        print(f"  Not enough money!")
                        return False
                    self.auction_bid = amount
                    self.auction_bidder = pi
                    return True
                elif cmd == "pass":
                    self.auction_passed[pi] = True
                    # If only one bidder left, they win
                    active_bidders = sum(1 for p in self.auction_passed if not p)
                    if active_bidders <= 1 or all(p or i == self.auction_bidder
                                                   for i, p in enumerate(self.auction_passed)):
                        winner = self.auction_bidder
                        self.money[winner] -= self.auction_bid
                        # Replace cheapest plant if at max
                        if len(self.plants[winner]) >= 3:
                            self.plants[winner].sort(key=lambda p: p["min_bid"])
                            removed = self.plants[winner].pop(0)
                            if str(removed["id"]) in self.plant_resources[winner]:
                                del self.plant_resources[winner][str(removed["id"])]
                        self.plants[winner].append(self.auction_plant)
                        self.plant_resources[winner][str(self.auction_plant["id"])] = {}
                        self.market_current.remove(self.auction_plant)
                        self._refill_market()
                        self.auction_plant = None
                        self.auction_bid = 0
                        self.auction_passed = [False, False]
                        # Move to next phase after all players have had a chance
                        self.phase = "resource"
                    return True

        elif self.phase == "resource":
            if cmd == "buy" and len(parts) == 4:
                resource = parts[1]
                try:
                    amount = int(parts[2])
                    plant_id = parts[3]
                except ValueError:
                    return False
                if resource not in RESOURCE_TYPES:
                    print(f"  Invalid resource! Use: {', '.join(RESOURCE_TYPES)}")
                    return False
                # Verify player owns plant
                plant = None
                for p in self.plants[pi]:
                    if str(p["id"]) == plant_id:
                        plant = p
                        break
                if plant is None:
                    print(f"  You don't own plant #{plant_id}!")
                    return False
                # Check fuel compatibility
                valid_fuels = plant["fuel"].split("/")
                if resource not in valid_fuels and plant["fuel"] != "wind":
                    print(f"  Plant #{plant_id} uses {plant['fuel']}, not {resource}!")
                    return False
                # Check storage (2x cost capacity)
                stored = self.plant_resources[pi].get(plant_id, {})
                current_stored = sum(stored.values())
                max_store = plant["cost"] * 2
                if current_stored + amount > max_store:
                    print(f"  Plant #{plant_id} can store {max_store}, has {current_stored}!")
                    return False
                price = self._get_resource_price(resource, amount)
                if price < 0:
                    print(f"  Not enough {resource} in supply!")
                    return False
                if price > self.money[pi]:
                    print(f"  Costs {price}, you have {self.money[pi]}!")
                    return False
                self.money[pi] -= price
                self.supply[resource] -= amount
                if plant_id not in self.plant_resources[pi]:
                    self.plant_resources[pi][plant_id] = {}
                self.plant_resources[pi][plant_id][resource] = \
                    self.plant_resources[pi][plant_id].get(resource, 0) + amount
                return True
            elif cmd == "done":
                self.phase = "build"
                return True

        elif self.phase == "build":
            if cmd == "connect" and len(parts) == 2:
                city_name = parts[1].capitalize()
                if city_name not in CITIES:
                    print(f"  Unknown city! Available: {', '.join(sorted(CITIES.keys()))}")
                    return False
                # Check step restrictions
                if self.step == 1:
                    for opp in range(2):
                        if opp != pi and city_name in self.cities[opp]:
                            print(f"  In Step 1, only one player per city!")
                            return False
                cost = self._connection_cost(pi, city_name)
                if cost < 0:
                    print(f"  Cannot connect to {city_name}!")
                    return False
                if cost > self.money[pi]:
                    print(f"  Costs {cost}, you have {self.money[pi]}!")
                    return False
                self.money[pi] -= cost
                self.cities[pi].append(city_name)
                # Check step advancement
                max_cities = max(len(self.cities[0]), len(self.cities[1]))
                if max_cities >= 4 and self.step == 1:
                    self.step = 2
                    print("  *** STEP 2 REACHED! Multiple players per city allowed. ***")
                    input("  Press Enter to continue...")
                elif max_cities >= 6 and self.step == 2:
                    self.step = 3
                    print("  *** STEP 3 REACHED! Final phase! ***")
                    # Remove lowest plant from market
                    if self.market_current:
                        self.market_current.pop(0)
                        self._refill_market()
                    input("  Press Enter to continue...")
                return True
            elif cmd == "done":
                self.phase = "power"
                return True

        elif self.phase == "power":
            if cmd == "power" and len(parts) >= 2:
                plant_ids = parts[1:]
                total_powered = 0
                for pid in plant_ids:
                    plant = None
                    for p in self.plants[pi]:
                        if str(p["id"]) == pid:
                            plant = p
                            break
                    if plant is None:
                        print(f"  You don't own plant #{pid}!")
                        return False
                    if plant["fuel"] == "wind":
                        total_powered += plant["powers"]
                        continue
                    stored = self.plant_resources[pi].get(pid, {})
                    total_stored = sum(stored.values())
                    if total_stored < plant["cost"]:
                        print(f"  Plant #{pid} needs {plant['cost']} fuel, has {total_stored}!")
                        return False
                    # Consume fuel
                    remaining = plant["cost"]
                    for res in list(stored.keys()):
                        consume = min(remaining, stored[res])
                        stored[res] -= consume
                        remaining -= consume
                        if stored[res] <= 0:
                            del stored[res]
                        if remaining <= 0:
                            break
                    self.plant_resources[pi][pid] = stored
                    total_powered += plant["powers"]
                # Cap at cities owned
                powered = min(total_powered, len(self.cities[pi]))
                income = INCOME_TABLE[min(powered, len(INCOME_TABLE) - 1)]
                self.money[pi] += income
                print(f"  Powered {powered} cities, earned {income} money!")
                input("  Press Enter to continue...")
                # End of round processing
                if self.current_player == 2:
                    self._replenish_resources()
                    self.round_number += 1
                self.phase = "auction"
                self.auction_plant = None
                self.auction_passed = [False, False]
                return True
            elif cmd == "done":
                powered = 0
                income = INCOME_TABLE[min(powered, len(INCOME_TABLE) - 1)]
                self.money[pi] += income
                print(f"  Powered 0 cities, earned {income} money.")
                input("  Press Enter to continue...")
                if self.current_player == 2:
                    self._replenish_resources()
                    self.round_number += 1
                self.phase = "auction"
                self.auction_plant = None
                self.auction_passed = [False, False]
                return True

        return False

    def check_game_over(self):
        """Game ends when a player reaches target cities."""
        for pi in range(2):
            if len(self.cities[pi]) >= self.cities_to_win:
                self.game_over = True
                # Most powered cities wins
                powered = [0, 0]
                for p in range(2):
                    cap = sum(pl["powers"] for pl in self.plants[p])
                    powered[p] = min(cap, len(self.cities[p]))
                if powered[0] > powered[1]:
                    self.winner = 1
                elif powered[1] > powered[0]:
                    self.winner = 2
                else:
                    if self.money[0] > self.money[1]:
                        self.winner = 1
                    elif self.money[1] > self.money[0]:
                        self.winner = 2
                    else:
                        self.winner = None
                return

    def get_state(self):
        """Return serializable game state."""
        return {
            "money": self.money, "plants": self.plants,
            "plant_resources": self.plant_resources, "cities": self.cities,
            "supply": self.supply, "market_current": self.market_current,
            "market_future": self.market_future, "plant_deck": self.plant_deck,
            "step": self.step, "phase": self.phase,
            "auction_plant": self.auction_plant, "auction_bid": self.auction_bid,
            "auction_bidder": self.auction_bidder, "auction_passed": self.auction_passed,
            "cities_to_win": self.cities_to_win, "round_number": self.round_number,
        }

    def load_state(self, state):
        """Restore game state."""
        self.money = state["money"]
        self.plants = state["plants"]
        self.plant_resources = state["plant_resources"]
        self.cities = state["cities"]
        self.supply = state["supply"]
        self.market_current = state["market_current"]
        self.market_future = state["market_future"]
        self.plant_deck = state["plant_deck"]
        self.step = state["step"]
        self.phase = state["phase"]
        self.auction_plant = state["auction_plant"]
        self.auction_bid = state["auction_bid"]
        self.auction_bidder = state["auction_bidder"]
        self.auction_passed = state["auction_passed"]
        self.cities_to_win = state["cities_to_win"]
        self.round_number = state["round_number"]

    def get_tutorial(self):
        """Return tutorial text."""
        deluxe_note = """
  DELUXE VARIANT:
  Includes extra high-value power plants (#25-28)
  and increased resource supply caps for longer,
  more strategic games.
""" if self.variation == "deluxe" else ""
        return f"""
==================================================
  Power Grid - Tutorial
==================================================

  OVERVIEW:
  Build the most powerful electrical network!
  Auction power plants, buy fuel resources, expand
  your city network, and power the most cities.
  First to connect {self.cities_to_win} cities triggers end game.

  PHASES (each round):

  1. AUCTION - Buy power plants:
     Command: bid <market#> <amount>
     Command: raise <amount> (outbid opponent)
     Command: pass
     - Current market shows 4 plants to bid on
     - Future market shows upcoming plants
     - Max 3 plants per player (auto-replace lowest)

  2. RESOURCES - Buy fuel for your plants:
     Command: buy <resource> <amount> <plant_id>
     Command: done
     - Resources: coal, oil, garbage, uranium
     - Prices increase as supply decreases
     - Each plant stores up to 2x its fuel cost
     - Wind plants need no fuel!

  3. BUILD - Expand your city network:
     Command: connect <city_name>
     Command: done
     - First city costs 10 (base cost)
     - Additional cities: connection cost + 10
     - Connection cost = cheapest path to network
     - Step 1: one player per city
     - Step 2+: multiple players allowed

  4. POWER - Generate electricity for income:
     Command: power <plant_id> [<plant_id>...]
     Command: done
     - Spend stored fuel to power cities
     - More cities powered = more income
     - Income: 10, 22, 33, 44, 54, 64, 73...

  STEPS:
  - Step 1: 0-3 cities (one player per city)
  - Step 2: 4-5 cities (open cities, faster)
  - Step 3: 6+ cities (final phase)

  POWER PLANTS:
  - Coal/Oil/Garbage: burn fuel to power cities
  - Uranium: efficient but expensive fuel
  - Wind: free power, no fuel needed!
  - Coal/Oil hybrid: accepts either fuel type

  SUPPLY & DEMAND:
  Resource prices rise when supply is low.
  Resources replenish each round based on step.
  Buy early when prices are low!
{deluxe_note}
  WINNING:
  Game ends when someone connects {self.cities_to_win} cities.
  Player powering most cities wins.
  Ties broken by most money.

  STRATEGY:
  - Diversify fuel types to avoid competition
  - Wind plants are valuable - no fuel costs
  - Don't overbid on early plants
  - Expand network efficiently (short paths)
  - Stock fuel when prices are low
  - Balance plant upgrades with network growth

==================================================
"""
