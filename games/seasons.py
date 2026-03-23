"""Seasons - Dice-drafting card combo engine game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen


SEASONS = ["Winter", "Spring", "Summer", "Autumn"]
RESOURCES = ["Air", "Water", "Earth", "Fire"]
RESOURCE_SYMBOLS = {"Air": "A", "Water": "W", "Earth": "E", "Fire": "F"}

# Dice faces per season: each face is a dict of effects
SEASON_DICE = {
    "Winter": [
        {"resources": {"Air": 1, "Water": 1}, "crystals": 0, "draw": 0, "pips": 1},
        {"resources": {"Water": 2}, "crystals": 1, "draw": 0, "pips": 1},
        {"resources": {"Air": 1}, "crystals": 2, "draw": 0, "pips": 1},
        {"resources": {"Water": 1}, "crystals": 0, "draw": 1, "pips": 2},
        {"resources": {"Air": 2, "Water": 1}, "crystals": 0, "draw": 0, "pips": 1},
        {"resources": {}, "crystals": 3, "draw": 1, "pips": 2},
    ],
    "Spring": [
        {"resources": {"Earth": 1, "Air": 1}, "crystals": 0, "draw": 0, "pips": 1},
        {"resources": {"Earth": 2}, "crystals": 1, "draw": 0, "pips": 1},
        {"resources": {"Air": 1}, "crystals": 0, "draw": 1, "pips": 2},
        {"resources": {"Earth": 1, "Water": 1}, "crystals": 2, "draw": 0, "pips": 1},
        {"resources": {"Air": 2}, "crystals": 1, "draw": 0, "pips": 1},
        {"resources": {}, "crystals": 2, "draw": 1, "pips": 3},
    ],
    "Summer": [
        {"resources": {"Fire": 1, "Earth": 1}, "crystals": 0, "draw": 0, "pips": 1},
        {"resources": {"Fire": 2}, "crystals": 1, "draw": 0, "pips": 1},
        {"resources": {"Earth": 1}, "crystals": 2, "draw": 0, "pips": 2},
        {"resources": {"Fire": 1, "Air": 1}, "crystals": 0, "draw": 1, "pips": 1},
        {"resources": {"Fire": 2, "Earth": 1}, "crystals": 0, "draw": 0, "pips": 1},
        {"resources": {}, "crystals": 4, "draw": 0, "pips": 2},
    ],
    "Autumn": [
        {"resources": {"Water": 1, "Fire": 1}, "crystals": 0, "draw": 0, "pips": 1},
        {"resources": {"Fire": 1}, "crystals": 2, "draw": 0, "pips": 1},
        {"resources": {"Water": 2}, "crystals": 0, "draw": 1, "pips": 2},
        {"resources": {"Fire": 1, "Earth": 1}, "crystals": 1, "draw": 0, "pips": 1},
        {"resources": {"Water": 1, "Earth": 1}, "crystals": 1, "draw": 0, "pips": 1},
        {"resources": {}, "crystals": 3, "draw": 1, "pips": 3},
    ],
}

# Power cards
POWER_CARDS = [
    {"name": "Amulet of Fire", "cost": {"Fire": 1}, "type": "ongoing",
     "crystals": 0, "effect": "fire_bonus", "points": 4,
     "desc": "+1 crystal whenever you gain Fire resources"},
    {"name": "Staff of Winter", "cost": {"Air": 1, "Water": 1}, "type": "ongoing",
     "crystals": 0, "effect": "winter_bonus", "points": 6,
     "desc": "+2 crystals at start of each Winter month"},
    {"name": "Crystal Orb", "cost": {"Earth": 1}, "type": "activated",
     "crystals": 0, "effect": "transmute", "points": 2,
     "desc": "Convert any 2 resources into 3 crystals (activated)"},
    {"name": "Potion of Life", "cost": {"Water": 2}, "type": "instant",
     "crystals": 5, "effect": "none", "points": 0,
     "desc": "Gain 5 crystals immediately"},
    {"name": "Ring of Power", "cost": {"Fire": 1, "Earth": 1}, "type": "ongoing",
     "crystals": 0, "effect": "power_bonus", "points": 8,
     "desc": "+1 to all resource gains"},
    {"name": "Scroll of Knowledge", "cost": {"Air": 2}, "type": "activated",
     "crystals": 0, "effect": "draw_power", "points": 3,
     "desc": "Draw 2 extra cards (activated)"},
    {"name": "Windmill", "cost": {"Air": 1, "Earth": 1}, "type": "ongoing",
     "crystals": 0, "effect": "air_crystals", "points": 5,
     "desc": "+1 crystal whenever you gain Air resources"},
    {"name": "Chalice of Eternity", "cost": {"Water": 1, "Fire": 1}, "type": "endgame",
     "crystals": 0, "effect": "endgame_cards", "points": 0,
     "desc": "3 points per power card you have at game end"},
    {"name": "Boots of Speed", "cost": {"Air": 1}, "type": "ongoing",
     "crystals": 0, "effect": "extra_pip", "points": 3,
     "desc": "+1 season pip each turn"},
    {"name": "Earth Golem", "cost": {"Earth": 2, "Fire": 1}, "type": "ongoing",
     "crystals": 0, "effect": "earth_bonus", "points": 7,
     "desc": "+2 crystals whenever you gain Earth resources"},
    {"name": "Phoenix Feather", "cost": {"Fire": 2}, "type": "instant",
     "crystals": 0, "effect": "copy_die", "points": 4,
     "desc": "Copy the effects of the die you didn't pick"},
    {"name": "Tidal Wave", "cost": {"Water": 2, "Air": 1}, "type": "instant",
     "crystals": 8, "effect": "none", "points": 0,
     "desc": "Gain 8 crystals immediately"},
    {"name": "Stone Circle", "cost": {"Earth": 1}, "type": "endgame",
     "crystals": 0, "effect": "endgame_resources", "points": 0,
     "desc": "2 points per resource you hold at game end"},
    {"name": "Flame Shield", "cost": {"Fire": 1}, "type": "ongoing",
     "crystals": 0, "effect": "fire_shield", "points": 5,
     "desc": "Opponent loses 1 crystal per turn"},
    {"name": "Ocean Crown", "cost": {"Water": 1, "Earth": 1, "Fire": 1}, "type": "endgame",
     "crystals": 0, "effect": "endgame_variety", "points": 0,
     "desc": "5 points per resource type you hold at game end"},
]


def _card_str(card):
    cost_str = "+".join(f"{v}{RESOURCE_SYMBOLS[k]}" for k, v in card["cost"].items())
    return f"[{card['name']}]({cost_str}) - {card['desc']}"


def _card_short(card):
    return f"[{card['name']}]"


class SeasonsGame(BaseGame):
    """Seasons: Draft dice, collect resources, play power cards for combos."""

    name = "Seasons"
    description = "Dice-drafting card combo engine - draft dice, play cards, score crystals"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (12 rounds, 9 starting cards)",
        "quick": "Quick game (6 rounds, 5 starting cards)",
        "epic": "Epic game (12 rounds, 12 starting cards)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_rounds = 12
        self.starting_cards = 9
        self.current_round = 0
        self.current_season_idx = 0
        self.current_month = 0
        self.player_crystals = [0, 0]
        self.player_resources = [
            {"Air": 0, "Water": 0, "Earth": 0, "Fire": 0},
            {"Air": 0, "Water": 0, "Earth": 0, "Fire": 0},
        ]
        self.player_hand = [[], []]
        self.player_tableau = [[], []]
        self.player_reserve = [[], []]
        self.draw_deck = []
        self.rolled_dice = []
        self.phase = "draft"
        self.dice_drafted = [False, False]
        self.resource_limit = 7

    def setup(self):
        if self.variation == "quick":
            self.max_rounds = 6
            self.starting_cards = 5
        elif self.variation == "epic":
            self.max_rounds = 12
            self.starting_cards = 12

        # Build draw deck
        self.draw_deck = POWER_CARDS * 2
        random.shuffle(self.draw_deck)

        # Deal starting hands
        for i in range(2):
            for _ in range(self.starting_cards):
                if self.draw_deck:
                    self.player_hand[i].append(self.draw_deck.pop())

        self.current_round = 1
        self.current_season_idx = 0
        self.current_month = 1
        self.phase = "draft"
        self._roll_dice()

    def _roll_dice(self):
        """Roll season dice for drafting."""
        season = SEASONS[self.current_season_idx]
        faces = SEASON_DICE[season]
        # Roll 3 dice (pick random faces)
        self.rolled_dice = []
        for i in range(3):
            face = random.choice(faces)
            self.rolled_dice.append(copy.deepcopy(face))
        self.dice_drafted = [False, False]

    def _current_season(self):
        return SEASONS[self.current_season_idx]

    def _apply_ongoing_effects(self, player_idx, trigger, resources_gained=None):
        """Apply ongoing card effects."""
        crystals_bonus = 0
        for card in self.player_tableau[player_idx]:
            eff = card.get("effect", "none")
            if trigger == "resource_gain" and resources_gained:
                if eff == "fire_bonus" and resources_gained.get("Fire", 0) > 0:
                    crystals_bonus += 1
                if eff == "air_crystals" and resources_gained.get("Air", 0) > 0:
                    crystals_bonus += 1
                if eff == "earth_bonus" and resources_gained.get("Earth", 0) > 0:
                    crystals_bonus += 2
            elif trigger == "season_start":
                if eff == "winter_bonus" and self._current_season() == "Winter":
                    crystals_bonus += 2
                if eff == "fire_shield":
                    opp = 1 - player_idx
                    if self.player_crystals[opp] > 0:
                        self.player_crystals[opp] -= 1
        self.player_crystals[player_idx] += crystals_bonus

    def _calc_endgame_bonus(self, player_idx):
        """Calculate endgame scoring from cards."""
        bonus = 0
        for card in self.player_tableau[player_idx]:
            eff = card.get("effect", "none")
            if eff == "endgame_cards":
                bonus += len(self.player_tableau[player_idx]) * 3
            elif eff == "endgame_resources":
                total_res = sum(self.player_resources[player_idx].values())
                bonus += total_res * 2
            elif eff == "endgame_variety":
                types_held = sum(1 for v in self.player_resources[player_idx].values() if v > 0)
                bonus += types_held * 5
        return bonus

    def _total_score(self, player_idx):
        base = self.player_crystals[player_idx]
        card_points = sum(c.get("points", 0) for c in self.player_tableau[player_idx])
        endgame = self._calc_endgame_bonus(player_idx)
        return base + card_points + endgame

    def display(self):
        clear_screen()
        p = self.current_player - 1
        opp = 1 - p
        season = self._current_season()

        print(f"{'='*65}")
        print(f"  SEASONS - Round {self.current_round}/{self.max_rounds} | "
              f"{season} (Month {self.current_month}/3) | Phase: {self.phase.upper()}")
        print(f"{'='*65}")
        print()

        # Both players
        for i in [opp, p]:
            tag = " (YOU)" if i == p else ""
            name = self.players[i]
            res = self.player_resources[i]
            res_str = " ".join(f"{RESOURCE_SYMBOLS[r]}:{res[r]}" for r in RESOURCES)
            print(f"  {name}{tag}: {self.player_crystals[i]} crystals | Resources: {res_str}")
            print(f"    Hand: {len(self.player_hand[i])} cards")
            if self.player_tableau[i]:
                print(f"    Tableau:")
                for ci, card in enumerate(self.player_tableau[i]):
                    print(f"      {ci+1}. {_card_short(card)} ({card['type']}) - {card['desc']}")
            else:
                print(f"    Tableau: (empty)")
            print(f"    Score: {self._total_score(i)} pts")
            print()

        # Dice
        if self.phase == "draft" and self.rolled_dice:
            print(f"  --- SEASON DICE ({season}) ---")
            for i, die in enumerate(self.rolled_dice):
                if i < len(self.rolled_dice):
                    res_str = " ".join(f"{v}{RESOURCE_SYMBOLS[k]}"
                                       for k, v in die["resources"].items() if v > 0)
                    if not res_str:
                        res_str = "-"
                    drafted_tag = " [TAKEN]" if die.get("drafted") else ""
                    print(f"    Die {i+1}: Resources: {res_str} | "
                          f"Crystals: {die['crystals']} | "
                          f"Draw: {die['draw']} | "
                          f"Pips: {die['pips']}{drafted_tag}")
            print()

        # Current player hand (if you)
        if self.phase in ("play", "draft"):
            hand = self.player_hand[p]
            if hand:
                print("  YOUR HAND:")
                for i, card in enumerate(hand):
                    print(f"    {i+1}. {_card_str(card)}")
                print()

    def get_move(self):
        p = self.current_player - 1

        if self.phase == "draft":
            print("  DRAFT PHASE - Pick a die:")
            print("    pick <die#>  - Draft a die and gain its effects")
            print()
        elif self.phase == "play":
            print("  PLAY PHASE - Play cards or activate abilities:")
            print("    play <hand#>      - Play a power card from hand (pay resources)")
            print("    activate <tab#>   - Activate an activated-type card")
            print("    transmute         - Convert 2 of any resource to 3 crystals")
            print("    done              - End your play phase")
            print()

        move = input_with_quit(f"  {self.players[p]}> ")
        return move.strip()

    def make_move(self, move):
        p = self.current_player - 1
        parts = move.lower().split()
        if not parts:
            return False

        action = parts[0]

        if self.phase == "draft":
            if action == "pick":
                return self._do_draft(p, parts)
            return False

        elif self.phase == "play":
            if action == "play":
                return self._do_play_card(p, parts)
            elif action == "activate":
                return self._do_activate(p, parts)
            elif action == "transmute":
                return self._do_transmute(p, parts)
            elif action == "done":
                return self._do_end_play(p)
            return False

        return False

    def _do_draft(self, p, parts):
        if len(parts) < 2:
            print("  Usage: pick <die#>")
            input("  Press Enter...")
            return False
        try:
            di = int(parts[1]) - 1
        except ValueError:
            return False

        if di < 0 or di >= len(self.rolled_dice):
            print("  Invalid die.")
            input("  Press Enter...")
            return False

        die = self.rolled_dice[di]
        if die.get("drafted"):
            print("  Die already taken!")
            input("  Press Enter...")
            return False

        # Apply die effects
        gained_resources = {}
        for res, amount in die["resources"].items():
            # Check for Ring of Power bonus
            bonus = 0
            for card in self.player_tableau[p]:
                if card.get("effect") == "power_bonus":
                    bonus += 1
            actual = amount + bonus
            self.player_resources[p][res] += actual
            gained_resources[res] = actual

        self.player_crystals[p] += die["crystals"]

        # Draw cards
        for _ in range(die["draw"]):
            if self.draw_deck:
                self.player_hand[p].append(self.draw_deck.pop())

        # Apply ongoing effects for resource gains
        self._apply_ongoing_effects(p, "resource_gain", gained_resources)

        # Enforce resource limit
        total_res = sum(self.player_resources[p].values())
        while total_res > self.resource_limit:
            # Discard excess (auto-discard lowest)
            for r in RESOURCES:
                if self.player_resources[p][r] > 0 and total_res > self.resource_limit:
                    self.player_resources[p][r] -= 1
                    total_res -= 1

        die["drafted"] = True
        self.dice_drafted[p] = True

        # If both drafted, move to play phase for first player
        opp = 1 - p
        if self.dice_drafted[opp]:
            self.phase = "play"
        # Otherwise, opponent drafts next (handled by switch_player)

        return True

    def _do_play_card(self, p, parts):
        if len(parts) < 2:
            print("  Usage: play <hand card#>")
            input("  Press Enter...")
            return False
        try:
            ci = int(parts[1]) - 1
        except ValueError:
            return False

        hand = self.player_hand[p]
        if ci < 0 or ci >= len(hand):
            print("  Invalid card index.")
            input("  Press Enter...")
            return False

        card = hand[ci]

        # Check resource cost
        for res, needed in card["cost"].items():
            if self.player_resources[p].get(res, 0) < needed:
                print(f"  Not enough {res}! Need {needed}, have {self.player_resources[p].get(res, 0)}.")
                input("  Press Enter...")
                return False

        # Pay cost
        for res, needed in card["cost"].items():
            self.player_resources[p][res] -= needed

        # Remove from hand
        played_card = hand.pop(ci)

        # Apply immediate effects
        if played_card["type"] == "instant":
            self.player_crystals[p] += played_card.get("crystals", 0)
            if played_card["effect"] == "copy_die":
                # Gain resources from a random unselected die
                for die in self.rolled_dice:
                    if not die.get("drafted"):
                        for res, amt in die["resources"].items():
                            self.player_resources[p][res] += amt
                        self.player_crystals[p] += die["crystals"]
                        break
            # Instant cards go to discard (not tableau)
            # But they still have points, so add to tableau for scoring
            self.player_tableau[p].append(played_card)
        else:
            # Ongoing, activated, or endgame cards go to tableau
            self.player_tableau[p].append(played_card)

        print(f"  Played {played_card['name']}!")
        input("  Press Enter...")
        return True

    def _do_activate(self, p, parts):
        if len(parts) < 2:
            print("  Usage: activate <tableau card#>")
            input("  Press Enter...")
            return False
        try:
            ti = int(parts[1]) - 1
        except ValueError:
            return False

        if ti < 0 or ti >= len(self.player_tableau[p]):
            print("  Invalid card.")
            input("  Press Enter...")
            return False

        card = self.player_tableau[p][ti]
        if card["type"] != "activated":
            print("  This card can't be activated!")
            input("  Press Enter...")
            return False

        eff = card["effect"]
        if eff == "transmute":
            # Need 2 of any resource
            total = sum(self.player_resources[p].values())
            if total < 2:
                print("  Need at least 2 resources to transmute!")
                input("  Press Enter...")
                return False
            # Spend 2 resources (lowest type first)
            spent = 0
            for r in RESOURCES:
                while self.player_resources[p][r] > 0 and spent < 2:
                    self.player_resources[p][r] -= 1
                    spent += 1
            self.player_crystals[p] += 3
            print("  Transmuted 2 resources into 3 crystals!")
            input("  Press Enter...")
        elif eff == "draw_power":
            drawn = 0
            for _ in range(2):
                if self.draw_deck:
                    self.player_hand[p].append(self.draw_deck.pop())
                    drawn += 1
            print(f"  Drew {drawn} cards!")
            input("  Press Enter...")

        return True

    def _do_transmute(self, p, parts):
        """General transmute: convert any resource to crystals at season rate."""
        season = self._current_season()
        rates = {"Winter": 3, "Spring": 2, "Summer": 1, "Autumn": 2}
        rate = rates[season]

        total = sum(self.player_resources[p].values())
        if total == 0:
            print("  No resources to transmute!")
            input("  Press Enter...")
            return False

        print(f"  Current season ({season}) rate: 1 resource = {rate} crystals")
        print(f"  Resources: " + " ".join(f"{RESOURCE_SYMBOLS[r]}:{self.player_resources[p][r]}"
                                           for r in RESOURCES))
        res_input = input_with_quit("  Which resource? (Air/Water/Earth/Fire): ").strip().title()

        if res_input not in RESOURCES:
            print("  Invalid resource.")
            input("  Press Enter...")
            return False

        if self.player_resources[p][res_input] <= 0:
            print(f"  No {res_input} to transmute!")
            input("  Press Enter...")
            return False

        self.player_resources[p][res_input] -= 1
        self.player_crystals[p] += rate
        print(f"  Transmuted 1 {res_input} into {rate} crystals!")
        input("  Press Enter...")
        return True

    def _do_end_play(self, p):
        """End the play phase and advance the game."""
        # Apply season start effects
        self._apply_ongoing_effects(p, "season_start")

        # Advance season via pips
        # Calculate total pips from drafted dice
        total_pips = 0
        for die in self.rolled_dice:
            if die.get("drafted"):
                total_pips += die.get("pips", 0)

        # Check for extra pip from Boots of Speed
        for card in self.player_tableau[p]:
            if card.get("effect") == "extra_pip":
                total_pips += 1

        # Advance month
        self.current_month += 1
        if self.current_month > 3:
            self.current_month = 1
            self.current_season_idx = (self.current_season_idx + 1) % 4
            if self.current_season_idx == 0:
                # New year
                pass

        self.current_round += 1
        self.phase = "draft"
        self._roll_dice()
        return True

    def check_game_over(self):
        if self.current_round > self.max_rounds:
            self.game_over = True
            s0 = self._total_score(0)
            s1 = self._total_score(1)
            if s0 > s1:
                self.winner = 1
            elif s1 > s0:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "max_rounds": self.max_rounds,
            "starting_cards": self.starting_cards,
            "current_round": self.current_round,
            "current_season_idx": self.current_season_idx,
            "current_month": self.current_month,
            "player_crystals": self.player_crystals[:],
            "player_resources": copy.deepcopy(self.player_resources),
            "player_hand": copy.deepcopy(self.player_hand),
            "player_tableau": copy.deepcopy(self.player_tableau),
            "player_reserve": copy.deepcopy(self.player_reserve),
            "draw_deck": copy.deepcopy(self.draw_deck),
            "rolled_dice": copy.deepcopy(self.rolled_dice),
            "phase": self.phase,
            "dice_drafted": self.dice_drafted[:],
            "resource_limit": self.resource_limit,
        }

    def load_state(self, state):
        self.max_rounds = state["max_rounds"]
        self.starting_cards = state["starting_cards"]
        self.current_round = state["current_round"]
        self.current_season_idx = state["current_season_idx"]
        self.current_month = state["current_month"]
        self.player_crystals = state["player_crystals"]
        self.player_resources = state["player_resources"]
        self.player_hand = state["player_hand"]
        self.player_tableau = state["player_tableau"]
        self.player_reserve = state["player_reserve"]
        self.draw_deck = state["draw_deck"]
        self.rolled_dice = state["rolled_dice"]
        self.phase = state["phase"]
        self.dice_drafted = state["dice_drafted"]
        self.resource_limit = state["resource_limit"]

    def get_tutorial(self):
        return """
====================================================
  SEASONS - Tutorial
====================================================

OVERVIEW:
  You are a sorcerer competing over 3 years (12
  rounds). Draft magical dice, gather resources,
  and play power cards for crystals and combos.

SEASONS & RESOURCES:
  Winter - Air & Water dominant
  Spring - Air & Earth dominant
  Summer - Fire & Earth dominant
  Autumn - Water & Fire dominant

EACH ROUND:
  1. DRAFT - Roll 3 season dice, each player picks one
     Dice give: resources, crystals, card draw, and
     season advancement pips

  2. PLAY - Play cards and use abilities
     play <#>     - Play a card from hand (pay resource cost)
     activate <#> - Use an activated card's ability
     transmute    - Convert 1 resource to crystals
                    (rate depends on season)
     done         - End your play phase

CARD TYPES:
  Instant   - One-time effect when played
  Ongoing   - Permanent effect while in play
  Activated - Use once per turn for an effect
  Endgame   - Scores bonus points at game end

TRANSMUTE RATES (resource -> crystals):
  Winter: 3 | Spring: 2 | Summer: 1 | Autumn: 2

RESOURCE LIMIT: 7 total resources max

SCORING:
  Crystals + card point values + endgame bonuses

STRATEGY:
  - Draft dice that match your card needs
  - Build synergies between ongoing cards
  - Transmute in Winter for best rates
  - Watch your resource limit!
====================================================
"""
