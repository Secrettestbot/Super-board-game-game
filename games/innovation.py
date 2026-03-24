"""Innovation - Civilization card game with splaying and dogma (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Icons used in the game
ICONS = ["crown", "leaf", "factory", "castle", "clock", "bulb"]
ICON_SYMBOLS = {
    "crown": "W",   # crown/wreath
    "leaf": "L",
    "factory": "F",
    "castle": "C",
    "clock": "K",
    "bulb": "B",
}

# Card definitions: (name, age, icons[4 positions: top-left, bottom-left, bottom-center, bottom-right], dogma_type, dogma_desc)
# dogma_type: "demand" (opponents must comply if fewer icons), "share" (opponents benefit if more icons)
# We generate cards procedurally for each age

def generate_cards(max_age):
    """Generate a full set of innovation cards."""
    age_names = {
        1: ["Wheel", "Writing", "Pottery", "Tools", "Clothing",
            "Archery", "Metalworking", "Oars", "Agriculture", "Domestication"],
        2: ["Calendar", "Mathematics", "Construction", "Road Building", "Currency",
            "Fermenting", "Mapmaking", "Canal Building", "Philosophy", "Monotheism"],
        3: ["Alchemy", "Translation", "Engineering", "Optics", "Compass",
            "Paper", "Machinery", "Medicine", "Education", "Feudalism"],
        4: ["Printing Press", "Gunpowder", "Invention", "Navigation", "Anatomy",
            "Perspective", "Enterprise", "Colonialism", "Reformation", "Experimentation"],
        5: ["Chemistry", "Physics", "Coal", "Steam Engine", "Astronomy",
            "Measurement", "Statistics", "Banking", "Societies", "The Pirate Code"],
        6: ["Industrialization", "Vaccination", "Classification", "Metric System", "Canning",
            "Atomic Theory", "Encyclopedia", "Machine Tools", "Democracy", "Emancipation"],
        7: ["Combustion", "Explosives", "Bicycle", "Electricity", "Refrigeration",
            "Sanitation", "Railroad", "Lighting", "Telegraph", "Evolution"],
        8: ["Flight", "Mobility", "Corporations", "Mass Media", "Antibiotics",
            "Skyscrapers", "Quantum Theory", "Rocketry", "Socialism", "Empiricism"],
        9: ["Computers", "Genetics", "Composites", "Fission", "Ecology",
            "Suburbia", "Services", "Specialization", "Collaboration", "Satellites"],
        10: ["Robotics", "Miniaturization", "Software", "Globalization", "Stem Cells",
             "AI", "Databases", "Bioengineering", "Self Service", "The Internet"],
    }

    dogma_effects = {
        "score": "Score a card from your hand",
        "draw": "Draw a card of value {age}",
        "meld": "Meld a card from your hand",
        "tuck": "Tuck a card from your hand under a pile",
        "splay_left": "Splay a color left",
        "splay_right": "Splay a color right",
        "splay_up": "Splay a color up",
        "return": "Return a card from your score pile",
        "demand_return": "Opponent returns their highest card",
        "demand_transfer": "Opponent transfers a card to you",
        "achieve": "Claim an achievement if eligible",
        "draw_and_score": "Draw and score a card of value {age}",
        "draw_and_meld": "Draw and meld a card of value {age}",
    }

    all_cards = []
    card_id = 0
    icon_cycle = list(ICONS)

    for age in range(1, max_age + 1):
        names = age_names.get(age, [f"Age{age}Card{i}" for i in range(10)])
        for i, name in enumerate(names):
            # Generate icons - 4 positions, one might be blank
            icons = []
            for pos in range(4):
                if (i + pos) % 5 == 0:
                    icons.append(None)  # blank spot
                else:
                    icons.append(icon_cycle[(i * 3 + pos + age) % len(icon_cycle)])

            # Assign dogma
            dogma_keys = list(dogma_effects.keys())
            dogma_key = dogma_keys[(i + age * 3) % len(dogma_keys)]
            is_demand = dogma_key.startswith("demand")
            featured_icon = icon_cycle[(i + age) % len(icon_cycle)]
            dogma_desc = dogma_effects[dogma_key].replace("{age}", str(age))

            card = {
                "id": card_id,
                "name": name,
                "age": age,
                "icons": icons,
                "dogma_type": "demand" if is_demand else "share",
                "dogma_key": dogma_key,
                "dogma_desc": dogma_desc,
                "featured_icon": featured_icon,
            }
            all_cards.append(card)
            card_id += 1

    return all_cards


# Colors for board piles
COLORS = ["blue", "red", "green", "yellow", "purple"]
COLOR_SYMBOLS = {"blue": "Bl", "red": "Rd", "green": "Gn", "yellow": "Yw", "purple": "Pr"}


class InnovationGame(BaseGame):
    """Innovation - Meld cards, activate dogma powers, achieve victories."""

    name = "Innovation"
    description = "Civilization card game with splaying and dogma"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (all 10 ages)",
        "quick": "Quick game (5 ages)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_age = 10 if self.variation != "quick" else 5
        self.supply_piles = {}  # age -> list of cards
        self.hands = {1: [], 2: []}
        self.boards = {1: {}, 2: {}}  # player -> {color: {"cards": [...], "splay": "none/left/right/up"}}
        self.score_piles = {1: [], 2: []}
        self.achievements = []  # available achievements
        self.claimed_achievements = {1: [], 2: []}
        self.log = []
        self.actions_remaining = 2
        self.achievements_to_win = 4 if self.variation != "quick" else 3

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 10:
            self.log = self.log[-10:]

    def setup(self):
        self.max_age = 10 if self.variation != "quick" else 5
        all_cards = generate_cards(self.max_age)
        random.shuffle(all_cards)

        # Organize into supply piles by age
        self.supply_piles = {}
        for age in range(1, self.max_age + 1):
            self.supply_piles[age] = [c for c in all_cards if c["age"] == age]
            random.shuffle(self.supply_piles[age])

        # Create achievements (one per age, from supply)
        self.achievements = []
        for age in range(1, self.max_age + 1):
            if self.supply_piles[age]:
                ach_card = self.supply_piles[age].pop()
                self.achievements.append({"age": age, "card": ach_card})

        # Deal 2 age-1 cards to each player
        self.hands = {1: [], 2: []}
        for p in (1, 2):
            for _ in range(2):
                if self.supply_piles[1]:
                    self.hands[p].append(self.supply_piles[1].pop())

        self.boards = {1: {}, 2: {}}
        self.score_piles = {1: [], 2: []}
        self.claimed_achievements = {1: [], 2: []}
        self.log = []
        self.actions_remaining = 2
        self.achievements_to_win = 4 if self.variation != "quick" else 3
        self.game_over = False
        self.winner = None
        self.current_player = 1

    def _get_top_card(self, player, color):
        """Get the top card of a board pile."""
        pile = self.boards[player].get(color)
        if pile and pile["cards"]:
            return pile["cards"][-1]
        return None

    def _count_icons(self, player):
        """Count all visible icons for a player."""
        counts = {}
        for icon in ICONS:
            counts[icon] = 0

        for color in COLORS:
            pile = self.boards[player].get(color)
            if not pile or not pile["cards"]:
                continue
            cards = pile["cards"]
            splay = pile["splay"]

            if len(cards) == 0:
                continue

            # Top card always shows all 4 icon positions
            top = cards[-1]
            for icon in top["icons"]:
                if icon:
                    counts[icon] = counts[icon] + 1

            # Splayed cards show partial icons
            if len(cards) > 1:
                for card in cards[:-1]:  # all cards except top
                    if splay == "left":
                        # Show right icon (position 3)
                        if card["icons"][3]:
                            counts[card["icons"][3]] += 1
                    elif splay == "right":
                        # Show left icons (positions 0, 1)
                        for pos in (0, 1):
                            if card["icons"][pos]:
                                counts[card["icons"][pos]] += 1
                    elif splay == "up":
                        # Show bottom icons (positions 1, 2, 3)
                        for pos in (1, 2, 3):
                            if card["icons"][pos]:
                                counts[card["icons"][pos]] += 1
                    # "none" = no icons from tucked cards

        return counts

    def _score_total(self, player):
        """Get total score value."""
        return sum(c["age"] for c in self.score_piles[player])

    def _highest_age_on_board(self, player):
        """Get the highest age card on player's board."""
        highest = 0
        for color in COLORS:
            top = self._get_top_card(player, color)
            if top and top["age"] > highest:
                highest = top["age"]
        return highest

    def _draw_card(self, age):
        """Draw a card from supply of given age (or next available)."""
        for a in range(age, self.max_age + 1):
            if a in self.supply_piles and self.supply_piles[a]:
                return self.supply_piles[a].pop()
        return None

    def _assign_color(self, card):
        """Assign a color to a card based on its id."""
        return COLORS[card["id"] % len(COLORS)]

    def display(self):
        clear_screen()
        print("=" * 64)
        print("          I N N O V A T I O N")
        print("=" * 64)
        print(f"  Ages: 1-{self.max_age} | Achievements to win: {self.achievements_to_win}")

        # Supply info
        supply_info = []
        for age in range(1, self.max_age + 1):
            count = len(self.supply_piles.get(age, []))
            if count > 0:
                supply_info.append(f"Age{age}:{count}")
        print(f"  Supply: {', '.join(supply_info) if supply_info else '(empty)'}")

        avail_ach = [a for a in self.achievements if a["age"] > 0]
        ach_labels = ", ".join("Age" + str(a["age"]) for a in avail_ach) if avail_ach else "(none)"
        print(f"  Available achievements: {ach_labels}")
        print()

        for p in (1, 2):
            marker = " <<" if self.current_player == p else ""
            print(f"  {self.players[p-1]}{marker}")
            print(f"    Score: {self._score_total(p)} | Achievements: {len(self.claimed_achievements[p])}/{self.achievements_to_win}")

            # Icon counts
            icons = self._count_icons(p)
            icon_str = " ".join(f"{ICON_SYMBOLS[ic]}:{icons[ic]}" for ic in ICONS if icons[ic] > 0)
            print(f"    Icons: {icon_str if icon_str else '(none)'}")

            # Board
            print(f"    Board:")
            has_cards = False
            for color in COLORS:
                pile = self.boards[p].get(color)
                if pile and pile["cards"]:
                    has_cards = True
                    top = pile["cards"][-1]
                    splay_str = f" [splay:{pile['splay']}]" if pile["splay"] != "none" else ""
                    depth = len(pile["cards"])
                    icon_display = " ".join(ICON_SYMBOLS.get(ic, ".") if ic else "." for ic in top["icons"])
                    print(f"      {COLOR_SYMBOLS[color]}: {top['name']}(Age{top['age']}) [{icon_display}] x{depth}{splay_str}")
            if not has_cards:
                print(f"      (empty)")

            # Hand
            hand = self.hands[p]
            if p == self.current_player:
                hand_str = ", ".join(f"{c['name']}(A{c['age']})" for c in hand)
                print(f"    Hand ({len(hand)}): {hand_str if hand_str else '(empty)'}")
            else:
                print(f"    Hand: {len(hand)} cards")
            print()

        print(f"  Actions remaining: {self.actions_remaining}")
        if self.log:
            print(f"\n  --- Log ---")
            for msg in self.log[-5:]:
                print(f"  {msg}")
        print()

    def get_move(self):
        print(f"  Actions: (d)raw, (m)eld, (a)chieve, (g)dogma")
        print(f"    d       = Draw a card")
        print(f"    m <num> = Meld card from hand (by number)")
        print(f"    a <age> = Claim achievement of that age")
        print(f"    g <col> = Activate dogma of top card on color pile")
        print(f"              Colors: {', '.join(f'{COLOR_SYMBOLS[c]}={c}' for c in COLORS)}")

        hand = self.hands[self.current_player]
        if hand:
            print(f"  Hand: ", end="")
            for i, c in enumerate(hand):
                icon_display = " ".join(ICON_SYMBOLS.get(ic, ".") if ic else "." for ic in c["icons"])
                print(f"\n    {i+1}: {c['name']}(A{c['age']}) [{icon_display}] {c['dogma_desc']}", end="")
            print()

        return ("action", input_with_quit("  Enter action: "))

    def make_move(self, move):
        action, value = move
        val = value.strip().lower()
        cp = self.current_player

        if val == "d":
            # Draw
            age = max(1, self._highest_age_on_board(cp))
            card = self._draw_card(age)
            if card:
                self.hands[cp].append(card)
                self._add_log(f"{self.players[cp-1]} draws {card['name']}(Age{card['age']})")
            else:
                # Drawing from empty supply above max age = game over, other player wins
                self._add_log(f"No cards to draw! {self.players[cp-1]} loses!")
                self.game_over = True
                self.winner = 2 if cp == 1 else 1
            self.actions_remaining -= 1
            self._check_actions()
            return True

        elif val.startswith("m"):
            parts = val.split()
            if len(parts) < 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            hand = self.hands[cp]
            if idx < 0 or idx >= len(hand):
                return False
            card = hand.pop(idx)
            self._meld_card(cp, card)
            self._add_log(f"{self.players[cp-1]} melds {card['name']}(Age{card['age']})")
            self.actions_remaining -= 1
            self._check_actions()
            return True

        elif val.startswith("a"):
            parts = val.split()
            if len(parts) < 2:
                return False
            try:
                target_age = int(parts[1])
            except ValueError:
                return False
            # Check eligibility: score >= 5*age and have a top card of that age
            required_score = 5 * target_age
            if self._score_total(cp) < required_score:
                print(f"  Need score >= {required_score} (have {self._score_total(cp)})")
                return False
            if self._highest_age_on_board(cp) < target_age:
                print(f"  Need a top card of age >= {target_age} on your board")
                return False
            # Find and claim achievement
            found = None
            for i, ach in enumerate(self.achievements):
                if ach["age"] == target_age:
                    found = i
                    break
            if found is None:
                print(f"  Age {target_age} achievement not available")
                return False
            ach = self.achievements.pop(found)
            self.claimed_achievements[cp].append(ach)
            self._add_log(f"{self.players[cp-1]} claims Age {target_age} achievement!")
            self.actions_remaining -= 1
            self._check_actions()
            return True

        elif val.startswith("g"):
            parts = val.split()
            if len(parts) < 2:
                return False
            color_input = parts[1].lower()
            # Resolve color
            target_color = None
            for c in COLORS:
                if c.startswith(color_input) or COLOR_SYMBOLS[c].lower() == color_input:
                    target_color = c
                    break
            if not target_color:
                print(f"  Unknown color: {color_input}")
                return False

            top = self._get_top_card(cp, target_color)
            if not top:
                print(f"  No card on {target_color} pile")
                return False

            self._execute_dogma(cp, top)
            self.actions_remaining -= 1
            self._check_actions()
            return True

        return False

    def _meld_card(self, player, card):
        """Place a card on the board."""
        color = self._assign_color(card)
        if color not in self.boards[player]:
            self.boards[player][color] = {"cards": [], "splay": "none"}
        self.boards[player][color]["cards"].append(card)

    def _tuck_card(self, player, card):
        """Tuck a card under a pile."""
        color = self._assign_color(card)
        if color not in self.boards[player]:
            self.boards[player][color] = {"cards": [], "splay": "none"}
        self.boards[player][color]["cards"].insert(0, card)

    def _execute_dogma(self, player, card):
        """Execute a card's dogma effect."""
        opp = 2 if player == 1 else 1
        featured = card["featured_icon"]
        p_icons = self._count_icons(player)
        o_icons = self._count_icons(opp)
        p_count = p_icons.get(featured, 0)
        o_count = o_icons.get(featured, 0)

        self._add_log(f"{self.players[player-1]} activates {card['name']} dogma ({card['dogma_desc']})")

        key = card["dogma_key"]
        age = card["age"]

        if key == "score":
            # Score a card from hand
            if self.hands[player]:
                scored = self.hands[player].pop(0)
                self.score_piles[player].append(scored)
                self._add_log(f"  Scored {scored['name']}(Age{scored['age']})")

        elif key == "draw":
            drawn = self._draw_card(age)
            if drawn:
                self.hands[player].append(drawn)
                self._add_log(f"  Drew {drawn['name']}(Age{drawn['age']})")

        elif key == "meld":
            if self.hands[player]:
                # Meld highest age card
                best = max(self.hands[player], key=lambda c: c["age"])
                self.hands[player].remove(best)
                self._meld_card(player, best)
                self._add_log(f"  Melded {best['name']}(Age{best['age']})")

        elif key == "tuck":
            if self.hands[player]:
                tucked = self.hands[player].pop(0)
                self._tuck_card(player, tucked)
                self._add_log(f"  Tucked {tucked['name']}(Age{tucked['age']})")

        elif key == "splay_left":
            self._do_splay(player, "left")

        elif key == "splay_right":
            self._do_splay(player, "right")

        elif key == "splay_up":
            self._do_splay(player, "up")

        elif key == "return":
            if self.score_piles[player]:
                returned = self.score_piles[player].pop()
                ret_age = returned["age"]
                if ret_age not in self.supply_piles:
                    self.supply_piles[ret_age] = []
                self.supply_piles[ret_age].append(returned)
                self._add_log(f"  Returned {returned['name']} to supply")

        elif key == "demand_return":
            if card["dogma_type"] == "demand" and o_count < p_count:
                if self.hands[opp]:
                    highest = max(self.hands[opp], key=lambda c: c["age"])
                    self.hands[opp].remove(highest)
                    ret_age = highest["age"]
                    if ret_age not in self.supply_piles:
                        self.supply_piles[ret_age] = []
                    self.supply_piles[ret_age].append(highest)
                    self._add_log(f"  {self.players[opp-1]} returns {highest['name']}")

        elif key == "demand_transfer":
            if card["dogma_type"] == "demand" and o_count < p_count:
                if self.score_piles[opp]:
                    transferred = self.score_piles[opp].pop()
                    self.score_piles[player].append(transferred)
                    self._add_log(f"  {self.players[opp-1]} transfers {transferred['name']} to {self.players[player-1]}")

        elif key == "achieve":
            # Auto-claim if eligible
            for i, ach in enumerate(self.achievements):
                req = 5 * ach["age"]
                if self._score_total(player) >= req and self._highest_age_on_board(player) >= ach["age"]:
                    claimed = self.achievements.pop(i)
                    self.claimed_achievements[player].append(claimed)
                    self._add_log(f"  Claimed Age {claimed['age']} achievement!")
                    break

        elif key == "draw_and_score":
            drawn = self._draw_card(age)
            if drawn:
                self.score_piles[player].append(drawn)
                self._add_log(f"  Drew and scored {drawn['name']}(Age{drawn['age']})")

        elif key == "draw_and_meld":
            drawn = self._draw_card(age)
            if drawn:
                self._meld_card(player, drawn)
                self._add_log(f"  Drew and melded {drawn['name']}(Age{drawn['age']})")

        # Sharing: if opponent has >= icons, they also benefit
        if card["dogma_type"] == "share" and o_count >= p_count:
            if key in ("draw", "draw_and_score", "draw_and_meld"):
                drawn = self._draw_card(age)
                if drawn:
                    if key == "draw":
                        self.hands[opp].append(drawn)
                    elif key == "draw_and_score":
                        self.score_piles[opp].append(drawn)
                    elif key == "draw_and_meld":
                        self._meld_card(opp, drawn)
                    self._add_log(f"  (Shared) {self.players[opp-1]} also benefits")

    def _do_splay(self, player, direction):
        """Splay the pile with the most cards."""
        best_color = None
        best_count = 0
        for color in COLORS:
            pile = self.boards[player].get(color)
            if pile and len(pile["cards"]) > best_count:
                best_count = len(pile["cards"])
                best_color = color
        if best_color and best_count > 1:
            self.boards[player][best_color]["splay"] = direction
            self._add_log(f"  Splayed {best_color} {direction}")

    def _check_actions(self):
        """Check if turn is over."""
        if self.actions_remaining <= 0:
            self.actions_remaining = 2
            self.switch_player()

    def check_game_over(self):
        if self.game_over:
            return
        for p in (1, 2):
            if len(self.claimed_achievements[p]) >= self.achievements_to_win:
                self.game_over = True
                self.winner = p
                self._add_log(f"{self.players[p-1]} wins with {self.achievements_to_win} achievements!")
                return

        # Check if all supply is empty
        total_supply = sum(len(self.supply_piles.get(a, [])) for a in range(1, self.max_age + 1))
        if total_supply == 0:
            # Player with highest score wins
            s1 = self._score_total(1)
            s2 = self._score_total(2)
            self.game_over = True
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                # Tie: most achievements
                if len(self.claimed_achievements[1]) >= len(self.claimed_achievements[2]):
                    self.winner = 1
                else:
                    self.winner = 2

    def get_state(self):
        # Convert boards to serializable format
        boards_ser = {}
        for p in (1, 2):
            boards_ser[str(p)] = {}
            for color, pile in self.boards[p].items():
                boards_ser[str(p)][color] = {
                    "cards": pile["cards"],
                    "splay": pile["splay"],
                }

        return {
            "max_age": self.max_age,
            "supply_piles": {str(k): v for k, v in self.supply_piles.items()},
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "boards": boards_ser,
            "score_piles": {"1": self.score_piles[1], "2": self.score_piles[2]},
            "achievements": self.achievements,
            "claimed_achievements": {"1": self.claimed_achievements[1], "2": self.claimed_achievements[2]},
            "log": self.log,
            "actions_remaining": self.actions_remaining,
            "achievements_to_win": self.achievements_to_win,
        }

    def load_state(self, state):
        self.max_age = state["max_age"]
        self.supply_piles = {int(k): v for k, v in state["supply_piles"].items()}
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}

        self.boards = {1: {}, 2: {}}
        for p_str, colors in state["boards"].items():
            p = int(p_str)
            for color, pile in colors.items():
                self.boards[p][color] = {
                    "cards": pile["cards"],
                    "splay": pile["splay"],
                }

        self.score_piles = {1: state["score_piles"]["1"], 2: state["score_piles"]["2"]}
        self.achievements = state["achievements"]
        self.claimed_achievements = {1: state["claimed_achievements"]["1"], 2: state["claimed_achievements"]["2"]}
        self.log = state["log"]
        self.actions_remaining = state["actions_remaining"]
        self.achievements_to_win = state["achievements_to_win"]
        self._resumed = True

    def get_tutorial(self):
        return """
=== INNOVATION TUTORIAL ===

Innovation is a civilization card game where you build a tableau of
innovations from 10 ages of human history.

ACTIONS (2 per turn):
  d         - DRAW a card from the supply (age = your highest board card)
  m <num>   - MELD a card from your hand onto your board
  a <age>   - ACHIEVE - claim an age achievement
  g <color> - DOGMA - activate the top card's power on a color pile

BOARD:
  Your board has 5 color piles (blue, red, green, yellow, purple)
  Each card is assigned to a color when melded
  Only the TOP card of each pile is fully visible
  Cards underneath are "tucked" and show no icons (unless splayed)

SPLAYING:
  Some dogma effects splay your piles, revealing icons on tucked cards:
  - Splay LEFT:  reveals right icon of tucked cards
  - Splay RIGHT: reveals left icons of tucked cards
  - Splay UP:    reveals bottom icons of tucked cards

ICONS:
  W=Crown  L=Leaf  F=Factory  C=Castle  K=Clock  B=Bulb
  Icons determine who is affected by dogma powers

DOGMA:
  Each card has a featured icon and a dogma effect
  DEMAND dogma: affects opponents with FEWER of the featured icon
  SHARE dogma: also benefits opponents with MORE/EQUAL featured icons

SCORING & ACHIEVEMENTS:
  Score pile = cards set aside for points (each worth its age value)
  To claim Age N achievement: need score >= 5*N AND a top card of age >= N
  First to claim the required number of achievements wins!

  Standard: 4 achievements | Quick: 3 achievements
"""
