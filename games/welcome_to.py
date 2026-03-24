"""Welcome To... - Flip-and-write neighborhood building game.

Choose house numbers and actions to build the best neighborhood.
Fill three streets with house numbers in ascending order, build parks,
pools, and fences to score points.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Actions available
ACTIONS = ["Landscaper", "Surveyor", "Agent", "Pool", "Temp", "Bis"]
ACTION_DESC = {
    "Landscaper": "Add a park to the street",
    "Surveyor": "Build a fence between houses",
    "Agent": "+1 to estate value",
    "Pool": "Add a pool to a house",
    "Temp": "Use a number +/- 2",
    "Bis": "Duplicate an adjacent number",
}

# Street sizes
STREET_SIZES = [10, 11, 12]

# Construction card: (number, action)
def make_deck():
    """Create the construction deck: 81 cards."""
    deck = []
    for num in range(1, 16):
        for action in ACTIONS:
            deck.append((num, action))
    # Add some extra low/high combos
    for num in [1, 2, 3, 13, 14, 15]:
        deck.append((num, random.choice(ACTIONS)))
    random.shuffle(deck)
    return deck


class WelcomeToGame(BaseGame):
    """Welcome To... - Flip-and-write neighborhood building."""

    name = "Welcome To"
    description = "Flip-and-write - build the best neighborhood with house numbers"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "halloween": "Halloween Theme",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.flipped = []  # 3 pairs of (number, action) available each turn
        self.streets = {}  # player -> [street0, street1, street2] each is list
        self.pools = {}    # player -> [street][house_idx] = bool
        self.fences = {}   # player -> [street][fence_idx] = bool
        self.parks = {}    # player -> [street] = count
        self.estates_bonus = {}  # player -> int
        self.used_bis = {}       # player -> count
        self.refusals = {}       # player -> count (max 3)
        self.round_number = 0
        self.log = []
        self.halloween = self.variation == "halloween"
        # Pool positions (fixed per street)
        self.pool_positions = {
            0: [2, 6, 9],
            1: [0, 3, 7, 10],
            2: [1, 5, 8, 11],
        }

    def setup(self):
        self.deck = make_deck()
        self.flipped = []
        for p in [1, 2]:
            sp = str(p)
            self.streets[sp] = [
                [None] * STREET_SIZES[i] for i in range(3)
            ]
            self.pools[sp] = [
                [False] * STREET_SIZES[i] for i in range(3)
            ]
            self.fences[sp] = [
                [False] * (STREET_SIZES[i] - 1) for i in range(3)
            ]
            self.parks[sp] = [0, 0, 0]
            self.estates_bonus[sp] = 0
            self.used_bis[sp] = 0
            self.refusals[sp] = 0
        self.round_number = 1
        self._flip_cards()
        self.log = ["Game started! Choose a card combo each turn."]

    def _flip_cards(self):
        """Flip 3 construction card pairs."""
        self.flipped = []
        for _ in range(3):
            if len(self.deck) < 2:
                self.deck = make_deck()
            num_card = self.deck.pop()
            act_card = self.deck.pop()
            # Pair: number from first card, action from second
            self.flipped.append((num_card[0], act_card[1]))

    def _can_place_number(self, player, street, house, number):
        """Check if number can go at this position (ascending order)."""
        sp = str(player)
        st = self.streets[sp][street]
        if st[house] is not None:
            return False
        if number < 1 or number > 15:
            return False
        # Check ascending: all filled houses to the left must be < number
        for i in range(house):
            if st[i] is not None and st[i] >= number:
                return False
        # All filled houses to the right must be > number
        for i in range(house + 1, len(st)):
            if st[i] is not None and st[i] <= number:
                return False
        return True

    def _get_valid_placements(self, player, number):
        """Get all valid (street, house) for a number."""
        placements = []
        for si in range(3):
            for hi in range(STREET_SIZES[si]):
                if self._can_place_number(player, si, hi, number):
                    placements.append((si, hi))
        return placements

    def _count_estates(self, player, street):
        """Count estate groups (consecutive houses between fences)."""
        sp = str(player)
        st = self.streets[sp][street]
        fences = self.fences[sp][street]
        groups = []
        current = 0
        for i in range(len(st)):
            if st[i] is not None:
                current += 1
            if i < len(fences) and fences[i]:
                if current > 0:
                    groups.append(current)
                current = 0
        if current > 0:
            groups.append(current)
        return groups

    def _calc_score(self, player):
        sp = str(player)
        score = 0
        # Parks scoring: per street, parks * (filled houses in street)
        for si in range(3):
            park_count = self.parks[sp][si]
            park_scores = [0, 2, 4, 7, 11, 16, 22]
            score += park_scores[min(park_count, 6)]

        # Pool scoring
        pool_count = sum(
            sum(1 for h, v in enumerate(self.pools[sp][si]) if v)
            for si in range(3)
        )
        pool_scores = [0, 3, 6, 9, 13, 17, 21, 26, 31, 36]
        score += pool_scores[min(pool_count, 9)]

        # Estate scoring (groups of filled consecutive houses)
        estate_values = {1: 1, 2: 3, 3: 7, 4: 12, 5: 18, 6: 25}
        for si in range(3):
            for g in self._count_estates(player, si):
                score += estate_values.get(min(g, 6), 25)
        score += self.estates_bonus[sp]

        # Penalties for refusals
        refusal_pen = [0, 0, 3, 5, 8]
        score -= refusal_pen[min(self.refusals[sp], 4)]

        # Halloween bonus: extra point per pool
        if self.halloween:
            score += pool_count

        return score

    def display(self):
        clear_screen()
        theme = "Halloween" if self.halloween else "Standard"
        print(f"{'=' * 65}")
        print(f"  WELCOME TO... - {theme} | Round {self.round_number}")
        print(f"{'=' * 65}")

        # Show flipped cards
        print("\n  Available combos:")
        for i, (num, act) in enumerate(self.flipped):
            print(f"    [{i+1}] Number {num:2d} + {act} ({ACTION_DESC[act]})")

        for p in [1, 2]:
            sp = str(p)
            marker = " << your turn" if p == self.current_player else ""
            score = self._calc_score(p)
            print(f"\n  {self.players[p-1]} | Score: {score} | "
                  f"Refusals: {self.refusals[sp]}/3{marker}")
            for si in range(3):
                st = self.streets[sp][si]
                size = STREET_SIZES[si]
                cells = []
                for hi in range(size):
                    val = st[hi]
                    pool = self.pools[sp][si][hi]
                    pool_mark = "~" if pool else " "
                    if val is not None:
                        cells.append(f"{pool_mark}{val:2d}{pool_mark}")
                    else:
                        pool_avail = "o" if hi in self.pool_positions[si] else "."
                        cells.append(f" {pool_avail}  ")
                # Show fences
                row_str = ""
                for hi in range(size):
                    row_str += cells[hi]
                    if hi < size - 1:
                        if self.fences[sp][si][hi]:
                            row_str += "|"
                        else:
                            row_str += " "
                parks_str = f" Parks:{self.parks[sp][si]}"
                print(f"    St{si+1}: {row_str}{parks_str}")

        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        print(f"  {self.players[cp-1]}, choose a combo or refuse:")
        print(f"    [1-3] Pick a combo")
        print(f"    [0] Refuse (penalty if 3+ refusals)")
        choice = input_with_quit("  Combo: ").strip()

        if choice == "0":
            return {"action": "refuse"}

        try:
            ci = int(choice) - 1
            if ci < 0 or ci >= len(self.flipped):
                return None
        except ValueError:
            return None

        number, action = self.flipped[ci]

        # Handle Temp action: adjust number
        if action == "Temp":
            print(f"  Temp: adjust {number} by -2 to +2.")
            adj = input_with_quit(f"  Adjustment (-2 to +2): ").strip()
            try:
                a = int(adj)
                if -2 <= a <= 2:
                    number = max(1, min(15, number + a))
            except ValueError:
                pass

        placements = self._get_valid_placements(cp, number)
        if not placements:
            print(f"  No valid placement for {number}. Refusing.")
            input_with_quit("  Press Enter...")
            return {"action": "refuse"}

        print(f"  Place {number} where? (street,house)")
        for si, hi in placements:
            print(f"    ({si+1},{hi+1}) - Street {si+1}, House {hi+1}")
        pos = input_with_quit("  Position (street,house): ").strip()
        try:
            parts = pos.split(",")
            si = int(parts[0]) - 1
            hi = int(parts[1]) - 1
            if (si, hi) not in placements:
                return None
        except (ValueError, IndexError):
            return None

        result = {"action": "place", "combo": ci, "number": number,
                  "street": si, "house": hi, "act_action": action}

        # Handle action-specific inputs
        if action == "Pool":
            if hi in self.pool_positions[si] and not self.pools[sp][si][hi]:
                result["pool"] = True
            else:
                result["pool"] = False
        elif action == "Surveyor":
            # Place fence adjacent to this house
            fence_opts = []
            if hi > 0 and not self.fences[sp][si][hi - 1]:
                fence_opts.append(hi - 1)
            if hi < STREET_SIZES[si] - 1 and not self.fences[sp][si][hi]:
                fence_opts.append(hi)
            if fence_opts:
                print(f"  Surveyor: Place fence at which position?")
                for fi in fence_opts:
                    print(f"    [{fi+1}] Between houses {fi+1} and {fi+2}")
                fc = input_with_quit("  Fence: ").strip()
                try:
                    fi = int(fc) - 1
                    if fi in fence_opts:
                        result["fence"] = fi
                except ValueError:
                    pass

        return result

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move.get("action")

        if action == "refuse":
            self.refusals[sp] += 1
            self.log.append(f"{self.players[cp-1]} refused. "
                            f"({self.refusals[sp]} refusals)")
            return self._advance_turn()

        if action == "place":
            si = move["street"]
            hi = move["house"]
            number = move["number"]
            act = move["act_action"]

            if not self._can_place_number(cp, si, hi, number):
                return False

            self.streets[sp][si][hi] = number
            msg = f"{self.players[cp-1]} placed {number} on St{si+1} H{hi+1}"

            # Apply action
            if act == "Landscaper":
                self.parks[sp][si] += 1
                msg += " + park"
            elif act == "Pool" and move.get("pool"):
                self.pools[sp][si][hi] = True
                msg += " + pool"
            elif act == "Surveyor" and "fence" in move:
                fi = move["fence"]
                self.fences[sp][si][fi] = True
                msg += " + fence"
            elif act == "Agent":
                self.estates_bonus[sp] += 1
                msg += " + estate bonus"
            elif act == "Bis":
                msg += " (bis)"

            self.log.append(msg)
            return self._advance_turn()

        return False

    def _advance_turn(self):
        """Advance to next player or next round."""
        if self.current_player == 1:
            self.current_player = 2
            return True
        else:
            # Both players done, new round
            self.round_number += 1
            self._flip_cards()
            self.current_player = 1
            return True

    def check_game_over(self):
        # Game ends after ~25 rounds or when all streets filled or 3 refusals
        max_rounds = 25
        if self.round_number > max_rounds:
            self.game_over = True

        for p in [1, 2]:
            sp = str(p)
            if self.refusals[sp] >= 3:
                self.game_over = True
            # Check if all streets are filled
            all_filled = all(
                all(v is not None for v in self.streets[sp][si])
                for si in range(3)
            )
            if all_filled:
                self.game_over = True

        if self.game_over:
            s1 = self._calc_score(1)
            s2 = self._calc_score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "deck": self.deck,
            "flipped": self.flipped,
            "streets": self.streets,
            "pools": self.pools,
            "fences": self.fences,
            "parks": self.parks,
            "estates_bonus": self.estates_bonus,
            "used_bis": self.used_bis,
            "refusals": self.refusals,
            "round_number": self.round_number,
            "log": self.log,
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.flipped = state["flipped"]
        self.streets = state["streets"]
        self.pools = state["pools"]
        self.fences = state["fences"]
        self.parks = state["parks"]
        self.estates_bonus = state["estates_bonus"]
        self.used_bis = state["used_bis"]
        self.refusals = state["refusals"]
        self.round_number = state["round_number"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  WELCOME TO... - Tutorial
============================================================

  OVERVIEW:
  Welcome To is a flip-and-write game where you build a
  neighborhood by writing house numbers on three streets.

  EACH TURN:
  - Three number+action combos are revealed
  - Both players simultaneously choose one combo
  - Place the number on an empty house slot
  - Numbers must be in ascending order (left to right)
  - Then apply the action

  ACTIONS:
  - Landscaper: Add a park to that street
  - Surveyor: Build a fence between adjacent houses
  - Agent: +1 point to estate scoring
  - Pool: Add a pool (only on marked pool slots)
  - Temp: Adjust the number by -2 to +2
  - Bis: Duplicate an adjacent house number

  SCORING:
  - Parks: more parks per street = more points
  - Pools: cumulative bonus for total pools
  - Estates: groups of houses between fences
  - Refusals: penalty for refusing 3+ times

  HALLOWEEN VARIANT:
  - Each pool is worth an extra point
  - Spookier theme!
============================================================
"""
