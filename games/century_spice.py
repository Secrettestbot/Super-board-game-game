"""Century: Spice Road - A hand-management and engine-building card game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Spice types ordered by value (lowest to highest)
SPICE_NAMES = {
    "Y": "Turmeric",
    "R": "Saffron",
    "G": "Cardamom",
    "B": "Cinnamon",
}
SPICE_ORDER = ["Y", "R", "G", "B"]
SPICE_VALUES = {"Y": 1, "R": 2, "G": 3, "B": 4}


def _make_merchant(name, action, **kwargs):
    """Create a merchant card dict.

    action types:
      'produce'  - gain spices (kwargs: gain={...})
      'upgrade'  - upgrade N spices by 1 level each (kwargs: upgrades=int)
      'trade'    - pay spices, receive spices (kwargs: give={...}, receive={...})
    """
    card = {"name": name, "action": action}
    card.update(kwargs)
    return card


def _generate_merchant_deck():
    """Build the merchant card deck."""
    cards = [
        _make_merchant("Spice Farmer", "produce", gain={"Y": 4}),
        _make_merchant("Saffron Grower", "produce", gain={"R": 2}),
        _make_merchant("Cardamom Grower", "produce", gain={"G": 1, "Y": 1}),
        _make_merchant("Cinnamon Seeker", "produce", gain={"B": 1}),
        _make_merchant("Mixed Harvest", "produce", gain={"Y": 2, "R": 1}),
        _make_merchant("Small Upgrade", "upgrade", upgrades=2),
        _make_merchant("Big Upgrade", "upgrade", upgrades=3),
        _make_merchant("Master Refiner", "upgrade", upgrades=4),
        _make_merchant("Y->R Trade", "trade", give={"Y": 2}, receive={"R": 2}),
        _make_merchant("Y->G Trade", "trade", give={"Y": 3}, receive={"G": 2}),
        _make_merchant("R->G Trade", "trade", give={"R": 2}, receive={"G": 2}),
        _make_merchant("R->B Trade", "trade", give={"R": 3}, receive={"B": 2}),
        _make_merchant("G->B Trade", "trade", give={"G": 2}, receive={"B": 2}),
        _make_merchant("Y->B Trade", "trade", give={"Y": 5}, receive={"B": 3}),
        _make_merchant("Mixed Trade", "trade", give={"Y": 2, "R": 1}, receive={"G": 1, "B": 1}),
    ]
    random.shuffle(cards)
    return cards


def _generate_point_cards():
    """Build the point card deck."""
    cards = [
        {"points": 6, "cost": {"Y": 2, "R": 2, "G": 1}},
        {"points": 7, "cost": {"R": 2, "G": 1, "B": 1}},
        {"points": 8, "cost": {"Y": 1, "R": 1, "G": 1, "B": 1}},
        {"points": 9, "cost": {"G": 2, "B": 1}},
        {"points": 10, "cost": {"R": 1, "G": 2, "B": 1}},
        {"points": 11, "cost": {"Y": 1, "G": 1, "B": 2}},
        {"points": 12, "cost": {"R": 2, "B": 2}},
        {"points": 13, "cost": {"G": 3, "B": 1}},
        {"points": 14, "cost": {"Y": 2, "R": 1, "B": 2}},
        {"points": 15, "cost": {"B": 3}},
        {"points": 16, "cost": {"G": 2, "B": 2}},
        {"points": 17, "cost": {"R": 3, "G": 1, "B": 1}},
        {"points": 8, "cost": {"Y": 3, "R": 2}},
        {"points": 10, "cost": {"Y": 2, "R": 3}},
        {"points": 12, "cost": {"Y": 3, "G": 2}},
        {"points": 9, "cost": {"R": 3, "G": 1}},
        {"points": 7, "cost": {"Y": 4, "R": 1}},
        {"points": 11, "cost": {"R": 1, "G": 1, "B": 2}},
        {"points": 14, "cost": {"G": 1, "B": 3}},
        {"points": 6, "cost": {"Y": 3, "R": 1, "G": 1}},
    ]
    random.shuffle(cards)
    return cards


def _spice_str(spices, skip_zero=False):
    """Format a spice dict as a compact string."""
    parts = []
    for s in SPICE_ORDER:
        v = spices.get(s, 0)
        if skip_zero and v == 0:
            continue
        parts.append(f"{s}:{v}")
    return " ".join(parts) if parts else "(none)"


def _total_spices(spices):
    return sum(spices.get(s, 0) for s in SPICE_ORDER)


class CenturySpiceGame(BaseGame):
    """Century: Spice Road - Collect and trade spices to claim point cards."""

    name = "Century: Spice Road"
    description = "A hand-management and engine-building spice trading game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (first to 6 point cards)",
        "quick": "Quick game (first to 4 point cards)",
    }

    CARAVAN_LIMIT = 10  # max spices a player can hold

    def __init__(self, variation=None):
        super().__init__(variation)
        self.merchant_deck = []
        self.merchant_row = []       # face-up merchant cards (up to 6)
        self.point_deck = []
        self.point_row = []          # face-up point cards (up to 5)
        self.gold_coins = []         # positions 0,1 of point row get gold/silver
        self.silver_coins = []
        self.player_hand = [[], []]         # merchant cards in hand
        self.player_discard = [[], []]      # played merchant cards
        self.player_spices = [{}, {}]       # caravan contents
        self.player_claimed = [[], []]      # claimed point cards
        self.player_gold = [0, 0]
        self.player_silver = [0, 0]
        self.target_cards = 6
        self.final_round = False
        self.final_round_last_player = None

    def setup(self):
        quick = self.variation == "quick"
        self.target_cards = 4 if quick else 6

        self.merchant_deck = _generate_merchant_deck()
        self.merchant_row = []
        for _ in range(6):
            if self.merchant_deck:
                self.merchant_row.append(self.merchant_deck.pop())

        self.point_deck = _generate_point_cards()
        self.point_row = []
        for _ in range(5):
            if self.point_deck:
                self.point_row.append(self.point_deck.pop())

        # Coin tokens: in 2p game, 2 gold and 2 silver per the simplified rules
        self.gold_coins = 2
        self.silver_coins = 2

        # Each player starts with 2 starter merchant cards and starting spices
        starter1 = _make_merchant("Starter: Produce 2Y", "produce", gain={"Y": 2})
        starter2 = _make_merchant("Starter: Upgrade 2", "upgrade", upgrades=2)

        for i in range(2):
            self.player_hand[i] = [dict(starter1), dict(starter2)]
            self.player_discard[i] = []
            self.player_spices[i] = {"Y": 3, "R": 0, "G": 0, "B": 0}
            self.player_claimed[i] = []
            self.player_gold[i] = 0
            self.player_silver[i] = 0

        # Player 2 gets an extra starting spice
        self.player_spices[1]["Y"] = 4

    def _refill_merchants(self):
        while len(self.merchant_row) < 6 and self.merchant_deck:
            self.merchant_row.append(self.merchant_deck.pop())

    def _refill_points(self):
        while len(self.point_row) < 5 and self.point_deck:
            self.point_row.append(self.point_deck.pop())

    def display(self):
        mode = "Standard" if self.variation == "standard" else "Quick"
        print(f"\n  === Century: Spice Road ({mode}, {self.target_cards} cards to win) ===")
        print(f"  Spices: Y=Turmeric  R=Saffron  G=Cardamom  B=Cinnamon")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        # Point cards row
        print("  Point Cards (claim by paying spice cost):")
        if not self.point_row:
            print("    (none remaining)")
        for i, card in enumerate(self.point_row):
            bonus = ""
            if i == 0 and self.gold_coins > 0:
                bonus = " +GOLD"
            elif i <= 1 and self.silver_coins > 0:
                bonus = " +SILVER"
            print(f"    [{i + 1}] {card['points']:2d} pts | cost: {_spice_str(card['cost'], skip_zero=True)}{bonus}")
        print(f"    Gold coins left: {self.gold_coins}  Silver coins left: {self.silver_coins}")
        print()

        # Merchant card row
        print(f"  Merchant Row (deck: {len(self.merchant_deck)}):")
        for i, card in enumerate(self.merchant_row):
            cost_label = f"(costs {i} Y)" if i > 0 else "(free)"
            desc = self._merchant_desc(card)
            print(f"    [{i + 1}] {desc}  {cost_label}")
        print()

        # Player info
        pi = self.current_player - 1
        for i in range(2):
            marker = " <<" if i == pi else ""
            pts = self._player_score(i)
            spices = _spice_str(self.player_spices[i])
            hand_count = len(self.player_hand[i])
            disc_count = len(self.player_discard[i])
            claimed = len(self.player_claimed[i])
            gold_silver = ""
            if self.player_gold[i] or self.player_silver[i]:
                gold_silver = f" | coins: {self.player_gold[i]}G {self.player_silver[i]}S"
            print(
                f"  {self.players[i]}: {pts} pts | "
                f"spices: {spices} | "
                f"hand: {hand_count} discard: {disc_count} | "
                f"claimed: {claimed}{gold_silver}{marker}"
            )

        # Show current player's hand
        print(f"\n  {self.players[pi]}'s Hand:")
        if not self.player_hand[pi]:
            print("    (empty - use 'rest' to pick up discards)")
        for i, card in enumerate(self.player_hand[pi]):
            desc = self._merchant_desc(card)
            print(f"    [{i + 1}] {desc}")
        if self.player_discard[pi]:
            print(f"  Discard pile ({len(self.player_discard[pi])}):")
            for card in self.player_discard[pi]:
                print(f"    - {self._merchant_desc(card)}")
        print()

    def _merchant_desc(self, card):
        if card["action"] == "produce":
            return f"Produce {_spice_str(card['gain'], skip_zero=True)}"
        elif card["action"] == "upgrade":
            return f"Upgrade {card['upgrades']} spices"
        elif card["action"] == "trade":
            return f"Trade {_spice_str(card['give'], skip_zero=True)} -> {_spice_str(card['receive'], skip_zero=True)}"
        return card["name"]

    def _player_score(self, pi):
        pts = sum(c["points"] for c in self.player_claimed[pi])
        pts += self.player_gold[pi] * 3
        pts += self.player_silver[pi] * 1
        return pts

    def get_move(self):
        pi = self.current_player - 1
        print(f"  {self.players[pi]}, choose an action:")
        print("    play N           - play merchant card N from hand")
        print("    acquire N        - acquire merchant card N from row (pay Y per position)")
        print("    claim N          - claim point card N (pay spice cost)")
        print("    rest             - pick up all discarded merchant cards")
        if self.player_hand[pi]:
            pass
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        pi = self.current_player - 1
        parts = move.lower().split()
        if not parts:
            return False

        action = parts[0]

        # --- Play a merchant card from hand ---
        if action == "play":
            if len(parts) < 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.player_hand[pi]):
                print("  Invalid card number.")
                return False

            card = self.player_hand[pi][idx]

            if card["action"] == "produce":
                gain = dict(card["gain"])
                total_after = _total_spices(self.player_spices[pi]) + sum(gain.values())
                if total_after > self.CARAVAN_LIMIT:
                    # Truncate gain to fit limit
                    room = self.CARAVAN_LIMIT - _total_spices(self.player_spices[pi])
                    if room <= 0:
                        print(f"  Caravan is full ({self.CARAVAN_LIMIT} spices max).")
                        return False
                    # Add what we can in order of value (lowest first)
                    added = 0
                    for s in SPICE_ORDER:
                        take = min(gain.get(s, 0), room - added)
                        self.player_spices[pi][s] = self.player_spices[pi].get(s, 0) + take
                        added += take
                        if added >= room:
                            break
                else:
                    for s, v in gain.items():
                        self.player_spices[pi][s] = self.player_spices[pi].get(s, 0) + v

            elif card["action"] == "upgrade":
                num_upgrades = card["upgrades"]
                # If extra args specify which spices to upgrade: play N Y Y R
                targets = [p.upper() for p in parts[2:]]
                if not targets:
                    # Auto-upgrade lowest value spices
                    targets = []
                    for s in SPICE_ORDER[:-1]:  # can't upgrade B
                        count = self.player_spices[pi].get(s, 0)
                        targets.extend([s] * count)
                    targets = targets[:num_upgrades]
                if len(targets) > num_upgrades:
                    targets = targets[:num_upgrades]
                if not targets:
                    # No upgradeable spices but card still played
                    pass
                else:
                    for t in targets:
                        if t not in SPICE_ORDER or t == "B":
                            print(f"  Cannot upgrade {t}.")
                            return False
                        if self.player_spices[pi].get(t, 0) <= 0:
                            print(f"  No {SPICE_NAMES.get(t, t)} to upgrade.")
                            return False
                    for t in targets:
                        next_idx = SPICE_ORDER.index(t) + 1
                        next_spice = SPICE_ORDER[next_idx]
                        self.player_spices[pi][t] -= 1
                        self.player_spices[pi][next_spice] = self.player_spices[pi].get(next_spice, 0) + 1

            elif card["action"] == "trade":
                # Check can pay
                give = card["give"]
                for s, v in give.items():
                    if self.player_spices[pi].get(s, 0) < v:
                        print(f"  Not enough {SPICE_NAMES.get(s, s)} to trade.")
                        return False
                receive = card["receive"]
                new_total = _total_spices(self.player_spices[pi]) - sum(give.values()) + sum(receive.values())
                if new_total > self.CARAVAN_LIMIT:
                    print(f"  Trade would exceed caravan limit of {self.CARAVAN_LIMIT}.")
                    return False
                for s, v in give.items():
                    self.player_spices[pi][s] -= v
                for s, v in receive.items():
                    self.player_spices[pi][s] = self.player_spices[pi].get(s, 0) + v

            # Move card from hand to discard
            self.player_hand[pi].pop(idx)
            self.player_discard[pi].append(card)
            return True

        # --- Acquire a merchant card from the row ---
        if action == "acquire":
            if len(parts) < 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.merchant_row):
                print("  Invalid merchant row position.")
                return False

            # Cost: place 1 Y on each card before this one
            cost_y = idx
            if self.player_spices[pi].get("Y", 0) < cost_y:
                print(f"  Need {cost_y} Turmeric (Y) to acquire card at position {idx + 1}.")
                return False

            # Place Y tokens on cards before this position (those players can pick up)
            # Simplified: Y spent is just lost (standard simplification for 2p)
            self.player_spices[pi]["Y"] = self.player_spices[pi].get("Y", 0) - cost_y
            # Actually: place 1 spice on each card to the left
            for i in range(idx):
                if i < len(self.merchant_row):
                    if "bonus_spice" not in self.merchant_row[i]:
                        self.merchant_row[i]["bonus_spice"] = {"Y": 0}
                    self.merchant_row[i]["bonus_spice"]["Y"] = self.merchant_row[i]["bonus_spice"].get("Y", 0) + 1

            card = self.merchant_row.pop(idx)
            # Collect any bonus spices on this card
            bonus = card.pop("bonus_spice", None)
            if bonus:
                room = self.CARAVAN_LIMIT - _total_spices(self.player_spices[pi])
                for s in SPICE_ORDER:
                    take = min(bonus.get(s, 0), room)
                    self.player_spices[pi][s] = self.player_spices[pi].get(s, 0) + take
                    room -= take

            self.player_hand[pi].append(card)
            self._refill_merchants()
            return True

        # --- Claim a point card ---
        if action == "claim":
            if len(parts) < 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.point_row):
                print("  Invalid point card position.")
                return False

            card = self.point_row[idx]
            # Check if player can pay cost
            for s, v in card["cost"].items():
                if self.player_spices[pi].get(s, 0) < v:
                    print(f"  Not enough {SPICE_NAMES.get(s, s)}.")
                    return False

            # Pay cost
            for s, v in card["cost"].items():
                self.player_spices[pi][s] -= v

            # Award coins
            if idx == 0 and self.gold_coins > 0:
                self.gold_coins -= 1
                self.player_gold[pi] += 1
            elif idx <= 1 and self.silver_coins > 0:
                self.silver_coins -= 1
                self.player_silver[pi] += 1

            claimed_card = self.point_row.pop(idx)
            self.player_claimed[pi].append(claimed_card)
            self._refill_points()
            return True

        # --- Rest: pick up all discarded cards ---
        if action == "rest":
            if not self.player_discard[pi]:
                print("  No cards to pick up.")
                return False
            self.player_hand[pi].extend(self.player_discard[pi])
            self.player_discard[pi] = []
            return True

        print("  Unknown action. Use: play, acquire, claim, or rest")
        return False

    def check_game_over(self):
        pi = self.current_player - 1
        if not self.final_round and len(self.player_claimed[pi]) >= self.target_cards:
            self.final_round = True
            self.final_round_last_player = pi

        if self.final_round and self.current_player == 2:
            self.game_over = True
            s1 = self._player_score(0)
            s2 = self._player_score(1)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                # Tie-breaker: more leftover spices (by value)
                v1 = sum(self.player_spices[0].get(s, 0) * SPICE_VALUES[s] for s in SPICE_ORDER)
                v2 = sum(self.player_spices[1].get(s, 0) * SPICE_VALUES[s] for s in SPICE_ORDER)
                if v1 > v2:
                    self.winner = 1
                elif v2 > v1:
                    self.winner = 2
                else:
                    self.winner = None

    def get_state(self):
        return {
            "merchant_deck": list(self.merchant_deck),
            "merchant_row": list(self.merchant_row),
            "point_deck": list(self.point_deck),
            "point_row": list(self.point_row),
            "gold_coins": self.gold_coins,
            "silver_coins": self.silver_coins,
            "player_hand": [list(h) for h in self.player_hand],
            "player_discard": [list(d) for d in self.player_discard],
            "player_spices": [dict(s) for s in self.player_spices],
            "player_claimed": [list(c) for c in self.player_claimed],
            "player_gold": list(self.player_gold),
            "player_silver": list(self.player_silver),
            "target_cards": self.target_cards,
            "final_round": self.final_round,
            "final_round_last_player": self.final_round_last_player,
        }

    def load_state(self, state):
        self.merchant_deck = list(state["merchant_deck"])
        self.merchant_row = list(state["merchant_row"])
        self.point_deck = list(state["point_deck"])
        self.point_row = list(state["point_row"])
        self.gold_coins = state["gold_coins"]
        self.silver_coins = state["silver_coins"]
        self.player_hand = [list(h) for h in state["player_hand"]]
        self.player_discard = [list(d) for d in state["player_discard"]]
        self.player_spices = [dict(s) for s in state["player_spices"]]
        self.player_claimed = [list(c) for c in state["player_claimed"]]
        self.player_gold = list(state["player_gold"])
        self.player_silver = list(state["player_silver"])
        self.target_cards = state["target_cards"]
        self.final_round = state["final_round"]
        self.final_round_last_player = state["final_round_last_player"]

    def get_tutorial(self):
        return """
==================================================
  Century: Spice Road - Tutorial
==================================================

  OVERVIEW:
  Century: Spice Road is a hand-management and
  engine-building card game. Players collect and
  trade spice cubes using merchant cards, then
  claim point cards by paying the required spices.

  SPICE TYPES (lowest to highest value):
  Y = Turmeric (yellow)   R = Saffron (red)
  G = Cardamom (green)    B = Cinnamon (brown)

  Caravan limit: 10 spices max per player.

  ON YOUR TURN, choose ONE action:

  1. PLAY A MERCHANT CARD
     Play a card from your hand for its effect:
     - Produce: gain the listed spices
     - Upgrade: upgrade N spices one level each
       (Y->R, R->G, G->B). You may specify which:
       play 2 Y R   (upgrade 1 Y and 1 R)
     - Trade: pay spices, receive other spices
     Command: play N  (card number from hand)

  2. ACQUIRE A MERCHANT CARD
     Take a card from the merchant row.
     Cards further right cost Turmeric (1 Y per
     position from the left). Y spent is placed
     on skipped cards as bonus spices.
     Command: acquire N  (position 1-6)

  3. CLAIM A POINT CARD
     Pay the spice cost on a point card to claim
     it. The 1st card in the row may earn a gold
     coin (+3 pts), the 2nd a silver coin (+1 pt).
     Command: claim N  (position 1-5)

  4. REST
     Pick up ALL your previously played merchant
     cards back into your hand.
     Command: rest

  WINNING:
  - Standard: first to claim 6 point cards
    triggers the final round.
  - Quick: 4 point cards to trigger.
  - Finish the round so both players have equal
    turns, then highest total score wins.
  - Score = point card values + gold*3 + silver*1
  - Tie-breaker: total value of leftover spices.

  STRATEGY HINTS:
  - Build an efficient engine of merchant cards
    before racing to claim point cards.
  - Upgrade cards are very flexible.
  - Don't ignore the gold/silver coin bonuses
    on the first two point card positions.
  - Time your rest turns carefully.

==================================================
"""
